"""Backfill `items.rarity` par héritage plutôt que par scraping : les buckets
"réimpression" (deck-exclusives, miscellaneous-cards-products,
battle-academy...) citent souvent le VRAI set d'origine de la carte dans
`name` (ex. "Scrafty - 74/99 (Next Destinies)") -- la rareté existe déjà
dans `items` pour ce set d'origine (backfillée par
`ingestion/sources/limitlesstcg.py`), juste pas reliée à cette ligne-ci.
Complète ce backfill, ne le remplace pas -- cf. mémoire projet
"limitlesstcg_rarity_backfill".

Découvert en creusant l'écart de couverture EN restant (2026-08-08) :
échantillonner ces buckets avant de les tagger 'Promo' en bloc (comme
`sync_promo_rarities`) a montré qu'ils contiennent en majorité de vraies
réimpressions, pas des promos pures -- les tagger aurait été une régression
de qualité de données, pas un gain.

Deux issues possibles selon ce que dit la parenthèse finale de `name` :
1. Un vrai nom de set (ex. "Next Destinies", "XY Phantom Forces") -> on
   retrouve le `set_code` correspondant par recouvrement de tokens contre
   les noms officiels LimitlessTCG déjà résolus (même technique que
   `limitlesstcg.build_pokemon_set_mapping`, seuil plus strict + marge sur
   le 2e candidat -- jamais de devinette entre deux sets proches), puis on
   copie la rareté de la carte de même numérateur dans ce set d'origine --
   SEULEMENT si elle y est déjà connue.
2. Un simple marqueur de canal de distribution sans set cité (retailer
   exclusif, prerelease, international...) -- classification 'Promo'
   directe (`RETAIL_MARKER_ONLY`, chaque entrée vue dans l'échantillon
   réel), pas une supposition sur une rareté qu'on ne connaît pas.

Tout le reste (traitement d'impression seul type "Cosmos Holo" sans set
cité, ou aucune parenthèse du tout, ou `code` sans "/" donc pas de
numérateur exploitable) reste NULL -- pas de source fiable, cf. docstring
`RETAIL_MARKER_ONLY` pour la liste des cas volontairement exclus.
"""
from __future__ import annotations

import re

from psycopg2.extras import execute_values

from ingestion.sources import limitlesstcg as lt
from shared.db import get_connection

_ERA_PREFIX_RE = re.compile(r"^(SV|SWSH|SM|BW|DP|XY|EX|HGSS)\s+", re.IGNORECASE)

# Marqueurs de canal de distribution vus dans l'échantillon réel (2026-08-08,
# cf. docstring module) qui ne citent aucun set d'origine -- la carte est
# légitimement "Promo" par ce canal (retailer exclusif, kit de prerelease,
# version internationale...), indépendamment du personnage. Volontairement
# PAS inclus : les traitements d'impression seuls ("Cosmos Holo", "Cracked
# Ice Holo", "Non-Holo", "Reverse Cosmos Holo", "Water Web Holo", "Wave
# Foil", "Sheen Holo", "Line Holo", "Mirage Holo", "Cosmo Holo/Foil") --
# ceux-là ne disent rien sur la rareté, ni les "* Stamped"/"* Stamp" (citent
# un thème de set moderne, pas le set d'origine réel de l'impression).
RETAIL_MARKER_ONLY: frozenset[str] = frozenset({
    "international version", "holiday calendar",
    "build-a-bear workshop exclusive", "toys r us promo", "toys r us",
    "gamestop exclusive", "eb games exclusive", "prerelease kit exclusive",
    "prerelease", "library exclusive", "costco exclusive",
    "best buy exclusive", "eu exclusive", "retail exclusive",
    "general mills promo", "premium collection promo",
    "battle arena deck exclusive", "no e-reader",
    "2013 unnumbered", "2017 unnumbered",
})

# Buckets EN identifiés comme des réimpressions (cf. commentaire d'élagage
# sous `limitlesstcg.EN_PROMO_SET_CODES`) -- volontairement PAS
# `pokemon-blister-exclusives` (échantillon 100% traitement d'impression
# seul type "Cosmos Holo", aucun set cité, rien à hériter) ni les trainer
# kits (numérotation autonome #1-30, pas de set cité).
RARITY_INHERIT_SET_CODES: tuple[str, ...] = (
    "pokemon-deck-exclusives",
    "pokemon-miscellaneous-cards-products",
    "pokemon-battle-academy",
    "pokemon-battle-academy-2022",
    "pokemon-battle-academy-2024",
)


def _parenthetical(name: str) -> str | None:
    m = re.search(r"\(([^)]+)\)\s*$", name or "")
    return m.group(1).strip() if m else None


def build_official_name_index() -> dict[str, str]:
    """`set_code` -> nom officiel LimitlessTCG, pour tous les sets EN déjà
    résolus (matching auto + `EN_SET_CODE_OVERRIDES`, cf.
    `limitlesstcg.build_pokemon_set_mapping`)."""
    mapping = lt.build_pokemon_set_mapping()
    en_limitless = lt.fetch_pokemon_set_list()
    return {code: en_limitless[slug] for slug, code in mapping.items() if slug in en_limitless}


def find_origin_set_code(cited_text: str, name_index: dict[str, str]) -> str | None:
    """`cited_text` (contenu de la parenthèse finale) -> notre `set_code`
    d'origine. Seuil élevé (>=0.8) ET marge nette sur le 2e candidat
    (>=0.3) : on préfère ne rien inférer plutôt que deviner entre deux sets
    dont le nom se ressemble."""
    text = _ERA_PREFIX_RE.sub("", cited_text).strip()
    ctoks = lt._set_name_tokens(text)
    if not ctoks:
        return None
    best_code, best_score, second_score = None, 0.0, 0.0
    for code, official_name in name_index.items():
        otoks = lt._set_name_tokens(official_name)
        if not otoks:
            continue
        union = ctoks | otoks
        s = len(ctoks & otoks) / len(union) if union else 0.0
        if s > best_score:
            second_score = best_score
            best_score, best_code = s, code
        elif s > second_score:
            second_score = s
    if best_score >= 0.8 and (best_score - second_score) >= 0.3:
        return best_code
    return None


def sync_rarity_inheritance(set_codes: tuple[str, ...] = RARITY_INHERIT_SET_CODES) -> dict:
    name_index = build_official_name_index()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, name, code FROM items
                   WHERE tcg = 'pokemon' AND language = 'EN' AND category = 'single'
                     AND rarity IS NULL AND set_code = ANY(%s) AND code LIKE '%%/%%'""",
                (list(set_codes),),
            )
            rows = cur.fetchall()

        inherit_updates: list[tuple[int, str]] = []
        promo_ids: list[int] = []
        unresolved = 0

        # Comparaison des numérateurs faite côté Python (pas `::int` en SQL)
        # -- CockroachDB interprète un cast `::int` sur une chaîne avec zéro
        # de padding ("091") comme de l'octal (strconv.ParseInt base 0) et
        # rejette les chiffres 8/9, alors que Python `int("091")` n'a pas ce
        # problème. Un cache par `origin_code` évite de re-fetch le même set
        # pour chaque carte à hériter.
        numerator_cache: dict[str, dict[int, str]] = {}

        def numerator_rarities(origin_code: str) -> dict[int, str]:
            if origin_code not in numerator_cache:
                with conn.cursor() as c:
                    c.execute(
                        """SELECT code, rarity FROM items
                           WHERE tcg='pokemon' AND language='EN' AND set_code=%s
                             AND code ~ '^[0-9]+/' AND rarity IS NOT NULL""",
                        (origin_code,),
                    )
                    numerator_cache[origin_code] = {
                        int(c_code.split("/")[0]): rarity for c_code, rarity in c.fetchall()
                    }
            return numerator_cache[origin_code]

        for item_id, name, code in rows:
            try:
                numerator = int(code.split("/")[0])
            except ValueError:
                unresolved += 1
                continue

            cited = _parenthetical(name)
            resolved = False
            if cited:
                origin_code = find_origin_set_code(cited, name_index)
                if origin_code:
                    rarity = numerator_rarities(origin_code).get(numerator)
                    if rarity:
                        inherit_updates.append((item_id, rarity))
                        resolved = True
                if not resolved and cited.lower() in RETAIL_MARKER_ONLY:
                    promo_ids.append(item_id)
                    resolved = True
            if not resolved:
                unresolved += 1

        if inherit_updates:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    "UPDATE items SET rarity = data.rarity FROM (VALUES %s) AS data (id, rarity) WHERE items.id = data.id",
                    inherit_updates,
                    page_size=len(inherit_updates),
                )
        if promo_ids:
            with conn.cursor() as cur:
                cur.execute("UPDATE items SET rarity = 'Promo' WHERE id = ANY(%s)", (promo_ids,))
        conn.commit()
    finally:
        conn.close()

    return {
        "total": len(rows),
        "inherited": len(inherit_updates),
        "promo_tagged": len(promo_ids),
        "unresolved": unresolved,
    }


def main():
    from dotenv import load_dotenv

    load_dotenv()
    result = sync_rarity_inheritance()
    print(f"Sur {result['total']} carte(s) sans rareté dans les buckets réimpression :")
    print(f"  {result['inherited']} héritée(s) d'un set d'origine cité")
    print(f"  {result['promo_tagged']} taguée(s) 'Promo' (marqueur de canal seul)")
    print(f"  {result['unresolved']} non résolue(s) (rien de fiable à en tirer)")


if __name__ == "__main__":
    main()
