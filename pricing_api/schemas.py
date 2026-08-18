"""Modèles Pydantic requête/réponse du micro-service de verdict. Champs en
snake_case, cohérent avec le contrat JSON déjà observé côté
web/app/api/*/route.ts (ex. item_id, grade).
"""
from pydantic import BaseModel, field_validator

from pricing.models import KNOWN_GRADES


class VerdictRequest(BaseModel):
    text: str | None = None
    image_url: str | None = None
    displayed_price: float
    grade: str = "ungraded"

    @field_validator("grade")
    @classmethod
    def _validate_grade(cls, v: str) -> str:
        if v not in KNOWN_GRADES:
            raise ValueError(f"grade doit être l'un de {sorted(KNOWN_GRADES)}")
        return v


class CardCandidateOut(BaseModel):
    card_id: int
    name: str
    code: str | None
    set_code: str | None
    rarity: str | None
    confidence: float


class SourcePriceOut(BaseModel):
    source: str
    grade: str
    price: float
    currency: str


class VerdictResponse(BaseModel):
    status: str  # 'matched' | 'ambiguous' | 'not_found' | 'card_not_found' | 'no_reference_price'
    card: CardCandidateOut | None = None
    candidates: list[CardCandidateOut] = []
    verdict: str | None = None  # 'green' | 'yellow' | 'red'
    reference_price: float | None = None
    displayed_price: float
    grade: str
    sources_compared: list[SourcePriceOut] = []
    message: str | None = None
