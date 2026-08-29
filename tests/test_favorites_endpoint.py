"""Tests du câblage FastAPI pour la watchlist (pricing_api/main.py::/favorites).
Même discipline que test_verdict_endpoint.py : add_favorite/fetch_favorites/
etc. monkeypatchés -- pas de DB/HTTP réels.
"""
from fastapi.testclient import TestClient

from pricing.favorites import FREE_FAVORITES_LIMIT
from pricing.models import Card
from pricing_api.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer fake-id-token"}


def _card(card_id=1):
    return Card(id=card_id, name="Izo", code="ST22-002", set_code="one-piece-starter-deck-22-ace-newgate",
                tcg="one-piece", category="single", language="EN", rarity="Super Rare")


def _auth(monkeypatch):
    monkeypatch.setattr("pricing_api.main.verify_id_token", lambda token: {"uid": "u1", "email": "u@example.com"})


class TestRequireUserOnFavorites:
    def test_get_favorites_without_auth_is_rejected(self):
        resp = client.get("/favorites")
        assert resp.status_code == 401

    def test_post_favorite_without_auth_is_rejected(self):
        resp = client.post("/favorites", json={"item_id": 1})
        assert resp.status_code == 401

    def test_delete_favorite_without_auth_is_rejected(self):
        resp = client.delete("/favorites/1")
        assert resp.status_code == 401


class TestGetFavorites:
    def test_lists_favorites_with_free_limit(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.fetch_favorites", lambda uid: [_card()])
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: False)
        monkeypatch.setattr("pricing_api.main.fetch_set_release_year", lambda tcg, set_code: 2022)
        monkeypatch.setattr("pricing_api.main.set_label_from_code", lambda set_code, tcg: "Starter Deck 22")

        resp = client.get("/favorites", headers=AUTH_HEADERS)

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["favorites"]) == 1
        assert body["favorites"][0]["card_id"] == 1
        assert body["limit"] == FREE_FAVORITES_LIMIT
        assert body["is_premium"] is False

    def test_premium_account_reports_unlimited(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.fetch_favorites", lambda uid: [])
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: True)

        resp = client.get("/favorites", headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["limit"] == -1
        assert resp.json()["is_premium"] is True


class TestPostFavorite:
    def test_adds_favorite_under_limit(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.is_favorited", lambda uid, item_id: False)
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: False)
        monkeypatch.setattr("pricing_api.main.count_favorites", lambda uid: 1)
        monkeypatch.setattr("pricing_api.main.add_favorite", lambda uid, item_id: "added")
        monkeypatch.setattr("pricing_api.main.fetch_card_by_id", lambda item_id: _card(item_id))
        monkeypatch.setattr("pricing_api.main.fetch_set_release_year", lambda tcg, set_code: 2022)
        monkeypatch.setattr("pricing_api.main.set_label_from_code", lambda set_code, tcg: "Starter Deck 22")

        resp = client.post("/favorites", json={"item_id": 42}, headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["status"] == "added"
        assert resp.json()["favorite"]["card_id"] == 42

    def test_rejects_new_favorite_at_free_limit(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.is_favorited", lambda uid, item_id: False)
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: False)
        monkeypatch.setattr("pricing_api.main.count_favorites", lambda uid: FREE_FAVORITES_LIMIT)

        resp = client.post("/favorites", json={"item_id": 42}, headers=AUTH_HEADERS)

        assert resp.status_code == 402

    def test_premium_bypasses_free_limit(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.is_favorited", lambda uid, item_id: False)
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: True)
        monkeypatch.setattr("pricing_api.main.count_favorites", lambda uid: FREE_FAVORITES_LIMIT + 5)
        monkeypatch.setattr("pricing_api.main.add_favorite", lambda uid, item_id: "added")
        monkeypatch.setattr("pricing_api.main.fetch_card_by_id", lambda item_id: _card(item_id))
        monkeypatch.setattr("pricing_api.main.fetch_set_release_year", lambda tcg, set_code: None)
        monkeypatch.setattr("pricing_api.main.set_label_from_code", lambda set_code, tcg: None)

        resp = client.post("/favorites", json={"item_id": 42}, headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["status"] == "added"

    def test_re_adding_already_favorited_item_bypasses_limit(self, monkeypatch):
        """Reclique sur un favori déjà présent (retry réseau, double clic) --
        no-op, jamais bloqué même à la limite atteinte (cf. main.py::post_favorite)."""
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.is_favorited", lambda uid, item_id: True)
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: False)
        monkeypatch.setattr("pricing_api.main.count_favorites", lambda uid: FREE_FAVORITES_LIMIT)
        monkeypatch.setattr("pricing_api.main.add_favorite", lambda uid, item_id: "already_favorited")
        monkeypatch.setattr("pricing_api.main.fetch_card_by_id", lambda item_id: _card(item_id))
        monkeypatch.setattr("pricing_api.main.fetch_set_release_year", lambda tcg, set_code: None)
        monkeypatch.setattr("pricing_api.main.set_label_from_code", lambda set_code, tcg: None)

        resp = client.post("/favorites", json={"item_id": 42}, headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["status"] == "already_favorited"

    def test_unknown_item_returns_404(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.is_favorited", lambda uid, item_id: False)
        monkeypatch.setattr("pricing_api.main.is_premium", lambda uid: False)
        monkeypatch.setattr("pricing_api.main.count_favorites", lambda uid: 0)
        monkeypatch.setattr("pricing_api.main.add_favorite", lambda uid, item_id: "item_not_found")

        resp = client.post("/favorites", json={"item_id": 999}, headers=AUTH_HEADERS)

        assert resp.status_code == 404


class TestDeleteFavorite:
    def test_removes_existing_favorite(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.remove_favorite", lambda uid, item_id: True)

        resp = client.delete("/favorites/42", headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["status"] == "removed"

    def test_removing_absent_favorite_is_not_an_error(self, monkeypatch):
        _auth(monkeypatch)
        monkeypatch.setattr("pricing_api.main.remove_favorite", lambda uid, item_id: False)

        resp = client.delete("/favorites/42", headers=AUTH_HEADERS)

        assert resp.status_code == 200
        assert resp.json()["status"] == "not_favorited"
