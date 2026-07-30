"""Connexion Postgres partagée entre ingestion et calcul d'indice.

Une seule variable d'environnement : DATABASE_URL (cf. .env.example).
"""
import os

import psycopg2


def get_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])
