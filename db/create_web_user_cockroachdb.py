"""Crée un utilisateur SQL CockroachDB dédié à l'appli web, en lecture seule
(GRANT SELECT uniquement -- jamais INSERT/UPDATE/DELETE), séparé de
`tcg-ingestion` (lecture/écriture, réservé au cron Python). Les 11 fichiers
web/lib/queries/*.ts ne font que du SELECT -- vérifié -- donc le site n'a
structurellement besoin que de lire. Intérêt : si la variable d'env du site
fuite un jour (mauvaise config Vercel, log, etc.), l'accès reste limité à de
la lecture, jamais d'écriture/suppression possible.

Génère un mot de passe aléatoire (alphabet URL-safe -- pas de caractère à
encoder dans la connection string) et écrit directement la nouvelle
COCKROACHDB_WEB_URL dans .env, sans jamais l'afficher ni la faire transiter
par le chat (cf. les frictions de mots de passe collés en clair plus tôt
dans le projet).

Usage : python -m db.create_web_user_cockroachdb
"""
import os
import re
import secrets
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

ENV_FILE = Path(__file__).parent.parent / ".env"
WEB_USER = "tcg-web"

TABLES = [
    "items",
    "price_snapshots",
    "sales",
    "index_volume",
    "sealed_ev",
    "sync_runs",
    "undervalued_scores",
    "index_values",
]


def main():
    admin_url = os.environ["COCKROACHDB_URL"]
    password = secrets.token_urlsafe(24)

    conn = psycopg2.connect(admin_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(f'CREATE USER IF NOT EXISTS "{WEB_USER}" WITH PASSWORD %s', (password,))
            cur.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{WEB_USER}"')
        print(f'Utilisateur "{WEB_USER}" cree, SELECT accorde sur {len(TABLES)} tables.')
    finally:
        conn.close()

    # Reconstruit la connection string en ne remplaçant que la partie
    # user:password -- garde host/port/db/sslmode/sslrootcert identiques à
    # COCKROACHDB_URL (regex plutôt qu'un parsing URI complet, pour ne pas
    # avoir à ré-encoder le chemin Windows local dans sslrootcert).
    m = re.match(r"^(postgresql://)[^:]+:[^@]+@(.*)$", admin_url)
    if not m:
        raise RuntimeError("COCKROACHDB_URL ne matche pas le format attendu -- verifier a la main.")
    web_url = f"{m.group(1)}{WEB_USER}:{password}@{m.group(2)}"

    with ENV_FILE.open("a", encoding="utf-8") as f:
        f.write(f"\nCOCKROACHDB_WEB_URL={web_url}\n")

    print("COCKROACHDB_WEB_URL ecrite dans .env (mot de passe jamais affiche ici).")


if __name__ == "__main__":
    main()
