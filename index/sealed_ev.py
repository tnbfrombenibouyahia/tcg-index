"""Calcule le ratio EV (Expected Value) des scellés "Booster Box" : compare
leur prix marché à la valeur de leurs singles en loose (ungraded), pour
repérer les scellés potentiellement sous-évalués.

Deux modes, cf. discussion 2026-07-31 (pas de données de pull-rate réelles
disponibles, donc pas de vrai calcul d'EV par pack -- ces deux ratios sont
des signaux comparatifs entre sets, pas une espérance statistique) :
- ev_ratio_total : somme de TOUS les singles du set / prix du Booster Box
  -> richesse globale du set relative au prix du scellé.
- ev_ratio_top10 : somme des 10 singles les plus chers / prix du Booster Box
  -> potentiel de "chasse" (meilleurs pulls possibles), isolé du bruit des
  100+ commons à faible valeur qui dominent sinon la somme totale.

Un seul scellé retenu par set : le "Booster Box" standard -- pas "...Case"
(plusieurs box) ni "Half Booster Box" (moitié des packs).

Prix du box : médiane des 3 dernières ventes individuelles (`sales`, grade=
'ungraded', source='pricecharting'), pas l'agrégat PriceCharting seul -- cf.
incident Deoxys Booster Box du 2026-07-31 : leur "Ungraded" affichait $110.70
avec un delta de -$30,618 par rapport à la mise à jour précédente, à cause
d'une vente d'édition italienne mal classée dans l'historique du produit
anglais (produit "volume: rare" chez eux -- une seule vente aberrante suffit
à corrompre leur agrégat sur un item peu liquide). La médiane sur 3 ventes
absorbe une vente pourrie tant que 2 des 3 sont saines ; une moyenne ne le
ferait pas.

Score de fiabilité (0-100) = 100 * min(score_dispersion, score_fraicheur,
score_volume) -- un MIN, pas une moyenne, pour qu'un seul signal mauvais
plombe tout le score plutôt que d'être noyé par les deux autres (même
raisonnement que médiane > moyenne) :
- score_dispersion : 1.0 si les 3 ventes sont identiques, 0 si l'une vaut
  3x+ une autre (signe probable de mismatch d'édition/langue/gradation).
- score_fraicheur : 1.0 si les 3 ventes couvrent <= 30 jours, 0 si >= 365
  jours (le marché a pu bouger entre-temps).
- score_volume : nb de ventes trouvées / 3 -- pénalise mécaniquement un item
  avec seulement 1-2 ventes, même si elles sont propres (pas assez de
  données pour vraiment savoir).

Si aucune vente n'est trouvée (item très peu liquide, jamais vu passer sur
PriceCharting), on retombe sur l'agrégat `price_snapshots` comme avant, mais
`box_price_source='pricecharting_aggregate'` le signale explicitement (pas
recoupé) plutôt que de laisser croire que c'est aussi fiable qu'une médiane
vérifiée.
"""
import argparse
import sys
from datetime import date

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from shared.db import get_connection

TOP_N = 10
SALES_SAMPLE_SIZE = 3

# `language = 'EN'` : depuis l'ajout du scellé JP (cf. pricecharting.py
# PRICECHARTING_JP_SEALED_SLUGS), _SINGLES_PRICES_SQL ci-dessous ne peut
# comparer un Booster Box qu'aux singles EN du même set_code (aucun single JP
# n'est tracké) -- sans ce filtre, un box JP récupérerait un ratio EV calculé
# contre des singles d'une autre langue, un chiffre trompeur plutôt qu'une
# absence de donnée.
_BOXES_SQL = """
    SELECT id, tcg, set_code FROM items
    WHERE category = 'sealed'
        AND name ILIKE %s AND name NOT ILIKE %s AND name NOT ILIKE %s
        AND set_code IS NOT NULL
        AND language = 'EN'
"""

_BOX_LAST_SALES_SQL = """
    SELECT sale_date, price FROM sales
    WHERE item_id = %s AND grade = 'ungraded' AND source = 'pricecharting'
    ORDER BY sale_date DESC LIMIT %s
"""

_BOX_AGGREGATE_PRICE_SQL = """
    SELECT price FROM price_snapshots
    WHERE item_id = %s AND grade = 'ungraded' AND source = 'pricecharting'
    ORDER BY captured_at DESC LIMIT 1
"""

_SINGLES_PRICES_SQL = """
    SELECT DISTINCT ON (ps.item_id) ps.price
    FROM price_snapshots ps
    JOIN items i ON i.id = ps.item_id
    WHERE i.tcg = %s AND i.set_code = %s AND i.category = 'single'
        AND ps.grade = 'ungraded' AND ps.source = 'pricecharting'
    ORDER BY ps.item_id, ps.captured_at DESC
"""

_UPSERT_SQL = """
    INSERT INTO sealed_ev (
        item_id, captured_at, box_price, box_price_source, box_sales_used,
        box_dispersion, box_span_days, box_reliability_score,
        singles_count, singles_total_value, singles_top10_value,
        ev_ratio_total, ev_ratio_top10
    )
    VALUES %s
    ON CONFLICT (item_id, captured_at) DO UPDATE SET
        box_price = EXCLUDED.box_price,
        box_price_source = EXCLUDED.box_price_source,
        box_sales_used = EXCLUDED.box_sales_used,
        box_dispersion = EXCLUDED.box_dispersion,
        box_span_days = EXCLUDED.box_span_days,
        box_reliability_score = EXCLUDED.box_reliability_score,
        singles_count = EXCLUDED.singles_count,
        singles_total_value = EXCLUDED.singles_total_value,
        singles_top10_value = EXCLUDED.singles_top10_value,
        ev_ratio_total = EXCLUDED.ev_ratio_total,
        ev_ratio_top10 = EXCLUDED.ev_ratio_top10
"""


def _median(values: list[float]) -> float:
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _reliability(prices: list[float], dates: list[date]) -> tuple[float, float, int]:
    """Retourne (dispersion, span_days, score) pour un échantillon de ventes.
    `dispersion` = prix max / prix min (1.0 = ventes identiques). `score` sur
    100, cf. docstring du module pour le détail de la formule."""
    n = len(prices)
    dispersion = max(prices) / min(prices) if min(prices) > 0 else float("inf")
    span_days = (max(dates) - min(dates)).days if n > 1 else 0

    dispersion_score = max(0.0, min(1.0, 1 - (dispersion - 1) / 2))
    recency_score = max(0.0, min(1.0, 1 - max(0, span_days - 30) / 335))
    volume_score = min(n, SALES_SAMPLE_SIZE) / SALES_SAMPLE_SIZE

    score = round(100 * min(dispersion_score, recency_score, volume_score), 1)
    return round(dispersion, 4), span_days, score


def _box_price(cur, item_id: int) -> tuple[float | None, str, int, float | None, int | None, float | None]:
    """Prix d'un Booster Box : médiane des `SALES_SAMPLE_SIZE` dernières ventes
    individuelles si dispo, sinon repli sur l'agrégat `price_snapshots` (avec
    `box_price_source='pricecharting_aggregate'` pour le signaler). Retourne
    (price, source, sales_used, dispersion, span_days, reliability_score)."""
    cur.execute(_BOX_LAST_SALES_SQL, (item_id, SALES_SAMPLE_SIZE))
    sales = cur.fetchall()

    if sales:
        prices = [float(p) for _, p in sales]
        dates = [d for d, _ in sales]
        dispersion, span_days, score = _reliability(prices, dates)
        return _median(prices), "sales_median", len(prices), dispersion, span_days, score

    cur.execute(_BOX_AGGREGATE_PRICE_SQL, (item_id,))
    row = cur.fetchone()
    if not row or not row[0]:
        return None, "pricecharting_aggregate", 0, None, None, None
    return float(row[0]), "pricecharting_aggregate", 0, None, None, None


def calculate_sealed_ev(conn, tcg: str | None = None) -> int:
    """Recalcule le ratio EV pour tous les Booster Box (ou ceux d'un seul
    tcg si précisé). Retourne le nombre de scellés mis à jour (0 si aucun
    Booster Box n'a de prix, ou aucun single correspondant en base)."""
    query, params = _BOXES_SQL, ["%Booster Box", "%Case%", "%Half%"]
    if tcg:
        query += " AND tcg = %s"
        params.append(tcg)

    with conn.cursor() as cur:
        cur.execute(query, tuple(params))
        boxes = cur.fetchall()
    if not boxes:
        return 0

    today = date.today()
    rows = []

    with conn.cursor() as cur:
        for box_id, box_tcg, set_code in boxes:
            box_price, price_source, sales_used, dispersion, span_days, score = _box_price(cur, box_id)
            if box_price is None:
                continue

            cur.execute(_SINGLES_PRICES_SQL, (box_tcg, set_code))
            prices = sorted((float(r[0]) for r in cur.fetchall()), reverse=True)
            if not prices:
                continue

            total_value = sum(prices)
            top10_value = sum(prices[:TOP_N])

            rows.append((
                box_id, today, box_price, price_source, sales_used,
                dispersion, span_days, score,
                len(prices), total_value, top10_value,
                total_value / box_price, top10_value / box_price,
            ))

    if not rows:
        return 0

    with conn.cursor() as cur:
        execute_values(cur, _UPSERT_SQL, rows)
    conn.commit()
    return len(rows)


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tcg", choices=["pokemon", "one-piece"], default=None,
        help="Ne calculer que pour un seul TCG (par défaut : les deux).",
    )
    args = parser.parse_args()

    conn = get_connection()
    try:
        n = calculate_sealed_ev(conn, args.tcg)
        print(f"{n} Booster Box(es) mis à jour." if n else "Aucun Booster Box avec prix + singles trouvé.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
