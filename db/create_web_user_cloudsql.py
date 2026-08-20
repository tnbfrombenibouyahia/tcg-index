"""Crée un utilisateur Postgres (Cloud SQL) dédié à l'appli web, en lecture
seule (GRANT SELECT uniquement -- jamais INSERT/UPDATE/DELETE), séparé du
compte admin utilisé par l'ingestion Python (lecture/écriture, cron). Les
fichiers web/lib/queries/*.ts ne font que du SELECT -- le site n'a
structurellement besoin que de lire. Intérêt : si la variable d'env du site
fuite un jour (mauvaise config Vercel, log, etc.), l'accès reste limité à de
la lecture, jamais d'écriture/suppression possible.

Équivalent Cloud SQL de db/create_web_user_cockroachdb.py -- adapté au SQL
standard PostgreSQL, qui ne supporte pas `CREATE USER IF NOT EXISTS` (extension
propre à CockroachDB) : passe par un bloc DO plpgsql qui teste pg_roles.

`ALTER DEFAULT PRIVILEGES` en plus de la version CockroachDB : GRANT SELECT ON
ALL TABLES ne couvre que les tables déjà là au moment du run -- sans ça, une
future table créée par l'admin (migration de schéma) resterait invisible au
site tant que ce script n'est pas rejoué à la main.

Génère un mot de passe aléatoire (alphabet URL-safe -- pas de caractère à
encoder dans la connection string) et écrit directement DATABASE_URL_WEB
dans .env, sans jamais l'afficher ni la faire transiter par le chat.

Usage : python -m db.create_web_user_cloudsql
"""
import os
import re
import secrets
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

ENV_FILE = Path(__file__).parent.parent / ".env"
WEB_USER = "cardquant_web"


def main():
    admin_url = os.environ["DATABASE_URL"]
    password = secrets.token_urlsafe(24)

    conn = psycopg2.connect(admin_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            # mogrify plutôt que %s directement dans le bloc DO : le texte du
            # bloc DO est un littéral dollar-quoté envoyé tel quel au serveur,
            # pas une requête paramétrable par psycopg2 -- mogrify produit un
            # littéral SQL correctement échappé qu'on interpole nous-mêmes.
            password_literal = cur.mogrify("%s", (password,)).decode()
            cur.execute(f"""
                DO $$
                BEGIN
                   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '{WEB_USER}') THEN
                      CREATE ROLE "{WEB_USER}" WITH LOGIN PASSWORD {password_literal};
                   ELSE
                      ALTER ROLE "{WEB_USER}" WITH PASSWORD {password_literal};
                   END IF;
                END
                $$;
            """)
            cur.execute(f'GRANT CONNECT ON DATABASE cardquant TO "{WEB_USER}"')
            cur.execute(f'GRANT USAGE ON SCHEMA public TO "{WEB_USER}"')
            cur.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "{WEB_USER}"')
            cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "{WEB_USER}"')
            cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
            table_count = cur.fetchone()[0]
        print(f'Utilisateur "{WEB_USER}" pret, SELECT accorde sur {table_count} table(s) + futures tables.')
    finally:
        conn.close()

    # Reconstruit la connection string en ne remplaçant que la partie
    # user:password -- garde host/port/db/sslmode identiques à DATABASE_URL.
    m = re.match(r"^(postgresql://)[^:]+:[^@]+@(.*)$", admin_url)
    if not m:
        raise RuntimeError("DATABASE_URL ne matche pas le format attendu -- verifier a la main.")
    web_url = f"{m.group(1)}{WEB_USER}:{password}@{m.group(2)}"

    with ENV_FILE.open("a", encoding="utf-8") as f:
        f.write(f"\nDATABASE_URL_WEB={web_url}\n")

    print("DATABASE_URL_WEB ecrite dans .env (mot de passe jamais affiche ici).")


if __name__ == "__main__":
    main()
