"""Stub -- CardMarket a une API officielle (compte pro requis) mais son
intégration est hors scope de cette itération (aucune clé disponible, cf.
.env.example). `items.cardmarket_id` existe déjà en base (db/schema.sql)
comme clé de jointure potentielle -- prêt à être branché le jour venu.

TODO: implémenter fetch_price() une fois une clé CardMarket obtenue. Point
d'attention pour ce jour-là : CardMarket facture en EUR, pas en USD comme
PriceCharting -- shared/verdict.py::compute_verdict_for_card ne fait
actuellement aucune conversion de devise (cf. sa docstring), à traiter avant
d'activer cette source aux côtés de PriceCharting.
"""
from pricing.models import Card, PriceQuote
from pricing.sources.base import PriceSource


class CardMarketSource(PriceSource):
    name = "cardmarket"

    def fetch_price(self, card: Card, grade: str) -> PriceQuote | None:
        raise NotImplementedError("CardMarketSource n'est pas encore implémentée.")
