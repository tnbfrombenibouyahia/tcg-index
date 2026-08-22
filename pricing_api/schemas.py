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
    # Sélection manuelle par l'utilisateur dans le picker du panneau
    # (candidat cliqué sur un statut 'ambiguous' précédent) -- quand
    # présent, court-circuite identify_card() entièrement : l'identité
    # n'est plus à deviner, elle est confirmée par un humain (cf.
    # pricing_api/main.py::post_verdict).
    selected_card_id: int | None = None

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
    # Miniature pour le picker de désambiguïsation -- None si le
    # référentiel n'a pas d'image pour cet item (rare, cf. couverture
    # mesurée dans tcg-index-handoff.md §04 : 99,9%/100% des items ont une
    # image_url exploitable).
    image_url: str | None = None
    # Libellé humain dérivé de set_code (cf. pricing/repository.py::set_label_from_code)
    # + année de sortie du set (cf. fetch_set_release_year) -- demande
    # utilisateur (2026-08-22) : voir si une carte vient d'un set classique
    # ou d'un tirage promo/événement, et de quelle année. Pas de champ
    # "is_promo" séparé : la rareté seule (ex. "Promo") ne suffit pas à
    # trancher de façon fiable (des cartes de sets clairement promo/
    # événementiels gardent leur rareté normale style "Secret Rare",
    # vérifié en base) -- `rarity` + `set_name` bruts affichés tels quels,
    # jamais une classification binaire devinée à leur place.
    set_name: str | None = None
    set_release_year: int | None = None


class SourcePriceOut(BaseModel):
    source: str
    grade: str
    price: float
    currency: str
    # Page produit source exacte -- None pour une source qui n'en résout pas
    # (cf. pricing/models.py::PriceQuote). Permet à l'extension de proposer
    # un lien de double-vérification vers la source réelle du prix.
    url: str | None = None


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


class GradingRoiInputsOut(BaseModel):
    """Ingrédients bruts (PAS le ROI calculé) -- cf. pricing/grading_roi.py.
    Le calcul EV/coût/ROI se fait côté extension (lib/gradingRoi.js, port de
    web/lib/gradingRoi.ts) pour rester recalculable en live quand
    l'utilisateur change ses hypothèses."""
    ungraded_price: float
    grade_prices: dict[str, float]  # seuls les grades avec un prix connu
    grade_counts: dict[str, dict[str, int]]  # 'card'|'set_rarity'|'set'|'tcg' -> {grade: count}


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
    grading_roi_inputs: GradingRoiInputsOut | None = None
