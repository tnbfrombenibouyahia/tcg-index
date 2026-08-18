"""Interface commune à toutes les sources de prix -- une implémentation par
source (cf. pricecharting_source.py pour la seule branchée en MVP,
cardmarket_source.py et ebay_sold_source.py comme stubs). Ajouter une
source = créer une classe ici, l'enregistrer dans la liste par défaut de
shared/verdict.py -- jamais toucher les sources existantes.
"""
from abc import ABC, abstractmethod

from pricing.models import Card, PriceQuote


class PriceSource(ABC):
    name: str

    @abstractmethod
    def fetch_price(self, card: Card, grade: str) -> PriceQuote | None:
        """Va chercher un prix FRAIS (jamais de cache ici, cf.
        pricing/cache.py pour la couche TTL). Retourne None si aucun prix
        trouvé/matché -- ne lève jamais pour un simple "pas trouvé", cohérent
        avec l'isolation d'erreurs déjà pratiquée dans ingestion/sources/*.py.
        Peut lever NotImplementedError (cf. les stubs) : pricing/cache.py la
        traite comme une absence de prix, sans casser le calcul avec les
        autres sources."""
