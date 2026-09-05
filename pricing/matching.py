"""Identification d'une carte (One Piece TCG ou Pokémon) à partir d'un texte
libre (titre d'annonce eBay/Vinted/Cardmarket) et/ou d'une URL d'image.

Priorité 1a (One Piece) : code officiel (regex, insensible à la casse) ->
correspondance exacte sur `items.code`, désambiguïsation par similarité des
qualificatifs entre crochets/parenthèses (Parallel/Alternate Art/Manga Art...)
si plusieurs lignes partagent le même code (cf.
ingestion/sources/limitlesstcg.py, un code peut correspondre à la carte de
base + ses variantes).

Priorité 1b (Pokémon) : numéro de carte ("110/078" ou code promo type
"SWSH029") -> toutes les lignes du référentiel Pokémon partageant ce
numérateur (un numéro Pokémon est TOUJOURS unique au sein d'un set, jamais
entre sets différents -- cf. ingestion/sources/limitlesstcg.py, docstring
module), désambiguïsation par langue puis par recouvrement de tokens
nom+set+rareté avec le texte libre.

Priorité 2 (fallback) : ni code One Piece ni numéro Pokémon trouvé ->
matching approximatif sur les tokens de nom + indice de rareté détecté,
cherché sur tout le catalogue (les deux jeux à la fois -- plutôt que de
deviner lequel à partir d'indices peu fiables, cf.
pricing/repository.py::fetch_items_by_name_tokens).

Ne devine jamais : si le meilleur score est sous le seuil de confiance ou
qu'il y a égalité entre plusieurs candidats, renvoie `status="ambiguous"`
avec les candidats plutôt qu'un choix arbitraire -- même philosophie que le
matcher fait maison de ingestion/sources/pricecharting.py (_best_single_match),
dont on reprend ici l'esprit (normalisation NFKD, coefficient de Dice sur des
tokens) sans en importer le code (fonctions privées `_`, fichier fragile
à ne pas toucher).
"""
import re
import unicodedata

from ingestion.sources.limitlesstcg import ONE_PIECE_KNOWN_RARITIES
from pricing.models import Card, MatchResult
from pricing.ocr import extract_text_from_image
from pricing.repository import (
    fetch_items_by_code,
    fetch_items_by_name_tokens,
    fetch_pokemon_items_by_number,
)

# Priorité 1 : code officiel One Piece, insensible à la casse (spec).
# Deux formes acceptées, mêmes contraintes (2 chiffres de set, 3 de carte,
# jamais moins/plus) : "OP10-105" (forme officielle, tiret) et
# "OP06 [#118]" / "OP06 #118" (forme vue en usage réel sur des annonces
# eBay -- espace puis numéro préfixé "#", entre crochets ou non, cf.
# item réel https://www.ebay.com/itm/157610454970 : titre "... OP06 [#118]",
# aucun tiret, la 1ère forme ratait ce cas et retombait en fuzzy name-only,
# 11 candidats "Roronoa Zoro" sans code pour trancher).
ONE_PIECE_CODE_RE = re.compile(
    r"\b(?:OP|ST|EB|P)\d{2}-\d{3}\b"
    r"|\b(?:OP|ST|EB|P)\d{2}\s*\[#\d{3}\]"
    r"|\b(?:OP|ST|EB|P)\d{2}\s*#\d{3}\b",
    re.IGNORECASE,
)
# Reconstruit "OP06-118" à partir du fragment capté ci-dessus, quelle que
# soit la forme d'origine -- un seul point de normalisation vers le format
# canonique stocké dans items.code.
_CODE_DIGITS_RE = re.compile(r"(OP|ST|EB|P)(\d{2}).*?(\d{3})", re.IGNORECASE)

_QUALIFIER_RE = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")
# Même seuil que pricecharting.py::_QUALIFIER_MATCH_THRESHOLD -- cohérence
# volontaire entre les deux matchers du repo.
_CODE_QUALIFIER_MATCH_THRESHOLD = 0.5
# Plus strict que le seuil ci-dessus : sans code, le signal de départ est
# plus faible (juste un nom approximatif), on exige donc un meilleur accord.
_FUZZY_NAME_MATCH_THRESHOLD = 0.6

# eBay/Vinted/Cardmarket abrègent souvent la rareté officielle. Mapping
# volontairement conservateur : pas de "p" seul -> Promo, collision trop
# probable avec le préfixe de code "P01-001" ou un simple "P" isolé sans
# rapport. Étendre avec prudence.
_RARITY_ABBREVIATIONS = {
    "sr": "Super Rare", "sec": "Secret Rare", "secret": "Secret Rare",
    "uc": "Uncommon", "dr": "Double Rare", "don": "Don!!",
    "tr": "Treasure Rare", "leader": "Leader",
}

# Relevé empirique (2026-09-05) : `SELECT DISTINCT rarity FROM items WHERE
# tcg='pokemon'` -- même démarche que ONE_PIECE_KNOWN_RARITIES
# (ingestion/sources/limitlesstcg.py). Exclut les valeurs non exploitables
# vues en base (NULL, chaîne littérale "None", "Unconfirmed").
POKEMON_KNOWN_RARITIES = {
    "Common", "Uncommon", "Rare", "Promo", "Ultra Rare", "Holo Rare",
    "Double Rare", "Rare Holo", "Secret Rare", "Art Rare", "Shiny Rare",
    "Special Art Rare", "Rainbow Rare", "Triple Rare", "Super Rare",
    "Classic Collection", "Shiny Holo Rare", "Rare Shiny",
    "Character Holo Rare", "Rare Ultra", "Character Super Rare",
    "Shiny Ultra Rare", "Radiant Rare", "ACE SPEC Rare", "Rare BREAK",
    "Rare Prism Star", "Rare Holo LV.X", "Amazing Rare",
    "Illustration Rare", "Futuristic Rare", "Rare Secret", "Rare Rainbow",
    "Prism Rare", "Rare Prime", "Special Illustration Rare", "Rare Ace",
}
# Union des deux jeux -- `_extract_rarity_hint` compare juste une chaîne
# détectée dans le texte à `c.rarity` (colonne d'un candidat déjà connu),
# aucun besoin de savoir a priori à quel jeu une rareté "appartient".
_ALL_KNOWN_RARITIES = ONE_PIECE_KNOWN_RARITIES | POKEMON_KNOWN_RARITIES

_NOISE_WORDS = {
    "nm", "lp", "psa", "tcg", "ccg", "card", "game", "one", "piece",
    "near", "mint", "foil", "japanese", "english", "new", "sealed",
    "pokemon", "jcc",
}


def _normalize_name(text: str) -> str:
    """Même approche que pricecharting.py::_normalize_name (NFKD, strip
    accents, lowercase, collapse non-alphanumérique) -- réimplémentée ici
    (fonction privée là-bas, ~3 lignes, pas de dépendance justifiée)."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


def extract_one_piece_code(text: str) -> str | None:
    """Premier code OP/ST/EB/Pxx-xxx trouvé (forme officielle ou "OP06
    [#118]", cf. ONE_PIECE_CODE_RE), normalisé en majuscules ET vers le
    format canonique à tiret (items.code est stocké ainsi, ex. 'OP10-105').
    None si aucun."""
    m = ONE_PIECE_CODE_RE.search(text)
    if not m:
        return None
    digits = _CODE_DIGITS_RE.match(m.group(0))
    prefix, set_num, card_num = digits.group(1), digits.group(2), digits.group(3)
    return f"{prefix.upper()}{set_num}-{card_num}"


# Priorité 1b (Pokémon) : numéro de carte au format "numérateur/dénominateur"
# (ex. "110/078", "101/159" -- convention d'affichage universelle sur les
# annonces Pokémon, quel que soit vendeur/langue) ou code promo
# alphanumérique (ex. "SWSH029", "XY141" -- lettres d'ère + chiffres,
# jamais de tiret contrairement à One Piece, cf. valeurs réelles vues en
# base). Dénominateur exigé à >= 2 chiffres pour ne pas confondre avec une
# quantité de lot ("3/5 cards") -- aucun set réel n'a un total à un seul
# chiffre.
POKEMON_NUMBER_RE = re.compile(r"\b(\d{1,4})\s*/\s*(\d{2,4})\b")
# MAJUSCULES exigées (pas re.IGNORECASE) + au moins 2 chiffres -- relevé
# empirique sur items.code réel ("SWSH029", "XY141", "S14", "DPBP006"...) :
# toujours en capitales (tel qu'imprimé sur la carte), jamais un seul
# chiffre. Sans ces deux garde-fous, la regex matchait des mots anglais
# ordinaires suivis d'un chiffre (ex. "Lot OF 3/5 cards" -> "of 3" ->
# "OF3", repéré par TestExtractPokemonNumber). Les rares codes à un seul
# préfixe-lettre (ex. "S14") ne sont donc pas couverts -- compromis
# assumé : moins de rappel, beaucoup moins de faux positifs.
POKEMON_PROMO_CODE_RE = re.compile(r"\b([A-Z]{2,6})\s?(\d{2,4})\b")


def extract_pokemon_number(text: str) -> str | None:
    """Numérateur brut si un motif "NNN/TTT" est trouvé (le retrait des
    zéros de tête se fait côté SQL, cf. pricing/repository.py::
    fetch_pokemon_items_by_number -- même normalisation appliquée aux deux
    côtés de la comparaison, un seul endroit où ça arrive), sinon un code
    promo alphanumérique reconstruit sans espace (ex. "SWSH 029" ->
    "SWSH029"), sinon None.

    Regex bien plus permissives que ONE_PIECE_CODE_RE (aucun format ancré
    ne distingue un code promo Pokémon d'un mot+nombre quelconque du
    titre) -- risque de faux positif assumé : cf. le commentaire dans
    _match_text sur pourquoi un numéro "reconnu" mais absent du
    référentiel retombe sur le fuzzy plutôt que de conclure "not_found"."""
    m = POKEMON_NUMBER_RE.search(text)
    if m:
        return m.group(1)
    m = POKEMON_PROMO_CODE_RE.search(text)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}"
    return None


def _qualifier_tokens(text: str) -> frozenset:
    """Mots dans les qualificatifs entre crochets/parenthèses, en ignorant
    les contenus purement numériques (ex. 'Cavendish (105)' -- le nombre
    entre parenthèses est un numéro apitcg, pas un qualificatif de variante
    Parallel/Alt-art/Manga, cf. données réelles item_id 98406) -- y compris
    préfixés d'un '#' (ex. 'OP06 [#118]', cf. ONE_PIECE_CODE_RE) : même
    numéro de carte, pas une variante non plus. Même exclusion pour un code
    officiel complet entre parenthèses (ex. 'Nami (OP01-016) (Manga)',
    item_id 36989 -- deux groupes, le 1er est un doublon du code, pas un
    qualificatif) : sans ce filtre, ces tokens de code se retrouvent dans le
    vocabulaire de désambiguïsation et gonflent artificiellement le score
    Dice de CE candidat sur n'importe quel texte contenant le même code --
    or le code est de fait présent dans tout texte qui arrive ici (c'est lui
    qui a déclenché la recherche), donc systématiquement en commun. Cas réel
    qui a motivé ce filtre : annonce eBay 206461711271, 'Nami OP01-016
    Manga Alt Art ... Japan' matchée à tort sur la ligne EN 36989 (Dice 0.6)
    plutôt que la bonne ligne JP 'Nami [Manga]' 72523 (Dice 0.25, qualificatif
    propre)."""
    contents = [
        c for c in _QUALIFIER_RE.findall(text)
        if not c.strip().lstrip("#").isdigit() and not ONE_PIECE_CODE_RE.fullmatch(c.strip())
    ]
    return frozenset(_normalize_name(" ".join(contents)).split())


def _dice(a: frozenset, b: frozenset) -> float:
    """Coefficient de Dice, même formule que pricecharting.py::_qualifier_dice."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


# Un code (items.code) peut être partagé par une dizaine de lignes du
# référentiel à la fois : variantes (Parallel/Manga/Alternate Art/Reprint/
# Anniversary...) ET langues (EN/JP) d'un même numéro de carte -- cas réel
# mesuré (annonce eBay 157610454970, OP06-118) : 11 items en base pour ce
# seul code, 6 EN + 5 JP. items.language distingue déjà ça -- un indice
# "JP"/"Japanese"/"Japan" ou "EN"/"English" dans le texte libre coupe la
# moitié des candidats avant même de comparer les qualificatifs de variante.
# "Japan" (pas seulement "Japanese") ajouté après un cas réel où le filtre
# ne se déclenchait pas (annonce eBay 206461711271, "... Comic Parallel
# Japan") et laissait les 19 candidats EN+JP en lice.
# "japonais"/"anglais" (FR) ajoutés après un cas réel similaire côté
# Pokémon (annonce eBay.fr 800613059079, "... Storm Emerald Japonais CCC
# 9.5 ...", aucun token "jp"/"japan"/"japanese") -- le multi-TCG couvre
# plusieurs locales eBay (cf. manifest.json), mais seul le FR est câblé
# ici pour l'instant (panel/marché principal actuel, cf. mémoire projet) ;
# DE/IT/ES etc. restent un point aveugle connu, pas encore rencontré en
# usage réel.
_LANGUAGE_HINT_TOKENS = {
    "EN": {"en", "english", "anglais"},
    "JP": {"jp", "japanese", "japan", "japonais"},
}


def _detect_language_hint(text: str) -> str | None:
    tokens = frozenset(_normalize_name(text).split())
    for language, hints in _LANGUAGE_HINT_TOKENS.items():
        if tokens & hints:
            return language
    return None


def disambiguate_candidates(text: str, candidates: list[Card]) -> MatchResult:
    """Pure (pas de DB) : départage plusieurs items partageant le même code
    en deux temps. 1) Filtre par langue si le texte en mentionne une
    (EN/JP) -- additif, pas exclusif : si le filtre viderait le pool (aucun
    candidat dans cette langue, donnée suspecte), on retombe sur tous les
    candidats plutôt que de perdre le match, même principe que le repli de
    recherche Population Analysis (cf. git log). 2) Similarité du
    qualificatif de variante (Parallel/Manga/Alternate Art...) : entre
    crochets/parenthèses du texte libre COMME avant, mais aussi en toutes
    lettres ailleurs dans le texte, restreint au vocabulaire propre à CES
    candidats (jamais tout mot du titre -- une annonce "PSA 10 One Piece
    ..." ne doit pas faire gagner un candidat dont le nom contient
    "One Piece" par coïncidence). Cas réel qui a motivé ce 2e point :
    annonce "... Manga Alt Art OP06 [#118]", qualificatif en clair, jamais
    entre crochets -- le catalogue le note "[Alternate Art Manga]".
    Ne devine jamais : renvoie status='ambiguous' si le meilleur score est
    sous le seuil ou s'il y a égalité -- même philosophie que
    pricecharting.py::_best_single_match."""
    if len(candidates) == 1:
        return MatchResult(status="matched", card=candidates[0], confidence=1.0, strategy="code")

    language_hint = _detect_language_hint(text)
    pool = [c for c in candidates if c.language == language_hint] if language_hint else candidates
    if not pool:
        pool = candidates

    candidate_vocab = frozenset().union(*(_qualifier_tokens(c.name) for c in pool))
    text_tokens = frozenset(_normalize_name(text).split())
    text_qual = _qualifier_tokens(text) | (text_tokens & candidate_vocab)

    scored = sorted(
        ((_dice(text_qual, _qualifier_tokens(c.name)), c) for c in pool),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _CODE_QUALIFIER_MATCH_THRESHOLD or tie:
        return MatchResult(status="ambiguous", candidates=[c for _, c in scored], strategy="code+qualifier")
    return MatchResult(status="matched", card=best, confidence=best_score, strategy="code+qualifier")


# Fragments de génération ("sv04", "swsh", "sm", "xy07", "ex"...) qui
# apparaissent dans nos `set_code` Pokémon (ex. 'pokemon-swsh07-evolving-
# skies', 'pokemon-jp-mega-dream-ex') mais que personne n'écrit dans une
# annonce -- même liste/esprit que ingestion/sources/limitlesstcg.py::
# _GEN_CODE_RE (réimplémentée en miniature ici, fonction privée là-bas,
# même convention que le reste de ce fichier). Sans ce filtre, "ex" comme
# fragment de set (ère Scarlet & Violet-ex) se retrouverait dans le
# vocabulaire de comparaison à égalité avec un "ex" de nom de carte réel
# ("Mega Rayquaza ex") -- signal correct par coïncidence ici, mais pas en
# général.
_POKEMON_GEN_CODE_RE = re.compile(r"^(sv|swsh|sm|xy|bw|dp|ex|hgss|me)\d*$")
_POKEMON_NUMBER_MATCH_THRESHOLD = 0.5  # même seuil que _CODE_QUALIFIER_MATCH_THRESHOLD -- signal de départ comparable (un numéro partagé, comme un code One Piece partagé)


def _pokemon_set_tokens(set_code: str | None) -> frozenset:
    """Dérive un vocabulaire de mots depuis `set_code` (ex.
    'pokemon-jp-storm-emeralda' -> {'jp', 'storm', 'emeralda'}) pour le
    comparer par recouvrement de tokens au texte libre d'une annonce.
    Contrairement à ingestion/sources/limitlesstcg.py::build_pokemon_set_mapping
    (qui exige une égalité stricte de tokens pour valider un mapping
    slug<->set_code), un simple score de Dice partiel suffit ici : un
    signal parmi d'autres dans disambiguate_pokemon_candidates, jamais une
    validation de correspondance exacte."""
    if not set_code:
        return frozenset()
    stripped = set_code.removeprefix("pokemon-")
    return frozenset(t for t in _normalize_name(stripped).split() if not _POKEMON_GEN_CODE_RE.fullmatch(t))


def disambiguate_pokemon_candidates(text: str, candidates: list[Card]) -> MatchResult:
    """Départage plusieurs cartes Pokémon partageant le même numéro.
    Contrairement à One Piece (où un même code peut désigner la carte de
    base + ses variantes Parallel/Manga/Alternate Art), un numéro Pokémon
    est TOUJOURS unique AU SEIN d'un set (vérifié, cf. docstring module
    ingestion/sources/limitlesstcg.py) -- une collision ici ne peut donc
    venir que de sets DIFFÉRENTS partageant le même numéro (très fréquent :
    83 cartes numéro "110" tous sets confondus, mesuré sur le catalogue
    réel au moment d'écrire ceci).

    1) Filtre par langue si détectée dans le texte -- même principe
    additif (jamais exclusif si ça viderait le pool) que
    disambiguate_candidates. Si un seul candidat survit à ce stade, il est
    retenu sans scoring de tokens supplémentaire : contrairement au
    qualificatif One Piece (qui peut légitimement être vide des deux
    côtés, cf. _dice), le nom+set Pokémon n'est quasiment jamais vide, et
    exiger un recouvrement de tokens en plus d'un numéro+langue déjà
    univoques rejetterait à tort des titres d'annonce trop laconiques pour
    contenir le nom du set en toutes lettres.

    2) Sinon, score de Dice sur (tokens du nom complet ∪ tokens du set ∪
    tokens de la rareté) de chaque candidat contre les tokens du texte
    restreints au vocabulaire propre à CES candidats -- même garde-fou que
    disambiguate_candidates (candidate_vocab) contre un mot générique du
    titre qui gonflerait le score au hasard. La rareté est incluse dans le
    vocabulaire plutôt que filtrée à part (contrairement au fallback fuzzy
    fuzzy_match_by_name_and_rarity) : un seul passage de scoring, plus
    simple, suffisant ici car le signal numéro+langue a déjà fait le gros
    du travail de réduction."""
    if len(candidates) == 1:
        return MatchResult(status="matched", card=candidates[0], confidence=1.0, strategy="pokemon_number")

    language_hint = _detect_language_hint(text)
    pool = [c for c in candidates if c.language == language_hint] if language_hint else candidates
    if not pool:
        pool = candidates
    if len(pool) == 1:
        return MatchResult(status="matched", card=pool[0], confidence=1.0, strategy="pokemon_number")

    def candidate_tokens(c: Card) -> frozenset:
        rarity_toks = frozenset(_normalize_name(c.rarity).split()) if c.rarity else frozenset()
        return frozenset(_normalize_name(c.name).split()) | _pokemon_set_tokens(c.set_code) | rarity_toks

    candidate_vocab = frozenset().union(*(candidate_tokens(c) for c in pool))
    text_tokens = frozenset(_normalize_name(text).split()) & candidate_vocab

    scored = sorted(
        ((_dice(text_tokens, candidate_tokens(c)), c) for c in pool),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _POKEMON_NUMBER_MATCH_THRESHOLD or tie:
        return MatchResult(status="ambiguous", candidates=[c for _, c in scored], strategy="pokemon_number+set")
    return MatchResult(status="matched", card=best, confidence=best_score, strategy="pokemon_number+set")


def _extract_rarity_hint(text: str) -> str | None:
    tokens = {t.lower() for t in re.findall(r"[A-Za-z!]+", text)}
    for token in tokens:
        if token in _RARITY_ABBREVIATIONS:
            return _RARITY_ABBREVIATIONS[token]
    lowered = text.lower()
    # Trié par longueur décroissante -- depuis l'ajout de POKEMON_KNOWN_RARITIES,
    # plusieurs raretés sont des sous-chaînes d'une autre plus spécifique
    # ("Rare" ⊂ "Art Rare" ⊂ "Special Art Rare") : un `next()` sur un set
    # non ordonné pourrait retenir la plus courte au hasard de l'itération.
    # Priorité à la plus longue = la plus précise.
    return next(
        (r for r in sorted(_ALL_KNOWN_RARITIES, key=len, reverse=True) if r.lower() in lowered),
        None,
    )


def _extract_name_tokens(text: str) -> set[str]:
    """Retire qualificatifs, code, rareté connue et bruit de place de marché
    avant de considérer le reste comme des tokens de nom de personnage.
    Heuristique best-effort documentée -- pas de NLP, cohérent avec le reste
    du repo."""
    stripped = _QUALIFIER_RE.sub(" ", text)
    stripped = ONE_PIECE_CODE_RE.sub(" ", stripped)
    # Numéro Pokémon "NNN/TTT" retiré aussi -- ce chemin (fallback) n'est
    # atteint pour un texte Pokémon que si extract_pokemon_number l'a déjà
    # cherché en base sans succès (cf. _match_text) ; laisser "110"/"078"
    # dans les tokens de nom n'aiderait jamais le score Dice sur le nom
    # (aucune carte ne s'appelle "110"), au mieux neutre, au pire du bruit.
    stripped = POKEMON_NUMBER_RE.sub(" ", stripped)
    tokens = set(_normalize_name(stripped).split()) - _NOISE_WORDS
    rarity = _extract_rarity_hint(text)
    if rarity:
        tokens -= set(_normalize_name(rarity).split())
    return tokens


def fuzzy_match_by_name_and_rarity(text: str) -> MatchResult:
    """Priorité 2 (fallback) : ni code One Piece ni numéro Pokémon
    exploitable. Pré-filtre en DB par tokens de nom sur TOUT le catalogue
    (`tcg=None`, cf. pricing/repository.py::fetch_items_by_name_tokens) --
    pas de tri par jeu au préalable, plutôt que deviner lequel à partir
    d'indices peu fiables -- puis score de Dice sur le nom normalisé
    complet (+ filtre optionnel par rareté détectée) -- ne devine jamais si
    le meilleur score est sous le seuil ou s'il y a égalité."""
    tokens = _extract_name_tokens(text)
    if not tokens:
        return MatchResult(status="not_found", strategy="fuzzy_name_rarity",
                            message="Aucun token de nom exploitable dans le texte fourni.")

    candidates = fetch_items_by_name_tokens(tokens, tcg=None)
    rarity_hint = _extract_rarity_hint(text)
    if rarity_hint:
        filtered = [c for c in candidates if c.rarity == rarity_hint]
        # Rareté détectée mais aucun candidat ne matche -> on garde le
        # pré-filtre par nom plutôt que de tout perdre.
        candidates = filtered or candidates
    if not candidates:
        return MatchResult(status="not_found", strategy="fuzzy_name_rarity")

    text_norm = frozenset(_normalize_name(" ".join(tokens)).split())
    scored = sorted(
        ((_dice(text_norm, frozenset(_normalize_name(c.name).split())), c) for c in candidates),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _FUZZY_NAME_MATCH_THRESHOLD or tie:
        return MatchResult(status="ambiguous", candidates=[c for _, c in scored[:10]], strategy="fuzzy_name_rarity")
    return MatchResult(status="matched", card=best, confidence=best_score, strategy="fuzzy_name_rarity")


def _match_text(text: str) -> MatchResult:
    """Priorité 1a : code One Piece OP/ST/EB/Pxx-xxx (+ désambiguïsation
    qualificatif si plusieurs items partagent le code) -- regex ancrée,
    quasi jamais de faux positif, donc un code reconnu mais absent du
    référentiel conclut directement "not_found".

    Priorité 1b : numéro de carte Pokémon (+ désambiguïsation set/langue
    si plusieurs items partagent le numéro). Regex bien plus permissive
    que le code One Piece (cf. extract_pokemon_number) -- un numéro
    "reconnu" mais absent du référentiel n'est PAS traité comme
    "not_found" : ça peut aussi bien être un vrai numéro absent du
    catalogue qu'un faux positif regex (ex. une quantité, une dimension) ;
    dans les deux cas, retomber sur le fuzzy est plus sûr que conclure à
    tort.

    Priorité 2 (fallback) : nom + rareté approximatifs, tout catalogue
    confondu. Factorisé hors de `identify_card` pour être partagé entre le
    texte fourni tel quel et le texte extrait par OCR."""
    code = extract_one_piece_code(text)
    if code:
        candidates = fetch_items_by_code(code)
        if not candidates:
            return MatchResult(status="not_found", strategy="code",
                                message=f"Code {code} reconnu mais absent du référentiel.")
        return disambiguate_candidates(text, candidates)

    number = extract_pokemon_number(text)
    if number:
        poke_candidates = fetch_pokemon_items_by_number(number)
        if poke_candidates:
            return disambiguate_pokemon_candidates(text, poke_candidates)

    return fuzzy_match_by_name_and_rarity(text)


def identify_card(text: str | None = None, image_url: str | None = None) -> MatchResult:
    """Point d'entrée public. `text` prioritaire s'il est fourni (titre
    d'annonce, en général plus fiable qu'un OCR). Sinon, `image_url` :
    passage 1 de la cascade (§01 du handoff) -- OCR Cloud Vision
    (pricing/ocr.py), le texte détecté est ensuite matché exactement comme
    un `text` fourni directement (même pipeline code/fuzzy).

    Pas de passage 2 (similarité visuelle/CLIP) dans cette itération : si
    l'OCR ne trouve rien, `identify_card` répond `not_found` plutôt que
    d'escalader -- cohérent avec "ne jamais deviner" (§01)."""
    if text:
        return _match_text(text)
    if image_url:
        ocr_text = extract_text_from_image(image_url)
        if not ocr_text:
            return MatchResult(status="not_found", strategy=None,
                                message="Aucun texte détecté sur l'image (OCR).")
        return _match_text(ocr_text)
    return MatchResult(status="not_found", strategy=None, message="Ni texte ni image_url fournis.")
