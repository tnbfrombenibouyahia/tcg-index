from dataclasses import dataclass
from datetime import date


@dataclass
class PriceRow:
    external_id: str      # id de l'item chez la source de prix
    price: float
    currency: str
    captured_at: date
    volume: int | None
    source: str


def fetch() -> list[PriceRow]:
    raise NotImplementedError
