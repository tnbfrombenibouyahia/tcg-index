"""Règle de sélection des cartes pour la requête PSA par carte (ingestion/card_selection.py)."""
import datetime as dt

import pytest

from ingestion import card_selection as cs
from ingestion.sources.pricecharting import PRICECHARTING_JP_ALL_SLUGS


def make_item(**over):
    base = dict(
        category="single", tcg="pokemon", set_code="pokemon-sv-obsidian-flames",
        rarity="Common", interest_tier=None, release_date=dt.date(2023, 8, 11),
    )
    base.update(over)
    return base


class TestPriceThreshold:
    def test_ten_dollars_is_selected_for_any_single(self):
        assert cs.is_selected(make_item(), 10.0)
        assert cs.is_selected(make_item(tcg="one-piece", rarity="Common"), 10.0)

    def test_just_under_ten_dollars_is_not(self):
        assert not cs.is_selected(make_item(), 9.99)
        assert not cs.is_selected(make_item(tcg="one-piece", rarity="Common"), 9.99)

    def test_unknown_price_alone_never_selects(self):
        assert not cs.is_selected(make_item(), None)


class TestOnePiece:
    @pytest.mark.parametrize("rarity", ["Leader", "Super Rare", "Secret Rare", "Treasure Rare", "SR", "SEC", "L", "super rare"])
    def test_hit_rarities_are_selected_even_when_cheap(self, rarity):
        assert cs.is_selected(make_item(tcg="one-piece", rarity=rarity), 0.5)

    @pytest.mark.parametrize("rarity", ["Common", "Uncommon", "Rare", "Promo", None])
    def test_other_rarities_need_the_price(self, rarity):
        assert not cs.is_selected(make_item(tcg="one-piece", rarity=rarity), 2.0)
        assert cs.is_selected(make_item(tcg="one-piece", rarity=rarity), 25.0)

    def test_one_piece_age_does_not_matter(self):
        assert not cs.is_selected(make_item(tcg="one-piece", rarity="Common", release_date=dt.date(2000, 1, 1)), 1.0)


class TestPokemon:
    def test_everything_before_2012_is_selected_even_a_cheap_common(self):
        assert cs.is_selected(make_item(release_date=dt.date(1999, 1, 9)), 0.30)
        assert cs.is_selected(make_item(release_date=dt.date(2011, 12, 31)), 0.30)

    def test_2012_and_after_needs_a_hit_or_the_price(self):
        assert not cs.is_selected(make_item(release_date=dt.date(2012, 1, 1)), 3.0)
        assert cs.is_selected(make_item(release_date=dt.date(2012, 1, 1), interest_tier="chase"), 3.0)
        assert cs.is_selected(make_item(release_date=dt.date(2012, 1, 1)), 12.0)

    @pytest.mark.parametrize("tier", ["sir", "ir", "fa", "secret", "chase"])
    def test_every_interest_tier_is_a_hit(self, tier):
        assert cs.is_selected(make_item(interest_tier=tier), 1.0)

    def test_japanese_pre_2012_set_is_selected_through_the_set_list(self):
        jp = make_item(set_code="pokemon-jp-expansion-pack", release_date=None, rarity=None)
        assert cs.is_selected(jp, 0.5)

    def test_japanese_modern_set_is_not(self):
        jp = make_item(set_code="pokemon-jp-terastal-festival", release_date=None, rarity="Common")
        assert not cs.is_selected(jp, 0.5)
        assert cs.is_selected(jp, 30.0)


class TestSealed:
    def test_sealed_is_never_filtered(self):
        assert cs.is_selected(make_item(category="sealed"), None)
        assert cs.should_store_price(make_item(category="sealed", tcg="pokemon"), 1.0)


class TestStorage:
    def test_one_piece_is_always_stored(self):
        assert cs.should_store_price(make_item(tcg="one-piece", rarity="Common"), 0.2)

    def test_pokemon_with_unknown_rarity_is_still_stored(self):
        assert cs.should_store_price(make_item(rarity=None), 0.2)

    def test_pokemon_unselected_with_known_rarity_is_not_stored(self):
        assert not cs.should_store_price(make_item(rarity="Common"), 2.0)

    def test_pokemon_selected_is_stored(self):
        assert cs.should_store_price(make_item(rarity="Common"), 15.0)
        assert cs.should_store_price(make_item(rarity="Common", interest_tier="sir"), 2.0)


class TestPre2012JapaneseSets:
    def test_threshold_and_cutoff_constants(self):
        assert cs.MIN_RAW_PRICE_USD == 10.0
        assert cs.VINTAGE_CUTOFF == dt.date(2012, 1, 1)

    def test_every_slug_exists_in_the_pricecharting_jp_mapping(self):
        unknown = sorted(s for s in cs.PRE_2012_JP_SET_CODES if s not in PRICECHARTING_JP_ALL_SLUGS)
        assert not unknown, f"slugs absents de PRICECHARTING_JP_ALL_SLUGS (faute de frappe ?) : {unknown}"

    def test_list_is_not_empty_and_prefixed(self):
        assert len(cs.PRE_2012_JP_SET_CODES) > 100
        assert all(c.startswith("pokemon-jp-") for c in cs.PRE_2012_JP_SET_CODES)
