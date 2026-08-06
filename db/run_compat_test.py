"""Exécute db/test_cockroachdb_compat.sql contre COCKROACHDB_URL et affiche le
résultat de chaque SELECT -- validation des 4 inconnues avant de committer à
la bascule (cf. db/COCKROACHDB_MIGRATION.md). Pas de CLI `cockroach`/`psql`
sur cette machine, donc psycopg2 (déjà une dépendance du projet, cf.
shared/db.py) plutôt qu'un outil de plus à installer.

Usage : python -m db.run_compat_test
"""
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Console Windows par defaut en cp1252 -- plante sur les accents des
# commentaires SQL reproduits dans les messages d'erreur sinon.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SQL_FILE = Path(__file__).parent / "test_cockroachdb_compat.sql"


def main():
    url = os.environ.get("COCKROACHDB_URL")
    if not url:
        print("COCKROACHDB_URL manquant dans .env -- rien à tester.")
        return

    statements = [s.strip() for s in SQL_FILE.read_text(encoding="utf-8").split(";") if s.strip()]

    conn = psycopg2.connect(url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for stmt in statements:
                # Ignore les blocs qui ne sont que des commentaires (le split
                # sur ';' laisse passer des fragments 100% commentaires entre
                # deux instructions).
                code_lines = [l for l in stmt.splitlines() if not l.strip().startswith("--")]
                if not any(l.strip() for l in code_lines):
                    continue
                try:
                    cur.execute(stmt)
                    if cur.description:  # SELECT -- affiche le résultat
                        cols = [d.name for d in cur.description]
                        rows = cur.fetchall()
                        print(f"OK -- {stmt.strip().splitlines()[0][:60]}...")
                        print(f"   colonnes: {cols}")
                        for row in rows:
                            print(f"   {row}")
                    else:
                        print(f"OK -- {stmt.strip().splitlines()[0][:60]}...")
                except Exception as e:
                    print(f"ÉCHEC -- {stmt.strip().splitlines()[0][:60]}...")
                    print(f"   {type(e).__name__}: {e}")
                print()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
