"""Détecteur de cartes sous-évaluées : compare une valeur théorique composite
à un prix marché réel pour identifier les singles vendus en dessous de leur
coût de production statistique (pull cost) pondéré par la popularité du
personnage.

Modèle (cf. spec "La théorie, aplatie") :
    valeur_théorique = pull_cost × character_multiplier × collector_factor × demand_factor
    undervalued_score = valeur_théorique / prix_marché_réel

Si undervalued_score > 1 de manière significative → la carte vaut plus que
son prix de marché actuel → potentiellement sous-évaluée.

MVP : collector_factor = 1.0 et demand_factor = 1.0 (fixes). Les deux inputs
HIGH/HIGH (pull_cost et character_multiplier) portent 70% du signal. Les
facteurs collector/demand seront activés en V2 quand les données
(Google Trends, taux de gradation agrégé, inventaire) seront disponibles.

Pipeline (7 étapes atomiques, cf. spec "Le pipeline aplati pour ton agent") :
1. Pull rate structurel : 1 / nb_cartes_de_cette_rareté_dans_le_set.
   Source : `items.rarity` (backfillé par limitlesstcg.py).
2. Pack price : dérivé du Booster Box (sealed_ev / packs_per_box).
   Fallback : pack_price_table.py.
3. Pull cost : pack_price × (1 / pull_rate).
4. Character multiplier : lookup character_table.get_multiplier().
5. Valeur théorique : pull_cost × character_multiplier (× 1.0 × 1.0 MVP).
6. Prix marché : dernier price_snapshots ungraded PriceCharting.
7. Score et upsert : undervalued_score = valeur_théorique / market_price.

Rejouable : recalcule tout (pas d'incrémental) — même philosophie que
calculate.py et sealed_ev.py. Si la méthodologie évolue (nouveaux poids,
calibration pull_rate), tout l'historique se recalcule sans re-scraper.

Ne porte que les singles (`items.category = 'single'`) : le modèle pull_cost
n'a de sens que pour les cartes individuelles d'un set ouvert. Le scellé a
son propre signal dans `sealed_ev`.
"""
import argparse
import sys
from datetime import date

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from index import character_table, pack_price_table
from shared.db import get_connection

# ---------------------------------------------------------------------------
# Constantes MVP
# ---------------------------------------------------------------------------

COLLECTOR_FACTOR = 1.0  # V2 : grading_rate × google_trends
DEMAND_FACTOR    = 1.0  # V2 : qty_sold_recent / inventory_available

# Pull rate de fallback quand items.rarity est NULL (pas encore backfillé) :
# médiane approximative d'un pool de ~30 cartes rares dans un set moderne.
FALLBACK_PULL_RATE = 1 / 30

# Filtres de bruit MVP :
# - MIN_MARKET_PRICE : exclut les cartes quasi-sans-valeur (commons à $0.01
#   dont le pull_cost dépasse le marché pour une raison structurelle banale —
#   ce n'est pas un signal actionnable). Ajustable via --min-market-price.
# - MIN_PULL_COST : exclut les cartes avec un pull_cost inférieur à ce seuil
#   (sets vintage avec des packs à ~$4 et 100+ commons = pull_cost $0.40,
#   le signal est du bruit structurel, pas une opportunité réelle).
MIN_MARKET_PRICE = 0.50  # USD
MIN_PULL_COST    = 1.00  # USD
MAX_PULL_COST    = 500.0  # USD -- plafond : évite les box vintage à $2000+
                              #              qui produisent des pull_cost absurdes

# Score de coupure (undervalued_score >= seuil) pour l'affichage --top
DEFAULT_MIN_SCORE = 1.0
DEFAULT_TOP_N     = 50

# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

# Toutes les cartes singles avec leur dernier prix ungraded PriceCharting,
# groupées par (set_code, rarity) pour calculer le pull_rate structurel.
# La CTE `rarity_counts` compte les cartes par (tcg, set_code, rarity, language)
# pour fournir le pool de pull_rate directement en SQL, évitant un aller-retour
# Python pour chaque combinaison.
_SINGLES_WITH_MARKET_PRICE_SQL = """
    WITH latest_price AS (
        SELECT DISTINCT ON (item_id)
            item_id,
            price AS market_price
        FROM price_snapshots
        WHERE grade = 'ungraded' AND source = 'pricecharting'
        ORDER BY item_id, captured_at DESC
    ),
    rarity_counts AS (
        SELECT tcg, set_code, language, rarity,
               COUNT(*) AS cards_in_pool
        FROM items
        WHERE category = 'single'
            AND set_code IS NOT NULL
            AND rarity IS NOT NULL
            {tcg_filter}
        GROUP BY tcg, set_code, language, rarity
    )
    SELECT
        i.id          AS item_id,
        i.tcg,
        i.set_code,
        i.language,
        i.name        AS item_name,
        i.rarity,
        rc.cards_in_pool,
        lp.market_price
    FROM items i
    JOIN latest_price lp ON lp.item_id = i.id
    LEFT JOIN rarity_counts rc
           ON rc.tcg = i.tcg
          AND rc.set_code = i.set_code
          AND rc.language = i.language
          AND rc.rarity   = i.rarity
    WHERE i.category = 'single'
        AND i.set_code IS NOT NULL
        {tcg_filter}
    ORDER BY i.set_code, i.tcg, i.language, i.rarity
"""

# Prix du Booster Box par (set_code, language) depuis sealed_ev — dernier
# calcul disponible. On prend la médiane des sales si dispo (box_price_source
# = 'sales_median'), sinon l'agrégat. Filtre sur box_reliability_score >= 30
# pour éviter les box avec un seul prix douteux (cf. incident Deoxys, sealed_ev.py).
_BOX_PRICES_SQL = """
    SELECT
        i.set_code,
        i.language,
        i.tcg,
        se.box_price,
        se.box_reliability_score
    FROM sealed_ev se
    JOIN items i ON i.id = se.item_id
    WHERE se.captured_at = (
        SELECT MAX(captured_at) FROM sealed_ev se2 WHERE se2.item_id = se.item_id
    )
    ORDER BY i.set_code, i.language
"""

_UPSERT_SQL = """
    INSERT INTO undervalued_scores (
        item_id, captured_at,
        pack_price, pull_rate, pull_cost,
        character_multiplier, collector_factor, demand_factor,
        theoretical_value, market_price, undervalued_score
    )
    VALUES %s
    ON CONFLICT (item_id, captured_at) DO UPDATE SET
        pack_price           = EXCLUDED.pack_price,
        pull_rate            = EXCLUDED.pull_rate,
        pull_cost            = EXCLUDED.pull_cost,
        character_multiplier = EXCLUDED.character_multiplier,
        collector_factor     = EXCLUDED.collector_factor,
        demand_factor        = EXCLUDED.demand_factor,
        theoretical_value    = EXCLUDED.theoretical_value,
        market_price         = EXCLUDED.market_price,
        undervalued_score    = EXCLUDED.undervalued_score
"""

# ---------------------------------------------------------------------------
# Logique pure
# ---------------------------------------------------------------------------


def _pull_rate(cards_in_pool: int | None) -> float:
    """Pull rate structurel : 1 / nb_cartes_de_cette_rareté_dans_le_set.
    Retourne le fallback si le pool est inconnu (rarity NULL) ou aberrant."""
    if cards_in_pool and cards_in_pool > 0:
        return 1.0 / cards_in_pool
    return FALLBACK_PULL_RATE


def _pack_price_from_box(
    box_prices: dict[tuple[str, str], float],
    set_code: str,
    language: str,
    tcg: str,
) -> float | None:
    """Dérive le pack_price depuis le Booster Box (box_price / packs_per_box).
    Retourne None si aucun box n'est disponible pour ce (set_code, language)."""
    box = box_prices.get((set_code, language))
    if box is None:
        return None
    packs = pack_price_table.get_packs_per_box(tcg, language)
    return box / packs


def _resolve_pack_price(
    box_prices: dict[tuple[str, str], float],
    set_code: str,
    language: str,
    tcg: str,
) -> tuple[float | None, str]:
    """Retourne (pack_price, source) en essayant d'abord le Booster Box,
    puis la table statique. Source : 'box_derived' ou 'static_table'."""
    pp = _pack_price_from_box(box_prices, set_code, language, tcg)
    if pp is not None:
        return pp, "box_derived"
    pp = pack_price_table.get_pack_price(set_code)
    if pp is not None:
        return pp, "static_table"
    return None, "unknown"


def _theoretical_value(pull_cost: float, char_mult: float) -> float:
    """Valeur théorique MVP : pull_cost × character_multiplier × 1.0 × 1.0."""
    return pull_cost * char_mult * COLLECTOR_FACTOR * DEMAND_FACTOR


# ---------------------------------------------------------------------------
# Calcul principal
# ---------------------------------------------------------------------------


def calculate_undervalued(
    conn,
    tcg: str | None = None,
    dry_run: bool = False,
    min_score: float = DEFAULT_MIN_SCORE,
    min_market_price: float = MIN_MARKET_PRICE,
    min_pull_cost: float = MIN_PULL_COST,
    top_n: int | None = None,
    verbose: bool = False,
) -> list[dict]:
    """Recalcule les scores undervalued pour tous les singles (ou un seul TCG).

    Args:
        conn:             connexion psycopg2 active.
        tcg:              'pokemon' ou 'one-piece', ou None pour les deux.
        dry_run:          si True, calcule mais n'écrit pas en base.
        min_score:        seuil d'affichage (undervalued_score >= min_score).
        min_market_price: filtre bruit — ignore cartes < ce prix marché (USD).
        min_pull_cost:    filtre bruit — ignore si pull_cost < ce seuil (USD).
        top_n:            si fourni, ne retourne que les top_n résultats triés.
        verbose:          affiche les exclusions (set sans pack price, etc.).

    Returns:
        Liste de dicts représentant les lignes calculées, triée par
        undervalued_score décroissant.
    """
    today = date.today()
    tcg_filter = "AND i.tcg = %s" if tcg else ""

    # 1. Récupère tous les singles avec leur dernier prix marché
    sql = _SINGLES_WITH_MARKET_PRICE_SQL.format(tcg_filter=tcg_filter)
    params = (tcg,) if tcg else ()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        singles = cur.fetchall()

    if not singles:
        print("Aucun single avec prix marché trouvé.")
        return []

    # 2. Récupère les prix de Booster Box depuis sealed_ev
    with conn.cursor() as cur:
        cur.execute(_BOX_PRICES_SQL)
        box_rows = cur.fetchall()

    # Index : (set_code, language) → box_price (filtré sur reliability >= 30)
    box_prices: dict[tuple[str, str], float] = {}
    for set_code, language, _tcg, box_price, reliability in box_rows:
        if reliability is not None and reliability < 30:
            if verbose:
                print(f"  [box_skip] {set_code}/{language} reliability={reliability:.0f} < 30")
            continue
        if set_code and language and box_price:
            box_prices[(set_code, language)] = float(box_price)

    # 3. Calcule le score pour chaque single
    rows = []
    skipped_no_pack = set()
    skipped_no_market = 0

    for (item_id, item_tcg, set_code, language, item_name,
         rarity, cards_in_pool, market_price) in singles:

        if market_price is None or float(market_price) <= 0:
            skipped_no_market += 1
            continue

        mkt = float(market_price)
        if mkt < min_market_price:
            skipped_no_market += 1
            continue

        # Pack price
        pack_price, _source = _resolve_pack_price(
            box_prices, set_code, language, item_tcg
        )
        if pack_price is None:
            skipped_no_pack.add(f"{set_code}/{language}")
            continue

        # Pull rate et pull cost
        pr = _pull_rate(cards_in_pool)
        pull_cost = pack_price * (1.0 / pr)

        # Filtre pull_cost minimum (bruit structurel : commons vintage à $0.40)
        if pull_cost < min_pull_cost or pull_cost > MAX_PULL_COST:
            continue

        # Character multiplier
        char_mult = character_table.get_multiplier(item_name, item_tcg)

        # Valeur théorique et score
        theo = _theoretical_value(pull_cost, char_mult)
        mkt  = float(market_price)
        score = theo / mkt

        rows.append({
            "item_id":              item_id,
            "captured_at":          today,
            "pack_price":           round(pack_price, 2),
            "pull_rate":            round(pr, 6),
            "pull_cost":            round(pull_cost, 2),
            "character_multiplier": round(char_mult, 4),
            "collector_factor":     COLLECTOR_FACTOR,
            "demand_factor":        DEMAND_FACTOR,
            "theoretical_value":    round(theo, 2),
            "market_price":         round(mkt, 2),
            "undervalued_score":    round(score, 4),
            # champs extra pour l'affichage CLI, pas écrits en base
            "_name":                item_name,
            "_tcg":                 item_tcg,
            "_set_code":            set_code,
            "_rarity":              rarity,
        })

    # Tri décroissant
    rows.sort(key=lambda r: r["undervalued_score"], reverse=True)

    # Stats d'exclusion
    if verbose or skipped_no_pack:
        n_no_pack = sum(1 for _ in skipped_no_pack)
        print(
            f"  Exclus : {skipped_no_market} sans prix marché, "
            f"{n_no_pack} set(s) sans pack price "
            f"({', '.join(sorted(skipped_no_pack)[:5])}"
            f"{'...' if n_no_pack > 5 else ''})"
        )

    # Upsert (sauf dry_run)
    if not dry_run and rows:
        db_rows = [
            (
                r["item_id"], r["captured_at"],
                r["pack_price"], r["pull_rate"], r["pull_cost"],
                r["character_multiplier"], r["collector_factor"], r["demand_factor"],
                r["theoretical_value"], r["market_price"], r["undervalued_score"],
            )
            for r in rows
        ]
        with conn.cursor() as cur:
            execute_values(cur, _UPSERT_SQL, db_rows)
        conn.commit()

    # Filtre min_score et top_n pour le retour/affichage
    filtered = [r for r in rows if r["undervalued_score"] >= min_score]
    if top_n:
        filtered = filtered[:top_n]

    return filtered


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

_COL_W = (6, 40, 12, 10, 8, 8, 8)  # largeurs colonnes affichage

def _print_table(rows: list[dict]) -> None:
    header = (
        f"{'SCORE':>6}  {'NOM':<40}  {'SET':<12}  "
        f"{'RARITY':<10}  {'THEO':>8}  {'MKT':>8}  {'CHAR':>8}"
    )
    sep = "-" * len(header)
    print(header)
    print(sep)
    for r in rows:
        name  = r["_name"][:40]
        sset  = (r["_set_code"] or "")[:12]
        rarity = (r["_rarity"] or "")[:10]
        print(
            f"{r['undervalued_score']:>6.2f}  {name:<40}  {sset:<12}  "
            f"{rarity:<10}  {r['theoretical_value']:>8.2f}  "
            f"{r['market_price']:>8.2f}  {r['character_multiplier']:>8.2f}"
        )


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tcg", choices=["pokemon", "one-piece"], default=None,
        help="Ne calculer que pour un seul TCG (défaut : les deux).",
    )
    parser.add_argument(
        "--min-score", type=float, default=DEFAULT_MIN_SCORE,
        help=f"Score minimum affiché (défaut : {DEFAULT_MIN_SCORE}).",
    )
    parser.add_argument(
        "--min-market-price", type=float, default=MIN_MARKET_PRICE,
        help=f"Prix marché minimum USD — filtre bruit (défaut : {MIN_MARKET_PRICE}).",
    )
    parser.add_argument(
        "--min-pull-cost", type=float, default=MIN_PULL_COST,
        help=f"Pull cost minimum USD — filtre bruit structurel (défaut : {MIN_PULL_COST}).",
    )
    parser.add_argument(
        "--top", type=int, default=None,
        help=f"N'afficher que les N premiers résultats.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Calcule mais n'écrit pas dans `undervalued_scores`.",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Affiche les exclusions (sets sans pack price, etc.).",
    )
    args = parser.parse_args()

    conn = get_connection()
    try:
        results = calculate_undervalued(
            conn,
            tcg=args.tcg,
            dry_run=args.dry_run,
            min_score=args.min_score,
            min_market_price=args.min_market_price,
            min_pull_cost=args.min_pull_cost,
            top_n=args.top,
            verbose=args.verbose,
        )
        if results:
            _print_table(results)
            print(f"\n{len(results)} carte(s) avec score >= {args.min_score}.")
        else:
            print("Aucune carte au-dessus du seuil.")
        if args.dry_run:
            print("(dry-run : rien écrit en base)")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
