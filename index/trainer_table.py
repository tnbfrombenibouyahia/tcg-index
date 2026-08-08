"""Table statique de popularité des Dresseurs/Supporters Pokémon, pour le
critère FA (Full Art) du système de tiers d'intérêt (cf. `interest_tier.py`).

Contrairement à `character_table.py` (Pokémon, ~700 espèces, TOUTES
scorées avec un fallback neutre pour les inconnues -- n'importe quel
Pokémon peut valoir la peine d'être noté), cette table est volontairement
**restrictive** : le critère utilisateur est "UNIQUEMENT les Dresseurs très
populaires" pour FA, pas "tout Dresseur avec un score neutre par défaut".
Un Dresseur absent d'ici est donc exclu du critère FA, pas noté 0.8 comme
le ferait `character_table.get_multiplier` -- `get_trainer_score` retourne
`None` pour signifier "pas dans la liste", jamais un score de repli.

Portée : uniquement les personnages qui reviennent de façon récurrente
comme pulls recherchés en Full Art/Alternate Art dans la communauté de
collectionneurs (rivaux, Champions, Team Leaders/Team Rocket, protagonistes
récurrents de l'anime) -- pas une liste exhaustive de tous les Dresseurs
qui existent. Liste forcément partielle et sujette à révision ; volontairement
courte plutôt que de deviner large et risquer de faire passer un Dresseur
obscur pour "populaire"."""
from __future__ import annotations

import re

# Score 7-10, même échelle que character_table.py, mais seuil d'usage
# différent (cf. `interest_tier.py` -- seuls 9-10 comptent comme
# "populaire" pour FA, 7-8 existent pour permettre un futur usage plus fin
# sans devoir tout renoter).
TRAINER_SCORES: dict[str, int] = {
    # Tier 10 — icônes absolues, toujours des pulls très recherchés
    "Cynthia":    10, "N":           10, "Lillie":     10, "Marnie":     10,
    "Iono":       10, "Leon":        10, "Misty":      10, "Erika":      10,
    "Skyla":      10, "Elesa":       10, "Serena":     10, "Dawn":       10,
    "May":        10, "Gladion":     10, "Ghetsis":    10, "Guzma":      10,
    "Nemona":     10, "Arven":       10, "Penny":      10,
    # Tier 9 — top collecteurs, très demandés
    "Steven":      9, "Cyrus":       9, "Lusamine":    9, "Sabrina":     9,
    "Whitney":     9, "Bianca":      9, "Hilda":       9, "Rosa":        9,
    "Hop":         9, "Bede":        9, "Piers":       9, "Raihan":      9,
    "Volkner":     9, "Flannery":    9, "Winona":      9, "Roxanne":     9,
    "Gardenia":    9, "Candice":     9, "Fantina":     9, "Maylene":     9,
    "Karen":       9, "Clair":       9, "Jasmine":     9, "Shauntal":    9,
    "Caitlin":     9, "Korrina":     9, "Valerie":     9, "Olympia":     9,
    "Kahili":      9, "Acerola":     9, "Plumeria":    9, "Sonia":       9,
    "Klara":       9, "Avery":       9, "Peonia":      9, "Mela":        9,
    "Grusha":      9, "Larry":       9, "Geeta":       9, "Rika":        9,
    "Poppy":       9, "Kofu":        9, "Katy":        9, "Jacq":        9,
    "Brassius":    9, "Iris":        9, "Grimsley":    9, "Colress":     9,
    "Team Rocket": 9, "Jessie":      9, "James":       9, "Giovanni":    9,
    "Team Skull":  9, "Team Aqua":   9, "Team Magma":  9, "Team Galactic": 9,
    "Team Plasma": 9, "Team Flare":  9, "Team Yell":   9, "Lysandre":    9,
    "Xerosic":     9, "Faba":        9,
    # Tier 8 — appréciés, demande solide mais moins systématique
    "Brock":       8, "Blaine":      8, "Bugsy":       8, "Falkner":     8,
    "Morty":       8, "Chuck":       8, "Pryce":       8, "Wattson":     8,
    "Brawly":      8, "Norman":      8, "Tate":        8, "Liza":        8,
    "Byron":       8, "Wake":        8, "Barry":       8, "Cheren":      8,
    "Clay":        8, "Burgh":       8, "Cilan":       8, "Chili":       8,
    "Cress":       8, "Roark":       8, "Wallace":     8, "Juan":        8,
    "Marlon":      8, "Miette":      8, "Shauna":      8, "Trevor":      8,
    "Tierno":      8, "Kiawe":       8, "Lana":        8, "Mallow":      8,
    "Sophocles":   8, "Hau":         8, "Molayne":     8, "Nanu":        8,
    "Hala":        8, "Olivia":      8, "Mina":        8, "Ilima":       8,
    "Bea":         8, "Allister":    8, "Gordie":      8, "Melony":      8,
    "Nessa":       8, "Milo":        8, "Kabu":        8, "Opal":        8,
    "Ball Guy":    8,
}


def _extract_trainer(name: str) -> str | None:
    """Retourne le premier token de `name` présent dans `TRAINER_SCORES`,
    ou `None`. Même approche que `character_table._extract_pokemon`
    (premier match dans le texte), mais sur une table volontairement
    petite -- pas de fallback "premier mot capitalisé trouvé", un Dresseur
    non listé doit rester `None`, pas être deviné."""
    cleaned = re.sub(r"\(.*?\)", " ", name)  # "(Full Art)" etc. n'aide pas
    tokens = re.split(r"[\s'’\-]+", cleaned)
    for tok in tokens:
        if tok in TRAINER_SCORES:
            return tok
    # Noms composés ("Team Rocket", "Team Skull"...) : cherchés en entier
    # avant de renoncer, pas juste token par token.
    for phrase in TRAINER_SCORES:
        if " " in phrase and phrase in cleaned:
            return phrase
    return None


def get_trainer_score(item_name: str) -> int | None:
    """Score brut (7-10) si `item_name` cite un Dresseur listé, sinon
    `None` -- jamais de valeur de repli, cf. docstring module."""
    trainer = _extract_trainer(item_name)
    return TRAINER_SCORES.get(trainer) if trainer else None
