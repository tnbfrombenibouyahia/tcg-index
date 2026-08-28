"""Tests des signaux étendus du panneau extension v2 : pure
(pricing/sales_stats.py, pricing/liquidity.py, pricing/opportunity_score.py)
puis orchestration (shared/verdict.py::compute_extended_signals, DB
monkeypatchée -- même style que tests/test_verdict.py).
"""
from datetime import date, timedelta

from pricing.liquidity import compute_liquidity, liquidity_label
from pricing.models import Card, PriceQuote
from pricing.opportunity_score import compute_opportunity_score
from pricing.sales_stats import compute_sales_stats
from shared import verdict

_TODAY = date(2026, 8, 28)


def _sale(price, days_ago, currency="USD"):
    """(price, currency, sale_date) -- même forme que fetch_recent_sales."""
    return (price, currency, _TODAY - timedelta(days=days_ago))


def _card(**overrides):
    defaults = dict(id=1, name="Izo", code="ST22-002", set_code="one-piece-starter-deck-22-ace-newgate",
                     tcg="one-piece", category="single", language="EN", rarity="Super Rare")
    defaults.update(overrides)
    return Card(**defaults)


class TestComputeSalesStats:
    def test_empty_list_returns_none_stats(self):
        stats = compute_sales_stats([])
        assert stats.median_recent is None
        assert stats.avg_last_10 is None
        assert stats.sample_size_recent == 0
        assert stats.currency is None

    def test_median_over_available_sales_dense_in_time(self):
        sales = [_sale(10.0, 0), _sale(12.0, 5), _sale(8.0, 10)]
        stats = compute_sales_stats(sales)
        assert stats.median_recent == 10.0
        assert stats.avg_last_10 == 10.0
        assert stats.sample_size_recent == 3
        assert stats.sample_size_10 == 3

    def test_partial_sample_when_fewer_than_3_sales(self):
        stats = compute_sales_stats([_sale(10.0, 0)])
        assert stats.median_recent == 10.0
        assert stats.sample_size_recent == 1

    def test_never_mixes_currencies(self):
        # La plus récente (1re du tuple, cf. fetch_recent_sales) fixe la
        # devise -- les autres devises sont ignorées, jamais fondues dans
        # le calcul (même principe que shared/verdict.py côté sources).
        sales = [_sale(10.0, 0), _sale(100.0, 3, currency="EUR"), _sale(12.0, 6)]
        stats = compute_sales_stats(sales)
        assert stats.currency == "USD"
        assert stats.sample_size_recent == 2
        assert stats.median_recent == 11.0

    def test_median_neutralizes_single_outlier_among_3(self):
        # Cas réel (2026-08-28) : carte item_id=73783, Roronoa Zoro OP06-118
        # [Alternate Art Manga] -- vente à $30.64 mêlée à des ventes à
        # $1475/$1999.99, toutes dans les 90 derniers jours. Une moyenne
        # arithmétique (ancien avg_last_3) donnait ~$1168.54 (faussé de
        # -33% vs la réalité) ; la médiane sur 3 valeurs ignore entièrement
        # la valeur isolée (contrairement à une médiane sur 4, qui moyenne
        # les 2 valeurs centrales -- cf. test suivant).
        sales = [_sale(1475.0, 0), _sale(30.64, 22), _sale(1999.99, 45)]
        stats = compute_sales_stats(sales)
        assert stats.median_recent == 1475.0  # $30.64 neutralisé, pas moyenné
        assert stats.sample_size_recent == 3

    def test_window_extends_to_5_when_recent_sales_are_temporally_dense(self):
        # 5 ventes toutes dans les 90 jours -- écart 3e->5e bien sous 180j,
        # la fenêtre doit s'étendre jusqu'à 5.
        sales = [_sale(p, d) for p, d in [(10.0, 0), (11.0, 20), (9.0, 40), (12.0, 60), (8.0, 80)]]
        stats = compute_sales_stats(sales)
        assert stats.sample_size_recent == 5
        assert stats.median_recent == 10.0

    def test_window_stays_at_3_when_4th_5th_sale_too_old(self):
        # 3 ventes récentes et denses, puis un grand trou -- les ventes #4/#5
        # sont à >180j de la 3e (l'ancre) : elles ne doivent PAS rejoindre la
        # fenêtre, même si elles existent et sont plus récentes que "rien".
        sales = [
            _sale(100.0, 0), _sale(110.0, 10), _sale(90.0, 20),   # denses -- fenêtre de base
            _sale(20.0, 300), _sale(15.0, 400),                    # vieille tendance de marché, exclues
        ]
        stats = compute_sales_stats(sales)
        assert stats.sample_size_recent == 3
        assert stats.median_recent == 100.0
        # avg_last_10, lui, reste une moyenne simple sur tout ce qui est
        # disponible -- inchangé, sert de repli plus généreux.
        assert stats.sample_size_10 == 5


class TestLiquidity:
    def test_label_thresholds(self):
        assert liquidity_label(3.1) == "liquide"
        assert liquidity_label(3.0) == "modere"  # borne haute inclusive côté modéré
        assert liquidity_label(1.0) == "modere"  # borne basse inclusive côté modéré
        assert liquidity_label(0.9) == "illiquide"

    def test_compute_liquidity_preserves_none_active_listings(self):
        # None = jamais scrapé (singles pas couverts en v1) -- ne doit
        # jamais devenir 0 en traversant compute_liquidity.
        metrics = compute_liquidity(sales_last_90d=14, active_listings=None)
        assert metrics.active_listings is None
        assert metrics.sales_last_90d == 14
        assert round(metrics.sales_per_month, 1) == 4.7
        assert metrics.label == "liquide"


class TestOpportunityScore:
    def test_fair_price_full_confidence_no_liquidity_is_near_50_scaled_by_weights(self):
        # ratio=1 (prix pile au marché) -> composante prix = 50 ; liquidité
        # nulle -> composante liquidité = 0 ; confiance pleine -> composante
        # confiance = 100. Score = 0.6*50 + 0.25*0 + 0.15*100 = 45.
        score = compute_opportunity_score(ratio=1.0, sales_per_month=0.0, confidence=1.0)
        assert score == 45

    def test_cheap_liquid_confident_scores_high(self):
        score = compute_opportunity_score(ratio=0.7, sales_per_month=5.0, confidence=1.0)
        assert score > 80

    def test_expensive_scores_low(self):
        # ratio=1.3 -> composante prix déjà clampée à 0 (plancher) : le
        # score restant vient uniquement de liquidité+confiance (25+15=40),
        # nettement sous la ligne de base "prix pile au marché" (45, cf.
        # test_fair_price_full_confidence_no_liquidity_is_near_50_scaled_by_weights).
        score = compute_opportunity_score(ratio=1.3, sales_per_month=5.0, confidence=1.0)
        assert score == 40

    def test_low_confidence_dampens_score(self):
        confident = compute_opportunity_score(ratio=0.7, sales_per_month=5.0, confidence=1.0)
        unsure = compute_opportunity_score(ratio=0.7, sales_per_month=5.0, confidence=0.3)
        assert unsure < confident

    def test_score_always_clamped_0_100(self):
        assert compute_opportunity_score(ratio=0.0, sales_per_month=100.0, confidence=1.0) <= 100
        assert compute_opportunity_score(ratio=5.0, sales_per_month=0.0, confidence=0.0) >= 0


class TestComputeExtendedSignals:
    def test_opportunity_score_none_without_any_price_signal(self, monkeypatch):
        card = _card()
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)

        signals = verdict.compute_extended_signals(card, "ungraded", displayed_price=8.0, reference_price=None)

        assert signals.opportunity_score is None
        assert signals.liquidity.sales_last_90d == 0

    def test_opportunity_score_falls_back_to_reference_price_without_recent_sales(self, monkeypatch):
        # Aucune vente récente connue -- repli sur reference_price
        # (PriceCharting), seul signal de prix disponible.
        card = _card()
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 12)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)

        signals = verdict.compute_extended_signals(
            card, "ungraded", displayed_price=8.0, reference_price=10.0, confidence=1.0,
        )

        assert signals.opportunity_score == compute_opportunity_score(0.8, signals.liquidity.sales_per_month, 1.0)

    def test_opportunity_score_prefers_recent_sales_over_reference_price(self, monkeypatch):
        # Reproduit le cas utilisateur du 2026-08-23 : reference_price
        # (PriceCharting) très favorable (prix affiché largement en dessous)
        # mais médiane des ventes récentes réelles bien plus basse -- le
        # score doit refléter la réalité du marché récent, pas PriceCharting
        # (dont le prix affiché est parfois un prix catalogue/demandé, pas
        # un prix réellement conclu).
        card = _card()
        monkeypatch.setattr(verdict, "fetch_recent_sales",
                             lambda *a, **k: [_sale(30.0, 0), _sale(30.0, 5), _sale(30.0, 10)])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 12)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)

        # displayed_price=38 : 27% AU-DESSUS de median_recent (30) -> mauvaise
        # affaire attendue, alors que reference_price=100 donnerait un ratio
        # de 0.38 (très favorable) si le score se basait encore dessus.
        signals = verdict.compute_extended_signals(
            card, "ungraded", displayed_price=38.0, reference_price=100.0, confidence=1.0,
        )

        expected = compute_opportunity_score(38.0 / 30.0, signals.liquidity.sales_per_month, 1.0)
        assert signals.opportunity_score == expected
        assert signals.opportunity_score < 50  # mauvaise affaire, pas "Bonne affaire"

    def test_language_comparison_includes_current_and_siblings(self, monkeypatch):
        card = _card()
        sibling = _card(id=2, language="JP")
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda c: [sibling])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda item_id, grade: (15.0, "USD") if item_id == 2 else None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)
        # URL de la langue sœur : résolue via un 2e appel PriceChartingSource
        # (cf. _build_language_comparison), pas price_snapshots -- mocké
        # séparément pour ne jamais toucher une vraie DB/le réseau ici.
        monkeypatch.setattr(verdict, "get_price_with_cache",
                             lambda card_arg, grade, source, ttl_hours=None: PriceQuote(
                                 source="pricecharting", grade=grade, price=15.0, currency="USD",
                                 url="https://www.pricecharting.com/game/jp-slug/izo"))

        signals = verdict.compute_extended_signals(card, "ungraded", reference_price=10.0,
                                                     reference_url="https://www.pricecharting.com/game/en-slug/izo")

        assert len(signals.language_comparison) == 2
        current, jp = signals.language_comparison
        assert current.is_current_listing is True
        assert current.language == "EN"
        assert current.price == 10.0
        assert current.url == "https://www.pricecharting.com/game/en-slug/izo"
        assert jp.is_current_listing is False
        assert jp.language == "JP"
        assert jp.price == 15.0
        assert jp.url == "https://www.pricecharting.com/game/jp-slug/izo"

    def test_sibling_without_known_price_has_none_price_not_zero(self, monkeypatch):
        card = _card()
        sibling = _card(id=2, language="JP")
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda c: [sibling])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda item_id, grade: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)
        # Prix inconnu ET URL inconnue (repli côté source aussi) -- jamais
        # de lien fabriqué faute de mieux, cf. commentaire de
        # LanguageComparisonEntry.url.
        monkeypatch.setattr(verdict, "get_price_with_cache", lambda *a, **k: None)

        signals = verdict.compute_extended_signals(card, "ungraded", reference_price=10.0)

        jp = signals.language_comparison[1]
        assert jp.price is None
        assert jp.currency is None
        assert jp.url is None

    def test_language_comparison_falls_back_to_loose_match_without_strict_sibling(self, monkeypatch):
        # Reproduit le cas utilisateur du 2026-08-23 : fetch_language_siblings
        # (même set_code) ne trouve rien pour cette carte, mais un autre
        # tirage du même code existe bien chez PriceCharting dans l'autre
        # langue -- le bouton de vérification doit quand même apparaître,
        # SANS jamais afficher un prix pour ce tirage non confirmé.
        card = _card()
        loose_variant = _card(id=3, language="JP", name="Roronoa Zoro [Alternate Art Manga]")
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda c: [])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda c: [loose_variant])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "get_price_with_cache",
                             lambda card_arg, grade, source, ttl_hours=None: PriceQuote(
                                 source="pricecharting", grade=grade, price=999.0, currency="USD",
                                 url="https://www.pricecharting.com/game/jp-slug/other-print"))

        signals = verdict.compute_extended_signals(card, "ungraded", reference_price=10.0)

        assert len(signals.language_comparison) == 2
        jp = signals.language_comparison[1]
        assert jp.is_current_listing is False
        assert jp.language == "JP"
        assert jp.price is None  # jamais le prix (999.0) d'un tirage non confirmé
        assert jp.currency is None
        assert jp.url == "https://www.pricecharting.com/game/jp-slug/other-print"

    def test_language_comparison_skips_loose_match_already_covered_by_strict_sibling(self, monkeypatch):
        # Une langue déjà couverte par un sibling strict ne doit jamais
        # apparaître 2 fois (pas de doublon repli).
        card = _card()
        sibling = _card(id=2, language="JP")
        loose_variant = _card(id=3, language="JP")
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda c: [sibling])
        monkeypatch.setattr(verdict, "fetch_language_variants_loose", lambda c: [loose_variant])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda item_id, grade: (15.0, "USD") if item_id == 2 else None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "get_price_with_cache", lambda *a, **k: None)

        signals = verdict.compute_extended_signals(card, "ungraded", reference_price=10.0)

        assert len(signals.language_comparison) == 2  # pas 3 : pas de doublon JP

    def test_sealed_display_skipped_for_sealed_items(self, monkeypatch):
        # Le display lui-même ne se compare pas à "un display du même set" --
        # fetch_sealed_display_for_set ne doit même pas être appelée.
        sealed_card = _card(category="sealed_display", code=None)
        called = []
        monkeypatch.setattr(verdict, "fetch_recent_sales", lambda *a, **k: [])
        monkeypatch.setattr(verdict, "count_sales_since", lambda *a, **k: 0)
        monkeypatch.setattr(verdict, "get_active_listing_count", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_language_siblings", lambda c: [])
        monkeypatch.setattr(verdict, "fetch_latest_price_snapshot", lambda *a, **k: None)
        monkeypatch.setattr(verdict, "fetch_sealed_display_for_set", lambda *a, **k: called.append(a))

        signals = verdict.compute_extended_signals(sealed_card, "ungraded", reference_price=None)

        assert called == []
        assert signals.sealed_display_price is None
