"""Journal des runs d'ingestion (table `sync_runs`) -- permet au dashboard web
"Live Market Data" de savoir ce qui est en train de charger (status='running',
finished_at NULL) et quand chaque étape a fini pour la dernière fois, sans
attendre la fin du run entier (une étape --tier peut durer plusieurs heures,
cf. orchestrator.py).

Connexion dédiée à chaque appel (pas la connexion du run en cours) : le start
doit être visible en base tout de suite, avant que l'étape elle-même ne
commence à écrire -- une connexion partagée non commitée ne le garantirait pas.
"""
from shared.db import get_connection


def start_run(run_type: str, step: str, tcg: str | None = None, tier: str | None = None) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO sync_runs (run_type, tier, step, tcg, status)
                   VALUES (%s, %s, %s, %s, 'running') RETURNING id""",
                (run_type, tier, step, tcg),
            )
            run_id = cur.fetchone()[0]
        conn.commit()
        return run_id
    finally:
        conn.close()


def finish_run(run_id: int, *, status: str, rows_written: int | None = None, detail: str | None = None) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE sync_runs SET status = %s, finished_at = now(),
                   rows_written = %s, detail = %s WHERE id = %s""",
                (status, rows_written, detail, run_id),
            )
        conn.commit()
    finally:
        conn.close()
