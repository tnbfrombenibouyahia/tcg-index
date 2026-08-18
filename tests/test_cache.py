"""Tests de la logique de cache TTL (pricing/cache.py). DB entièrement
monkeypatchée -- pas de connexion réelle nécessaire.
"""
from datetime import datetime, timedelta, timezone

from pricing import cache
from pricing.models import Card, PriceQuote
from pricing.sources.base import PriceSource


def _card():
    return Card(id=1, name="Izo", code="ST22-002", set_code="one-piece-starter-deck-22-ace-newgate",
                tcg="one-piece", category="single", language="EN", rarity="Super Rare")


class _StubSource(PriceSource):
    name = "stub"

    def __init__(self, result=None, exc=None):
        self.result = result
        self.exc = exc
        self.calls = 0

    def fetch_price(self, card, grade):
        self.calls += 1
        if self.exc is not None:
            raise self.exc
        return self.result


class TestIsFresh:
    def test_fresh_within_ttl(self):
        now = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
        fetched_at = now - timedelta(hours=1)
        assert cache.is_fresh(fetched_at, 12, now=now) is True

    def test_stale_beyond_ttl(self):
        now = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
        fetched_at = now - timedelta(hours=13)
        assert cache.is_fresh(fetched_at, 12, now=now) is False

    def test_exact_ttl_boundary_is_stale(self):
        now = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
        fetched_at = now - timedelta(hours=12)
        assert cache.is_fresh(fetched_at, 12, now=now) is False


class TestGetPriceWithCache:
    def test_fresh_cache_short_circuits_source(self, monkeypatch):
        cached = PriceQuote(source="stub", grade="ungraded", price=10.0, currency="USD")
        monkeypatch.setattr(cache, "get_cached_price", lambda *a, **k: cached)
        source = _StubSource(result=PriceQuote(source="stub", grade="ungraded", price=999, currency="USD"))

        result = cache.get_price_with_cache(_card(), "ungraded", source)

        assert result is cached
        assert source.calls == 0

    def test_cold_cache_success_upserts_and_returns_fresh_price(self, monkeypatch):
        monkeypatch.setattr(cache, "get_cached_price", lambda *a, **k: None)
        upserted = {}
        monkeypatch.setattr(cache, "upsert_price", lambda item_id, quote: upserted.update(item_id=item_id, quote=quote))
        fresh = PriceQuote(source="stub", grade="ungraded", price=42.0, currency="USD")
        source = _StubSource(result=fresh)

        result = cache.get_price_with_cache(_card(), "ungraded", source)

        assert result is fresh
        assert source.calls == 1
        assert upserted == {"item_id": 1, "quote": fresh}

    def test_not_implemented_source_falls_back_to_stale_price(self, monkeypatch):
        monkeypatch.setattr(cache, "get_cached_price", lambda *a, **k: None)
        stale = PriceQuote(source="stub", grade="ungraded", price=5.0, currency="USD")
        monkeypatch.setattr(cache, "get_stale_price", lambda *a, **k: stale)
        source = _StubSource(exc=NotImplementedError("pas encore branchée"))

        result = cache.get_price_with_cache(_card(), "ungraded", source)

        assert result is stale

    def test_source_failure_without_stale_price_returns_none(self, monkeypatch):
        monkeypatch.setattr(cache, "get_cached_price", lambda *a, **k: None)
        monkeypatch.setattr(cache, "get_stale_price", lambda *a, **k: None)
        source = _StubSource(result=None)

        result = cache.get_price_with_cache(_card(), "ungraded", source)

        assert result is None

    def test_network_exception_is_isolated_not_propagated(self, monkeypatch):
        monkeypatch.setattr(cache, "get_cached_price", lambda *a, **k: None)
        monkeypatch.setattr(cache, "get_stale_price", lambda *a, **k: None)
        source = _StubSource(exc=ConnectionError("timeout"))

        result = cache.get_price_with_cache(_card(), "ungraded", source)  # ne doit pas lever

        assert result is None
