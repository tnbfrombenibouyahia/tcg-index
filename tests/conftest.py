"""Fabriques partagées par les tests arbitrage (tests/test_arbitrage_*.py)."""
import datetime as dt

import pytest

from arbitrage.economics import evaluate
from arbitrage.models import Alert, Candidate


@pytest.fixture
def make_candidate():
    def _make(**over):
        base = dict(
            item_id=1, name="Charizard", code="4/102", set_code="base-set", tcg="pokemon", language="EN",
            rarity="Holo Rare", image_url="https://img.example/ref.png",
            psa9_usd=210.0, psa9_date=dt.date(2026, 9, 20), psa10_usd=2000.0, psa10_date=dt.date(2026, 9, 20),
        )
        base.update(over)
        return Candidate(**base)
    return _make


@pytest.fixture
def make_alert(make_candidate):
    def _make(*, price=200.0, shipping=5.0, currency="USD", rate=1.0, **over):
        candidate = over.pop("candidate", None) or make_candidate()
        opp = evaluate(
            buy_total_usd=(price + (shipping or 0.0)) * rate,
            psa9_usd=candidate.psa9_usd, psa10_usd=candidate.psa10_usd,
        )
        base = dict(
            candidate=candidate, marketplace="ebay_fr", listing_id="v1|123|0",
            title="Charizard 4/102 BGS 9.5", url="https://www.ebay.fr/itm/123",
            image_url="https://i.ebayimg.com/x.jpg", grader="bgs", grade=9.5,
            price=price, shipping=shipping, currency=currency, usd_per_unit=rate,
            seller="shop", seller_feedback_pct=99.5, opportunity=opp, item_country="FR",
        )
        base.update(over)
        return Alert(**base)
    return _make
