"""Lectures DB sur `items`, `sales`, `active_listings` et `price_snapshots`
pour le module pricing. Même style que shared/sync_log.py : connexion dédiée
par appel, try/finally: conn.close(), SQL inline (pas d'ORM, cohérent avec
le reste du repo).
"""
from datetime import date

from pricing.models import Card
from shared.db import get_connection

_CARD_COLUMNS = "id, name, code, set_code, tcg, category, language, rarity"
_SALES_STATS_LIMIT = 10  # borne haute -- moy. 3 ET moy. 10 se calculent sur la même liste (cf. pricing/sales_stats.py)


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


def fetch_recent_sales(item_id: int, grade: str, *, limit: int = _SALES_STATS_LIMIT) -> list[tuple[float, str]]:
    """`limit` dernières ventes (item_id, grade), plus récente d'abord --
    couvre moy. 3 ET moy. 10 en une seule requête (cf. pricing/sales_stats.py),
    sur l'index idx_sales_item_date (item_id, sale_date DESC). Liste vide si
    aucune vente connue -- jamais d'exception pour "pas de données", cohérent
    avec fetch_card_by_id."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price, currency FROM sales WHERE item_id = %s AND grade = %s "
                "ORDER BY sale_date DESC, id DESC LIMIT %s",
                (item_id, grade, limit),
            )
            return [(float(price), currency) for price, currency in cur.fetchall()]
    finally:
        conn.close()


def count_sales_since(item_id: int, grade: str, since: date) -> int:
    """Nb de ventes conclues depuis `since` -- alimente la fenêtre glissante
    de liquidité (90j, cf. pricing/liquidity.py). 0 est une réponse valide
    (carte illiquide confirmée), à ne jamais confondre avec le None de
    fetch_latest_active_listing_count (jamais scrapé, cf. son docstring)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM sales WHERE item_id = %s AND grade = %s AND sale_date >= %s",
                (item_id, grade, since),
            )
            return cur.fetchone()[0]
    finally:
        conn.close()


def fetch_latest_active_listing_count(item_id: int, grade: str) -> int | None:
    """None si aucune ligne (jamais scrapé pour cet item/grade) -- PAS 0.
    LIMITE CONNUE : `active_listings` ne couvre aujourd'hui que le scellé
    (grade toujours 'ungraded', cf. commentaire de la table dans
    db/schema.sql -- "seul le scellé est synchronisé") -- pour un single,
    ceci renvoie None tant que l'ingestion n'est pas étendue aux singles.
    L'appelant ne doit jamais confondre ce None avec "0 annonce active"."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_count FROM active_listings WHERE item_id = %s AND grade = %s "
                "ORDER BY captured_at DESC LIMIT 1",
                (item_id, grade),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def fetch_latest_price_snapshot(item_id: int, grade: str) -> tuple[float, str] | None:
    """Dernier prix connu (`price_snapshots`), même table que
    lib/queries/gradingRoi.ts côté site -- réutilise
    idx_price_snapshots_item_grade_captured (déjà trié captured_at DESC,
    created_at DESC). None si jamais snapshotté à ce grade."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price, currency FROM price_snapshots WHERE item_id = %s AND grade = %s "
                "ORDER BY captured_at DESC, created_at DESC LIMIT 1",
                (item_id, grade),
            )
            row = cur.fetchone()
            return (float(row[0]), row[1]) if row else None
    finally:
        conn.close()


def fetch_language_siblings(card: Card) -> list[Card]:
    """Même carte (set_code + code), langues différentes -- PAS de repli
    fuzzy ici (contrairement à pricing/matching.py) : le code est déjà connu
    et fiable à ce stade (carte déjà identifiée), un faux-positif de langue
    serait pire qu'une comparaison manquante. Renvoie [] pour le scellé
    (card.code est NULL, cf. db/schema.sql::items)."""
    if not card.code or not card.set_code:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = %s AND set_code = %s AND UPPER(code) = UPPER(%s) "
                "AND category = %s AND language != %s",
                (card.tcg, card.set_code, card.code, card.category, card.language),
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_sealed_display_for_set(tcg: str, set_code: str | None, language: str) -> Card | None:
    """Le display scellé (Booster Box -- `category='sealed_display'` est
    déjà ce grain précis, pas besoin de filtrer Case/ETB/Tin séparément, cf.
    db/schema.sql::items) du même set ET de la même langue que la carte
    consultée. Filtré par langue plutôt qu'un premier trouvé au hasard :
    comparer une carte JP au prix d'un display EN serait trompeur. None si
    ce couple set/langue n'a pas de display référencé -- jamais deviné."""
    if not set_code:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = %s AND set_code = %s AND category = 'sealed_display' AND language = %s "
                "LIMIT 1",
                (tcg, set_code, language),
            )
            row = cur.fetchone()
            return _row_to_card(row) if row else None
    finally:
        conn.close()
