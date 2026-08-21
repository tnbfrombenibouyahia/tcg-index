"""Liquidité (carte/set) : ventes conclues sur fenêtre glissante 90j +
annonces actives -- cf. tcg-index-handoff.md §07 ("Extension + site -- sales
+ active_listings, requête directe, aucun stockage dédié"). Le label
(liquide/modéré/illiquide) est décidé ICI, une seule fois, pour que
l'extension n'ait jamais à réimplémenter le seuillage.
"""
from dataclasses import dataclass

_LIQUID_MIN_PER_MONTH = 3.0
_MODERATE_MIN_PER_MONTH = 1.0
_WINDOW_DAYS = 90
_WINDOW_MONTHS = _WINDOW_DAYS / 30


@dataclass
class LiquidityMetrics:
    sales_last_90d: int
    # None = jamais scrapé pour cet item/grade (active_listings ne couvre
    # aujourd'hui que le scellé, cf. pricing/repository.py::fetch_latest_active_listing_count)
    # -- PAS "0 annonce active", ne jamais confondre les deux côté affichage.
    active_listings: int | None
    sales_per_month: float
    label: str  # 'liquide' | 'modere' | 'illiquide'


def liquidity_label(sales_per_month: float) -> str:
    """Seuils repris du brief produit : >3/mois liquide, 1-3 modéré, <1
    illiquide."""
    if sales_per_month > _LIQUID_MIN_PER_MONTH:
        return "liquide"
    if sales_per_month >= _MODERATE_MIN_PER_MONTH:
        return "modere"
    return "illiquide"


def compute_liquidity(sales_last_90d: int, active_listings: int | None) -> LiquidityMetrics:
    sales_per_month = sales_last_90d / _WINDOW_MONTHS
    return LiquidityMetrics(
        sales_last_90d=sales_last_90d,
        active_listings=active_listings,
        sales_per_month=sales_per_month,
        label=liquidity_label(sales_per_month),
    )
