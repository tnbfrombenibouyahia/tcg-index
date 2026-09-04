"""Détecteur de sous-évaluation RELATIVE : compare chaque carte à ses pairs
directs (même set, même rareté, même langue) plutôt qu'à une valeur
théorique absolue -- complémentaire à `index/undervalued.py`, pas un
remplacement.

Pourquoi un 2e signal alors que `undervalued.py` existe déjà (cf. discussion
2026-08-29/30, tcg-index-handoff.md) : le modèle absolu (pull_cost ×
character_multiplier) rate un cas concret -- deux SIR du même set, popularité
de personnage comparable, l'une à 40% du prix de l'autre sans raison
visible. `undervalued.py` ne peut pas voir ça : il compare chaque carte à SA
PROPRE valeur théorique dérivée du prix du Booster Box, jamais les cartes
entre elles. Ce module fait l'inverse -- aucune notion de pull_cost/pack
price, donc AUCUNE dépendance à `sealed_ev` : il note même les sets sans
Booster Box mappé, que `undervalued.py` doit skipper entièrement
(`skipped_no_pack`, cf. son docstring).

Modèle :
    normalized_price = market_price / character_multiplier
    (le pull_cost théorique est CONSTANT au sein d'un groupe de pairs -- même
    set, même rareté, même langue -> même pull_rate -- donc sous le modèle
    théorique de undervalued.py, la seule variation "expliquée" restante
    entre deux cartes du même groupe est character_multiplier. Diviser par
    ce multiplicateur retire cet effet, ce qui reste doit être comparable
    entre pairs.)

    peer_median_normalized = médiane leave-one-out des normalized_price du
    groupe (EXCLUT la carte notée elle-même -- cf. _leave_one_out_median :
    avec des groupes de 4-5 cartes, l'inclure la ferait contaminer son
    propre repère de comparaison à hauteur de 20-25%).

    relative_value_score = peer_median_normalized / normalized_price
    Score > 1 : la carte se négocie sous la médiane de ses pairs, popularité
    de personnage prise en compte -- candidate à une sous-évaluation
    relative. Score < 1 : au-dessus de ses pairs (candidate à une
    SURévaluation relative, pas exposée par la CLI par défaut mais présente
    en base pour qui veut trier dans l'autre sens).

Groupe de pairs : (tcg, set_code, language, rarity, qualifier_bucket) --
`qualifier_bucket` ajouté après un 1er dry-run réel (2026-08-30) qui a
exposé le vrai piège : (set, rareté) SEUL mélange des variantes au libellé
de rareté brut identique mais au marché totalement différent -- ex. groupe
"Super Rare" de one-piece-ex EB03, où "Nico Robin [SP]" ($486), "Nico Robin
(055) (SP)" ($1450) et "Nico Robin (055) (Alternate Art)" ($50) partagent
`rarity='Super Rare'` mais n'ont RIEN de comparable. Même motif que
`pricing/repository.py::_qualifier_tokens` (extraction du contenu entre
parenthèses/crochets du nom, hors qualificatifs purement numériques comme
"(055)") -- dupliqué ici en miniature plutôt qu'importé, même discipline
que ce fichier ("modules de matching volontairement autonomes"). Un
qualificatif absent -> bucket "" (cartes "normales", l'essentiel du
volume) ; deux libellés différents ("Alternate Art" vs "Alternate Art
Manga") restent volontairement deux buckets distincts -- le 1er dry-run a
confirmé des prix réels très différents entre les deux, pas une variation
de formatage à fusionner.

`MAX_GROUP_PRICE_SPREAD` (défaut 20x, max/min de market_price au sein d'un
groupe) : filet de sécurité en plus du qualificatif, découvert sur le même
dry-run -- un groupe de Commons EB02 à $1-2 mélangé à des Commons EB02
à $700-3786 (AUCUN qualificatif dans les noms, donc le fix ci-dessus ne
l'attrape pas) s'est révélé être une vraie anomalie de donnée en amont
(mauvais mapping produit PriceCharting, pas une vraie variation de marché).
Un groupe qui dépasse ce ratio est exclu EN ENTIER, jamais deviné quelle
carte est fautive -- la médiane qui en sortirait serait fausse pour
CHAQUE carte du groupe, pas seulement l'aberrante. Même philosophie que
`MAX_PULL_COST` dans undervalued.py.

Rareté NULL exclue (contrairement à undervalued.py, qui a un pull_rate de
repli) : un groupe de pairs sans rareté connue n'a pas de sens, jamais
deviné. `MIN_PEER_GROUP_SIZE` (défaut 4) exclut les groupes trop petits pour
qu'une médiane leave-one-out veuille dire quelque chose (à 3 cartes, la
médiane leave-one-out n'est qu'une moyenne de 2 valeurs).

Rejouable comme le reste de `index/` : recalcule tout à chaque run, pas
d'incrémental. Ne porte que les singles, même restriction que
`undervalued.py` (le scellé a `sealed_ev`, pas de notion de "pairs" pour un
Booster Box).
"""
import argparse
import re
import statistics
import sys
import unicodedata
from collections import defaultdict
from datetime import date

from dotenv import load_dotenv
from psycopg2.extras import execute_values

from index import character_table
from index.undervalued import MIN_MARKET_PRICE  # seuil de bruit partagé -- cf. son commentaire
from shared.db import get_connection

# ---------------------------------------------------------------------------
# Constantes MVP
# ---------------------------------------------------------------------------

# En dessous, une médiane leave-one-out n'a plus vraiment de sens (cf.
# docstring du module) -- 4 cartes minimum, dont 3 servent de repère pour
# chacune.
MIN_PEER_GROUP_SIZE = 4

# Volontairement plus haut que le seuil 1.0 de undervalued.py : ce signal
# compare des groupes plus petits (quelques cartes par set/rareté/langue
# contre tout un TCG pour le modèle absolu), donc plus sensible au bruit --
# un score juste au-dessus de 1 est souvent un écart d'arrondi, pas un
# vrai signal. 1.3 ~= la carte se négocie ~23% sous la médiane de ses pairs.
DEFAULT_MIN_SCORE = 1.3
DEFAULT_TOP_N = 50

# cf. docstring du module -- filet de sécurité contre une anomalie de
# donnée en amont (mauvais mapping produit), découvert sur données réelles.
MAX_GROUP_PRICE_SPREAD = 20.0

# ---------------------------------------------------------------------------
# Qualificatif de variante -- même motif que pricing/repository.py::
# _qualifier_tokens (regex identique), dupliqué en miniature plutôt
# qu'importé, cf. docstring du module.
# ---------------------------------------------------------------------------

_QUALIFIER_RE = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")


def _qualifier_bucket(name: str) -> str:
    """Clé de bucket stable à partir du contenu entre parenthèses/crochets
    du nom -- "" si la carte n'a aucun qualificatif (cas normal, l'essentiel
    du volume). Un contenu purement numérique (ex. "(055)", numéro apitcg)
    est ignoré, même exclusion que pricing/repository.py::_qualifier_tokens
    -- sinon "Nico Robin [SP]" et "Nico Robin (055) (SP)" finiraient dans
    deux buckets différents pour un simple numéro sans rapport avec la
    variante réelle."""
    contents = [c for c in _QUALIFIER_RE.findall(name) if not c.strip().isdigit()]
    if not contents:
        return ""
    normalized = unicodedata.normalize("NFKD", " ".join(contents)).encode("ascii", "ignore").decode()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized.lower())
    return " ".join(sorted(set(normalized.split())))


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

# Même CTE latest_price que undervalued.py (même définition de "prix
# marché" pour les deux signaux structurels -- pas de raison qu'elle
# diverge). rarity IS NOT NULL : cf. docstring, un groupe de pairs sans
# rareté connue n'a pas de sens.
_SINGLES_WITH_MARKET_PRICE_SQL = """
    WITH latest_price AS (
        SELECT DISTINCT ON (item_id)
            item_id,
            price AS market_price
        FROM price_snapshots
        WHERE grade = 'ungraded' AND source = 'pricecharting'
        ORDER BY item_id, captured_at DESC
    )
    SELECT
        i.id          AS item_id,
        i.tcg,
        i.set_code,
        i.language,
        i.name        AS item_name,
        i.rarity,
        lp.market_price
    FROM items i
    JOIN latest_price lp ON lp.item_id = i.id
    WHERE i.category = 'single'
        AND i.set_code IS NOT NULL
        AND i.rarity IS NOT NULL
        {tcg_filter}
    ORDER BY i.set_code, i.tcg, i.language, i.rarity
"""

_UPSERT_SQL = """
    INSERT INTO relative_value_scores (
        item_id, captured_at, peer_group_size, character_multiplier,
        market_price, normalized_price, peer_median_normalized, relative_value_score
    )
    VALUES %s
    ON CONFLICT (item_id, captured_at) DO UPDATE SET
        peer_group_size         = EXCLUDED.peer_group_size,
        character_multiplier    = EXCLUDED.character_multiplier,
        market_price             = EXCLUDED.market_price,
        normalized_price          = EXCLUDED.normalized_price,
        peer_median_normalized    = EXCLUDED.peer_median_normalized,
        relative_value_score      = EXCLUDED.relative_value_score
"""

# ---------------------------------------------------------------------------
# Logique pure
# ---------------------------------------------------------------------------


def _leave_one_out_median(values: list[float], index: int) -> float:
    """Médiane de `values` SANS l'élément à `index` -- la carte notée ne
    doit jamais contaminer son propre repère de comparaison (cf. docstring
    du module)."""
    others = values[:index] + values[index + 1:]
    return statistics.median(others)


def score_peer_group(cards: list[dict]) -> list[dict]:
    """`cards` : cartes d'UN SEUL groupe de pairs (même tcg/set_code/
    language/rarity), chacune avec au moins {market_price, character_multiplier}.
    Retourne la même liste de dicts, enrichie de normalized_price/
    peer_median_normalized/relative_value_score. Ne touche pas à la DB --
    séparé de calculate_relative_value pour rester testable sans connexion,
    même discipline que undervalued.py::_pull_rate/_theoretical_value."""
    normalized = [c["market_price"] / c["character_multiplier"] for c in cards]
    results = []
    for i, c in enumerate(cards):
        peer_median = _leave_one_out_median(normalized, i)
        score = peer_median / normalized[i] if normalized[i] > 0 else 0.0
        results.append({
            **c,
            "normalized_price": normalized[i],
            "peer_median_normalized": peer_median,
            "relative_value_score": score,
        })
    return results


# ---------------------------------------------------------------------------
# Calcul principal
# ---------------------------------------------------------------------------


def calculate_relative_value(
    conn,
    tcg: str | None = None,
    dry_run: bool = False,
    min_score: float = DEFAULT_MIN_SCORE,
    min_market_price: float = MIN_MARKET_PRICE,
    min_peer_group_size: int = MIN_PEER_GROUP_SIZE,
    max_group_price_spread: float = MAX_GROUP_PRICE_SPREAD,
    top_n: int | None = None,
    verbose: bool = False,
) -> list[dict]:
    """Recalcule les scores de valeur relative pour tous les singles (ou un
    seul TCG). Même signature/philosophie que
    undervalued.py::calculate_undervalued (rejouable, dry_run, top_n)."""
    today = date.today()
    tcg_filter = "AND i.tcg = %s" if tcg else ""

    sql = _SINGLES_WITH_MARKET_PRICE_SQL.format(tcg_filter=tcg_filter)
    params = (tcg,) if tcg else ()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        singles = cur.fetchall()

    if not singles:
        print("Aucun single avec prix marché et rareté connue trouvé.")
        return []

    # Groupe par (tcg, set_code, language, rarity, qualifier_bucket) -- cf.
    # docstring du module pour pourquoi qualifier_bucket est nécessaire
    # (variantes SP/Alternate Art/Manga au même rarity brut mais au marché
    # incomparable).
    groups: dict[tuple, list[dict]] = defaultdict(list)
    skipped_no_market = 0
    for item_id, item_tcg, set_code, language, item_name, rarity, market_price in singles:
        if market_price is None or float(market_price) < min_market_price:
            skipped_no_market += 1
            continue
        groups[(item_tcg, set_code, language, rarity, _qualifier_bucket(item_name))].append({
            "item_id": item_id,
            "market_price": float(market_price),
            "character_multiplier": character_table.get_multiplier(item_name, item_tcg),
            "_name": item_name,
            "_tcg": item_tcg,
            "_set_code": set_code,
            "_rarity": rarity,
        })

    rows = []
    skipped_small_group = 0
    skipped_price_spread = 0
    for group_cards in groups.values():
        if len(group_cards) < min_peer_group_size:
            skipped_small_group += len(group_cards)
            continue
        prices = [c["market_price"] for c in group_cards]
        # cf. MAX_GROUP_PRICE_SPREAD -- groupe trop hétérogène pour être
        # des pairs réels (anomalie de donnée en amont la plupart du
        # temps), exclu EN ENTIER plutôt que de deviner quelle carte est
        # fautive.
        if max(prices) > min(prices) * max_group_price_spread:
            skipped_price_spread += len(group_cards)
            continue
        for scored in score_peer_group(group_cards):
            rows.append({
                "item_id":                scored["item_id"],
                "captured_at":            today,
                "peer_group_size":        len(group_cards),
                "character_multiplier":   round(scored["character_multiplier"], 4),
                "market_price":           round(scored["market_price"], 2),
                "normalized_price":       round(scored["normalized_price"], 2),
                "peer_median_normalized": round(scored["peer_median_normalized"], 2),
                "relative_value_score":   round(scored["relative_value_score"], 4),
                "_name":     scored["_name"],
                "_tcg":      scored["_tcg"],
                "_set_code": scored["_set_code"],
                "_rarity":   scored["_rarity"],
            })

    rows.sort(key=lambda r: r["relative_value_score"], reverse=True)

    if verbose:
        print(
            f"  Exclus : {skipped_no_market} sous le prix marché minimum, "
            f"{skipped_small_group} dans un groupe de pairs < {min_peer_group_size} cartes, "
            f"{skipped_price_spread} dans un groupe à l'écart de prix > {max_group_price_spread:.0f}x "
            "(probable anomalie de donnée, cf. docstring du module)."
        )

    if not dry_run and rows:
        db_rows = [
            (
                r["item_id"], r["captured_at"], r["peer_group_size"], r["character_multiplier"],
                r["market_price"], r["normalized_price"], r["peer_median_normalized"], r["relative_value_score"],
            )
            for r in rows
        ]
        with conn.cursor() as cur:
            execute_values(cur, _UPSERT_SQL, db_rows)
        conn.commit()

    filtered = [r for r in rows if r["relative_value_score"] >= min_score]
    if top_n:
        filtered = filtered[:top_n]

    return filtered


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _print_table(rows: list[dict]) -> None:
    header = (
        f"{'SCORE':>6}  {'NOM':<40}  {'SET':<12}  "
        f"{'RARITY':<10}  {'MKT':>8}  {'PAIRS':>6}  {'PEERS':>5}"
    )
    sep = "-" * len(header)
    print(header)
    print(sep)
    for r in rows:
        name = r["_name"][:40]
        sset = (r["_set_code"] or "")[:12]
        rarity = (r["_rarity"] or "")[:10]
        print(
            f"{r['relative_value_score']:>6.2f}  {name:<40}  {sset:<12}  "
            f"{rarity:<10}  {r['market_price']:>8.2f}  {r['peer_median_normalized']:>6.2f}  "
            f"{r['peer_group_size']:>5}"
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
        help=f"Prix marché minimum USD -- filtre bruit (défaut : {MIN_MARKET_PRICE}).",
    )
    parser.add_argument(
        "--min-peer-group-size", type=int, default=MIN_PEER_GROUP_SIZE,
        help=f"Taille minimum d'un groupe de pairs pour être noté (défaut : {MIN_PEER_GROUP_SIZE}).",
    )
    parser.add_argument(
        "--max-group-price-spread", type=float, default=MAX_GROUP_PRICE_SPREAD,
        help=f"Ratio max/min de prix toléré dans un groupe de pairs, au-delà exclu comme "
             f"probable anomalie de donnée (défaut : {MAX_GROUP_PRICE_SPREAD:.0f}).",
    )
    parser.add_argument(
        "--top", type=int, default=None,
        help="N'afficher que les N premiers résultats.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Calcule mais n'écrit pas dans `relative_value_scores`.",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Affiche les exclusions (groupes trop petits, etc.).",
    )
    args = parser.parse_args()

    conn = get_connection()
    try:
        results = calculate_relative_value(
            conn,
            tcg=args.tcg,
            dry_run=args.dry_run,
            min_score=args.min_score,
            min_market_price=args.min_market_price,
            min_peer_group_size=args.min_peer_group_size,
            max_group_price_spread=args.max_group_price_spread,
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
