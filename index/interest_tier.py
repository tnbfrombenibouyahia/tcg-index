"""Classification des cartes Pokémon EN/JP en "tiers d'intérêt", pour
alléger la partie recherche/suivi de l'app sur les cartes qui comptent
vraiment (demande utilisateur, cf. mémoire projet). Scope Pokémon
uniquement pour l'instant, cf. [[feedback_phased_by_tcg]] -- One Piece n'a
pas cette terminologie (SIR/IR/FA/Secret est un vocabulaire Pokémon
moderne, ère Scarlet & Violet), sa propre notion de rareté "chase" existe
déjà nativement dans `ONE_PIECE_KNOWN_RARITIES` et n'a pas besoin de ce
système.

Quatre tiers, dérivés de `items.rarity` (backfillé via
[[project_limitlesstcg_rarity_backfill]], EN 91.9%/JP 69.7%) :

- **sir** (Special Illustration Rare / Alt Art) : cartes à illustration
  pleine page racontant une scène -- correspond directement à la valeur
  stockée `"Special Art Rare"` (même tier, libellé différent selon la
  source : Bulbapedia/API TCG disent "Special Art Rare", le nom commercial
  FR/communauté est "Special Illustration Rare"/SIR).
- **ir** (Illustration Rare) : versions alternatives des Pokémon standards
  -- `"Art Rare"` stocké.
- **secret** (Secret Rare, dont "Gold") : numérotées au-delà du total
  officiel du set -- `"Secret Rare"`/`"Rare Secret"` (JP) stockés.
- **fa** (Full Art) : PAS de valeur de rareté dédiée dans nos données --
  contrairement aux trois tiers ci-dessus, "Full Art" est noyé dans
  plusieurs paliers de rareté selon l'époque (Ultra Rare/Rare Ultra/
  Character Holo Rare/Character Super Rare, cf. `_FA_CANDIDATE_RARITIES`)
  et un échantillon a confirmé que ces paliers mélangent des vraies Full
  Art ET des cartes normales qui partagent juste le même palier pour
  d'autres raisons (ex/GX/V "standards" de la même génération). Le
  critère utilisateur est en plus explicitement restrictif : "UNIQUEMENT
  les Dresseurs très populaires et les Pokémon iconiques" -- donc `fa`
  demande TROIS conditions à la fois (pas juste la rareté) :
    1. `rarity` dans un des paliers candidats FA,
    2. `"Full Art"`/`"Alternate Art"` littéralement dans `name` (vérifié
       empiriquement : seulement 37.6% du pool de rareté candidate a
       "Full Art" dans le nom -- sans ce filtre texte, `fa` inclurait des
       cartes ordinaires comme "Fighting Energy" ou "Altaria" qui
       partagent juste le palier de rareté par génération),
    3. le personnage cité est "populaire" -- soit un Pokémon iconique
       (`character_table.get_score(tcg='pokemon') >= _ICONIC_THRESHOLD`,
       seuil volontairement au tier 9-10 seulement, pas 7-8 : "iconique"
       exclut les Pokémon obscurs que `character_table` note quand même
       pour le calcul continu d'`undervalued_scores`), soit un Dresseur
       listé dans `trainer_table.TRAINER_SCORES` (qui n'a PAS de fallback
       neutre -- absent de la liste = exclu, pas noté par défaut, cf. son
       docstring).

Une carte hors de ces 4 tiers (Common/Uncommon/Rare/Holo Rare/Promo, ou
tout le reste) -- ainsi que les paliers "chase" d'autres époques
(Rainbow Rare, Radiant Rare, Amazing Rare, Rare BREAK, Rare Prime, Rare
Prism Star, ACE SPEC Rare, Double/Triple Rare, Shiny (Ultra) Rare, Rare
Holo VMAX/VSTAR/V...) reçoit le tier **chase** générique : l'utilisateur a
choisi de les inclure comme équivalents d'autres époques plutôt que de
limiter le filtre à la terminologie SV littérale -- un Charizard GX
Rainbow ou un Lucario Prime vintage sont clairement des "cartes d'intérêt"
même si leur nom de palier ne dit pas "Secret"/"SIR"."""
from __future__ import annotations

import re

from index.character_table import get_score as get_pokemon_score
from index.trainer_table import get_trainer_score

# ---------------------------------------------------------------------------
# Paliers de rareté -> tier direct (pas de condition supplémentaire)
# ---------------------------------------------------------------------------

_SIR_RARITIES: frozenset[str] = frozenset({"Special Art Rare"})
_IR_RARITIES: frozenset[str] = frozenset({"Art Rare"})
_SECRET_RARITIES: frozenset[str] = frozenset({
    "Secret Rare", "Rare Secret", "Rainbow Rare", "Rare Rainbow",
    "Rare Rainbow Alt", "Hyper Rare",
})

# Paliers "chase" génériques (équivalents d'autres époques, cf. docstring)
_CHASE_RARITIES: frozenset[str] = frozenset({
    "Radiant Rare", "Amazing Rare", "Rare BREAK", "Rare Prime",
    "Rare Prism Star", "ACE SPEC Rare", "Double Rare", "Triple Rare",
    "Shiny Rare", "Shiny Ultra Rare", "Rare Shiny", "Rare Shiny GX",
    "Rare Shiny V", "Rare Shiny Vmax", "Classic Collection",
})

# Paliers candidats pour FA -- nécessitent EN PLUS le filtre texte "Full
# Art" et le filtre popularité (cf. docstring module), jamais un tier
# direct comme les trois précédents.
_FA_CANDIDATE_RARITIES: frozenset[str] = frozenset({
    "Ultra Rare", "Rare Ultra", "Character Holo Rare", "Character Super Rare",
})

_FULL_ART_NAME_RE = re.compile(r"full art|alternate art", re.IGNORECASE)

# "Iconique" (FA) = tier 9-10 seulement de character_table, pas 7-8 --
# volontairement plus strict que le multiplicateur continu utilisé pour
# undervalued_scores (0.7-1.0 sur toute la table), cf. docstring module.
_ICONIC_POKEMON_THRESHOLD = 9


def classify(name: str, rarity: str | None) -> str | None:
    """Tier d'intérêt ('sir' | 'ir' | 'fa' | 'secret' | 'chase') pour une
    carte Pokémon, ou `None` si hors de tout tier (Common/Uncommon/Rare/
    Holo Rare/Promo/rareté inconnue). `name`/`rarity` : `items.name`/
    `items.rarity` tels quels."""
    if not rarity:
        return None

    if rarity in _SIR_RARITIES:
        return "sir"
    if rarity in _IR_RARITIES:
        return "ir"
    if rarity in _SECRET_RARITIES:
        return "secret"
    if rarity in _CHASE_RARITIES:
        return "chase"

    if rarity in _FA_CANDIDATE_RARITIES:
        if not _FULL_ART_NAME_RE.search(name):
            return None
        is_iconic_pokemon = (get_pokemon_score(name, "pokemon") or 0) >= _ICONIC_POKEMON_THRESHOLD
        is_popular_trainer = get_trainer_score(name) is not None
        if is_iconic_pokemon or is_popular_trainer:
            return "fa"
        return None

    return None
