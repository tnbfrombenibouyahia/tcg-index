"""Calcule les sous-indices définis dans `methodology.py` à partir de
`price_snapshots` et écrit le résultat dans `index_values`.

Rejouable : recalcule tout l'historique de chaque sous-indice à chaque run
(pas d'incrémental) -- le volume actuel (quelques milliers d'items, une
poignée de jours pour l'instant) le permet largement, et ça garantit
qu'affiner la méthodo plus tard recalcule tout l'historique sans re-scraper
(cf. handoff doc §2, la règle d'or du projet : ingestion et calcul sont
découplés).

Ne lit que `price_snapshots.grade = 'ungraded'` -- le gradé (PSA7-10) est
scopé aux sets récents seulement (cf. mémoire projet "grading_tiers"), pas
assez de couverture pour porter un indice pour l'instant (cf.
methodology.py).

Ne lit que `source = 'pricecharting'` -- volontaire, pas un oubli. JustTCG
est en pause (cf. mémoire projet "justtcg_401_incident") et son historique
déjà en base vient des sondages de validation (Réserve 1/2, probe_combo.py) :
quelques items avec des dates éparses sur ~11 mois, pas une vraie collecte
quotidienne. Le mélanger produirait des jours à 1 seul constituant qui
polluent l'historique de l'indice sans rien représenter de réel. Si JustTCG
reprend un jour comme source active, ce filtre est le premier endroit à
revisiter.
"""
import argparse
import sys

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from index.methodology import INDEX_DEFINITIONS, build_series
from shared.db import get_connection

_DAILY_STATS_SQL_TEMPLATE = """
    WITH filtered AS (
        SELECT ps.item_id, ps.captured_at, ps.price
        FROM price_snapshots ps
        JOIN items i ON i.id = ps.item_id
        WHERE ps.grade = 'ungraded' AND ps.source = 'pricecharting'
            AND i.tcg = %s{category_clause}
    ),
    with_prev AS (
        SELECT
            item_id, captured_at, price,
            LAG(price) OVER (PARTITION BY item_id ORDER BY captured_at) AS prev_price
        FROM filtered
    )
    SELECT
        captured_at,
        AVG((price - prev_price) / prev_price)
            FILTER (WHERE prev_price IS NOT NULL AND prev_price != 0)::double precision AS avg_return,
        COUNT(*) AS constituents
    FROM with_prev
    GROUP BY captured_at
    ORDER BY captured_at
"""

_UPSERT_INDEX_VALUES_SQL = """
    INSERT INTO index_values (index_code, captured_at, value, constituents)
    VALUES %s
    ON CONFLICT (index_code, captured_at) DO UPDATE SET
        value = EXCLUDED.value,
        constituents = EXCLUDED.constituents
"""


def calculate_index(conn, index_code: str, tcg: str, category: str | None) -> int:
    """Recalcule tout l'historique d'un sous-indice et l'upsert dans
    `index_values`. `category=None` regroupe scellé + cartes (cf. les
    GLOBAL dans methodology.py). Retourne le nombre de jours écrits (0 si
    aucune donnée)."""
    if category is None:
        sql, params = _DAILY_STATS_SQL_TEMPLATE.format(category_clause=""), (tcg,)
    else:
        sql, params = _DAILY_STATS_SQL_TEMPLATE.format(category_clause=" AND i.category = %s"), (tcg, category)

    with conn.cursor() as cur:
        cur.execute(sql, params)
        daily_stats = cur.fetchall()
    if not daily_stats:
        return 0

    series = build_series(daily_stats)
    rows = [(index_code, captured_at, value, constituents) for captured_at, value, constituents in series]

    with conn.cursor() as cur:
        execute_values(cur, _UPSERT_INDEX_VALUES_SQL, rows)
    conn.commit()
    return len(rows)


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--index", choices=sorted(INDEX_DEFINITIONS), default=None,
        help="Ne calculer qu'un seul sous-indice (par défaut : tous).",
    )
    args = parser.parse_args()

    codes = [args.index] if args.index else sorted(INDEX_DEFINITIONS)

    conn = get_connection()
    try:
        for code in codes:
            definition = INDEX_DEFINITIONS[code]
            n = calculate_index(conn, code, definition["tcg"], definition["category"])
            if n:
                print(f"{code}: {n} jour(s) calculé(s).")
            else:
                print(f"{code}: aucune donnée disponible.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
