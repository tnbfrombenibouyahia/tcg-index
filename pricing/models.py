"""Dataclasses partagées par pricing/matching.py, pricing/repository.py,
pricing/cache.py, pricing/sources/*, shared/verdict.py -- évite de
redéfinir la forme d'une carte/d'un prix dans chaque fichier.
"""
from dataclasses import dataclass, field
from datetime import datetime

# Même vocabulaire que price_snapshots.grade / ingestion/sources/pricecharting.py
# -- dupliqué ici faute de module de constantes partagé côté Python (le
# vocabulaire équivalent vit en TypeScript dans web/lib/constants.ts, non
# réutilisable depuis ce service).
KNOWN_GRADES = {"ungraded", "psa7", "psa8", "psa9", "psa9.5", "psa10"}


@dataclass
class Card:
    id: int
    name: str
    code: str | None
    set_code: str | None
    tcg: str
    category: str
    language: str
    rarity: str | None


@dataclass
class PriceQuote:
    source: str
    grade: str
    price: float
    currency: str
    fetched_at: datetime | None = None


@dataclass
class MatchResult:
    status: str  # 'matched' | 'ambiguous' | 'not_found'
    card: Card | None = None
    candidates: list[Card] = field(default_factory=list)
    confidence: float = 0.0
    strategy: str | None = None  # 'code' | 'code+qualifier' | 'fuzzy_name_rarity' | None
    message: str | None = None
