"""Tests de arbitrage/ebay_slabs.py : annonce eBay -> Alert (ou rejet), sans réseau."""
import pytest

from arbitrage import ebay_slabs
from arbitrage.economics import Thresholds

RATES = {"USD": 1.0, "EUR": 1.1, "GBP": 1.3}


def _rate(currency):
    return RATES[currency]


def _summary(**over):
    base = {
        "itemId": "v1|123|0",
        "title": "Charizard 4/102 Base Set BGS 9.5 Gem Mint",
        "price": {"value": "200.00", "currency": "USD"},
        "itemWebUrl": "https://www.ebay.fr/itm/123",
        "buyingOptions": ["FIXED_PRICE"],
        "seller": {"username": "shop", "feedbackPercentage": "99.5"},
        "image": {"imageUrl": "https://i.ebayimg.com/x.jpg"},
        "shippingOptions": [{"shippingCost": {"value": "5.00", "currency": "USD"}}],
    }
    base.update(over)
    return base


def _extract(candidate, summary, **kw):
    return ebay_slabs.extract_alert(
        candidate, summary, marketplace="ebay_fr", thresholds=kw.pop("thresholds", Thresholds()), usd_per_unit=_rate,
    )


class TestExtractAlert:
    def test_happy_path(self, make_candidate):
        alert = _extract(make_candidate(), _summary())
        assert alert is not None
        assert (alert.grader, alert.grade) == ("bgs", 9.5)
        assert alert.listing_id == "v1|123|0"
        assert alert.shipping == 5.0
        assert alert.opportunity.buy_total_usd == pytest.approx(205.0)
        assert alert.seller == "shop" and alert.seller_feedback_pct == 99.5
        assert alert.marketplace == "ebay_fr"

    def test_strips_search_keywords_tracking_param_from_url(self, make_candidate):
        url = "https://www.ebay.fr/itm/123?_skw=Charizard+%22OP05-067%22+%28bgs%2Cbeckett%29&hash=item4a2c:g:LP4A"
        alert = _extract(make_candidate(), _summary(itemWebUrl=url))
        assert alert.url == "https://www.ebay.fr/itm/123?hash=item4a2c:g:LP4A"

    def test_url_without_query_is_untouched(self, make_candidate):
        assert _extract(make_candidate(), _summary()).url == "https://www.ebay.fr/itm/123"

    def test_reads_item_location_country(self, make_candidate):
        assert _extract(make_candidate(), _summary(itemLocation={"country": "JP"})).item_country == "JP"
        assert _extract(make_candidate(), _summary()).item_country is None

    def test_converts_listing_currency_to_usd(self, make_candidate):
        summary = _summary(
            price={"value": "180.00", "currency": "EUR"},
            shippingOptions=[{"shippingCost": {"value": "5.00", "currency": "EUR"}}],
        )
        alert = _extract(make_candidate(), summary)
        assert alert.currency == "EUR" and alert.usd_per_unit == 1.1
        assert alert.opportunity.buy_total_usd == pytest.approx((180 + 5) * 1.1)

    def test_shipping_in_other_currency_is_converted_to_listing_currency(self, make_candidate):
        summary = _summary(
            price={"value": "180.00", "currency": "EUR"},
            shippingOptions=[{"shippingCost": {"value": "5.00", "currency": "GBP"}}],
        )
        alert = _extract(make_candidate(), summary)
        assert alert.shipping == pytest.approx(5.0 * 1.3 / 1.1)

    def test_missing_shipping_is_none_not_zero_claim(self, make_candidate):
        alert = _extract(make_candidate(), _summary(shippingOptions=[]))
        assert alert.shipping is None
        assert alert.opportunity.buy_total_usd == pytest.approx(200.0)

    def test_takes_cheapest_shipping_option(self, make_candidate):
        options = [
            {"shippingCost": {"value": "20.00", "currency": "USD"}},
            {"shippingCost": {"value": "4.00", "currency": "USD"}},
        ]
        assert _extract(make_candidate(), _summary(shippingOptions=options)).shipping == 4.0

    @pytest.mark.parametrize("over", [
        dict(buyingOptions=["AUCTION"]),                                         # prix courant d'enchère != prix d'achat
        dict(title="Charizard 4/102 Base Set PSA 9"),                             # ce n'est pas un slab BGS/CGC
        dict(title="Charizard 4/102 Base Set BGS 9"),                             # note hors ALLOWED_GRADES
        dict(title="Charizard 4/102 BGS 10 Black Label"),                         # label premium
        dict(title="Lot de 2 Charizard 4/102 BGS 9.5"),                           # lot
        dict(title="Charizard proxy custom 4/102 BGS 9.5"),                       # proxy/custom
        dict(title="Charizard 5/102 Base Set BGS 9.5"),                           # mauvais numéro
        dict(title="Charizard 14/102 Base Set BGS 9.5"),                          # "4/102" n'est pas "14/102"
        dict(title="Blastoise 4/102 Base Set BGS 9.5"),                           # bon numéro mais autre carte
        dict(title="Charizard 4/102 BGS 9.5 japonais"),                           # indice JP pour une carte EN
        dict(title="Dracaufeu 4/102 BGS 9.5 FR"),                                 # autre langue
        dict(title="Charizard 4/102 BGS 9.5 vs PSA 10"),                          # deux graders : ambigu
        dict(price={"value": "10.00", "currency": "USD"}),                        # trop beau : sûrement une autre carte
        dict(price={"value": "900.00", "currency": "USD"}),                       # multiple trop faible
        dict(price=None),
        dict(itemId=None),
    ])
    def test_rejects(self, make_candidate, over):
        assert _extract(make_candidate(), _summary(**over)) is None

    def test_jp_card_requires_explicit_jp_hint(self, make_candidate):
        jp = make_candidate(language="JP")
        assert _extract(jp, _summary(title="Charizard 4/102 BGS 9.5")) is None
        assert _extract(jp, _summary(title="Charizard 4/102 BGS 9.5 Japanese")) is not None

    def test_grade_10_allowed_by_default_and_restrictable(self, make_candidate):
        summary = _summary(title="Charizard 4/102 CGC 10 Pristine")
        alert = _extract(make_candidate(), summary)
        assert alert is not None and (alert.grader, alert.grade) == ("cgc", 10.0)
        assert _extract(make_candidate(), summary, thresholds=Thresholds(allowed_grades=(9.5,))) is None


class TestHasCode:
    @pytest.mark.parametrize("code,title,expected", [
        ("4/102", "Charizard 4/102 BGS 9.5", True),
        ("4/102", "Charizard 4 / 102 BGS 9.5", True),          # espaces autour du "/"
        ("4/102", "Charizard #4/102", True),
        ("4/102", "Charizard 14/102", False),                  # préfixe numérique
        ("4/102", "Charizard 4/1020", False),                  # suffixe numérique
        ("OP06-118", "Zoro OP06-118 Alternate Art CGC 10", True),
        ("OP06-118", "Zoro OP06 - 118 CGC 10", True),
        ("OP06-118", "Zoro OP06-119 CGC 10", False),
        (None, "Charizard 4/102", False),
        ("", "Charizard 4/102", False),
    ])
    def test_has_code(self, code, title, expected):
        assert ebay_slabs.has_code(code, title) is expected


class TestHasName:
    def test_all_words_must_be_in_title(self):
        assert ebay_slabs.has_name("Charizard", "Charizard 4/102 BGS 9.5")
        assert ebay_slabs.has_name("Dark Charizard", "Dark Charizard 4/102")
        assert not ebay_slabs.has_name("Dark Charizard", "Charizard 4/102")

    def test_qualifiers_in_brackets_are_ignored_for_the_name(self):
        assert ebay_slabs.has_name("Roronoa Zoro (Alternate Art)", "Roronoa Zoro OP06-118 CGC 10")
        assert ebay_slabs.has_name("Nico Robin [SP]", "Nico Robin OP01-001")

    def test_accents_are_folded(self):
        assert ebay_slabs.has_name("Pokémon Card", "Pokemon Card 4/102")

    def test_base_name(self):
        assert ebay_slabs.base_name("Roronoa Zoro [Alternate Art Manga]") == "Roronoa Zoro"
        assert ebay_slabs.base_name("Nico Robin (055) (Alternate Art)") == "Nico Robin"
        assert ebay_slabs.base_name("Charizard") == "Charizard"


class TestHasQualifiers:
    def test_variant_words_must_be_in_title(self):
        assert ebay_slabs.has_qualifiers("Zoro [Alternate Art Manga]", "Zoro OP06-118 Manga Alternate Art CGC 10")
        assert not ebay_slabs.has_qualifiers("Zoro [Alternate Art Manga]", "Zoro OP06-118 CGC 10")
        assert not ebay_slabs.has_qualifiers("Zoro [Alternate Art Manga]", "Zoro OP06-118 Alternate Art CGC 10")

    def test_no_qualifier_means_nothing_to_require(self):
        assert ebay_slabs.has_qualifiers("Zoro", "Zoro OP06-118 Manga CGC 10")

    def test_numeric_only_groups_ignored(self):
        assert ebay_slabs.has_qualifiers("Nico Robin (055)", "Nico Robin OP01-017 BGS 10")
        assert not ebay_slabs.has_qualifiers("Nico Robin (055) (Alternate Art)", "Nico Robin OP01-017 BGS 10")


class TestExtractAlertVariants:
    def test_variant_candidate_rejects_base_card_listing(self, make_candidate):
        variant = make_candidate(name="Charizard [Alternate Art]")
        assert _extract(variant, _summary(title="Charizard 4/102 BGS 9.5")) is None
        assert _extract(variant, _summary(title="Charizard 4/102 Alternate Art BGS 9.5")) is not None


class TestSearchAlerts:
    def test_builds_query_and_keeps_only_worthy_listings(self, monkeypatch, make_candidate):
        calls = []

        def fake_search(q, **kwargs):
            calls.append((q, kwargs))
            return {"itemSummaries": [
                _summary(itemId="a", title="Charizard 4/102 BGS 9.5"),
                _summary(itemId="b", title="Charizard 4/102 PSA 9"),
            ]}

        monkeypatch.setattr(ebay_slabs.ebay, "search_listings", fake_search)
        alerts = ebay_slabs.search_alerts(
            make_candidate(), marketplace_id="EBAY_FR", buyer_country="FR",
            thresholds=Thresholds(), usd_per_unit=_rate,
        )
        assert [a.listing_id for a in alerts] == ["a"]
        assert len(calls) == 1                                   # une seule requête pour tous les graders
        q, kwargs = calls[0]
        assert q == 'Charizard "4/102" (bgs,beckett,cgc)'
        assert kwargs["marketplace_id"] == "EBAY_FR" and kwargs["delivery_country"] == "FR"

    def test_query_uses_base_name_without_variant_qualifiers(self, monkeypatch, make_candidate):
        calls = []
        monkeypatch.setattr(ebay_slabs.ebay, "search_listings", lambda q, **kw: calls.append(q) or {})
        ebay_slabs.search_alerts(
            make_candidate(name="Roronoa Zoro [Alternate Art Manga]", code="OP06-118"),
            marketplace_id="EBAY_FR", buyer_country="FR", thresholds=Thresholds(), usd_per_unit=_rate,
        )
        assert calls == ['Roronoa Zoro "OP06-118" (bgs,beckett,cgc)']

    def test_empty_response(self, monkeypatch, make_candidate):
        monkeypatch.setattr(ebay_slabs.ebay, "search_listings", lambda q, **kw: {})
        assert ebay_slabs.search_alerts(
            make_candidate(), marketplace_id="EBAY_FR", buyer_country="FR",
            thresholds=Thresholds(), usd_per_unit=_rate,
        ) == []
