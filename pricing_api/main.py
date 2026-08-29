"""Micro-service FastAPI indépendant de web/ (Next.js) -- appelé directement
par l'extension navigateur. Accès DB lecture-écriture identique à
l'ingestion (mêmes credentials DATABASE_URL) : contrairement à web/, ce
service doit pouvoir écrire le cache de prix (table `prices`), ce que
l'utilisateur DB dédié au web (lecture seule par conception) ne permet pas.

Lancement local : uvicorn pricing_api.main:app --reload --port 8001
"""
import os

from dotenv import load_dotenv

load_dotenv()  # avant tout import qui lit os.environ à l'import (shared.db),
                # même ordre que db/apply_schema.py.

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pricing.auth import verify_id_token
from pricing.favorites import (
    FREE_FAVORITES_LIMIT,
    add_favorite,
    count_favorites,
    fetch_favorites,
    is_favorited,
    is_premium,
    remove_favorite,
)
from pricing.matching import identify_card
from pricing.models import Card
from pricing.repository import fetch_card_by_id, fetch_set_release_year, set_label_from_code
from pricing_api.schemas import (
    CardCandidateOut,
    FavoriteAddRequest,
    FavoriteAddResponse,
    FavoriteOut,
    FavoriteRemoveResponse,
    FavoriteStatusResponse,
    FavoritesListResponse,
    GradingRoiInputsOut,
    LanguageComparisonOut,
    LiquidityOut,
    SalesStatsOut,
    SealedDisplayPriceOut,
    SourcePriceOut,
    VerdictRequest,
    VerdictResponse,
)
from shared.verdict import ExtendedSignals, compute_extended_signals, compute_verdict_for_card

app = FastAPI(title="tcg-index pricing API")

_cors_origins = [o.strip() for o in os.environ.get("PRICING_API_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    # allow_methods=["POST"] seul suffit à /verdict, seul appelant navigateur
    # direct pour l'instant (extension : host_permissions bypass CORS
    # entièrement, cf. extension/manifest.json -- cette liste ne le concerne
    # pas). Le jour où web/ (site) appelle /favorites directement depuis le
    # navigateur (§10 handoff -- écran Watchlist pas encore construit), GET
    # et DELETE devront être ajoutés ici, sinon le préflight CORS échoue
    # silencieusement pour ces deux méthodes.
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["POST"], allow_headers=["*"])


def _card_out(card: Card, confidence: float) -> CardCandidateOut:
    return CardCandidateOut(card_id=card.id, name=card.name, code=card.code, set_code=card.set_code,
                             rarity=card.rarity, language=card.language, confidence=confidence,
                             image_url=card.image_url,
                             set_name=set_label_from_code(card.set_code, card.tcg),
                             set_release_year=fetch_set_release_year(card.tcg, card.set_code))


def _favorite_out(card: Card) -> FavoriteOut:
    return FavoriteOut(card_id=card.id, name=card.name, code=card.code, set_code=card.set_code,
                        rarity=card.rarity, language=card.language, image_url=card.image_url,
                        set_name=set_label_from_code(card.set_code, card.tcg),
                        set_release_year=fetch_set_release_year(card.tcg, card.set_code))


def _extended_out(signals: ExtendedSignals) -> dict:
    """Aplatit ExtendedSignals vers les champs top-level de VerdictResponse
    (cf. pricing_api/schemas.py) -- séparé de _card_out pour rester lisible,
    un champ dataclass -> un champ Pydantic à la fois."""
    sales_stats = SalesStatsOut(
        median_recent=signals.sales_stats.median_recent, avg_last_10=signals.sales_stats.avg_last_10,
        sample_size_recent=signals.sales_stats.sample_size_recent, sample_size_10=signals.sales_stats.sample_size_10,
        currency=signals.sales_stats.currency,
    ) if signals.sales_stats else None
    liquidity = LiquidityOut(
        sales_last_90d=signals.liquidity.sales_last_90d, active_listings=signals.liquidity.active_listings,
        sales_per_month=signals.liquidity.sales_per_month, label=signals.liquidity.label,
    ) if signals.liquidity else None
    sealed_display_price = SealedDisplayPriceOut(
        price=signals.sealed_display_price.price, currency=signals.sealed_display_price.currency,
    ) if signals.sealed_display_price else None
    grading_roi_inputs = GradingRoiInputsOut(
        ungraded_price=signals.grading_roi_inputs.ungraded_price,
        grade_prices=signals.grading_roi_inputs.grade_prices,
        grade_counts=signals.grading_roi_inputs.grade_counts,
    ) if signals.grading_roi_inputs else None
    return dict(
        opportunity_score=signals.opportunity_score,
        sales_stats=sales_stats,
        liquidity=liquidity,
        language_comparison=[
            LanguageComparisonOut(language=e.language, card_id=e.card_id, price=e.price,
                                   currency=e.currency, is_current_listing=e.is_current_listing, url=e.url)
            for e in signals.language_comparison
        ],
        sealed_display_price=sealed_display_price,
        grading_roi_inputs=grading_roi_inputs,
    )


def require_user(authorization: str | None = Header(default=None)) -> dict:
    """"Compte requis avant toute utilisation" (§01/§09) appliqué ici, pas
    seulement côté extension (cf. extension/README.md -- avant ce commit,
    la gate n'existait que côté client). `authorization` : en-tête
    `Authorization: Bearer <id_token Firebase>` posé par
    extension/background.js. 401 si absent ou invalide/expiré -- jamais
    d'exception non gérée, un jeton qui échoue la vérification est un cas
    attendu (session expirée), pas une panne serveur."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentification requise (en-tête Authorization manquant).")
    user = verify_id_token(authorization.split(" ", 1)[1])
    if user is None:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée.")
    return user


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/favorites", response_model=FavoritesListResponse)
def get_favorites(user: dict = Depends(require_user)) -> FavoritesListResponse:
    premium = is_premium(user["uid"])
    return FavoritesListResponse(
        favorites=[_favorite_out(c) for c in fetch_favorites(user["uid"])],
        limit=-1 if premium else FREE_FAVORITES_LIMIT,
        is_premium=premium,
    )


@app.get("/favorites/{item_id}", response_model=FavoriteStatusResponse)
def get_favorite_status(item_id: int, user: dict = Depends(require_user)) -> FavoriteStatusResponse:
    """Statut d'UNE carte -- appelé par le panneau extension juste après
    identification (cf. content.js::refreshFavoriteStatus), pour afficher le
    bouton "surveiller" dans le bon état sans recharger la liste entière."""
    uid = user["uid"]
    premium = is_premium(uid)
    return FavoriteStatusResponse(
        is_favorited=is_favorited(uid, item_id),
        count=count_favorites(uid),
        limit=-1 if premium else FREE_FAVORITES_LIMIT,
        is_premium=premium,
    )


@app.post("/favorites", response_model=FavoriteAddResponse)
def post_favorite(req: FavoriteAddRequest, user: dict = Depends(require_user)) -> FavoriteAddResponse:
    uid = user["uid"]
    # Le plafond gratuit (§10 handoff, pas encore de vrai palier payant) ne
    # s'applique qu'à un VRAI ajout -- reclique sur un favori déjà présent
    # (retry réseau, double clic dans le panneau) reste un no-op, jamais
    # bloqué même à la limite atteinte.
    if not is_favorited(uid, req.item_id) and not is_premium(uid) and count_favorites(uid) >= FREE_FAVORITES_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=f"Limite de {FREE_FAVORITES_LIMIT} favoris atteinte pour le compte gratuit.",
        )

    result = add_favorite(uid, req.item_id)
    if result == "item_not_found":
        raise HTTPException(status_code=404, detail="Carte introuvable.")

    card = fetch_card_by_id(req.item_id)
    return FavoriteAddResponse(status=result, favorite=_favorite_out(card))


@app.delete("/favorites/{item_id}", response_model=FavoriteRemoveResponse)
def delete_favorite(item_id: int, user: dict = Depends(require_user)) -> FavoriteRemoveResponse:
    removed = remove_favorite(user["uid"], item_id)
    return FavoriteRemoveResponse(status="removed" if removed else "not_favorited")


@app.post("/verdict", response_model=VerdictResponse)
def post_verdict(req: VerdictRequest, _user: dict = Depends(require_user)) -> VerdictResponse:
    if req.selected_card_id is not None:
        # Picker de désambiguïsation (panneau extension) : l'utilisateur a
        # cliqué un candidat sur un verdict 'ambiguous' précédent --
        # identité confirmée par un humain, identify_card() court-circuité
        # entièrement (jamais re-deviner ce qui vient d'être choisi).
        # confidence=1.0, pas 0.0 : contrairement à un candidat non
        # sélectionné, celui-ci n'est plus une hypothèse.
        card_id, confidence = req.selected_card_id, 1.0
    else:
        match = identify_card(text=req.text, image_url=req.image_url)
        if match.status != "matched":
            return VerdictResponse(
                status=match.status,
                candidates=[_card_out(c, 0.0) for c in match.candidates],
                displayed_price=req.displayed_price, grade=req.grade, message=match.message,
            )
        card_id, confidence = match.card.id, match.confidence

    outcome = compute_verdict_for_card(req.displayed_price, card_id, req.grade)

    # Signaux étendus dès que la carte est connue, même sans prix de
    # référence (status='no_reference_price') -- moy. ventes/liquidité/
    # comparaison langue ne dépendent pas de `outcome.verdict`, seul
    # opportunity_score en a besoin et gère lui-même son absence (cf.
    # shared/verdict.py::compute_extended_signals).
    extended = dict(opportunity_score=None, sales_stats=None, liquidity=None,
                    language_comparison=[], sealed_display_price=None, grading_roi_inputs=None)
    if outcome.card is not None:
        # Réutilise l'URL PriceCharting déjà résolue par compute_verdict_for_card
        # (outcome.sources_compared) pour la ligne "cette annonce" de la
        # comparaison par langue -- jamais un 2e scrape pour la même carte.
        reference_url = next((q.url for q in outcome.sources_compared if q.source == "pricecharting" and q.url), None)
        signals = compute_extended_signals(
            outcome.card, req.grade,
            displayed_price=req.displayed_price,
            reference_price=outcome.verdict.reference_price if outcome.verdict else None,
            reference_url=reference_url,
            confidence=confidence,
        )
        extended = _extended_out(signals)

    return VerdictResponse(
        status=outcome.status,
        card=_card_out(outcome.card, confidence) if outcome.card else None,
        verdict=outcome.verdict.label if outcome.verdict else None,
        reference_price=outcome.verdict.reference_price if outcome.verdict else None,
        displayed_price=req.displayed_price, grade=req.grade,
        sources_compared=[
            SourcePriceOut(source=q.source, grade=q.grade, price=q.price, currency=q.currency, url=q.url)
            for q in outcome.sources_compared
        ],
        **extended,
    )
