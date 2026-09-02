"""Modèles Pydantic requête/réponse du micro-service de verdict. Champs en
snake_case, cohérent avec le contrat JSON déjà observé côté
web/app/api/*/route.ts (ex. item_id, grade).
"""
from datetime import date

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
    """Médiane récente (fenêtre adaptative 3-5 ventes) / moy. 10 dernières
    ventes -- cf. pricing/sales_stats.py. sample_size_recent varie entre 0
    et 5 selon la densité temporelle des ventes disponibles (jamais masqué
    à l'appelant, cf. docstring de compute_sales_stats) ; sample_size_10 < 10
    signale une moyenne partielle (peu de ventes connues)."""
    median_recent: float | None
    avg_last_10: float | None
    sample_size_recent: int
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
    # Page produit PriceCharting pour CETTE langue -- None si pas résolue
    # (set non mappé, scraping en échec...). Alimente le bouton "Voir la
    # version <langue>" du panneau extension, cf. shared/verdict.py::
    # _build_language_comparison -- jamais un lien de recherche deviné.
    url: str | None = None


class SealedDisplayPriceOut(BaseModel):
    price: float
    currency: str


class FavoriteOut(BaseModel):
    """Une carte favorite -- mêmes champs d'affichage que CardCandidateOut
    (picker/watchlist cohérents), sans `confidence` : un favori est déjà
    une identité confirmée, pas un candidat à départager.

    current_price/current_currency ajoutés pour l'écran Watchlist CardQuant
    (cf. mémoire projet "cardquant-rebrand") -- prix brut (ungraded) le plus
    récent connu, même source que _position_out du portefeuille
    (fetch_latest_price_snapshot). None si jamais snapshotté à ce grade."""
    card_id: int
    name: str
    code: str | None
    set_code: str | None
    rarity: str | None
    language: str  # 'EN' | 'JP' | 'FR' -- porte la langue suivie (cf. pricing/favorites.py)
    image_url: str | None = None
    set_name: str | None = None
    set_release_year: int | None = None
    current_price: float | None = None
    current_currency: str | None = None


class FavoritesListResponse(BaseModel):
    favorites: list[FavoriteOut]
    # FREE_FAVORITES_LIMIT (cf. pricing/favorites.py), ou -1 si is_premium
    # (illimité) -- évite à l'appelant de dupliquer la constante pour
    # afficher "2/3 favoris".
    limit: int
    is_premium: bool


class FavoriteStatusResponse(BaseModel):
    """Statut favori d'UNE carte -- panneau extension (cf. content.js::
    refreshFavoriteStatus), interrogé juste après une carte identifiée par
    /verdict, pour ne jamais recharger la liste entière (FREE_FAVORITES_LIMIT
    reste petit, mais pas de raison de payer un GET /favorites complet pour
    savoir l'état d'une seule carte)."""
    is_favorited: bool
    count: int  # nb de favoris actuels de l'utilisateur -- alimente l'affichage "2/3"
    limit: int  # FREE_FAVORITES_LIMIT, ou -1 si is_premium (illimité)
    is_premium: bool


class FavoriteAddRequest(BaseModel):
    item_id: int


class FavoriteAddResponse(BaseModel):
    status: str  # 'added' | 'already_favorited'
    favorite: FavoriteOut


class FavoriteRemoveResponse(BaseModel):
    status: str  # 'removed' | 'not_favorited'


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
    # opportunity_score compare le prix affiché à la moy. des ventes
    # récentes en priorité (repli sur reference_price PriceCharting
    # seulement si aucune vente récente n'est connue, cf.
    # shared/verdict.py::compute_extended_signals) -- reste None seulement si
    # NI l'un NI l'autre signal n'est disponible : jamais deviné sans aucun
    # prix de référence.
    opportunity_score: int | None = None
    sales_stats: SalesStatsOut | None = None
    liquidity: LiquidityOut | None = None
    language_comparison: list[LanguageComparisonOut] = []
    sealed_display_price: SealedDisplayPriceOut | None = None
    grading_roi_inputs: GradingRoiInputsOut | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Portefeuille personnel (écran PnL CardQuant, cf. mémoire projet
# "cardquant-rebrand") -- cf. pricing/portfolio.py pour le CRUD, ce fichier
# ne porte que la forme JSON.
# ─────────────────────────────────────────────────────────────────────────────

class PortfolioPositionOut(BaseModel):
    id: int
    item_id: int
    name: str
    code: str | None
    set_code: str | None
    tcg: str
    language: str
    rarity: str | None
    image_url: str | None = None
    grade: str
    quantity: int
    buy_price: float
    buy_currency: str
    buy_date: date
    sell_price: float | None
    sell_currency: str | None
    sell_date: date | None
    note: str | None
    status: str  # 'open' | 'closed'
    # Prix marché le plus récent connu à `grade` -- None si jamais snapshotté
    # (cf. pricing/repository.py::fetch_latest_price_snapshot). Toujours
    # renseigné même pour une position fermée (affichage "et aujourd'hui ?"),
    # le P/V réalisé lui reste basé sur sell_price, pas sur ce champ.
    current_price: float | None = None
    current_currency: str | None = None


class PortfolioListResponse(BaseModel):
    positions: list[PortfolioPositionOut]


class PortfolioAddRequest(BaseModel):
    item_id: int
    grade: str = "ungraded"
    quantity: int = 1
    buy_price: float
    buy_currency: str = "EUR"
    buy_date: date
    note: str | None = None

    @field_validator("grade")
    @classmethod
    def _validate_grade(cls, v: str) -> str:
        if v not in KNOWN_GRADES:
            raise ValueError(f"grade doit être l'un de {sorted(KNOWN_GRADES)}")
        return v

    @field_validator("quantity")
    @classmethod
    def _validate_quantity(cls, v: int) -> int:
        if v < 1:
            raise ValueError("quantity doit être >= 1")
        return v


class PortfolioAddResponse(BaseModel):
    position: PortfolioPositionOut


class PortfolioUpdateRequest(BaseModel):
    """Édition partielle -- tous les champs sont optionnels, seuls ceux
    fournis sont modifiés (cf. pricing/portfolio.py::update_position).
    `clear_sale=True` rouvre une position close, ignore les autres champs de
    vente s'ils sont fournis en même temps (correction d'erreur de saisie,
    pas une revente + réouverture simultanées)."""
    sell_price: float | None = None
    sell_currency: str | None = None
    sell_date: date | None = None
    note: str | None = None
    clear_sale: bool = False


class PortfolioUpdateResponse(BaseModel):
    position: PortfolioPositionOut


class PortfolioDeleteResponse(BaseModel):
    status: str  # 'removed' | 'not_found'
