"""Matérialise les ingrédients du calculateur ROI de gradation
(cf. web/lib/gradingRoi.ts + web/lib/queries/gradingRoi.ts) dans
`grading_roi_inputs`, une fois par run --tier plutôt qu'à chaque chargement
de page web.

Ne calcule PAS le ROI : seulement les données coûteuses à dériver (dernier
prix connu par grade, comptage des ventes gradées à 4 niveaux d'agrégation
carte/set+rareté/set/tcg). Port SQL 1:1 des CTE graded_prices/prices/
item_grade_counts/context/levels qui vivaient auparavant dans
lib/queries/gradingRoi.ts (fetchCandidates) et tournaient en live à chaque
requête -- ~3.3s mesurés (plein scan de price_snapshots + sales), cf.
mémoire projet "slow_pages_missing_indexes", incident 2026-08-06.

Le calcul ROI proprement dit (frais PSA par palier, risque de sous-note,
%) reste 100% dans lib/gradingRoi.ts (TypeScript, pur) -- jamais porté ici
-- puisqu'il doit rester recalculable en live côté client quand
l'utilisateur modifie les hypothèses dans le calculateur interactif
(GradingRoiCalculator). Dupliquer cette formule ici créerait un risque de
divergence pour aucun gain : elle est déjà bon marché en JS (arithmétique
pure sur ~11k lignes, largement sous la milliseconde), seule la requête SQL
qui l'alimentait était le problème.

Dépend de `sales.grade` et `price_snapshots.grade != 'ungraded'`, toutes
deux uniquement mises à jour par un run --tier (cf. docstring
ingestion/orchestrator.py) -- comme index/volume.py, n'a donc de sens
qu'appelé depuis le bloc --tier, jamais le run quotidien (recalculer sur
des données inchangées serait du travail perdu).
"""
import argparse
import sys
from datetime import date

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from shared.db import get_connection

# ---------------------------------------------------------------------------
# SQL -- port 1:1 des CTE de lib/queries/gradingRoi.ts::fetchCandidates
# ---------------------------------------------------------------------------

_CANDIDATES_SQL = """
    WITH graded_prices AS (
        SELECT DISTINCT ON (item_id, grade) item_id, grade, price
        FROM price_snapshots
        WHERE grade IN ('ungraded', 'psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
        ORDER BY item_id, grade, captured_at DESC, created_at DESC
    ),
    prices AS (
        SELECT
            item_id,
            MAX(price) FILTER (WHERE grade = 'ungraded') AS ungraded_price,
            MAX(price) FILTER (WHERE grade = 'psa7')     AS psa7_price,
            MAX(price) FILTER (WHERE grade = 'psa8')     AS psa8_price,
            MAX(price) FILTER (WHERE grade = 'psa9')     AS psa9_price,
            MAX(price) FILTER (WHERE grade = 'psa9.5')   AS psa95_price,
            MAX(price) FILTER (WHERE grade = 'psa10')    AS psa10_price
        FROM graded_prices
        GROUP BY item_id
    ),
    item_grade_counts AS (
        SELECT
            item_id,
            COUNT(*) FILTER (WHERE grade = 'psa7')   AS n7,
            COUNT(*) FILTER (WHERE grade = 'psa8')   AS n8,
            COUNT(*) FILTER (WHERE grade = 'psa9')   AS n9,
            COUNT(*) FILTER (WHERE grade = 'psa9.5') AS n95,
            COUNT(*) FILTER (WHERE grade = 'psa10')  AS n10
        FROM sales
        WHERE grade IN ('psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
        GROUP BY item_id
    ),
    context AS (
        SELECT
            i.id AS item_id, i.tcg, i.set_code, i.rarity,
            COALESCE(g.n7, 0)  AS n7,
            COALESCE(g.n8, 0)  AS n8,
            COALESCE(g.n9, 0)  AS n9,
            COALESCE(g.n95, 0) AS n95,
            COALESCE(g.n10, 0) AS n10
        FROM items i
        LEFT JOIN item_grade_counts g ON g.item_id = i.id
        WHERE i.category = 'single'
    ),
    levels AS (
        SELECT
            item_id, n7, n8, n9, n95, n10,
            SUM(n7)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n7,
            SUM(n8)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n8,
            SUM(n9)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n9,
            SUM(n95) OVER (PARTITION BY tcg, set_code, rarity) AS sr_n95,
            SUM(n10) OVER (PARTITION BY tcg, set_code, rarity) AS sr_n10,
            SUM(n7)  OVER (PARTITION BY tcg, set_code) AS set_n7,
            SUM(n8)  OVER (PARTITION BY tcg, set_code) AS set_n8,
            SUM(n9)  OVER (PARTITION BY tcg, set_code) AS set_n9,
            SUM(n95) OVER (PARTITION BY tcg, set_code) AS set_n95,
            SUM(n10) OVER (PARTITION BY tcg, set_code) AS set_n10,
            SUM(n7)  OVER (PARTITION BY tcg) AS tcg_n7,
            SUM(n8)  OVER (PARTITION BY tcg) AS tcg_n8,
            SUM(n9)  OVER (PARTITION BY tcg) AS tcg_n9,
            SUM(n95) OVER (PARTITION BY tcg) AS tcg_n95,
            SUM(n10) OVER (PARTITION BY tcg) AS tcg_n10
        FROM context
    )
    SELECT
        p.item_id,
        p.ungraded_price, p.psa7_price, p.psa8_price, p.psa9_price, p.psa95_price, p.psa10_price,
        l.n7, l.n8, l.n9, l.n95, l.n10,
        l.sr_n7, l.sr_n8, l.sr_n9, l.sr_n95, l.sr_n10,
        l.set_n7, l.set_n8, l.set_n9, l.set_n95, l.set_n10,
        l.tcg_n7, l.tcg_n8, l.tcg_n9, l.tcg_n95, l.tcg_n10
    FROM prices p
    JOIN levels l ON l.item_id = p.item_id
    WHERE p.ungraded_price IS NOT NULL
      AND (
        p.psa7_price IS NOT NULL OR p.psa8_price IS NOT NULL OR p.psa9_price IS NOT NULL
        OR p.psa95_price IS NOT NULL OR p.psa10_price IS NOT NULL
      )
"""

_UPSERT_SQL = """
    INSERT INTO grading_roi_inputs (
        item_id, captured_at, ungraded_price,
        psa7_price, psa8_price, psa9_price, psa95_price, psa10_price,
        card_n7, card_n8, card_n9, card_n95, card_n10,
        sr_n7, sr_n8, sr_n9, sr_n95, sr_n10,
        set_n7, set_n8, set_n9, set_n95, set_n10,
        tcg_n7, tcg_n8, tcg_n9, tcg_n95, tcg_n10
    )
    VALUES %s
    ON CONFLICT (item_id, captured_at) DO UPDATE SET
        ungraded_price = EXCLUDED.ungraded_price,
        psa7_price     = EXCLUDED.psa7_price,
        psa8_price     = EXCLUDED.psa8_price,
        psa9_price     = EXCLUDED.psa9_price,
        psa95_price    = EXCLUDED.psa95_price,
        psa10_price    = EXCLUDED.psa10_price,
        card_n7 = EXCLUDED.card_n7, card_n8 = EXCLUDED.card_n8, card_n9 = EXCLUDED.card_n9,
        card_n95 = EXCLUDED.card_n95, card_n10 = EXCLUDED.card_n10,
        sr_n7 = EXCLUDED.sr_n7, sr_n8 = EXCLUDED.sr_n8, sr_n9 = EXCLUDED.sr_n9,
        sr_n95 = EXCLUDED.sr_n95, sr_n10 = EXCLUDED.sr_n10,
        set_n7 = EXCLUDED.set_n7, set_n8 = EXCLUDED.set_n8, set_n9 = EXCLUDED.set_n9,
        set_n95 = EXCLUDED.set_n95, set_n10 = EXCLUDED.set_n10,
        tcg_n7 = EXCLUDED.tcg_n7, tcg_n8 = EXCLUDED.tcg_n8, tcg_n9 = EXCLUDED.tcg_n9,
        tcg_n95 = EXCLUDED.tcg_n95, tcg_n10 = EXCLUDED.tcg_n10
"""


def calculate_grading_roi_inputs(conn, dry_run: bool = False) -> int:
    """Recalcule `grading_roi_inputs` pour tous les candidats éligibles
    (ungraded connu + au moins un prix gradé), les deux TCG confondus --
    même filtre que fetchCandidates côté web, pas de scope --tcg ici
    puisque toute la table est réécrite à chaque run (comme
    undervalued_scores).

    Returns:
        Nombre de lignes upsertées.
    """
    today = date.today()

    with conn.cursor() as cur:
        cur.execute(_CANDIDATES_SQL)
        candidates = cur.fetchall()

    if not candidates:
        return 0

    db_rows = [(c[0], today, *c[1:]) for c in candidates]

    if not dry_run:
        with conn.cursor() as cur:
            execute_values(cur, _UPSERT_SQL, db_rows)
        conn.commit()

    return len(db_rows)


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Calcule mais n'écrit pas en base.")
    args = parser.parse_args()

    conn = get_connection()
    try:
        n = calculate_grading_roi_inputs(conn, dry_run=args.dry_run)
    finally:
        conn.close()

    print(f"{n} candidat(s) ROI de gradation {'calculé(s) (dry-run)' if args.dry_run else 'écrit(s)'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
