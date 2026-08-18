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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pricing.matching import identify_card
from pricing.models import Card
from pricing_api.schemas import CardCandidateOut, SourcePriceOut, VerdictRequest, VerdictResponse
from shared.verdict import compute_verdict_for_card

app = FastAPI(title="tcg-index pricing API")

_cors_origins = [o.strip() for o in os.environ.get("PRICING_API_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["POST"], allow_headers=["*"])


def _card_out(card: Card, confidence: float) -> CardCandidateOut:
    return CardCandidateOut(card_id=card.id, name=card.name, code=card.code,
                             set_code=card.set_code, rarity=card.rarity, confidence=confidence)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/verdict", response_model=VerdictResponse)
def post_verdict(req: VerdictRequest) -> VerdictResponse:
    match = identify_card(text=req.text, image_url=req.image_url)

    if match.status != "matched":
        return VerdictResponse(
            status=match.status,
            candidates=[_card_out(c, 0.0) for c in match.candidates],
            displayed_price=req.displayed_price, grade=req.grade, message=match.message,
        )

    outcome = compute_verdict_for_card(req.displayed_price, match.card.id, req.grade)
    return VerdictResponse(
        status=outcome.status,
        card=_card_out(outcome.card, match.confidence) if outcome.card else None,
        verdict=outcome.verdict.label if outcome.verdict else None,
        reference_price=outcome.verdict.reference_price if outcome.verdict else None,
        displayed_price=req.displayed_price, grade=req.grade,
        sources_compared=[
            SourcePriceOut(source=q.source, grade=q.grade, price=q.price, currency=q.currency)
            for q in outcome.sources_compared
        ],
    )
