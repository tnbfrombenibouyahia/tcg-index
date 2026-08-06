"""Applique db/schema.sql sur le cluster CockroachDB (COCKROACHDB_URL), pas
sur DATABASE_URL (Supabase, toujours prod -- cf. db/COCKROACHDB_MIGRATION.md).

Variante de db/apply_schema.py qui utilise `shared.db.get_connection()`
(câblé sur DATABASE_URL) -- volontairement séparée plutôt que de faire
pointer DATABASE_URL sur CockroachDB, pour ne pas risquer de faire tourner
autre chose (orchestrator.py, etc.) contre le mauvais cluster par erreur
avant la bascule officielle.

Usage : python -m db.apply_schema_cockroachdb
"""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

SCHEMA_FILE = Path(__file__).parent / "schema.sql"


def main():
    url = os.environ.get("COCKROACHDB_URL")
    if not url:
        print("COCKROACHDB_URL manquant dans .env -- rien à appliquer.")
        return

    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Schéma appliqué avec succès sur CockroachDB.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
