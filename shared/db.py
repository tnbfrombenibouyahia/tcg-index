"""Connexion Postgres partagée entre ingestion et calcul d'indice.

Une seule variable d'environnement : DATABASE_URL (cf. .env.example).
"""
import os
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


def _dsn_without_sslrootcert(raw_dsn: str) -> str:
    parts = urlsplit(raw_dsn)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "sslrootcert"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def get_connection():
    dsn = _dsn_without_sslrootcert(os.environ["DATABASE_URL"])
    return psycopg2.connect(dsn, sslrootcert=certifi.where())


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
def retry_on_serialization_failure(fn, *, max_attempts=5, base_delay_s=2.0):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except psycopg2.errors.SerializationFailure:
            if attempt == max_attempts:
                raise
            print(f"  (conflit d'écriture CockroachDB, nouvelle tentative {attempt}/{max_attempts}...)")
            time.sleep(base_delay_s * attempt)
