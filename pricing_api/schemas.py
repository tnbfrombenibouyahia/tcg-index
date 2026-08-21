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
    language: str  # 'EN' | 'JP' | 'FR' -- cf. pricing/models.py::Card, requis pour l'affichage extension (panneau v2)
    confidence: float


class SourcePriceOut(BaseModel):
    source: str
    grade: str
    price: float
    currency: str


class SalesStatsOut(BaseModel):
    """Moy. 3 / moy. 10 dernières ventes -- cf. pricing/sales_stats.py.
    sample_size_* < 3/10 signale une moyenne partielle (peu de ventes
    connues), à afficher tel quel plutôt que masqué."""
    avg_last_3: float | None
    avg_last_10: float | None
    sample_size_3: int
    sample_size_10: int
    currency: str | None  # None si aucune vente exploitable


class LiquidityOut(BaseModel):
    """cf. pricing/liquidity.py -- label déjà décidé côté serveur, l'UI
    n'a qu'à l'afficher."""
    sales_last_90d: int
    # None = jamais scrapé pour cet item/grade (PAS "0 annonce active" --
    # active_listings ne couvre aujourd'hui que le scellé, cf.
    # pricing/repository.py::fetch_latest_active_listing_count)
    active_listings: int | None
    sales_per_month: float
    label: str  # 'liquide' | 'modere' | 'illiquide'


class LanguageComparisonOut(BaseModel):
    language: str
    card_id: int
    price: float | None  # None si aucun prix connu pour cette langue (pas d'équivalent trouvé)
    currency: str | None
    is_current_listing: bool  # true pour la ligne de l'annonce affichée


class SealedDisplayPriceOut(BaseModel):
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

    # Signaux étendus (maquette panneau v2) -- tous None/vides si la carte
    # n'a pas pu être identifiée (status != 'ok' et != 'no_reference_price').
    # opportunity_score reste None même carte identifiée si aucune source de
    # prix n'a répondu (status='no_reference_price') : jamais deviné sans
    # prix de référence, cf. shared/verdict.py::compute_extended_signals.
    opportunity_score: int | None = None
    sales_stats: SalesStatsOut | None = None
    liquidity: LiquidityOut | None = None
    language_comparison: list[LanguageComparisonOut] = []
    sealed_display_price: SealedDisplayPriceOut | None = None
