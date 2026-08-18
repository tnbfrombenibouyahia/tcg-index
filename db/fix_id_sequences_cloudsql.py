"""Resynchronise les séquences BIGSERIAL sur Cloud SQL après
db/migrate_data_to_cloudsql.py -- l'insertion d'`id` explicites (pour
préserver les FK) ne fait pas avancer les séquences `<table>_id_seq`
créées automatiquement par BIGSERIAL, donc le premier INSERT sans id
explicite après la migration entrerait en collision avec un id déjà
occupé sans ce fix.

Plus simple que db/fix_id_sequences_cockroachdb.py (spécifique à
CockroachDB, qui doit remplacer `unique_rowid()` par une vraie séquence) :
Postgres a déjà une vraie séquence par défaut, il suffit de la caler sur
MAX(id) via setval().

Usage : python -m db.fix_id_sequences_cloudsql
"""
import os
import sys

import psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
load_dotenv()

TABLES = [
    "items",
    "price_snapshots",
    "sales",
    "active_listings",
    "population_snapshots",
    "sealed_ev",
    "undervalued_scores",
    "grading_roi_inputs",
    "index_volume",
    "sync_runs",
    "index_values",
]


def main():
    conn = psycopg2.connect(os.environ["CLOUDSQL_URL"], sslmode="require")
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for table in TABLES:
                cur.execute(
                    f"SELECT setval('{table}_id_seq', COALESCE((SELECT MAX(id) FROM {table}), 1), "
                    f"(SELECT MAX(id) IS NOT NULL FROM {table}))"
                )
                new_val = cur.fetchone()[0]
                print(f"{table}: sequence {table}_id_seq calee a {new_val}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
