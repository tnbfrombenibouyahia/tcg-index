"""Lectures DB sur `items`, `sales`, `active_listings` et `price_snapshots`
pour le module pricing. Même style que shared/sync_log.py : connexion dédiée
par appel, try/finally: conn.close(), SQL inline (pas d'ORM, cohérent avec
le reste du repo).
"""
from datetime import date

from pricing.grading_roi import GradingRoiInputs
from pricing.models import Card
from shared.db import get_connection

_CARD_COLUMNS = "id, name, code, set_code, tcg, category, language, rarity, image_url"
_SALES_STATS_LIMIT = 10  # borne haute -- moy. 3 ET moy. 10 se calculent sur la même liste (cf. pricing/sales_stats.py)


def _row_to_card(row: tuple) -> Card:
    return Card(
        id=row[0], name=row[1], code=row[2], set_code=row[3],
        tcg=row[4], category=row[5], language=row[6], rarity=row[7], image_url=row[8],
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
    """Dernière ligne connue, quel que soit son âge -- None si aucune ligne
    (jamais scrapé pour cet item/grade) -- PAS 0. `grade` : 'ungraded' ou
    'graded' (toutes notes PSA confondues, eBay ne permet pas de filtrer
    plus finement -- cf. docstring de ingestion/sources/ebay.py). Jamais un
    grade PSA précis ici, il n'existera jamais en base.

    Deux régimes de fraîcheur selon `items.category`, cf.
    pricing/active_listings_source.py pour le détail :
    - 'sealed' : couvert par le batch hebdomadaire existant
      (`ingestion/sources/ebay.py::run_ebay_listings_sync`) -- cette
      fonction reste le seul point de lecture, jamais plus vieille qu'une
      semaine pour un item déjà repéré une fois.
    - 'single' : depuis le 2026-08-22, scrapé À LA DEMANDE au moment de la
      consultation (cf. active_listings_source.py) -- ne JAMAIS appeler
      cette fonction directement pour un single, elle ne fait aucun scrape
      live et renverrait une ligne périmée ou None. L'ancien batch par
      rotation (~5 semaines/cycle) est retiré : rejeté après une semaine
      d'usage réel -- un chiffre vieux d'un mois n'aide personne à décider
      d'un achat, cf. discussion utilisateur du 2026-08-22."""
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


def fetch_active_listing_count_for_date(item_id: int, grade: str, captured_at: date) -> int | None:
    """Lecture STRICTE à une date précise (contrairement à
    fetch_latest_active_listing_count, qui prend la plus récente quel que
    soit son âge) -- utilisée par pricing/active_listings_source.py pour
    savoir si le cache du jour est déjà chaud avant de scraper en direct.
    None si pas encore scrapé CE jour précis pour cet item/grade (même si
    une ligne plus ancienne existe)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_count FROM active_listings "
                "WHERE item_id = %s AND grade = %s AND captured_at = %s",
                (item_id, grade, captured_at),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


_UPSERT_ACTIVE_LISTING_SQL = """
    INSERT INTO active_listings (item_id, captured_at, marketplace, buying_option, grade, listing_count)
    VALUES (%s, %s, 'ebay', 'all', %s, %s)
    ON CONFLICT (item_id, captured_at, marketplace, buying_option, grade) DO NOTHING
"""


def upsert_active_listing_count(item_id: int, grade: str, listing_count: int, captured_at: date) -> None:
    """DO NOTHING sur conflit (pas DO UPDATE) : une seule écriture par
    (item, jour, grade) suffit -- si deux requêtes concurrentes scrapent le
    même item le même jour (rare mais possible côté verdict ponctuel), la
    première gagne, la seconde n'écrase pas pour un chiffre qui n'a de
    toute façon quasi aucune chance d'avoir bougé entre les deux appels."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_UPSERT_ACTIVE_LISTING_SQL, (item_id, captured_at, grade, listing_count))
        conn.commit()
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


_GRADING_ROI_INPUTS_COLUMNS = (
    "ungraded_price, psa7_price, psa8_price, psa9_price, psa95_price, psa10_price, "
    "card_n7, card_n8, card_n9, card_n95, card_n10, "
    "sr_n7, sr_n8, sr_n9, sr_n95, sr_n10, "
    "set_n7, set_n8, set_n9, set_n95, set_n10, "
    "tcg_n7, tcg_n8, tcg_n9, tcg_n95, tcg_n10"
)


def fetch_grading_roi_inputs(item_id: int) -> GradingRoiInputs | None:
    """None si jamais matérialisé pour cet item -- `grading_roi_inputs` n'est
    rempli que par un run --tier (cf. index/grading_roi_inputs.py), pas le
    run quotidien : une carte pas encore repassée dans son palier n'a
    simplement pas de ligne. L'appelant doit traiter ça comme "calculateur
    indisponible pour l'instant", jamais comme un ROI nul."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_GRADING_ROI_INPUTS_COLUMNS} FROM grading_roi_inputs "
                "WHERE item_id = %s ORDER BY captured_at DESC LIMIT 1",
                (item_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            (ungraded, p7, p8, p9, p95, p10,
             c7, c8, c9, c95, c10,
             sr7, sr8, sr9, sr95, sr10,
             set7, set8, set9, set95, set10,
             tcg7, tcg8, tcg9, tcg95, tcg10) = row

            grade_prices: dict[str, float] = {}
            for grade, price in (("psa7", p7), ("psa8", p8), ("psa9", p9), ("psa9.5", p95), ("psa10", p10)):
                if price is not None:
                    grade_prices[grade] = float(price)

            def _counts(n7, n8, n9, n95, n10) -> dict[str, int]:
                return {"psa7": n7, "psa8": n8, "psa9": n9, "psa9.5": n95, "psa10": n10}

            return GradingRoiInputs(
                ungraded_price=float(ungraded),
                grade_prices=grade_prices,
                grade_counts={
                    "card": _counts(c7, c8, c9, c95, c10),
                    "set_rarity": _counts(sr7, sr8, sr9, sr95, sr10),
                    "set": _counts(set7, set8, set9, set95, set10),
                    "tcg": _counts(tcg7, tcg8, tcg9, tcg95, tcg10),
                },
            )
    finally:
        conn.close()
