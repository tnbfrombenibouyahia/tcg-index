"""Rattrape le retard entre CockroachDB (miroir figé de la dernière
migration) et Supabase (prod, mise à jour par le cron quotidien depuis).
Complément de db/migrate_data_to_cockroachdb.py (migration initiale) --
pensé pour être relancé à volonté avant chaque comparaison de requêtes,
sans retransférer les lignes déjà présentes.

Deux stratégies selon la table (cf. commentaires schema.sql) :
- `items` et `sync_runs` : lignes modifiables en place (upsert sur
  `items.source/external_id`, `sync_runs` passe running -> success/error sur
  la même ligne, cf. shared/sync_log.py) -- retraitées intégralement avec
  `ON CONFLICT (id) DO UPDATE`.
- Toutes les autres (price_snapshots, sales, index_volume, sealed_ev,
  undervalued_scores, index_values) : append-only, jamais d'UPDATE --
  récupère seulement `WHERE id > MAX(id) côté CockroachDB`, beaucoup plus
  rapide qu'un re-scan complet.

Usage : python -m db.resync_data_to_cockroachdb
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

UPSERT_TABLES = ["items", "sync_runs"]
APPEND_ONLY_TABLES = [
    "price_snapshots",
    "sales",
    "sealed_ev",
    "undervalued_scores",
    "index_volume",
    "index_values",
]


def _copy_rows(src_cur, dst_cur, table, insert_sql_template, columns_holder):
    total = 0
    insert_sql = None
    while True:
        rows = src_cur.fetchmany(BATCH_SIZE)
        if not rows:
            break
        if insert_sql is None:
            columns = [d.name for d in src_cur.description]
            columns_holder["columns"] = columns
            insert_sql = insert_sql_template(columns)
        psycopg2.extras.execute_values(dst_cur, insert_sql, rows)
        total += len(rows)
        print(f"  {table}: {total} lignes...", end="\r")
    return total


def resync_upsert_table(src_conn, dst_conn, table):
    with src_conn.cursor(name=f"resync_{table}") as src_cur:
        src_cur.itersize = BATCH_SIZE
        src_cur.execute(f"SELECT * FROM {table} ORDER BY id")

        def build_sql(columns):
            col_list = ", ".join(columns)
            non_id = [c for c in columns if c != "id"]
            set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in non_id)
            return f"INSERT INTO {table} ({col_list}) VALUES %s ON CONFLICT (id) DO UPDATE SET {set_clause}"

        holder = {}
        with dst_conn.cursor() as dst_cur:
            total = _copy_rows(src_cur, dst_cur, table, build_sql, holder)
            dst_conn.commit()
        print(f"  {table}: {total} lignes upsertees" + " " * 20)
        return total


def resync_append_only_table(src_conn, dst_conn, table):
    with dst_conn.cursor() as dst_cur:
        dst_cur.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
        max_id = dst_cur.fetchone()[0]

    with src_conn.cursor(name=f"resync_{table}") as src_cur:
        src_cur.itersize = BATCH_SIZE
        src_cur.execute(f"SELECT * FROM {table} WHERE id > %s ORDER BY id", (max_id,))

        def build_sql(columns):
            col_list = ", ".join(columns)
            return f"INSERT INTO {table} ({col_list}) VALUES %s ON CONFLICT DO NOTHING"

        holder = {}
        with dst_conn.cursor() as dst_cur:
            total = _copy_rows(src_cur, dst_cur, table, build_sql, holder)
            dst_conn.commit()
        print(f"  {table}: {total} nouvelles lignes (id > {max_id})" + " " * 20)
        return total


def main():
    src = psycopg2.connect(os.environ["DATABASE_URL"])
    dst = psycopg2.connect(os.environ["COCKROACHDB_URL"])
    try:
        t0 = time.time()
        grand_total = 0
        for table in UPSERT_TABLES:
            print(f"Resync (upsert) de {table}...")
            grand_total += resync_upsert_table(src, dst, table)
        for table in APPEND_ONLY_TABLES:
            print(f"Resync (append) de {table}...")
            grand_total += resync_append_only_table(src, dst, table)
        print(f"\nResync termine en {time.time()-t0:.1f}s -- {grand_total} lignes traitees.")
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    main()
