"""Statistiques de ventes récentes (moy. 3 / moy. 10 dernières ventes) --
pure, à partir d'une liste déjà triée par pricing/repository.py::fetch_recent_sales
(la plus récente en premier). Jamais de requête ici : séparé de la lecture
DB comme median_reference_price/classify le sont déjà dans shared/verdict.py.
"""
import statistics
from dataclasses import dataclass


@dataclass
class SalesStats:
    avg_last_3: float | None
    avg_last_10: float | None
    sample_size_3: int   # nb de ventes réellement utilisées -- peut être < 3
    sample_size_10: int  # idem, peut être < 10 ; jamais masqué à l'appelant
    currency: str | None  # None si aucune vente exploitable


def compute_sales_stats(recent_sales: list[tuple[float, str]]) -> SalesStats:
    """`recent_sales` : (price, currency), triées la plus récente d'abord,
    déjà limitées à N côté requête (cf. fetch_recent_sales). Ne mélange
    jamais deux devises dans une même moyenne -- même principe que
    shared/verdict.py::compute_verdict_for_card (LIMITE CONNUE documentée là
    aussi) : ne garde que les ventes dans la devise de la plus récente, les
    autres sont ignorées plutôt que fondues dans le calcul."""
    if not recent_sales:
        return SalesStats(avg_last_3=None, avg_last_10=None, sample_size_3=0, sample_size_10=0, currency=None)

    currency = recent_sales[0][1]
    prices = [price for price, cur in recent_sales if cur == currency]

    last_3 = prices[:3]
    last_10 = prices[:10]
    return SalesStats(
        avg_last_3=statistics.fmean(last_3) if last_3 else None,
        avg_last_10=statistics.fmean(last_10) if last_10 else None,
        sample_size_3=len(last_3),
        sample_size_10=len(last_10),
        currency=currency,
    )
