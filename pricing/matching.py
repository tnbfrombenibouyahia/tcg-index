"""Identification d'une carte One Piece TCG à partir d'un texte libre
(titre d'annonce eBay/Vinted/Cardmarket) et/ou d'une URL d'image.

Priorité 1 : code officiel One Piece (regex, insensible à la casse) ->
correspondance exacte sur `items.code`, désambiguïsation par similarité des
qualificatifs entre crochets/parenthèses (Parallel/Alternate Art/Manga Art...)
si plusieurs lignes partagent le même code (cf.
ingestion/sources/limitlesstcg.py, un code peut correspondre à la carte de
base + ses variantes).

Priorité 2 (fallback) : aucun code trouvé -> matching approximatif sur les
tokens de nom + indice de rareté détecté.

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
from pricing.repository import fetch_items_by_code, fetch_items_by_name_tokens

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

_NOISE_WORDS = {
    "nm", "lp", "psa", "tcg", "ccg", "card", "game", "one", "piece",
    "near", "mint", "foil", "japanese", "english", "new", "sealed",
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


def _qualifier_tokens(text: str) -> frozenset:
    """Mots dans les qualificatifs entre crochets/parenthèses, en ignorant
    les contenus purement numériques (ex. 'Cavendish (105)' -- le nombre
    entre parenthèses est un numéro apitcg, pas un qualificatif de variante
    Parallel/Alt-art/Manga, cf. données réelles item_id 98406) -- y compris
    préfixés d'un '#' (ex. 'OP06 [#118]', cf. ONE_PIECE_CODE_RE) : même
    numéro de carte, pas une variante non plus."""
    contents = [c for c in _QUALIFIER_RE.findall(text) if not c.strip().lstrip("#").isdigit()]
    return frozenset(_normalize_name(" ".join(contents)).split())


def _dice(a: frozenset, b: frozenset) -> float:
    """Coefficient de Dice, même formule que pricecharting.py::_qualifier_dice."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def disambiguate_candidates(text: str, candidates: list[Card]) -> MatchResult:
    """Pure (pas de DB) : départage plusieurs items partageant le même code
    par similarité du contenu des qualificatifs entre crochets/parenthèses
    du texte libre vs. du nom candidat. Ne devine jamais : renvoie
    status='ambiguous' si le meilleur score est sous le seuil ou s'il y a
    égalité -- même philosophie que pricecharting.py::_best_single_match."""
    if len(candidates) == 1:
        return MatchResult(status="matched", card=candidates[0], confidence=1.0, strategy="code")

    text_qual = _qualifier_tokens(text)
    scored = sorted(
        ((_dice(text_qual, _qualifier_tokens(c.name)), c) for c in candidates),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _CODE_QUALIFIER_MATCH_THRESHOLD or tie:
        return MatchResult(status="ambiguous", candidates=[c for _, c in scored], strategy="code+qualifier")
    return MatchResult(status="matched", card=best, confidence=best_score, strategy="code+qualifier")


def _extract_rarity_hint(text: str) -> str | None:
    tokens = {t.lower() for t in re.findall(r"[A-Za-z!]+", text)}
    for token in tokens:
        if token in _RARITY_ABBREVIATIONS:
            return _RARITY_ABBREVIATIONS[token]
    lowered = text.lower()
    return next((r for r in ONE_PIECE_KNOWN_RARITIES if r.lower() in lowered), None)


def _extract_name_tokens(text: str) -> set[str]:
    """Retire qualificatifs, code, rareté connue et bruit de place de marché
    avant de considérer le reste comme des tokens de nom de personnage.
    Heuristique best-effort documentée -- pas de NLP, cohérent avec le reste
    du repo."""
    stripped = _QUALIFIER_RE.sub(" ", text)
    stripped = ONE_PIECE_CODE_RE.sub(" ", stripped)
    tokens = set(_normalize_name(stripped).split()) - _NOISE_WORDS
    rarity = _extract_rarity_hint(text)
    if rarity:
        tokens -= set(_normalize_name(rarity).split())
    return tokens


def fuzzy_match_by_name_and_rarity(text: str) -> MatchResult:
    """Priorité 2 (fallback) : aucun code trouvé. Pré-filtre en DB par
    tokens de nom, puis score de Dice sur le nom normalisé complet (+ filtre
    optionnel par rareté détectée) -- ne devine jamais si le meilleur score
    est sous le seuil ou s'il y a égalité."""
    tokens = _extract_name_tokens(text)
    if not tokens:
        return MatchResult(status="not_found", strategy="fuzzy_name_rarity",
                            message="Aucun token de nom exploitable dans le texte fourni.")

    candidates = fetch_items_by_name_tokens(tokens)
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
    """Priorité 1 : code OP/ST/EB/Pxx-xxx (+ désambiguïsation qualificatif
    si plusieurs items partagent le code). Priorité 2 (fallback) : nom +
    rareté approximatifs. Factorisé hors de `identify_card` pour être
    partagé entre le texte fourni tel quel et le texte extrait par OCR."""
    code = extract_one_piece_code(text)
    if code:
        candidates = fetch_items_by_code(code)
        if not candidates:
            return MatchResult(status="not_found", strategy="code",
                                message=f"Code {code} reconnu mais absent du référentiel.")
        return disambiguate_candidates(text, candidates)
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
