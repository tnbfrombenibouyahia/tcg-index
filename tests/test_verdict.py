"""Tests de shared/verdict.py : classification pure (median_reference_price,
classify) et orchestration (compute_verdict_for_card, DB/sources monkeypatchées).
"""
from pricing.models import Card
from shared import verdict


def _card():
    return Card(id=1, name="Izo", code="ST22-002", set_code="one-piece-starter-deck-22-ace-newgate",
                tcg="one-piece", category="single", language="EN", rarity="Super Rare")


class TestMedianReferencePrice:
    def test_empty_list_returns_none(self):
        assert verdict.median_reference_price([]) is None

    def test_median_of_odd_count(self):
        assert verdict.median_reference_price([8.0, 10.0, 12.0]) == 10.0


class TestClassify:
    def test_below_green_max_is_green(self):
        result = verdict.classify(8.0, 10.0, "ungraded")
        assert result.label == "green"
        assert result.ratio == 0.8

    def test_exactly_at_green_max_is_yellow(self):
        # ratio 0.85 pile -- borne verte exclusive (spec : "< 85%").
        result = verdict.classify(8.5, 10.0, "ungraded")
        assert result.label == "yellow"

    def test_exactly_at_yellow_max_is_yellow(self):
        # ratio 1.15 pile -- borne jaune inclusive (spec : "85-115%").
        result = verdict.classify(11.5, 10.0, "ungraded")
        assert result.label == "yellow"

    def test_above_yellow_max_is_red(self):
        result = verdict.classify(11.51, 10.0, "ungraded")
        assert result.label == "red"

    def test_env_thresholds_used_when_not_overridden_explicitly(self, monkeypatch):
        monkeypatch.setenv("VERDICT_GREEN_MAX_RATIO", "0.9")
        result = verdict.classify(8.9, 10.0, "ungraded")  # ratio 0.89, sous le seuil custom
        assert result.label == "green"

    def test_explicit_args_override_env(self, monkeypatch):
        monkeypatch.setenv("VERDICT_GREEN_MAX_RATIO", "0.5")
        result = verdict.classify(8.0, 10.0, "ungraded", green_max_ratio=0.85)
        assert result.label == "green"


class TestComputeVerdictForCard:
    def test_card_not_found(self, monkeypatch):
        monkeypatch.setattr(verdict, "fetch_card_by_id", lambda item_id: None)
        outcome = verdict.compute_verdict_for_card(10.0, 999, "ungraded")
        assert outcome.status == "card_not_found"

    def test_no_reference_price_when_no_source_responds(self, monkeypatch):
        card = _card()
        monkeypatch.setattr(verdict, "fetch_card_by_id", lambda item_id: card)
        monkeypatch.setattr(verdict, "get_price_with_cache", lambda *a, **k: None)

        outcome = verdict.compute_verdict_for_card(10.0, 1, "ungraded", sources=[object()])

        assert outcome.status == "no_reference_price"
        assert outcome.card is card
        assert outcome.sources_compared == []

    def test_ok_status_computes_verdict_from_sources(self, monkeypatch):
        from pricing.models import PriceQuote

        card = _card()
        monkeypatch.setattr(verdict, "fetch_card_by_id", lambda item_id: card)
        quote = PriceQuote(source="pricecharting", grade="ungraded", price=10.0, currency="USD")
        monkeypatch.setattr(verdict, "get_price_with_cache", lambda *a, **k: quote)

        outcome = verdict.compute_verdict_for_card(8.0, 1, "ungraded", sources=[object()])

        assert outcome.status == "ok"
        assert outcome.verdict.label == "green"
        assert outcome.sources_compared == [quote]

    def test_grade_is_never_swapped_for_another(self, monkeypatch):
        card = _card()
        monkeypatch.setattr(verdict, "fetch_card_by_id", lambda item_id: card)
        seen_grades = []

        def fake_get_price_with_cache(card, grade, source, **kwargs):
            seen_grades.append(grade)
            return None

        monkeypatch.setattr(verdict, "get_price_with_cache", fake_get_price_with_cache)

        verdict.compute_verdict_for_card(10.0, 1, "psa10", sources=[object(), object()])

        assert seen_grades == ["psa10", "psa10"]
