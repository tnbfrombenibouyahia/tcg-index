"""Tests du module le plus fragile : pricing/matching.py. Cas construits à
partir de titres réels observés dans
ingestion/_probe_output/ebay_report_one-piece_en.json.
"""
from pricing.matching import (
    _qualifier_tokens,
    disambiguate_candidates,
    extract_one_piece_code,
    fuzzy_match_by_name_and_rarity,
    identify_card,
)
from pricing.models import Card


def _card(id, name, code, set_code="one-piece-starter-deck-22-ace-newgate", rarity="Super Rare"):
    return Card(id=id, name=name, code=code, set_code=set_code, tcg="one-piece",
                category="single", language="EN", rarity=rarity)


class TestExtractOnePieceCode:
    def test_finds_code_with_numeric_qualifier(self):
        assert extract_one_piece_code("Cavendish (105) OP10-105 Royal Blood Regular") == "OP10-105"

    def test_finds_code_st_prefix(self):
        assert extract_one_piece_code("IZO ST22-002 SR ONE PIECE FOIL LP") == "ST22-002"

    def test_finds_code_eb_prefix(self):
        text = "Don Accino EB02-004 Common Extra Booster: Anime 25th Collection One Piece NM"
        assert extract_one_piece_code(text) == "EB02-004"

    def test_case_insensitive_normalized_to_uppercase(self):
        assert extract_one_piece_code("one piece izo op10-105 sr foil") == "OP10-105"

    def test_rejects_single_digit_set_number(self):
        assert extract_one_piece_code("OP1-105") is None

    def test_rejects_three_digit_set_number(self):
        assert extract_one_piece_code("OP100-105") is None

    def test_rejects_pokemon_style_code(self):
        assert extract_one_piece_code("Charizard 199/165 no code here") is None

    def test_no_code_in_plain_text(self):
        assert extract_one_piece_code("Monkey D Luffy Leader near mint") is None


class TestQualifierTokens:
    def test_purely_numeric_qualifier_is_ignored(self):
        # Le nombre entre parenthèses est un numéro apitcg (item_id 98406),
        # pas un qualificatif de variante -- ne doit jamais être traité comme tel.
        assert _qualifier_tokens("Cavendish (105)") == frozenset()

    def test_text_qualifier_is_captured(self):
        assert _qualifier_tokens("Izo (Parallel)") == frozenset({"parallel"})

    def test_bracket_qualifier_is_captured(self):
        assert _qualifier_tokens("Izo [Manga]") == frozenset({"manga"})


class TestDisambiguateCandidates:
    def test_single_candidate_matches_without_scoring(self):
        card = _card(1, "Izo", "ST22-002")
        result = disambiguate_candidates("anything at all", [card])
        assert result.status == "matched"
        assert result.card is card
        assert result.confidence == 1.0

    def test_picks_variant_matching_qualifier_in_text(self):
        base = _card(1, "Izo", "ST22-002")
        parallel = _card(2, "Izo (Parallel)", "ST22-002")
        text = "One Piece TCG: Izo (Parallel) ST22-002 Ace & Newgate Super Rare Foil (Alt Art) B"
        result = disambiguate_candidates(text, [base, parallel])
        assert result.status == "matched"
        assert result.card is parallel

    def test_picks_base_when_text_has_no_qualifier(self):
        base = _card(1, "Izo", "ST22-002")
        parallel = _card(2, "Izo (Parallel)", "ST22-002")
        text = "Izo ST22-002 Super Rare Starter Deck 22: Ace & Newgate One Piece Foil Near Mint"
        result = disambiguate_candidates(text, [base, parallel])
        assert result.status == "matched"
        assert result.card is base

    def test_ambiguous_when_no_candidate_qualifier_matches_text(self):
        parallel = _card(1, "Izo (Parallel)", "ST22-002")
        manga = _card(2, "Izo [Manga]", "ST22-002")
        alt = _card(3, "Izo [Alternate Art]", "ST22-002")
        text = "Izo ST22-002 Super Rare One Piece Near Mint"
        result = disambiguate_candidates(text, [parallel, manga, alt])
        assert result.status == "ambiguous"
        assert len(result.candidates) == 3
        assert result.card is None


class TestFuzzyMatchByNameAndRarity:
    def test_matches_despite_different_punctuation(self, monkeypatch):
        candidate = _card(1, "Marshall.D.Teach", "OP12-054", rarity="Common")
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: [candidate])

        text = "Marshall D Teach One Piece Legacy Of The Master OP12-054"
        result = fuzzy_match_by_name_and_rarity(text)

        assert result.status == "matched"
        assert result.card is candidate

    def test_ambiguous_when_same_name_and_no_decisive_rarity_hint(self, monkeypatch):
        card_a = _card(1, "Luffy", "OP01-001", rarity="Common")
        card_b = _card(2, "Luffy", "OP03-013", rarity="Leader")
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: [card_a, card_b])

        result = fuzzy_match_by_name_and_rarity("Luffy One Piece Card Near Mint")

        assert result.status == "ambiguous"
        assert len(result.candidates) == 2

    def test_not_found_when_no_exploitable_name_token(self, monkeypatch):
        called = []
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: called.append(tokens) or [])

        result = fuzzy_match_by_name_and_rarity("NM LP PSA TCG Card Near Mint Foil")

        assert result.status == "not_found"
        assert not called  # aucun appel DB : le pré-filtre a déjà tout retiré

    def test_not_found_when_db_has_no_candidate(self, monkeypatch):
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: [])
        result = fuzzy_match_by_name_and_rarity("Some Unknown Character")
        assert result.status == "not_found"


class TestIdentifyCard:
    def test_with_code_delegates_to_code_lookup(self, monkeypatch):
        card = _card(1, "Izo", "ST22-002")
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [card])

        result = identify_card(text="IZO ST22-002 SR ONE PIECE FOIL LP")

        assert result.status == "matched"
        assert result.card is card
        assert result.strategy == "code"

    def test_code_recognized_but_not_in_catalog(self, monkeypatch):
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [])

        result = identify_card(text="Some Card OP99-999")

        assert result.status == "not_found"
        assert "OP99-999" in result.message

    def test_falls_back_to_fuzzy_without_code(self, monkeypatch):
        candidate = _card(1, "Marshall.D.Teach", "OP12-054", rarity="Common")
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: [candidate])

        result = identify_card(text="Marshall D Teach One Piece Legacy Of The Master")

        assert result.status == "matched"
        assert result.strategy == "fuzzy_name_rarity"

    def test_image_url_only_is_not_implemented_stub(self):
        result = identify_card(image_url="https://example.com/listing.jpg")
        assert result.status == "not_found"
        assert result.message is not None and "image" in result.message.lower()

    def test_text_takes_priority_over_image_url(self, monkeypatch):
        card = _card(1, "Izo", "ST22-002")
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [card])

        result = identify_card(text="IZO ST22-002 SR", image_url="https://example.com/listing.jpg")

        assert result.status == "matched"

    def test_nothing_provided_is_not_found(self):
        result = identify_card()
        assert result.status == "not_found"
