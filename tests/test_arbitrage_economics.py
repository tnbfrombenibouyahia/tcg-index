"""Tests de arbitrage/economics.py (signal pur) et de arbitrage/store.py::should_alert."""
import os

import pytest

from arbitrage.economics import (
    Thresholds, evaluate, is_alert_worthy, psa_service_tier, select_slice,
)
from arbitrage.store import should_alert


class TestPsaServiceTier:
    @pytest.mark.parametrize("value,tier,fee", [
        (100, "Value", 30.0),
        (499, "Value", 30.0),        # plafond inclusif
        (500, "Value Plus", 50.0),
        (2000, "Express", 150.0),
        (24999, "Walk-Through", 599.0),
        (50000, "Walk-Through", 599.0),   # hors barème : dernier palier
    ])
    def test_tier_covers_declared_value(self, value, tier, fee):
        assert psa_service_tier(value) == (tier, fee)


class TestEvaluate:
    def test_user_example_gcc10_at_200_psa9_210_psa10_2000(self):
        # L'exemple de la demande : slab à 200, PSA 9 à 210, PSA 10 à 2000.
        opp = evaluate(buy_total_usd=200.0, psa9_usd=210.0, psa10_usd=2000.0)
        assert opp.fee_tier == "Express" and opp.fee_usd == 150.0   # valeur déclarée 2000 -> Express
        assert opp.total_cost_usd == pytest.approx(370.0)           # 200 + 150 + 20
        assert opp.multiple == pytest.approx(10.0)
        assert opp.breakeven_p10 == pytest.approx((370 - 210) / (2000 - 210))   # ~8,9 %
        assert opp.floor_covered is False

    def test_floor_covered_when_psa9_repays_everything(self):
        opp = evaluate(buy_total_usd=100.0, psa9_usd=210.0, psa10_usd=400.0)   # frais Value = 30
        assert opp.total_cost_usd == pytest.approx(150.0)
        assert opp.floor_covered is True
        assert opp.breakeven_p10 == 0.0

    def test_breakeven_clamped_to_one_when_never_profitable(self):
        opp = evaluate(buy_total_usd=5000.0, psa9_usd=210.0, psa10_usd=2000.0)
        assert opp.breakeven_p10 == 1.0

    @pytest.mark.parametrize("kwargs", [
        dict(buy_total_usd=0.0, psa9_usd=210.0, psa10_usd=2000.0),
        dict(buy_total_usd=200.0, psa9_usd=0.0, psa10_usd=2000.0),
        dict(buy_total_usd=200.0, psa9_usd=210.0, psa10_usd=210.0),   # aucun upside
        dict(buy_total_usd=200.0, psa9_usd=210.0, psa10_usd=150.0),
    ])
    def test_returns_none_for_meaningless_inputs(self, kwargs):
        assert evaluate(**kwargs) is None


class TestIsAlertWorthy:
    def test_user_example_is_worthy(self):
        opp = evaluate(buy_total_usd=200.0, psa9_usd=210.0, psa10_usd=2000.0)
        assert is_alert_worthy(opp, Thresholds()) is True

    def test_rejects_small_multiple(self):
        # Équilibre correct (~12 %) mais PSA 10 seulement x1,5 le prix d'achat : peu d'upside.
        opp = evaluate(buy_total_usd=1300.0, psa9_usd=1400.0, psa10_usd=2000.0)
        assert opp.breakeven_p10 <= 0.25 and opp.multiple < 2.0
        assert is_alert_worthy(opp, Thresholds()) is False

    def test_accepts_borderline_real_case_cgc10_144eur(self):
        # Cas réel eBay.fr du 2026-09-28 : Zoro-Juurou OP05-067, CGC 10 à ~144 EUR
        # (~158 USD), PSA 9 = 172 $, PSA 10 = 492 $ -> équilibre ~11 %, multiple ~x3.
        opp = evaluate(buy_total_usd=158.0, psa9_usd=172.0, psa10_usd=492.0)
        assert 0.10 < opp.breakeven_p10 < 0.15
        assert is_alert_worthy(opp, Thresholds()) is True

    def test_rejects_high_breakeven(self):
        # Multiple correct (x4) mais PSA 9 très bas : il faudrait ~30 % de PSA 10 pour rentrer dans ses frais.
        opp = evaluate(buy_total_usd=500.0, psa9_usd=100.0, psa10_usd=2000.0)
        assert opp.multiple >= 3.0
        assert opp.breakeven_p10 > 0.25
        assert is_alert_worthy(opp, Thresholds()) is False

    def test_rejects_suspiciously_cheap_listing(self):
        # 10 $ pour une carte dont le PSA 9 vaut 210 : presque sûrement une autre carte / contrefaçon.
        opp = evaluate(buy_total_usd=10.0, psa9_usd=210.0, psa10_usd=2000.0)
        assert is_alert_worthy(opp, Thresholds()) is False


class TestThresholdsFromEnv:
    def test_defaults_without_env(self, monkeypatch):
        for name in [k for k in os.environ if k.startswith("ARBITRAGE_")]:
            monkeypatch.delenv(name)
        assert Thresholds.from_env() == Thresholds()

    def test_env_overrides(self, monkeypatch):
        monkeypatch.setenv("ARBITRAGE_ALLOWED_GRADES", "10")
        monkeypatch.setenv("ARBITRAGE_MIN_MULTIPLE", "5")
        monkeypatch.setenv("ARBITRAGE_MAX_PSA_AGE_DAYS", "30")
        t = Thresholds.from_env()
        assert t.allowed_grades == (10.0,)
        assert t.min_multiple == 5.0
        assert t.max_psa_age_days == 30

    def test_grades_list_is_comma_separated_with_dot_decimals(self, monkeypatch):
        monkeypatch.setenv("ARBITRAGE_ALLOWED_GRADES", "9.5, 10")
        assert Thresholds.from_env().allowed_grades == (9.5, 10.0)


class TestSelectSlice:
    def test_whole_pool_when_it_fits_the_budget(self):
        assert select_slice([1, 2, 3], 5, now_epoch=0) == [1, 2, 3]

    def test_no_budget_means_whole_pool(self):
        assert select_slice([1, 2, 3], None, now_epoch=0) == [1, 2, 3]

    def test_rotates_through_consecutive_slices(self):
        pool = list(range(10))
        assert select_slice(pool, 4, now_epoch=0) == [0, 1, 2, 3]
        assert select_slice(pool, 4, now_epoch=3600) == [4, 5, 6, 7]
        assert select_slice(pool, 4, now_epoch=7200) == [8, 9]
        assert select_slice(pool, 4, now_epoch=10800) == [0, 1, 2, 3]   # boucle

    def test_same_hour_gives_same_slice(self):
        pool = list(range(10))
        assert select_slice(pool, 4, now_epoch=3601) == select_slice(pool, 4, now_epoch=7199)


class TestShouldAlert:
    def test_first_time_always_alerts(self):
        assert should_alert(None, 200.0) is True

    def test_same_price_does_not_realert(self):
        assert should_alert(200.0, 200.0) is False

    def test_small_drop_does_not_realert(self):
        assert should_alert(100.0, 96.0) is False

    def test_drop_of_five_percent_or_more_realerts(self):
        assert should_alert(100.0, 94.0) is True

    def test_price_increase_does_not_realert(self):
        assert should_alert(100.0, 130.0) is False
