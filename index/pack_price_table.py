"""Table statique de prix de pack (USD) par set_code — fallback quand aucun
Booster Box n'est trouvé dans `sealed_ev` pour dériver le pack_price.

Logique principale (cf. index/undervalued.py `_pack_price_from_sealed_ev`) :
    pack_price = box_price / packs_per_box

Si le Booster Box n'est pas en base (item non mappé, pas de ventes récentes,
item filtré), on tombe sur cette table. Elle couvre les sets récents les plus
importants et quelques sets vintage populaires.

Nombre de packs par box :
- Pokémon EN standard : 36 packs/box (depuis Scarlet & Violet)
- Pokémon JP standard : 30 packs/box
- One Piece EN : 24 packs/box
- One Piece JP : 12 packs/box (boosters plus chers, ~¥600/pack)

Ces valeurs servent aussi à la dérivation depuis le Booster Box : si le set
est en base mais que le compte de packs n'est pas connu, on prend le défaut
par TCG/langue.
"""
from __future__ import annotations

# Nombre de packs par Booster Box, par (tcg, language). Utilisé à la fois
# comme fallback et comme diviseur dans la dérivation depuis sealed_ev.
PACKS_PER_BOX: dict[tuple[str, str], int] = {
    ("pokemon",   "EN"): 36,
    ("pokemon",   "JP"): 30,
    ("one-piece", "EN"): 24,
    ("one-piece", "JP"): 12,
}

DEFAULT_PACKS_PER_BOX = 36  # fallback si (tcg, language) inconnu

# Prix de pack USD hardcodés, par set_code.
# Source : prix marché observés mi-2026 (singles loose pack market).
# À compléter au fur et à mesure ; les sets sans entrée ici ET sans Booster
# Box en base seront exclus du calcul (tracé dans les logs).
PACK_PRICES_USD: dict[str, float] = {
    # --- Pokémon Scarlet & Violet era (EN) ---
    "pokemon-scarlet-violet":                   5.50,
    "pokemon-paldea-evolved":                   5.25,
    "pokemon-obsidian-flames":                  5.50,
    "pokemon-paradox-rift":                     6.00,
    "pokemon-paldean-fates":                    9.50,
    "pokemon-temporal-forces":                  5.50,
    "pokemon-twilight-masquerade":              5.50,
    "pokemon-shrouded-fable":                   5.75,
    "pokemon-stellar-crown":                    5.50,
    "pokemon-surging-sparks":                   5.50,
    "pokemon-prismatic-evolutions":             14.00,
    "pokemon-journey-together":                 5.50,
    "pokemon-destined-rivals":                  5.50,
    "pokemon-scarlet-violet-151":               8.50,
    "pokemon-scarlet-violet-black-star-promos": None,   # pas de box
    # --- Pokémon Sword & Shield era (EN) ---
    "pokemon-sword-shield":                     4.50,
    "pokemon-rebel-clash":                      4.25,
    "pokemon-darkness-ablaze":                  4.50,
    "pokemon-champions-path":                   None,   # set spécial, pas de box
    "pokemon-vivid-voltage":                    4.25,
    "pokemon-shining-fates":                    9.00,
    "pokemon-battle-styles":                    4.25,
    "pokemon-chilling-reign":                   4.50,
    "pokemon-evolving-skies":                   6.50,
    "pokemon-celebrations":                     None,   # set spécial
    "pokemon-fusion-strike":                    4.50,
    "pokemon-brilliant-stars":                  5.00,
    "pokemon-astral-radiance":                  4.75,
    "pokemon-pokemon-go":                       None,   # set spécial
    "pokemon-lost-origin":                      4.75,
    "pokemon-silver-tempest":                   4.75,
    "pokemon-crown-zenith":                     None,   # set spécial
    # --- Pokémon Sun & Moon era (EN, sélection populaire) ---
    "pokemon-hidden-fates":                     None,   # set spécial, packs rares
    "pokemon-cosmic-eclipse":                   4.00,
    "pokemon-team-up":                          3.75,
    "pokemon-unbroken-bonds":                   4.00,
    "pokemon-unified-minds":                    4.00,
    "pokemon-forbidden-light":                  3.75,
    "pokemon-ultra-prism":                      3.75,
    "pokemon-crimson-invasion":                 3.75,
    "pokemon-burning-shadows":                  4.00,
    "pokemon-guardians-rising":                 3.75,
    "pokemon-sun-moon":                         4.00,
    # --- Pokémon JP (sets récents) ---
    "sv1":   3.50, "sv2":   3.50, "sv2a":  4.00, "sv3":   3.50,
    "sv3a":  5.50, "sv4":   3.50, "sv4a":  3.75, "sv5":   3.50,
    "sv5a":  5.00, "sv5k":  3.50, "sv6":   3.50, "sv6a":  3.75,
    "sv7":   3.75, "sv7a":  4.00, "sv8":   3.75, "sv8a":  4.50,
    "sv8b":  4.00, "sv9":   3.75, "sv9a":  4.00,
    # --- One Piece EN ---
    "one-piece-romance-dawn":       3.75,
    "one-piece-paramount-war":      3.75,
    "one-piece-pillars-of-strength":3.75,
    "one-piece-kingdoms-of-intrigue":3.75,
    "one-piece-awakening-of-the-new-era": 3.75,
    "one-piece-wings-of-the-captain":    4.00,
    "one-piece-500-years-in-the-future": 4.00,
    "one-piece-two-legends":             4.00,
    "one-piece-emperors-in-the-new-world": 4.00,
    "one-piece-royal-blood":             4.25,
    # --- One Piece JP ---
    "OP01": 7.50, "OP02": 7.50, "OP03": 7.50, "OP04": 7.50,
    "OP05": 7.50, "OP06": 7.50, "OP07": 7.50, "OP08": 7.50,
    "OP09": 7.50, "OP10": 8.00,
}


def get_pack_price(set_code: str) -> float | None:
    """Prix de pack USD pour un set_code, ou None si inconnu/non applicable."""
    return PACK_PRICES_USD.get(set_code)


def get_packs_per_box(tcg: str, language: str) -> int:
    """Nombre de packs par Booster Box pour ce (tcg, langue)."""
    return PACKS_PER_BOX.get((tcg, language), DEFAULT_PACKS_PER_BOX)
