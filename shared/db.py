"""Connexion Postgres partagée entre ingestion et calcul d'indice.

Une seule variable d'environnement : DATABASE_URL (cf. .env.example).
"""
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import certifi
import psycopg2

# `sslrootcert` est résolu ici via certifi.where() plutôt que codé en dur
# dans DATABASE_URL -- incident 2026-08-09 : un chemin Windows
# (.../Python312/.../certifi/cacert.pem, nécessaire en local sur Windows où
# ni `verify-full` seul ni `sslrootcert=system` ne marchent avec
# psycopg2-binary) s'est retrouvé dans le secret GitHub Actions et a cassé
# le cron 3 jours (le runner Linux n'a pas ce chemin). `sslrootcert=system`
# à la place a aussi échoué côté runner (`certificate verify failed` --
# l'OpenSSL statique de psycopg2-binary ne s'appuie pas fiablement sur le
# magasin de certs de l'OS, apparemment vrai sur Linux aussi, pas juste
# Windows comme documenté). Le bundle CA de certifi, lui, est un fichier
# portable réinstallé identiquement par pip à chaque environnement --
# marche pareil en local (Windows/Mac/Linux) et en CI, sans dépendre du
# magasin de certs de la machine. Toute valeur sslrootcert déjà présente
# dans DATABASE_URL est retirée avant d'imposer celle-ci, pour ne jamais
# la dupliquer (psycopg2/libpq n'aiment pas un paramètre en double).


def _dsn_without_sslrootcert(raw_dsn: str) -> str:
    parts = urlsplit(raw_dsn)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "sslrootcert"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def get_connection():
    dsn = _dsn_without_sslrootcert(os.environ["DATABASE_URL"])
    return psycopg2.connect(dsn, sslrootcert=certifi.where())
