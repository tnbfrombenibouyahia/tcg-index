"""Annonces eBay de slabs BGS/CGC d'une carte candidate -> alertes.

Approche "carte d'abord" (pas de balayage générique "CGC 10 pokemon") : on
n'interroge eBay que pour les cartes où un arbitrage est plausible
(arbitrage/candidates.py), avec la même requête à 98 % de précision que le
comptage de listings (nom + numéro entre guillemets, cf.
ingestion/sources/ebay.py::build_single_query), plus le nom du grader. Les
annonces reviennent triées par prix croissant : les moins chères, donc les
seules intéressantes, sont en tête.

Garde-fous de précision (une fausse alerte publique coûte plus cher qu'une
opportunité ratée) : grader et note lus dans le titre (arbitrage/graders.py),
langue cohérente avec la carte suivie (EN et JP sont deux `items` aux prix
PSA différents), pas de lot/proxy/custom, prix d'achat pas absurdement bas
face au PSA 9 (autre carte ou contrefaçon), prix fixe uniquement (le prix
courant d'une enchère n'est pas un prix d'achat).
"""
import re
import unicodedata
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from arbitrage.economics import Thresholds, evaluate, is_alert_worthy
from arbitrage.graders import parse_slab
from arbitrage.models import Alert, Candidate
from ingestion.sources import ebay

GRADERS = ("bgs", "cgc")
# Syntaxe OR d'eBay : `(a,b,c)`. Validée en conditions réelles le 2026-09-28
# sur eBay.fr (Luffy OP05-119 : bgs=5, beckett=2, (bgs,beckett)=6 -- l'union,
# recouvrement compris ; (cgc,bgs,beckett)=14). "beckett" en plus de "bgs"
# parce que des vendeurs écrivent le nom en toutes lettres sans "BGS". Une
# seule requête par carte au lieu d'une par grader : budget de quota divisé
# par deux.
GRADER_QUERY = "(bgs,beckett,cgc)"

# Un titre "lot", "proxy"... n'est pas un slab à l'unité de la vraie carte.
_EXCLUDED_TITLE = re.compile(
    r"\b(lot|lots|bundle|proxy|proxies|custom|replica|replique|reproduction|"
    r"fake|orica|digital|numerique|code\s*card|reprint)\b",
    re.IGNORECASE,
)

_JP_HINTS = {"jp", "jpn", "jap", "japan", "japanese", "japonais", "japonaise"}
# Autres éditions linguistiques d'un même numéro de carte (prix PSA propres) :
# une carte EN suivie ne doit pas être comparée à un slab FR/DE/KR...
# "de" volontairement absent (préposition française dans les titres FR).
_OTHER_LANGUAGE_HINTS = {
    "fr", "french", "francais", "francaise", "allemand", "allemande", "german", "deutsch",
    "italien", "italian", "espagnol", "spanish", "coreen", "korean", "chinois", "chinese",
    "thai", "indonesian",
}


def _tokens(text: str) -> set[str]:
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return set(re.findall(r"[a-z0-9]+", folded.lower()))


def language_ok(card_language: str, title: str) -> bool:
    """EN suivie : refuse tout indice JP ou d'une autre langue. JP suivie :
    exige un indice JP explicite (sans lui, l'annonce est presque toujours
    l'édition EN, au prix PSA très différent)."""
    tokens = _tokens(title)
    has_jp = bool(tokens & _JP_HINTS)
    if card_language == "JP":
        return has_jp
    return not has_jp and not (tokens & _OTHER_LANGUAGE_HINTS)


def has_code(code: str | None, title: str) -> bool:
    """Le numéro de carte figure dans le titre, en tant que numéro entier :
    "4/102" ne doit pas valider "14/102" ni "4/1020" (la simple sous-chaîne,
    ce que fait déjà la requête eBay entre guillemets, laisse passer ce bruit).
    Espaces tolérés autour de "/" et "-" ("4 / 102")."""
    if not code or not code.strip():
        return False
    pieces = [re.escape(p) for p in re.split(r"([/-])", code.strip().lower())]
    pattern = r"(?<![0-9a-z])" + r"\s*".join(pieces) + r"(?![0-9])"
    return re.search(pattern, title.lower()) is not None


_QUALIFIER_GROUP = re.compile(r"[\(\[](.*?)[\)\]]")


def base_name(name: str) -> str:
    """Nom sans qualificatifs entre parenthèses/crochets ("Nico Robin [SP]"
    -> "Nico Robin")."""
    return re.sub(r"\s+", " ", _QUALIFIER_GROUP.sub(" ", name)).strip()


def has_name(name: str, title: str) -> bool:
    """Tous les mots du nom de base sont dans le titre. eBay peut matcher un
    mot de la requête dans la description ou les caractéristiques plutôt que
    dans le titre."""
    words = {w for w in _tokens(base_name(name)) if len(w) >= 2}
    return bool(words) and words <= _tokens(title)


def has_qualifiers(name: str, title: str) -> bool:
    """Les qualificatifs de variante du nom ("[Alternate Art]", "(Manga)",
    "[SP]") figurent dans le titre. Un même code (ex. OP06-118) est partagé
    par une dizaine d'items -- carte de base, Alternate Art, Manga, Parallel
    -- aux prix PSA sans commune mesure : comparer un slab de la carte de
    base au PSA d'une variante fabriquerait de fausses alertes. Sans
    qualificatif dans le nom suivi, rien à exiger (les garde-fous de prix
    couvrent le reste). Les groupes purement numériques ("(055)") sont
    ignorés."""
    title_tokens = _tokens(title)
    for group in _QUALIFIER_GROUP.findall(name):
        words = {w for w in _tokens(group) if len(w) >= 2 and not w.isdigit()}
        if words and not words <= title_tokens:
            return False
    return True


def _clean_url(url: str) -> str:
    """Retire `_skw` (les mots-clés de NOTRE requête, ajoutés par eBay à
    l'URL de l'annonce) : du bruit dans un lien public. Le reste de la query
    string (`hash`) est conservé tel quel."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "_skw"]
    return urlunsplit(parts._replace(query=urlencode(query, safe=":")))


def _money(obj: dict | None) -> tuple[float, str] | None:
    if not obj or obj.get("value") in (None, "") or not obj.get("currency"):
        return None
    return float(obj["value"]), obj["currency"]


def _cheapest_shipping(summary: dict, currency: str, usd_per_unit: Callable[[str], float]) -> float | None:
    """Frais de port les plus bas connus, exprimés dans la devise de l'annonce.
    None si eBay n'en donne aucun (pas de contexte acheteur, ou à calculer)."""
    costs = []
    for option in summary.get("shippingOptions") or []:
        money = _money(option.get("shippingCost"))
        if money is None:
            continue
        value, cur = money
        costs.append(value if cur == currency else value * usd_per_unit(cur) / usd_per_unit(currency))
    return min(costs) if costs else None


def extract_alert(
    candidate: Candidate,
    summary: dict,
    *,
    marketplace: str,
    thresholds: Thresholds,
    usd_per_unit: Callable[[str], float],
) -> Alert | None:
    """Une annonce eBay (item_summary) -> Alert, ou None si elle ne passe pas
    un des garde-fous / le seuil du signal."""
    title = summary.get("title") or ""
    slab = parse_slab(title)
    if (
        slab is None
        or slab.grader not in GRADERS
        or slab.premium_label
        or slab.grade not in thresholds.allowed_grades
    ):
        return None
    if _EXCLUDED_TITLE.search(title):
        return None
    if not has_code(candidate.code, title) or not has_name(candidate.name, title):
        return None
    if not has_qualifiers(candidate.name, title):
        return None
    if not language_ok(candidate.language, title):
        return None
    if "FIXED_PRICE" not in (summary.get("buyingOptions") or []):
        return None

    money = _money(summary.get("price"))
    if money is None or not summary.get("itemId") or not summary.get("itemWebUrl"):
        return None
    price, currency = money
    shipping = _cheapest_shipping(summary, currency, usd_per_unit)
    rate = usd_per_unit(currency)

    opp = evaluate(
        buy_total_usd=(price + (shipping or 0.0)) * rate,
        psa9_usd=candidate.psa9_usd,
        psa10_usd=candidate.psa10_usd,
        extra_costs_usd=thresholds.extra_costs_usd,
    )
    if opp is None or not is_alert_worthy(opp, thresholds):
        return None

    seller = summary.get("seller") or {}
    feedback = seller.get("feedbackPercentage")
    image = (summary.get("image") or {}).get("imageUrl")
    return Alert(
        candidate=candidate,
        marketplace=marketplace,
        listing_id=summary["itemId"],
        title=title,
        url=_clean_url(summary["itemWebUrl"]),
        item_country=(summary.get("itemLocation") or {}).get("country"),
        image_url=image,
        grader=slab.grader,
        grade=slab.grade,
        price=price,
        shipping=shipping,
        currency=currency,
        usd_per_unit=rate,
        seller=seller.get("username"),
        seller_feedback_pct=float(feedback) if feedback not in (None, "") else None,
        opportunity=opp,
    )


def search_alerts(
    candidate: Candidate,
    *,
    marketplace_id: str,
    buyer_country: str,
    thresholds: Thresholds,
    usd_per_unit: Callable[[str], float],
    limit: int = 50,
) -> list[Alert]:
    """Une requête eBay (carte candidate x place de marché) -> alertes, tous
    graders BGS/Beckett/CGC confondus."""
    # Nom SANS qualificatifs : "[Alternate Art Manga]" n'apparaît presque jamais
    # tel quel dans un titre et ferait fondre le rappel ; extract_alert
    # revérifie de toute façon les qualificatifs (has_qualifiers).
    query = (
        f"{ebay.build_single_query({'name': base_name(candidate.name), 'code': candidate.code})} "
        f"{GRADER_QUERY}"
    )
    payload = ebay.search_listings(
        query, marketplace_id=marketplace_id, delivery_country=buyer_country, limit=limit,
    )
    marketplace = marketplace_id.lower()
    alerts = []
    for summary in payload.get("itemSummaries") or []:
        alert = extract_alert(
            candidate, summary, marketplace=marketplace, thresholds=thresholds, usd_per_unit=usd_per_unit,
        )
        if alert is not None:
            alerts.append(alert)
    return alerts
