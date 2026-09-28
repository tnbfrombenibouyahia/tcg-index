"""Dataclasses partagées par le module arbitrage (même rôle que pricing/models.py)."""
from dataclasses import dataclass
from datetime import date

from arbitrage.economics import Opportunity


@dataclass(frozen=True)
class Candidate:
    """Carte pour laquelle un arbitrage est plausible : PSA 9 et PSA 10 connus
    en base (price_snapshots, USD) avec un écart assez large pour qu'un slab
    BGS/CGC bon marché puisse valoir un regrade."""
    item_id: int
    name: str
    code: str | None
    set_code: str | None
    tcg: str
    language: str
    rarity: str | None
    image_url: str | None
    psa9_usd: float
    psa9_date: date
    psa10_usd: float
    psa10_date: date


@dataclass(frozen=True)
class Alert:
    candidate: Candidate
    marketplace: str            # 'ebay_fr', 'ebay_us'... (colonne arbitrage_alerts.marketplace)
    listing_id: str
    title: str
    url: str
    image_url: str | None
    grader: str                 # 'bgs' | 'cgc'
    grade: float
    price: float                # prix d'annonce, devise de l'annonce
    shipping: float | None      # None = non précisé par la place de marché
    currency: str
    usd_per_unit: float         # taux utilisé pour convertir `currency` -> USD
    seller: str | None
    seller_feedback_pct: float | None
    opportunity: Opportunity
    item_country: str | None = None   # pays d'expédition (ISO, ex. 'FR', 'JP') -- TVA/douane si hors UE
