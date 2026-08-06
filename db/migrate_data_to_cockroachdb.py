"""Copie les données de Supabase (DATABASE_URL, toujours prod) vers
CockroachDB (COCKROACHDB_URL), une fois le schéma déjà appliqué (cf.
db/apply_schema_cockroachdb.py). Ne touche jamais Supabase en écriture --
lecture seule côté source.

Ordre des tables : `items` d'abord (seule table référencée par FK item_id
depuis price_snapshots/sales/sealed_ev/undervalued_scores) -- le reste dans
n'importe quel ordre. `id` est réinséré explicitement pour préserver les FK
existantes (pas de régénération via unique_rowid()/BIGSERIAL côté
CockroachDB). Batch insert (execute_values) plutôt que ligne par ligne vu le
volume (~1.6M lignes au total le 2026-08-05, `sales` à lui seul ~1M).
`ON CONFLICT DO NOTHING` rend le script rejouable sans risque si interrompu
en cours de route.

Usage : python -m db.migrate_data_to_cockroachdb
"""
import os
import sys
import time

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
load_dotenv()

BATCH_SIZE = 2000

TABLES = [
    "items",
    "price_snapshots",
    "sales",
    "sealed_ev",
    "undervalued_scores",
    "index_volume",
    "sync_runs",
    "index_values",
]


def migrate_table(src_conn, dst_conn, table):
    with src_conn.cursor(name=f"migrate_{table}") as src_cur:
        src_cur.itersize = BATCH_SIZE
        src_cur.execute(f"SELECT * FROM {table} ORDER BY id")

        total = 0
        t0 = time.time()
        insert_sql = None
        with dst_conn.cursor() as dst_cur:
            while True:
                rows = src_cur.fetchmany(BATCH_SIZE)
                if not rows:
                    break
                if insert_sql is None:
                    # description n'est peuplé qu'après le premier fetch sur
                    # un curseur nommé (server-side) -- pas juste après execute().
                    columns = [d.name for d in src_cur.description]
                    col_list = ", ".join(columns)
                    insert_sql = f"INSERT INTO {table} ({col_list}) VALUES %s ON CONFLICT DO NOTHING"
                psycopg2.extras.execute_values(dst_cur, insert_sql, rows)
                dst_conn.commit()
                total += len(rows)
                print(f"  {table}: {total} lignes copiees...", end="\r")
        elapsed = time.time() - t0
        print(f"  {table}: {total} lignes copiees en {elapsed:.1f}s" + " " * 20)
        return total


def main():
    src = psycopg2.connect(os.environ["DATABASE_URL"])
    dst = psycopg2.connect(os.environ["COCKROACHDB_URL"])
    try:
        grand_total = 0
        for table in TABLES:
            print(f"Migration de {table}...")
            grand_total += migrate_table(src, dst, table)
        print(f"\nMigration terminee -- {grand_total} lignes copiees au total.")
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    main()
