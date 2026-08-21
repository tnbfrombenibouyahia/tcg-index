"""Tests du câblage FastAPI (pricing_api/main.py). identify_card,
compute_verdict_for_card et verify_id_token sont monkeypatchés -- pas de
DB/HTTP réels.
"""
from fastapi.testclient import TestClient

from pricing.models import Card, MatchResult
from pricing_api.main import app
from shared.verdict import ExtendedSignals, Verdict, VerdictOutcome

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer fake-id-token"}


def _card():
    return Card(id=1, name="Izo", code="ST22-002", set_code="one-piece-starter-deck-22-ace-newgate",
                tcg="one-piece", category="single", language="EN", rarity="Super Rare")


class TestRequireUser:
    """"Compte requis avant toute utilisation" (§01/§09) appliqué côté
    serveur -- pas seulement un mur d'UX côté extension."""

    def test_missing_authorization_header_is_rejected(self):
        resp = client.post("/verdict", json={"text": "Izo", "displayed_price": 8.0})
        assert resp.status_code == 401

    def test_non_bearer_authorization_is_rejected(self):
        resp = client.post("/verdict", json={"text": "Izo", "displayed_price": 8.0},
                            headers={"Authorization": "Basic abc123"})
        assert resp.status_code == 401

    def test_invalid_token_is_rejected(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: None)
        resp = client.post("/verdict", json={"text": "Izo", "displayed_price": 8.0}, headers=AUTH_HEADERS)
        assert resp.status_code == 401


class TestPostVerdict:
    def test_matched_card_returns_verdict(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})
        card = _card()
        monkeypatch.setattr(
            "pricing_api.main.identify_card",
            lambda text=None, image_url=None: MatchResult(status="matched", card=card, confidence=1.0, strategy="code"),
        )
        outcome = VerdictOutcome(
            status="ok", card=card,
            verdict=Verdict(label="green", ratio=0.8, reference_price=10.0, displayed_price=8.0, grade="ungraded"),
            sources_compared=[],
        )
        monkeypatch.setattr("pricing_api.main.compute_verdict_for_card", lambda *a, **k: outcome)
        monkeypatch.setattr("pricing_api.main.compute_extended_signals", lambda *a, **k: ExtendedSignals(opportunity_score=72))

        resp = client.post("/verdict", json={"text": "IZO ST22-002 SR", "displayed_price": 8.0, "grade": "ungraded"},
                            headers=AUTH_HEADERS)

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["verdict"] == "green"
        assert body["card"]["card_id"] == 1
        assert body["reference_price"] == 10.0
        assert body["opportunity_score"] == 72

    def test_ambiguous_match_returns_candidates_without_verdict(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})
        candidates = [_card()]
        monkeypatch.setattr(
            "pricing_api.main.identify_card",
            lambda text=None, image_url=None: MatchResult(status="ambiguous", candidates=candidates),
        )

        resp = client.post("/verdict", json={"text": "Izo", "displayed_price": 8.0}, headers=AUTH_HEADERS)

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ambiguous"
        assert len(body["candidates"]) == 1
        assert body["verdict"] is None

    def test_image_url_only_returns_not_found_stub_message(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})
        monkeypatch.setattr(
            "pricing_api.main.identify_card",
            lambda text=None, image_url=None: MatchResult(status="not_found", message="stub non implémenté"),
        )

        resp = client.post("/verdict", json={"image_url": "https://example.com/listing.jpg", "displayed_price": 8.0},
                            headers=AUTH_HEADERS)

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "not_found"
        assert body["message"] == "stub non implémenté"

    def test_invalid_grade_is_rejected(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})
        resp = client.post("/verdict", json={"text": "Izo", "displayed_price": 8.0, "grade": "psa11"},
                            headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_missing_displayed_price_is_rejected(self, monkeypatch):
        monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})
        resp = client.post("/verdict", json={"text": "Izo"}, headers=AUTH_HEADERS)
        assert resp.status_code == 422


class TestHealth:
    def test_health_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
