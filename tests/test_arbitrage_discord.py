"""Tests de arbitrage/discord_webhook.py : embeds et envoi par lots, sans réseau."""
import pytest
import requests

from arbitrage import discord_webhook as dw


class _Resp:
    def __init__(self, status=204, body=None):
        self.status_code = status
        self._body = body or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(dw.time, "sleep", lambda s: None)


class TestFormatting:
    def test_money_french_format(self):
        assert dw.fmt_money(1850, "EUR") == "1 850,00 €"
        assert dw.fmt_money(5, "USD") == "5,00 $"
        assert dw.fmt_money(12.5, "CHF") == "12,50 CHF"

    def test_grade(self):
        assert dw.fmt_grade(10.0) == "10"
        assert dw.fmt_grade(9.5) == "9.5"


class TestBuildEmbed:
    def test_core_content(self, make_alert):
        embed = dw.build_embed(make_alert())
        assert embed["title"] == "Charizard — BGS 9.5"
        assert embed["url"] == "https://www.ebay.fr/itm/123"
        assert "4/102" in embed["description"]
        assert embed["image"]["url"] == "https://i.ebayimg.com/x.jpg"
        assert embed["thumbnail"]["url"] == "https://img.example/ref.png"
        by_name = {f["name"]: f["value"] for f in embed["fields"]}
        assert "200,00 $" in by_name["🛒 Prix"] and "5,00 $" in by_name["🛒 Prix"]
        assert "210,00 $" in by_name["🎯 PSA 9 / PSA 10"] and "2 000,00 $" in by_name["🎯 PSA 9 / PSA 10"]
        assert "×9.8" in by_name["📈 Multiple"]                       # 2000 / 205
        assert "%" in by_name["⚖️ Seuil de rentabilité"]
        assert by_name["🏪 Vendeur"] == "shop (99,5 % positifs) · expédié depuis FR"
        assert "Hypothèse" in embed["footer"]["text"]

    def test_amounts_shown_in_listing_currency(self, make_alert):
        embed = dw.build_embed(make_alert(price=180.0, shipping=5.0, currency="EUR", rate=1.1))
        by_name = {f["name"]: f["value"] for f in embed["fields"]}
        assert "180,00 €" in by_name["🛒 Prix"]
        assert "€" in by_name["🎯 PSA 9 / PSA 10"] and "$" not in by_name["🎯 PSA 9 / PSA 10"]

    def test_shipping_unknown_is_stated(self, make_alert):
        embed = dw.build_embed(make_alert(shipping=None))
        assert "livraison non précisée" in embed["fields"][0]["value"]

    def test_free_shipping_is_worded_not_shown_as_zero(self, make_alert):
        embed = dw.build_embed(make_alert(shipping=0.0))
        assert embed["fields"][0]["value"] == "200,00 $ · livraison gratuite"

    def test_non_eu_seller_gets_a_customs_warning(self, make_alert):
        seller = {f["name"]: f["value"] for f in dw.build_embed(make_alert(item_country="JP"))["fields"]}["🏪 Vendeur"]
        assert "expédié depuis JP" in seller and "Hors UE" in seller and "TVA" in seller

    @pytest.mark.parametrize("country", ["FR", "DE", "IT"])
    def test_eu_seller_has_no_customs_warning(self, make_alert, country):
        seller = {f["name"]: f["value"] for f in dw.build_embed(make_alert(item_country=country))["fields"]}["🏪 Vendeur"]
        assert f"expédié depuis {country}" in seller and "Hors UE" not in seller

    def test_unknown_country_says_nothing_about_customs(self, make_alert):
        seller = {f["name"]: f["value"] for f in dw.build_embed(make_alert(item_country=None))["fields"]}["🏪 Vendeur"]
        assert "expédié" not in seller and "Hors UE" not in seller

    def test_floor_covered_is_green_and_worded(self, make_alert, make_candidate):
        cheap_ceiling = make_candidate(psa9_usd=210.0, psa10_usd=400.0)
        embed = dw.build_embed(make_alert(candidate=cheap_ceiling, price=100.0, shipping=0.0))
        assert embed["color"] == dw._COLOR_FLOOR_COVERED
        assert "Plancher couvert" in {f["name"]: f["value"] for f in embed["fields"]}["⚖️ Seuil de rentabilité"]

    def test_speculative_is_yellow(self, make_alert):
        assert dw.build_embed(make_alert())["color"] == dw._COLOR_SPECULATIVE

    def test_respects_discord_limits(self, make_alert, make_candidate):
        embed = dw.build_embed(make_alert(candidate=make_candidate(name="X" * 500), seller="s" * 2000))
        assert len(embed["title"]) <= 256
        assert all(len(f["value"]) <= 1024 for f in embed["fields"])

    def test_optional_images_omitted(self, make_alert, make_candidate):
        embed = dw.build_embed(make_alert(image_url=None, candidate=make_candidate(image_url=None)))
        assert "image" not in embed and "thumbnail" not in embed


class TestPostAlerts:
    def test_posts_in_chunks_and_confirms_each_chunk(self, monkeypatch, make_alert):
        payloads, confirmed = [], []
        monkeypatch.setattr(dw.requests, "post", lambda url, json, timeout: payloads.append(json) or _Resp())
        alerts = [make_alert(listing_id=f"id{i}") for i in range(7)]

        posted = dw.post_alerts("https://discord.example/webhook", alerts, on_posted=lambda c: confirmed.append(len(c)))

        assert posted == 7
        assert [len(p["embeds"]) for p in payloads] == [5, 2]
        assert confirmed == [5, 2]
        assert all(p["allowed_mentions"] == {"parse": []} for p in payloads)

    def test_retries_after_rate_limit(self, monkeypatch, make_alert):
        responses = [_Resp(429, {"retry_after": 0.1}), _Resp(204)]
        monkeypatch.setattr(dw.requests, "post", lambda url, json, timeout: responses.pop(0))
        assert dw.post_alerts("https://discord.example/webhook", [make_alert()]) == 1
        assert responses == []

    def test_failed_chunk_is_not_confirmed(self, monkeypatch, make_alert):
        responses = [_Resp(204), _Resp(500)]
        confirmed = []
        monkeypatch.setattr(dw.requests, "post", lambda url, json, timeout: responses.pop(0))
        alerts = [make_alert(listing_id=f"id{i}") for i in range(7)]

        with pytest.raises(requests.HTTPError):
            dw.post_alerts("https://discord.example/webhook", alerts, on_posted=lambda c: confirmed.append(len(c)))

        assert confirmed == [5]   # le 1er lot est enregistré, pas le 2e (sera retenté au prochain run)
