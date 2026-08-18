"""Classification vert/jaune/rouge d'un prix affiché face à un prix de
référence marché, à grade équivalent.

La partie pure (median_reference_price, classify) n'a aucune dépendance
DB/HTTP -- réutilisable telle quelle, testable sans environnement. Seule
compute_verdict_for_card importe `pricing.*` : elle orchestre matching de
prix + calcul, placée ici à la demande explicite (réutilisable par
pricing_api/ ET un futur script batch), même si cela introduit une
dépendance shared -> pricing inhabituelle pour ce module (shared/db.py et
shared/sync_log.py n'ont aujourd'hui aucune dépendance vers leurs frères).
"""
import os
import statistics
from dataclasses import dataclass, field

from pricing.cache import get_price_with_cache
from pricing.models import Card, PriceQuote
from pricing.repository import fetch_card_by_id
from pricing.sources.base import PriceSource
from pricing.sources.pricecharting_source import PriceChartingSource

_DEFAULT_GREEN_MAX_RATIO = 0.85
_DEFAULT_YELLOW_MAX_RATIO = 1.15


@dataclass
class Verdict:
    label: str  # 'green' | 'yellow' | 'red'
    ratio: float
    reference_price: float
    displayed_price: float
    grade: str


@dataclass
class VerdictOutcome:
    status: str  # 'ok' | 'card_not_found' | 'no_reference_price'
    card: Card | None = None
    verdict: Verdict | None = None
    sources_compared: list[PriceQuote] = field(default_factory=list)


def median_reference_price(prices: list[float]) -> float | None:
    """None si `prices` est vide -- pas d'exception, l'appelant décide."""
    return statistics.median(prices) if prices else None


def classify(displayed_price: float, reference_price: float, grade: str, *,
             green_max_ratio: float | None = None, yellow_max_ratio: float | None = None) -> Verdict:
    """Seuils lus depuis .env si non fournis (VERDICT_GREEN_MAX_RATIO /
    VERDICT_YELLOW_MAX_RATIO) -- paramétrables explicitement pour les tests,
    sans dépendance à l'environnement dans les cas unitaires. Bornes exactes
    conformes à la spec : vert strictement sous green_max, jaune inclusif
    jusqu'à yellow_max, rouge strictement au-dessus."""
    if green_max_ratio is None:
        green_max_ratio = float(os.environ.get("VERDICT_GREEN_MAX_RATIO", _DEFAULT_GREEN_MAX_RATIO))
    if yellow_max_ratio is None:
        yellow_max_ratio = float(os.environ.get("VERDICT_YELLOW_MAX_RATIO", _DEFAULT_YELLOW_MAX_RATIO))

    ratio = displayed_price / reference_price
    if ratio < green_max_ratio:
        label = "green"
    elif ratio <= yellow_max_ratio:
        label = "yellow"
    else:
        label = "red"
    return Verdict(label=label, ratio=ratio, reference_price=reference_price,
                    displayed_price=displayed_price, grade=grade)


def compute_verdict_for_card(displayed_price: float, card_id: int, grade: str = "ungraded", *,
                              sources: list[PriceSource] | None = None,
                              ttl_hours: float | None = None) -> VerdictOutcome:
    """Fonction demandée par la spec (section 3) : (prix_affiché, card_id,
    grade) -> verdict. Compare TOUJOURS à grade équivalent (le paramètre
    `grade` est propagé tel quel à chaque source, jamais de fallback vers un
    autre grade). `sources` par défaut = [PriceChartingSource()] (seule
    source branchée en MVP, cf. pricing/sources/) -- injectable pour les
    tests ou pour étendre plus tard sans changer la signature.

    LIMITE CONNUE (non traitée dans cette itération) : aucune conversion de
    devise -- si les sources renvoient des devises différentes entre elles,
    ou différentes de celle du prix affiché, la médiane mélange des montants
    non comparables. PriceCharting (seule source MVP) est exclusivement en
    USD -- acceptable tant qu'une seule source est branchée, à corriger
    avant d'en ajouter une 2e dans une devise différente (ex. CardMarket,
    EUR)."""
    card = fetch_card_by_id(card_id)
    if card is None:
        return VerdictOutcome(status="card_not_found")

    active_sources = sources if sources is not None else [PriceChartingSource()]
    quotes = []
    for source in active_sources:
        quote = get_price_with_cache(card, grade, source, ttl_hours=ttl_hours)
        if quote is not None:
            quotes.append(quote)

    reference = median_reference_price([q.price for q in quotes])
    if reference is None:
        return VerdictOutcome(status="no_reference_price", card=card, sources_compared=quotes)

    verdict = classify(displayed_price, reference, grade)
    return VerdictOutcome(status="ok", card=card, verdict=verdict, sources_compared=quotes)
