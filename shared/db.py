"""Connexion Postgres partagée entre ingestion et calcul d'indice.

Une seule variable d'environnement : DATABASE_URL (cf. .env.example).
"""
import contextlib
import os
import random
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import certifi
import psycopg2
import psycopg2.errors

# `sslrootcert` est résolu ici via certifi.where() plutôt que codé en dur
# dans DATABASE_URL -- incident 2026-08-09 : un chemin Windows
# (.../Python312/.../certifi/cacert.pem, nécessaire en local sur Windows où
# ni `verify-full` seul ni `sslrootcert=system` ne marchent avec
# psycopg2-binary) s'est retrouvé dans le secret GitHub Actions et a cassé
# le cron 3 jours (le runner Linux n'a pas ce chemin). `sslrootcert=system`
# à la place a aussi échoué côté runner (`certificate verify failed` --
# l'OpenSSL statique de psycopg2-binary ne s'appuie pas fiablement sur le
# magasin de certs de l'OS, apparemment vrai sur Linux aussi, pas juste
# Windows comme documenté). Le bundle CA de certifi, lui, est un fichier
# portable réinstallé identiquement par pip à chaque environnement --
# marche pareil en local (Windows/Mac/Linux) et en CI, sans dépendre du
# magasin de certs de la machine. Toute valeur sslrootcert déjà présente
# dans DATABASE_URL est retirée avant d'imposer celle-ci, pour ne jamais
# la dupliquer (psycopg2/libpq n'aiment pas un paramètre en double).
#
# 2026-08-16 : ce bundle certifi ne vaut que pour verify-ca/verify-full
# (CockroachDB Cloud, certificat public standard). Cloud SQL (nouvelle
# cible, cf. cardquant-handoff-adapte.md) présente un certificat signé par
# une autorité interne à Google, absente de tout bundle de CA public --
# forcer sslrootcert dessus fait échouer la connexion (`certificate verify
# failed`) même avec le bon mot de passe. On ne l'injecte donc plus que
# quand DATABASE_URL demande explicitement verify-ca/verify-full ; les
# autres modes (`require`, utilisé par Cloud SQL) passent sans rootcert --
# toujours chiffré en transit, juste sans vérification d'identité du
# certificat, cohérent avec ce que fait déjà tout script de ce repo qui se
# connecte directement à Cloud SQL (cf. db/migrate_data_to_cloudsql.py).


def _dsn_without_sslrootcert(raw_dsn: str) -> tuple[str, str | None]:
    parts = urlsplit(raw_dsn)
    query = parse_qsl(parts.query, keep_blank_values=True)
    sslmode = next((v for k, v in query if k == "sslmode"), None)
    query = [(k, v) for k, v in query if k != "sslrootcert"]
    return urlunsplit(parts._replace(query=urlencode(query))), sslmode


def get_connection():
    dsn, sslmode = _dsn_without_sslrootcert(os.environ["DATABASE_URL"])
    if sslmode in ("verify-ca", "verify-full"):
        return psycopg2.connect(dsn, sslrootcert=certifi.where())
    return psycopg2.connect(dsn)


# ---------------------------------------------------------------------------
# Verrou applicatif (remplace `concurrency: group` de GitHub Actions)
# ---------------------------------------------------------------------------
# 2026-08-16 : sous Cloud Run Jobs + Cloud Scheduler (cf. cardquant-handoff-adapte.md
# §04), plus de `concurrency: group: pricecharting-sync` -- ce filet GitHub
# Actions évitait justement à daily-sync/tiered-sync/ebay-listings-sync de
# s'écrire dessus sur les mêmes tables d'agrégats (indices/undervalued/
# sealed_ev/volume/grading_roi_inputs), après plusieurs incidents réels
# (2026-08-10, 2026-08-12, 2026-08-13, cf. commentaires de ces 3 workflows).
# Cloud Scheduler n'a pas d'équivalent natif entre Job resources différentes.
#
# `pg_advisory_lock` (bloquant, PAS `pg_try_advisory_lock`) reproduit
# exactement la sémantique `cancel-in-progress: false` : une run qui ne peut
# pas prendre le verrou ATTEND (mise en file), elle n'échoue pas et n'annule
# rien. Verrou tenu par sa propre connexion dédiée (nécessaire : PostgreSQL
# libère les verrous de session à la fermeture de la connexion, jamais
# transactionnels ici -- le lock doit survivre à travers tout l'appel, pas
# juste une transaction) et libéré explicitement en sortie, connexion fermée
# après. Clé fixe (hashtext du nom du groupe) plutôt que l'id de la table :
# c'est UN SEUL verrou pour les 3 jobs concernés (même groupe logique que
# `pricecharting-sync` côté GitHub Actions), pas un verrou par table.
_INGESTION_WRITER_LOCK_KEY = "pricecharting-sync"  # même nom que l'ancien concurrency group


@contextlib.contextmanager
def ingestion_writer_lock():
    """À poser autour de tout run qui touche aux tables d'agrégats partagées
    (prix quotidien, --tier, --ebay-listings) -- cf. commentaire ci-dessus.
    Bloque jusqu'à obtention du verrou (peut attendre plusieurs dizaines de
    minutes si une autre run tourne encore, exactement comme la file
    d'attente `concurrency` group qu'il remplace)."""
    conn = get_connection()
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(hashtext(%s))", (_INGESTION_WRITER_LOCK_KEY,))
        yield
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", (_INGESTION_WRITER_LOCK_KEY,))
        conn.close()


# ---------------------------------------------------------------------------
# Retry sur conflit d'écriture CockroachDB (SQLSTATE 40001, RETRY_SERIALIZABLE)
# ---------------------------------------------------------------------------
# Constaté 2026-08-09/10 : `daily-sync` (référentiel + prix + index/undervalued/
# sealed_ev) et `tiered-sync --tier hot` (grades/ventes + les 5 mêmes calculs
# d'index) tournent à 26 min d'écart (cf. tiered-sync.yml) alors que
# `daily-sync` prend couramment 80-90 min -- ils se chevauchent presque
# toutes les nuits et s'écrivent dessus sur les mêmes lignes (indices,
# undervalued_scores, sealed_ev, volume, grading_roi_inputs). Sous isolation
# SERIALIZABLE (seule proposée par CockroachDB), c'est le comportement
# ATTENDU en cas de conflit, pas un bug : le client est censé rejouer toute
# la transaction, cf.
# https://www.cockroachlabs.com/docs/v26.2/transaction-retry-error-reference.html
#
# `fn` doit être un callable sans argument qui rejoue tout le calcul de bout
# en bout (sa propre connexion incluse) -- vrai des 5 étapes de calcul de
# l'orchestrateur, chacune "rejouable" par conception (recalcule tout,
# jamais incrémental, cf. leurs docstrings), donc sûr à ré-exécuter en entier
# plutôt que de retenter juste la requête qui a échoué.
#
# Réglages 2026-08-10 (après un test délibéré des deux workflows lancés à la
# même seconde, cf. commit précédent) : les 5 tentatives / ~20s d'origine
# n'ont pas suffi face à un chevauchement complet avec un autre job de
# ~90 min qui réécrit sans arrêt les mêmes lignes -- attendu (le décalage des
# crons dans tiered-sync.yml reste le vrai fix contre CE scénario), mais on
# muscle quand même le filet de sécurité pour les cas résiduels (relance
# manuelle mal synchronisée, drift de scheduling GitHub Actions, run
# exceptionnellement long). Backoff exponentiel (×2, plafonné à 60s) + jitter
# aléatoire (évite que plusieurs calculs en conflit ne retentent tous à
# l'identique et se re-percutent) : ~10 tentatives couvrent maintenant
# jusqu'à ~5 min de contention continue avant d'abandonner, contre ~20s
# avant.
def retry_on_serialization_failure(fn, *, max_attempts=10, base_delay_s=2.0, max_delay_s=60.0):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except psycopg2.errors.SerializationFailure:
            if attempt == max_attempts:
                raise
            delay = min(base_delay_s * (2 ** (attempt - 1)), max_delay_s)
            delay += random.uniform(0, delay * 0.25)
            print(f"  (conflit d'écriture CockroachDB, nouvelle tentative {attempt}/{max_attempts} dans {delay:.0f}s...)")
            time.sleep(delay)
