"""Lectures DB sur `items` pour le module pricing. Même style que
shared/sync_log.py : connexion dédiée par appel, try/finally: conn.close(),
SQL inline (pas d'ORM, cohérent avec le reste du repo).
"""
from pricing.models import Card
from shared.db import get_connection

_CARD_COLUMNS = "id, name, code, set_code, tcg, category, language, rarity"


def _row_to_card(row: tuple) -> Card:
    return Card(
        id=row[0], name=row[1], code=row[2], set_code=row[3],
        tcg=row[4], category=row[5], language=row[6], rarity=row[7],
    )


def fetch_items_by_code(code: str) -> list[Card]:
    """items.tcg='one-piece' AND UPPER(code) = UPPER(%s) -- peut renvoyer
    plusieurs lignes (carte de base + Parallel/Alternate Art/Manga Art
    partageant le même code, cf. ingestion/sources/limitlesstcg.py)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = 'one-piece' AND UPPER(code) = UPPER(%s)",
                (code,),
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_items_by_name_tokens(tokens: set[str], *, tcg: str = "one-piece", limit: int = 200) -> list[Card]:
    """Pré-filtre par ILIKE '%token%' sur name pour chaque token (OR), tcg
    fixé -- réduit le set de candidats avant le scoring Dice fait en Python
    par pricing/matching.py (pas de scan de tout le catalogue à chaque
    requête). `limit` en filet de sécurité si les tokens sont trop
    génériques."""
    if not tokens:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            or_clause = " OR ".join(["name ILIKE %s"] * len(tokens))
            params = [f"%{token}%" for token in tokens] + [tcg, limit]
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                f"WHERE ({or_clause}) AND tcg = %s LIMIT %s",
                params,
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_card_by_id(item_id: int) -> Card | None:
    """Utilisé par shared/verdict.py::compute_verdict_for_card quand le
    matching a déjà été fait en amont (card_id déjà connu)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {_CARD_COLUMNS} FROM items WHERE id = %s", (item_id,))
            row = cur.fetchone()
            return _row_to_card(row) if row else None
    finally:
        conn.close()
