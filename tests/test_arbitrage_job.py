"""Tests de arbitrage/job.py : orchestration, tout le réseau/la DB monkeypatchés."""
import os

import pytest

from arbitrage import job


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    monkeypatch.setattr(job.time, "sleep", lambda s: None)
    for name in [k for k in os.environ if k.startswith("ARBITRAGE_")]:
        monkeypatch.delenv(name)
    monkeypatch.setenv("DISCORD_ARBITRAGE_WEBHOOK_URL", "https://discord.example/webhook")


def _wire(monkeypatch, make_candidate, alerts, last_prices=None, posted=None):
    monkeypatch.setattr(job, "fetch_candidates", lambda t: [make_candidate(item_id=1)])
    monkeypatch.setattr(job.ebay_slabs, "search_alerts", lambda c, **kw: list(alerts))
    monkeypatch.setattr(job.store, "fetch_last_prices", lambda mp, ids, **kw: dict(last_prices or {}))
    monkeypatch.setattr(
        job.discord_webhook, "post_alerts",
        lambda url, to_post, on_posted=None: (posted.extend(to_post) if posted is not None else None) or len(to_post),
    )


class TestRun:
    def test_dry_run_posts_nothing(self, monkeypatch, make_candidate, make_alert):
        posted = []
        _wire(monkeypatch, make_candidate, [make_alert()], posted=posted)
        stats = job.run_arbitrage_alerts(dry_run=True)
        assert posted == [] and stats["posted"] == 0 and stats["fresh_alerts"] == 1

    def test_posts_fresh_alerts(self, monkeypatch, make_candidate, make_alert):
        posted = []
        _wire(monkeypatch, make_candidate, [make_alert()], posted=posted)
        stats = job.run_arbitrage_alerts()
        assert len(posted) == 1 and stats["posted"] == 1

    def test_skips_already_alerted_listing_unless_price_dropped(self, monkeypatch, make_candidate, make_alert):
        posted = []
        _wire(monkeypatch, make_candidate, [make_alert(price=200.0)], last_prices={"v1|123|0": 205.0}, posted=posted)
        assert job.run_arbitrage_alerts()["fresh_alerts"] == 0     # baisse de 2,4 % seulement

        _wire(monkeypatch, make_candidate, [make_alert(price=180.0)], last_prices={"v1|123|0": 205.0}, posted=posted)
        assert job.run_arbitrage_alerts()["fresh_alerts"] == 1     # baisse de 12 %

    def test_same_listing_found_twice_is_posted_once_at_lowest_price(self, monkeypatch, make_candidate, make_alert):
        posted = []
        _wire(monkeypatch, make_candidate, [make_alert(price=200.0), make_alert(price=190.0)], posted=posted)
        job.run_arbitrage_alerts()
        assert [a.price for a in posted] == [190.0]

    def test_caps_alerts_per_run_keeping_best_first(self, monkeypatch, make_candidate, make_alert):
        posted = []
        alerts = [make_alert(listing_id=f"id{i}", price=100.0 + 20 * i) for i in range(5)]
        _wire(monkeypatch, make_candidate, alerts, posted=posted)
        monkeypatch.setenv("ARBITRAGE_MAX_ALERTS_PER_RUN", "2")
        stats = job.run_arbitrage_alerts()
        assert stats["fresh_alerts"] == 5 and stats["posted"] == 2
        assert [a.listing_id for a in posted] == ["id0", "id1"]     # les moins chères = seuil de rentabilité le plus bas

    def test_requires_webhook_unless_dry_run(self, monkeypatch, make_candidate, make_alert):
        _wire(monkeypatch, make_candidate, [make_alert()])
        monkeypatch.delenv("DISCORD_ARBITRAGE_WEBHOOK_URL")
        with pytest.raises(RuntimeError, match="DISCORD_ARBITRAGE_WEBHOOK_URL"):
            job.run_arbitrage_alerts()
        assert job.run_arbitrage_alerts(dry_run=True)["fresh_alerts"] == 1

    def test_search_errors_are_counted_not_fatal(self, monkeypatch, make_candidate, make_alert):
        monkeypatch.setattr(job, "fetch_candidates", lambda t: [make_candidate(item_id=1), make_candidate(item_id=2)])
        monkeypatch.setattr(job.store, "fetch_last_prices", lambda *a, **kw: {})

        def flaky(candidate, **kw):
            if candidate.item_id == 1:
                raise RuntimeError("eBay 500")
            return [make_alert()]

        monkeypatch.setattr(job.ebay_slabs, "search_alerts", flaky)
        stats = job.run_arbitrage_alerts(dry_run=True)
        assert stats["searches"] == 1 and len(stats["errors"]) == 1 and stats["fresh_alerts"] == 1

    def test_request_budget_derives_card_count(self, monkeypatch, make_candidate):
        pool = [make_candidate(item_id=i) for i in range(500)]
        seen = []
        monkeypatch.setattr(job, "fetch_candidates", lambda t: pool)
        monkeypatch.setattr(job.ebay_slabs, "search_alerts", lambda c, **kw: seen.append(c.item_id) or [])
        monkeypatch.setattr(job.store, "fetch_last_prices", lambda *a, **kw: {})
        monkeypatch.setenv("ARBITRAGE_MAX_REQUESTS_PER_RUN", "20")
        stats = job.run_arbitrage_alerts(dry_run=True)
        assert stats["cards_processed"] == 20 and len(seen) == 20

    def test_request_budget_is_split_across_marketplaces(self, monkeypatch, make_candidate):
        pool = [make_candidate(item_id=i) for i in range(500)]
        seen = []
        monkeypatch.setattr(job, "fetch_candidates", lambda t: pool)
        monkeypatch.setattr(job.ebay_slabs, "search_alerts", lambda c, **kw: seen.append((c.item_id, kw["marketplace_id"])) or [])
        monkeypatch.setattr(job.store, "fetch_last_prices", lambda *a, **kw: {})
        monkeypatch.setenv("ARBITRAGE_MAX_REQUESTS_PER_RUN", "20")
        monkeypatch.setenv("ARBITRAGE_EBAY_MARKETPLACES", "EBAY_FR, EBAY_US")
        stats = job.run_arbitrage_alerts(dry_run=True)
        assert stats["cards_processed"] == 10 and len(seen) == 20
