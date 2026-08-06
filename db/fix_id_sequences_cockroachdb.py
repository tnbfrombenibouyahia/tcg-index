"""Remplace le générateur d'id par défaut de CockroachDB (`unique_rowid()`,
défaut de BIGSERIAL sur ce moteur) par une vraie séquence SQL croissante sur
les 8 tables, pour que les futurs id restent petits comme sur Postgres.

Pourquoi : `unique_rowid()` encode horloge+nœud, produit des valeurs du
genre 1199069219243786241 (19 chiffres) -- largement au-delà de
Number.MAX_SAFE_INTEGER (9007199254740991) côté JS, et au-delà du INT4 max
(~2.1 milliards) utilisé par les requêtes web (cf. db/COCKROACHDB_MIGRATION.md,
fix ::int -> ::int4). Sans ce script, la première ligne créée après la
bascule aurait un id énorme -- cast ::int4 en échec, page cassée.

Chaque séquence démarre à (MAX(id) actuel + marge) pour ne jamais entrer en
collision avec les id déjà migrés depuis Supabase.

Usage : python -m db.fix_id_sequences_cockroachdb
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
    "index_volume",
    "sealed_ev",
    "sync_runs",
    "undervalued_scores",
    "index_values",
]

MARGIN = 10_000  # marge de securite au-dessus du MAX(id) actuel


def main():
    conn = psycopg2.connect(os.environ["COCKROACHDB_URL"])
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for table in TABLES:
                cur.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
                max_id = cur.fetchone()[0]
                start = max_id + MARGIN
                seq = f"{table}_id_seq"
                cur.execute(f"CREATE SEQUENCE IF NOT EXISTS {seq} START {start}")
                cur.execute(f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{seq}')")
                print(f"{table}: sequence {seq} demarree a {start} (max id actuel {max_id})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
