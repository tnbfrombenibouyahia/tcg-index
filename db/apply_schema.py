"""Applique db/schema.sql sur la base pointée par DATABASE_URL.

Usage : python -m db.apply_schema
"""
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from shared.db import get_connection

SCHEMA_FILE = Path(__file__).parent / "schema.sql"


def main():
    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Schéma appliqué avec succès.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
