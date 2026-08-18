"""Copie les données de CockroachDB (COCKROACHDB_URL, source -- l'actuelle
prod) vers Cloud SQL (CLOUDSQL_URL, destination -- la nouvelle cible, cf.
cardquant-handoff-adapte.md), une fois le schéma déjà appliqué (cf.
db/apply_schema.py). Ne touche jamais CockroachDB en écriture -- lecture
seule côté source. Miroir de db/migrate_data_to_cockroachdb.py (même
migration, sens inverse, un cran plus tard dans l'historique du projet).

Deux variables dédiées (COCKROACHDB_URL / CLOUDSQL_URL) plutôt que DATABASE_URL
des deux côtés -- ambigu de savoir laquelle est source/destination pendant une
migration, cf. incident de nommage sur db/migrate_data_to_cockroachdb.py (qui,
lui, utilisait DATABASE_URL=Supabase, COCKROACHDB_URL=destination -- lisible
seulement parce que DATABASE_URL était encore la prod à l'époque). Ici,
DATABASE_URL n'est délibérément pas touché : il continue de pointer vers
CockroachDB (toujours la prod tant que la bascule n'est pas actée) pendant
toute la durée de la migration.

Cloud SQL n'utilise pas le certificat public (certifi) que shared.db.get_connection()
impose -- son autorité est interne à Google, jamais dans un magasin de CA
public (cf. incident 2026-08-16, `certificate verify failed`). D'où deux
fonctions de connexion locales ci-dessous plutôt qu'un import de shared.db.

Table `prices` volontairement exclue de TABLES : cache mutable à TTL (dernier
prix connu par item/source/grade, cf. schema.sql), pas une source de vérité
-- se repeuple seul à l'usage, aucune valeur à transporter une donnée déjà
potentiellement périmée.

Ordre des tables : `items` d'abord (seule table référencée par FK item_id
depuis le reste). `id` est réinséré explicitement pour préserver les FK --
db/fix_id_sequences_cloudsql.py resynchronise les séquences BIGSERIAL après
coup. Batch insert (execute_values), `ON CONFLICT DO NOTHING` rend le script
rejouable sans risque si interrompu en cours de route.

Usage : python -m db.migrate_data_to_cloudsql
"""
import os
import sys
import time

import certifi
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
    "active_listings",
    "population_snapshots",
    "sealed_ev",
    "undervalued_scores",
    "grading_roi_inputs",
    "index_volume",
    "sync_runs",
    "index_values",
]


def _connect_cockroachdb():
    return psycopg2.connect(os.environ["COCKROACHDB_URL"], sslrootcert=certifi.where())


def _connect_cloudsql():
    return psycopg2.connect(os.environ["CLOUDSQL_URL"], sslmode="require")


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
    src = _connect_cockroachdb()
    dst = _connect_cloudsql()
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
