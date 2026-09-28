"""Quelles cartes méritent une requête PriceCharting PAR CARTE (prix PSA 7-10 +
historique de ventes) ? Les prix « ungraded » d'un set, eux, arrivent tous en
une seule requête de page (cf. `pricecharting.sync_price_snapshots_for_set`) :
c'est ce prix brut, déjà gratuit, qui sert ici de critère de valeur.

Règle (décidée avec l'utilisateur le 2026-09-28, pour alimenter les alertes
d'arbitrage `arbitrage/` qui exigent un prix PSA 9 ET PSA 10 -- cf.
`arbitrage/candidates.py`) :

- **One Piece** (EN et JP) : prix brut >= 10 $, OU rareté « hit » (Leader,
  Super Rare, Secret Rare, Treasure Rare). Constat chiffré : 58 % des cartes EN
  à PSA 10 >= 100 $ ne sont PAS des hits par rareté (variantes alt-art /
  parallèles qui gardent la rareté de la carte de base) -> la rareté seule
  raterait la majorité de la valeur.
- **Pokémon** (EN et JP) : TOUT ce qui est sorti avant 2012 (même les communes :
  en vintage, un PSA 10 multiplie le prix brut par 50 ou plus), OU `interest_tier`
  (SIR/IR/FA/secret/chase, cf. `index/interest_tier.py`), OU prix brut >= 10 $.
- **Scellé** : jamais concerné (règle inchangée).

`interest_tier` n'est calculé que pour Pokémon, et `release_date` n'existe pas
côté JP (aucune source ne la fournit, cf. `pricecharting.py`) : le « avant 2012 »
JP passe donc par une liste de sets écrite à la main (`PRE_2012_JP_SLUGS`).
"""
from __future__ import annotations

from datetime import date
from typing import Any, Mapping

# Seuil de prix brut (USD) à partir duquel une carte mérite sa requête PSA.
# Calibré le 2026-09-28 sur les cartes One Piece/Pokémon JP où prix brut ET
# PSA 10 sont connus : à 5 $ on retrouve 59 % (OP EN) à 82 % (OP JP) des
# cartes à PSA 10 >= 100 $ ; le reste est surtout du bruit (PSA 10 issu d'UNE
# vente sur une carte à < 2 $). Relevé à 10 $ à la demande de l'utilisateur.
MIN_RAW_PRICE_USD = 10.0

VINTAGE_CUTOFF = date(2012, 1, 1)

# Comparés en minuscules. Les abréviations existent en base (3 SR, 2 L, 2 SEC
# côté One Piece EN).
ONE_PIECE_HIT_RARITIES = frozenset({
    "leader", "super rare", "secret rare", "treasure rare", "sr", "sec", "l", "tr",
})

# Sets JP sortis avant 2012 (slug sans le préfixe `pokemon-jp-`). Les dates de
# 1996 à 2010 (Base -> Call of Legends) viennent de l'API TCGdex ; TCGdex ne
# couvre ni l'ère Diamond & Pearl ni Black & White, complétées à la main
# (2026-09-28). Frontière 2011/2012 volontairement approximative : se tromper
# sur un set de communes BW coûte quelques requêtes, pas une carte de valeur
# (le prix brut >= 10 $ et `interest_tier` la rattrapent de toute façon).
# Ajouter un slug ici suffit ; un slug inconnu de PRICECHARTING_JP_ALL_SLUGS
# est refusé par tests/test_card_selection.py.
PRE_2012_JP_SLUGS = frozenset({
    # Avant le TCG proprement dit : cartes à collectionner annexes des années 90-2000.
    "1995-combo-deck", "1996-carddass", "1997-carddass", "1998-carddass", "1999-carddass",
    "2000-carddass", "2004-carddass-zukan", "2005-carddass-zukan", "1999-merlin",
    "2000-merlin-sticker", "topsun", "vending", "meiji-promo", "marumiya",
    "sealdass-series-1", "sealdass-series-2", "sealdass-series-3", "sealdass-series-4",
    "sealdass-stitch-touch", "old-maid", "hanafuda", "amada-super-dx",
    # Base, Jungle, Fossil, Team Rocket, Gym, Neo (1996-2001).
    "expansion-pack", "jungle", "mystery-of-the-fossils", "rocket-gang",
    "challenge-from-the-darkness", "gold-silver-new-world", "crossing-the-ruins",
    "awakening-legends", "darkness-and-to-light", "intro-pack-neo", "neo-premium-file",
    "yamabuki-city-gym", "hanada-city-gym", "nivi-city-gym", "guren-town-gym",
    "southern-islands", "tropical-island", "rainbow-island",
    # VS, web, e-Card (2001-2002).
    "vs", "web", "expedition-expansion-pack", "the-town-on-no-map", "wind-from-the-sea",
    "mysterious-mountains", "split-earth", "e-starter-deck", "pokekyun-collection",
    # ADV (2003-2004) et PCG (2004-2007).
    "miracle-of-the-desert", "rulers-of-the-heavens", "magma-vs-aqua-two-ambitions",
    "undone-seal", "flight-of-legends", "clash-of-the-blue-sky", "rocket-gang-strikes-back",
    "golden-sky-silvery-ocean", "mirage-forest", "holon-research", "holon-phantom",
    "miracle-crystal", "offense-and-defense-of-the-furthest-ends", "world-champions-pack",
    "pokepark-forest", "10th-movie-commemoration-promo", "11th-movie-commemoration-promo",
    "movie-commemoration-random", "movie-commemoration-vs-pack",
    # Diamond & Pearl / Platinum (2006-2009) -- liste manuelle.
    "space-time", "secret-of-the-lakes", "shining-darkness", "moonlit-pursuit",
    "temple-of-anger", "cruel-traitor", "intense-fight-in-the-destroyed-sky",
    "bonds-to-the-end-of-time", "beat-of-the-frontier", "advent-of-arceus",
    "rage-of-the-broken-heavens", "cry-from-the-mysterious", "entry-pack-2008",
    "entry-pack-dpt",
    # HeartGold/SoulSilver et Legend (2009-2010).
    "heartgold-collection", "soulsilver-collection", "reviving-legends", "lost-link",
    "clash-at-the-summit", "legendary-heartbeat", "beginning-set-hs",
    # Black & White, début (fin 2010 - 2011) -- liste manuelle.
    "black-collection", "white-collection", "red-collection", "hail-blizzard",
    "psycho-drive", "dark-rush", "cold-flare", "freeze-bolt", "dragon-blade",
    "dragon-blast", "dragon-selection", "battle-theme-deck-victini",
    # Half decks et decks préconstruits de la même période.
    "deoxys-half-deck", "deoxys-constructed-starter-deck", "deoxys-high-class",
    "emerald-half-deck", "charizard-half-deck", "charizard-g-half-deck",
    "gallade-half-deck", "garchomp-half-deck", "garchomp-c-half-deck", "heatran-half-deck",
    "infernape-half-deck", "palkia-half-deck", "pikachu-half-deck", "regigigas-half-deck",
    "ampharos-ex-starter-set", "groudon-constructed-starter-deck",
    "rayquaza-constructed-starter-deck", "metagross-constructed-starter-deck",
    "gardevoir-constructed-starter-deck", "steelix-constructed-starter-deck",
    "tyranitar-constructed-starter-deck", "kyogre-ex-starter-deck", "mewtwo-ex-starter-deck",
    "salamence-starter-deck", "flygon-starter-deck", "mudkip-starter-deck",
    "torchic-starter-deck", "treecko-starter-deck", "totodile-side-deck",
    "feraligatr-starter-deck", "meganium-starter-deck", "typhlosion-starter-deck",
    "arceus-lvx-deck", "palkia-lvx-constructed-deck", "regigigas-lvx-collection",
    "darkrai-starter", "lucario-starter", "hyper-metal-chain-deck", "magma-deck-kit",
    "team-aqua-deck",
})

PRE_2012_JP_SET_CODES = frozenset(f"pokemon-jp-{slug}" for slug in PRE_2012_JP_SLUGS)


def _is_pre_2012(item: Mapping[str, Any]) -> bool:
    release_date = item.get("release_date")
    if release_date is not None:
        return release_date < VINTAGE_CUTOFF
    return item.get("set_code") in PRE_2012_JP_SET_CODES


def is_selected(item: Mapping[str, Any], raw_price: float | None) -> bool:
    """`item` : au minimum `tcg`, `category`, `set_code`, `rarity`,
    `interest_tier`, `release_date` (les clés absentes valent None). `raw_price`
    : dernier prix « ungraded » en USD lu sur la page de set."""
    if item.get("category") != "single":
        return True
    if raw_price is not None and float(raw_price) >= MIN_RAW_PRICE_USD:
        return True
    if item.get("tcg") == "one-piece":
        rarity = item.get("rarity")
        return rarity is not None and rarity.strip().lower() in ONE_PIECE_HIT_RARITIES
    if item.get("tcg") == "pokemon":
        return item.get("interest_tier") is not None or _is_pre_2012(item)
    return False


def should_store_price(item: Mapping[str, Any], raw_price: float | None) -> bool:
    """Faut-il archiver le prix « ungraded » du jour dans `price_snapshots` ?
    Inchangé pour le scellé et One Piece. Pour un single Pokémon : oui s'il est
    sélectionné, ou si sa rareté n'est pas encore connue (une carte tout juste
    sortie n'est pas encore classée par le backfill hebdo, elle ne doit pas
    être coupée avant d'avoir pu l'être) ; sinon non, cohérent avec la purge
    d'historique du 2026-08-08."""
    if item.get("category") != "single" or item.get("tcg") != "pokemon":
        return True
    if item.get("rarity") is None:
        return True
    return is_selected(item, raw_price)
