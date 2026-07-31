"""Calcule le volume d'échange quotidien à partir de `sales` et écrit le
résultat dans `index_volume` -- distinct de `index_values` (le niveau de
prix) : ici on compte des transactions, pas des cotations.

Grain identique à `index_values` (même `INDEX_DEFINITIONS` de
methodology.py) : (index_code, captured_at). Contrairement au calcul de
prix, pas de chaînage ici -- chaque jour est un agrégat indépendant
(nb de ventes, somme des prix), donc pas besoin de `methodology.build_series`.

Toutes les gradations sont comptées ensemble (ungraded + psa7-10) : une
vente est une vente, le volume total du marché ne distingue pas la
gradation -- contrairement au calcul de prix (`calculate.py`) qui doit lui
choisir UNE série de prix cohérente par item pour ne pas mélanger des
niveaux de prix différents.

Couverture actuelle très partielle, pas un bug : `sales` ne remonte que les
singles de sets sortis dans les 18 derniers mois (cf. mémoire projet
"sales_volume_tracking"), alimentée par le cron `grades-and-sales.yml`
(lun/mer/ven). Le scellé et les sets plus anciens n'auront donc jamais de
volume sous ce scope -- les sous-indices *_SEALED resteront à 0 tant que le
scraping de ventes ne couvre pas le scellé.
"""
import argparse
import sys

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from index.methodology import INDEX_DEFINITIONS
from shared.db import get_connection

_DAILY_VOLUME_SQL_TEMPLATE = """
    SELECT
        s.sale_date AS captured_at,
        COUNT(*) AS sales_count,
        SUM(s.price) AS sales_value
    FROM sales s
    JOIN items i ON i.id = s.item_id
    WHERE i.tcg = %s{category_clause}
    GROUP BY s.sale_date
    ORDER BY s.sale_date
"""

_UPSERT_INDEX_VOLUME_SQL = """
    INSERT INTO index_volume (index_code, captured_at, sales_count, sales_value)
    VALUES %s
    ON CONFLICT (index_code, captured_at) DO UPDATE SET
        sales_count = EXCLUDED.sales_count,
        sales_value = EXCLUDED.sales_value
"""


def calculate_volume(conn, index_code: str, tcg: str, category: str | None) -> int:
    """Recalcule tout l'historique de volume d'un sous-indice et l'upsert
    dans `index_volume`. `category=None` regroupe scellé + cartes (cf. les
    GLOBAL dans methodology.py). Retourne le nombre de jours écrits (0 si
    aucune vente enregistrée)."""
    if category is None:
        sql, params = _DAILY_VOLUME_SQL_TEMPLATE.format(category_clause=""), (tcg,)
    else:
        sql, params = _DAILY_VOLUME_SQL_TEMPLATE.format(category_clause=" AND i.category = %s"), (tcg, category)

    with conn.cursor() as cur:
        cur.execute(sql, params)
        daily_volume = cur.fetchall()
    if not daily_volume:
        return 0

    rows = [(index_code, captured_at, count, value) for captured_at, count, value in daily_volume]
    with conn.cursor() as cur:
        execute_values(cur, _UPSERT_INDEX_VOLUME_SQL, rows)
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
            n = calculate_volume(conn, code, definition["tcg"], definition["category"])
            if n:
                print(f"{code}: {n} jour(s) de volume calculé(s).")
            else:
                print(f"{code}: aucune vente enregistrée.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
