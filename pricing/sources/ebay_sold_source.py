"""Stub -- distinct de ingestion/sources/ebay.py (qui compte des LISTINGS
ACTIFS via l'API eBay Browse, un proxy de pression vendeuse, pas un prix de
vente réalisé) et de la table `sales` (déjà alimentée par du scraping
PriceCharting de ventes eBay/TCGPlayer, pas par l'API eBay directement).

TODO: implémenter fetch_price() si une intégration API eBay dédiée aux
ventes réalisées (Marketplace Insights ou équivalent) devient nécessaire,
au-delà de ce que PriceCharting republie déjà via `sales`.
"""
from pricing.models import Card, PriceQuote
from pricing.sources.base import PriceSource


class EbaySoldListingsSource(PriceSource):
    name = "ebay_sold"

    def fetch_price(self, card: Card, grade: str) -> PriceQuote | None:
        raise NotImplementedError("EbaySoldListingsSource n'est pas encore implémentée.")
