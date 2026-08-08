"""Table statique de popularité des personnages pour le calcul du
character_multiplier (cf. index/undervalued.py).

Logique : normalized_score (7-10) / 10 → un multiplicateur entre 0.7 et 1.0.
- 10 = personnage iconique (Charizard, Pikachu, Luffy) → ×1.0
- 9  = top-tier, forte communauté de collecteurs           → ×0.9
- 8  = personnage apprécié, demande solide                 → ×0.8
- 7  = personnage de second plan ou obscur                 → ×0.7

Pour un personnage absent de la table → FALLBACK_MULTIPLIER = 0.8 (neutre,
légèrement en dessous du tier 9). On ne pénalise pas trop l'inconnu : il
peut s'agir d'un nouveau set dont la popularité n'est pas encore encodée.

Extraction du nom depuis items.name :
- Pokémon : le premier token présent dans la table est retenu ("Charizard ex
  #199" → "Charizard", "Pikachu VMAX" → "Pikachu").
- One Piece : scan de droite à gauche pour gérer "Monkey D. Luffy" → "Luffy".
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Tables de scores
# ---------------------------------------------------------------------------

# Pokémon : scores 7-10
_POKEMON_SCORES: dict[str, int] = {
    # Tier 10 — icônes absolues
    "Charizard":   10, "Pikachu":    10, "Mewtwo":    10, "Mew":        10,
    "Eevee":       10, "Gengar":     10, "Snorlax":   10, "Umbreon":    10,
    "Espeon":      10, "Rayquaza":   10, "Lugia":     10, "Ho-Oh":      10,
    "Celebi":      10, "Gyarados":   10, "Dragonite": 10,
    # Tier 9 — top collecteurs
    "Blastoise":   9, "Venusaur":   9, "Alakazam":  9, "Machamp":    9,
    "Raichu":      9, "Ninetales":  9, "Clefairy":  9, "Articuno":   9,
    "Zapdos":      9, "Moltres":    9, "Jolteon":   9, "Flareon":    9,
    "Vaporeon":    9, "Sylveon":    9, "Leafeon":   9, "Glaceon":    9,
    "Metagross":   9, "Garchomp":   9, "Lucario":   9, "Gardevoir":  9,
    "Togekiss":    9, "Mimikyu":    9, "Scizor":    9, "Tyranitar":  9,
    "Dragonair":   9, "Dratini":    9, "Flygon":    9, "Salamence":  9,
    "Latias":      9, "Latios":     9, "Jirachi":   9, "Deoxys":     9,
    "Dialga":      9, "Palkia":     9, "Giratina":  9, "Groudon":    9,
    "Kyogre":      9,
    "Darkrai":     9, "Shaymin":    9, "Arceus":    9, "Zekrom":     9,
    "Reshiram":    9, "Kyurem":     9, "Xerneas":   9, "Yveltal":    9,
    "Solgaleo":    9, "Lunala":     9, "Necrozma":  9, "Cosmog":     9,
    "Eternatus":   9, "Zacian":     9, "Zamazenta": 9, "Calyrex":    9,
    "Miraidon":    9, "Koraidon":   9, "Terapagos": 9, "Pecharunt":  9,
    # Tier 8 — populaires
    "Arcanine":    8, "Nidoking":   8, "Nidoqueen":  8, "Rapidash":  8,
    "Slowbro":     8, "Haunter":    8, "Electabuzz": 8, "Magmar":    8,
    "Lapras":      8, "Ditto":      8, "Aerodactyl": 8, "Ampharos":  8,
    "Heracross":   8, "Houndoom":   8, "Kingdra":    8, "Raikou":    8,
    "Entei":       8, "Suicune":    8, "Absol":      8, "Milotic":   8,
    "Roserade":    8, "Rotom":      8, "Spiritomb":  8, "Riolu":     8,
    "Zoroark":     8, "Chandelure": 8, "Cobalion":   8, "Terrakion": 8,
    "Virizion":    8, "Greninja":   8, "Talonflame": 8, "Aegislash": 8,
    "Goodra":      8, "Noivern":    8, "Volcanion":  8, "Magearna":  8,
    "Incineroar":  8, "Decidueye":  8, "Primarina":  8, "Zeraora":   8,
    "Cinderace":   8, "Inteleon":   8, "Rillaboom":  8, "Dragapult": 8,
    "Grimmsnarl":  8, "Toxtricity": 8, "Obstagoon":  8, "Morpeko":   8,
    "Centiskorch": 8, "Hatterene":  8, "Alcremie":   8, "Zarude":    8,
    "Urshifu":     8, "Hisuian":    8, "Ursaluna":   8, "Sneasler":  8,
    "Fuecoco":     8, "Sprigatito": 8, "Quaxly":     8, "Skeledirge":8,
    "Meowscarada": 8, "Quaquaval":  8, "Ogerpon":    8, "Annihilape":8,
    # Tier 7 — second plan / obscurs (échantillon des plus connus)
    "Rattata":     7, "Pidgey":     7, "Caterpie":   7, "Weedle":    7,
    "Spearow":     7, "Ekans":      7, "Sandshrew":  7, "Jigglypuff":7,
    "Geodude":     7, "Slowpoke":   7, "Magnemite":  7, "Doduo":     7,
    "Seel":        7, "Krabby":     7, "Voltorb":    7, "Cubone":    7,
    "Lickitung":   7, "Koffing":    7, "Rhyhorn":    7, "Chansey":   7,
    "Tangela":     7, "Horsea":     7, "Goldeen":    7, "Staryu":    7,
    "Jynx":        7, "Tauros":     7, "Magikarp":   7, "Porygon":   7,
    "Omanyte":     7, "Kabuto":     7, "Sentret":    7, "Hoothoot":  7,
    "Ledyba":      7, "Spinarak":   7, "Pichu":      7, "Cleffa":    7,
    "Togepi":      7, "Natu":       7, "Mareep":     7, "Hoppip":    7,
    "Aipom":       7, "Sunkern":    7, "Yanma":      7, "Wooper":    7,
    "Murkrow":     7, "Misdreavus": 7, "Unown":      7, "Wobbuffet": 7,
    "Girafarig":   7, "Pineco":     7, "Dunsparce":  7, "Gligar":    7,
    "Snubbull":    7, "Qwilfish":   7, "Shuckle":    7, "Teddiursa": 7,
    "Slugma":      7, "Swinub":     7, "Corsola":    7, "Remoraid":  7,
    "Delibird":    7, "Mantine":    7, "Phanpy":     7, "Houndour":  7,
    "Skitty":      7, "Torchic":    7, "Mudkip":     7, "Treecko":   7,
    "Ralts":       7, "Snorunt":    7, "Spheal":     7, "Clamperl":  7,
    "Relicanth":   7, "Turtwig":    7, "Chimchar":   7, "Piplup":    7,
    "Starly":      7, "Shinx":      7, "Budew":      7, "Pachirisu": 7,
    "Buizel":      7, "Burmy":      7, "Combee":     7, "Cherubi":   7,
    "Shellos":     7, "Drifloon":   7, "Buneary":    7, "Glameow":   7,
    "Stunky":      7, "Bronzor":    7, "Bonsly":     7, "Happiny":   7,
    "Chatot":      7, "Mantyke":    7, "Snover":     7, "Oshawott":  7,
    "Tepig":       7, "Snivy":      7, "Patrat":     7, "Lillipup":  7,
    "Purrloin":    7, "Blitzle":    7, "Roggenrola": 7, "Woobat":    7,
    "Drilbur":     7, "Audino":     7, "Tympole":    7, "Sandile":   7,
    "Darumaka":    7, "Maractus":   7, "Dwebble":    7, "Trubbish":  7,
    "Vanillite":   7, "Foongus":    7, "Frillish":   7, "Alomomola": 7,
    "Joltik":      7, "Ferroseed":  7, "Klink":      7, "Tynamo":    7,
    "Elgyem":      7, "Litwick":    7, "Axew":       7, "Cubchoo":   7,
    "Cryogonal":   7, "Stunfisk":   7, "Mienfoo":    7, "Golett":    7,
    "Pawniard":    7, "Bouffalant": 7, "Rufflet":    7, "Vullaby":   7,
    "Deino":       7, "Larvesta":   7, "Fennekin":   7, "Chespin":   7,
    "Froakie":     7, "Bunnelby":   7, "Fletchling": 7, "Scatterbug":7,
    "Litleo":      7, "Skiddo":     7, "Pancham":    7, "Furfrou":   7,
    "Espurr":      7, "Honedge":    7, "Inkay":      7, "Swirlix":   7,
    "Spritzee":    7, "Amaura":     7, "Tyrunt":     7, "Goomy":     7,
    "Pumpkaboo":   7, "Phantump":   7, "Bergmite":   7, "Noibat":    7,
    "Rowlet":      7, "Litten":     7, "Popplio":    7, "Pikipek":   7,
    "Yungoos":     7, "Grubbin":    7, "Crabrawler": 7, "Oricorio":  7,
    "Cutiefly":    7, "Rockruff":   7, "Wishiwashi": 7, "Mareanie":  7,
    "Mudbray":     7, "Dewpider":   7, "Fomantis":   7, "Morelull":  7,
    "Salandit":    7, "Stufful":    7, "Bounsweet":  7, "Wimpod":    7,
    "Pyukumuku":   7, "Silvally":   7, "Bruxish":    7, "Drampa":    7,
    "Dhelmise":    7, "Grookey":    7, "Scorbunny":  7, "Sobble":    7,
    "Skwovet":     7, "Rookidee":   7, "Blipbug":    7, "Nickit":    7,
    "Gossifleur":  7, "Wooloo":     7, "Chewtle":    7, "Yamper":    7,
    "Snom":        7, "Rolycoly":   7, "Applin":     7, "Silicobra": 7,
    "Cramorant":   7, "Arrokuda":   7, "Perrserker": 7, "Cursola":   7,
    "Runerigus":   7, "Milcery":    7, "Falinks":    7, "Pincurchin":7,
    "Stonjourner": 7, "Eiscue":     7, "Indeedee":   7, "Drakloak":  7,
    "Togedemaru":  7, "Spidops":    7, "Nymble":     7, "Pawmi":     7,
    "Tandemaus":   7, "Fidough":    7, "Smoliv":     7, "Nacli":     7,
    "Charcadet":   7, "Tadbulb":    7, "Wattrel":    7, "Finizen":   7,
    "Wiglett":     7, "Capsakid":   7, "Rellor":     7, "Flittle":   7,
    "Tinkatink":   7, "Cyclizar":   7, "Orthworm":   7, "Glimmet":   7,
    "Greavard":    7, "Flamigo":    7, "Cetoddle":   7, "Veluza":    7,
    "Dondozo":     7, "Tatsugiri":  7, "Farigiraf":  7, "Dudunsparce":7,
    "Kingambit":   7, "Clodsire":   7, "Frigibax":   7, "Gimmighoul":7,
    "Poltchageist":7, "Okidogi":    7, "Munkidori":  7, "Fezandipiti":7,
    "Wo-Chien":    7, "Squawkabilly":7,
}

# One Piece : scores 7-10
_ONEPIECE_SCORES: dict[str, int] = {
    # Tier 10 — personnages iconiques
    "Luffy":      10, "Zoro":       10, "Nami":       10, "Usopp":      10,
    "Sanji":      10, "Chopper":    10, "Robin":      10, "Franky":     10,
    "Brook":      10, "Jinbe":      10, "Ace":        10, "Shanks":     10,
    "Whitebeard": 10, "Roger":      10, "Kaido":      10,
    "Hancock":    10,
    # Tier 9 — top-tier
    "Law":        9, "Kid":         9, "Killer":      9, "Crocodile":  9,
    "Doflamingo": 9, "Katakuri":    9, "Yamato":      9, "Marco":      9,
    "Rayleigh":   9, "Sengoku":     9, "Aokiji":      9, "Kizaru":     9,
    "Akainu":     9, "Fujitora":    9, "Ryokugyu":    9, "Mihawk":     9,
    "Buggy":      9, "Coby":        9, "Sabo":        9, "Blackbeard": 9,
    "Teach":      9, "Imu":         9,
    # Tier 8 — bien connus
    "Vivi":       8, "Tashigi":     8, "Smoker":      8, "Hina":       8,
    "Perona":     8, "Moriah":      8, "Kuma":        8, "Bonney":     8,
    "Bellamy":    8, "Caesar":      8, "Vergo":       8, "Monet":      8,
    "Sugar":      8, "Trebol":      8, "Diamante":    8, "Pica":       8,
    "Cavendish":  8, "Bartolomeo":  8, "Kyros":       8, "Rebecca":    8,
    "Queen":      8, "King":        8, "Jack":        8, "Ulti":       8,
    "Drake":      8, "Apoo":        8, "Hawkins":     8, "Caribou":    8,
    "Urouge":     8, "Capone":      8, "Issho":       8, "Tsuru":      8,
    "Koala":      8, "Ivankov":     8, "Vista":       8, "Lucci":      8,
    # Tier 7 — second plan
    "Dorry":      7, "Brogy":       7, "Laboon":      7, "Crocus":     7,
    "Wapol":      7, "Kureha":      7, "Dalton":      7, "Enel":       7,
    "Wyper":      7, "Gedatsu":     7, "Ohm":         7, "Satori":     7,
    "Aisa":       7, "Conis":       7, "Pagaya":      7, "Foxy":       7,
    "Kumadori":   7, "Jabra":       7, "Kaku":        7, "Kalifa":     7,
    "Fukurou":    7, "Blueno":      7, "Spandam":     7, "Bon":        7,
    "Bentham":    7, "Hatchan":     7, "Camie":       7, "Pappag":     7,
    "Arlong":     7, "Alvida":      7, "Mohji":       7, "Cabaji":     7,
    "Helmeppo":   7, "Morgan":      7, "Fullbody":    7, "Jango":      7,
    "Kaya":       7, "Dorry":       7, "Brogy":       7,
}

FALLBACK_MULTIPLIER = 0.8

# ---------------------------------------------------------------------------
# Logique d'extraction et de lookup
# ---------------------------------------------------------------------------

# Tokens à ignorer lors du scan (types de carte, suffixes courants)
_POKEMON_IGNORE: frozenset[str] = frozenset({
    "ex", "EX", "GX", "V", "VMAX", "VSTAR", "VStar", "TAG", "TEAM",
    "Trainer", "Supporter", "Stadium", "Item", "Tool",
    "Full", "Art", "Alternate", "Rainbow", "Gold", "Secret",
    "Common", "Uncommon", "Shiny", "Promo", "Hyper", "Ultra",
    "Amazing", "Radiant", "ACE", "SPEC", "BREAK",
})

_ONEPIECE_IGNORE: frozenset[str] = frozenset({
    "Don", "Event", "Stage", "Character", "Leader", "Parallel",
    "Full", "Art", "Alternate", "Manga", "Promo", "Secret",
    "Special", "Campaign",
})

_CARD_NUMBER_RE = re.compile(r"#\d+.*$")
_PUNCTUATION_RE = re.compile(r"['''\-]")


def _clean(name: str) -> str:
    name = _CARD_NUMBER_RE.sub("", name)
    name = _PUNCTUATION_RE.sub(" ", name)
    return name.strip()


def _extract_pokemon(name: str) -> str | None:
    tokens = _clean(name).split()
    for tok in tokens:
        if tok in _POKEMON_SCORES:
            return tok
    for tok in tokens:
        if tok not in _POKEMON_IGNORE and not tok.isdigit() and len(tok) > 1:
            return tok
    return None


def _extract_onepiece(name: str) -> str | None:
    tokens = _clean(name).split()
    for tok in reversed(tokens):
        if tok in _ONEPIECE_SCORES:
            return tok
    for tok in tokens:
        if tok not in _ONEPIECE_IGNORE and not tok.isdigit() and len(tok) > 1:
            return tok
    return None


def get_multiplier(item_name: str, tcg: str) -> float:
    """Retourne le character_multiplier (0.7–1.0) pour un item.

    Args:
        item_name: valeur de ``items.name``.
        tcg: ``'pokemon'`` ou ``'one-piece'``.

    Returns:
        float entre 0.7 et 1.0. ``FALLBACK_MULTIPLIER`` (0.8) si inconnu.
    """
    if tcg == "pokemon":
        char = _extract_pokemon(item_name)
        if char:
            score = _POKEMON_SCORES.get(char)
            if score is not None:
                return score / 10.0
    elif tcg == "one-piece":
        char = _extract_onepiece(item_name)
        if char:
            score = _ONEPIECE_SCORES.get(char)
            if score is not None:
                return score / 10.0
    return FALLBACK_MULTIPLIER


def get_score(item_name: str, tcg: str) -> int | None:
    """Score brut (7-10) ou None. Utile pour le debug/QA."""
    if tcg == "pokemon":
        char = _extract_pokemon(item_name)
        if char:
            return _POKEMON_SCORES.get(char)
    elif tcg == "one-piece":
        char = _extract_onepiece(item_name)
        if char:
            return _ONEPIECE_SCORES.get(char)
    return None
