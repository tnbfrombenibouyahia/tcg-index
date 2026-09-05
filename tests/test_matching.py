"""Tests du module le plus fragile : pricing/matching.py. Cas construits à
partir de titres réels observés dans
ingestion/_probe_output/ebay_report_one-piece_en.json.
"""
from pricing.matching import (
    _pokemon_set_tokens,
    _qualifier_tokens,
    disambiguate_candidates,
    disambiguate_pokemon_candidates,
    extract_one_piece_code,
    extract_pokemon_number,
    fuzzy_match_by_name_and_rarity,
    identify_card,
)
from pricing.models import Card


def _card(id, name, code, set_code="one-piece-starter-deck-22-ace-newgate", rarity="Super Rare", language="EN"):
    return Card(id=id, name=name, code=code, set_code=set_code, tcg="one-piece",
                category="single", language=language, rarity=rarity)


def _poke_card(id, name, code, set_code, rarity=None, language="EN"):
    return Card(id=id, name=name, code=code, set_code=set_code, tcg="pokemon",
                category="single", language=language, rarity=rarity)


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

    def test_finds_bracket_hash_form(self):
        # Forme vue en usage réel (annonce eBay 157610454970) -- espace puis
        # numéro préfixé "#" entre crochets, aucun tiret.
        text = "PSA 10 One Piece JP Roronoa Zoro Manga Alt Art OP06 [#118]"
        assert extract_one_piece_code(text) == "OP06-118"

    def test_finds_hash_form_without_brackets(self):
        assert extract_one_piece_code("Some Card OP06 #118 Alt Art") == "OP06-118"

    def test_bracket_hash_form_rejects_single_digit_set(self):
        assert extract_one_piece_code("OP6 [#118]") is None

    def test_bracket_hash_form_rejects_two_digit_card_number(self):
        assert extract_one_piece_code("OP06 [#18]") is None


class TestQualifierTokens:
    def test_purely_numeric_qualifier_is_ignored(self):
        # Le nombre entre parenthèses est un numéro apitcg (item_id 98406),
        # pas un qualificatif de variante -- ne doit jamais être traité comme tel.
        assert _qualifier_tokens("Cavendish (105)") == frozenset()

    def test_text_qualifier_is_captured(self):
        assert _qualifier_tokens("Izo (Parallel)") == frozenset({"parallel"})

    def test_bracket_qualifier_is_captured(self):
        assert _qualifier_tokens("Izo [Manga]") == frozenset({"manga"})

    def test_hash_prefixed_numeric_qualifier_is_ignored(self):
        # "[#118]" est le numéro de carte capté par ONE_PIECE_CODE_RE (forme
        # bracket-hash), pas un qualificatif de variante -- même traitement
        # que le "(105)" purement numérique ci-dessus.
        assert _qualifier_tokens("Roronoa Zoro OP06 [#118]") == frozenset()


class TestExtractPokemonNumber:
    def test_finds_numerator_denominator_form(self):
        # Cas réel : annonce eBay.fr 800613059079, "Mega Rayquaza EX
        # 110/078 Storm Emerald Japonais CCC 9.5 PV 280 Dragon".
        assert extract_pokemon_number("Mega Rayquaza EX 110/078 Storm Emerald Japonais") == "110"

    def test_keeps_leading_zeros_normalization_to_sql(self):
        # Le retrait des zéros de tête se fait côté SQL (cf.
        # fetch_pokemon_items_by_number), pas ici -- la fonction renvoie
        # le numérateur brut.
        assert extract_pokemon_number("Dunsparce 110/168 Celestial Storm") == "110"

    def test_rejects_single_digit_denominator_lot_quantity(self):
        # "3/5 cards" (quantité de lot) ne doit pas être pris pour un
        # numéro de carte -- aucun set réel n'a un total à un seul chiffre.
        assert extract_pokemon_number("Lot of 3/5 cards near mint") is None

    def test_finds_promo_code_without_slash(self):
        assert extract_pokemon_number("Rayquaza - SWSH029 Promo") == "SWSH029"

    def test_promo_code_reconstructed_without_space(self):
        assert extract_pokemon_number("Rayquaza SWSH 029") == "SWSH029"

    def test_no_number_in_plain_text(self):
        assert extract_pokemon_number("Mega Rayquaza ex Storm Emerald near mint") is None


class TestPokemonSetTokens:
    def test_strips_pokemon_prefix(self):
        assert _pokemon_set_tokens("pokemon-jp-storm-emeralda") == frozenset({"jp", "storm", "emeralda"})

    def test_strips_generation_code_fragment(self):
        # "ex" ici est un fragment d'ère de set (Scarlet & Violet-ex), pas
        # un nom de carte -- cf. _POKEMON_GEN_CODE_RE.
        assert _pokemon_set_tokens("pokemon-jp-mega-dream-ex") == frozenset({"jp", "mega", "dream"})

    def test_none_set_code_is_empty(self):
        assert _pokemon_set_tokens(None) == frozenset()


class TestDisambiguatePokemonCandidates:
    def test_single_candidate_matches_without_scoring(self):
        card = _poke_card(1, "Rayquaza", "101", "pokemon-crown-zenith")
        result = disambiguate_pokemon_candidates("anything at all", [card])
        assert result.status == "matched"
        assert result.card is card
        assert result.confidence == 1.0

    def test_picks_matching_set_and_name_across_many_same_number_candidates(self):
        # Cas réel qui a motivé ce chemin : 83 cartes Pokémon partagent le
        # numérateur "110" tous sets confondus (mesuré sur le catalogue
        # réel), la bonne carte se départage par nom+set+rareté, pas par
        # numéro seul.
        target = _poke_card(64196, "Mega Rayquaza ex", "110", "pokemon-jp-storm-emeralda",
                             rarity="Special Art Rare", language="JP")
        decoy_same_number_en = _poke_card(8314, "Dunsparce", "110/168", "pokemon-sm-celestial-storm", language="EN")
        decoy_same_number_jp = _poke_card(51638, "Mega Charizard X Ex", "110", "pokemon-jp-inferno-x", language="JP")
        text = "Mega Rayquaza EX 110/078 Storm Emerald Japonais CCC 9.5 PV 280 Dragon"

        result = disambiguate_pokemon_candidates(text, [target, decoy_same_number_en, decoy_same_number_jp])

        assert result.status == "matched"
        assert result.card is target

    def test_language_hint_narrows_to_single_survivor_without_token_overlap(self):
        # Numéro + langue déjà univoques (un seul candidat JP survit) --
        # ne doit PAS retomber à "ambiguous" faute de recouvrement de
        # tokens texte/carte, contrairement au qualificatif One Piece (qui
        # peut légitimement être vide des deux côtés, cf. _dice) : ici le
        # texte est délibérément laconique, sans nom de set.
        jp_card = _poke_card(1, "Obscure Card Name", "42", "pokemon-jp-some-obscure-set", language="JP")
        en_card = _poke_card(2, "Obscure Card Name", "42", "pokemon-some-obscure-set", language="EN")
        text = "PSA 10 Japan 42/100 Near Mint"
        result = disambiguate_pokemon_candidates(text, [jp_card, en_card])
        assert result.status == "matched"
        assert result.card is jp_card

    def test_ambiguous_when_no_signal_decisive(self):
        a = _poke_card(1, "Some Card", "42", "pokemon-set-a", language="EN")
        b = _poke_card(2, "Other Card", "42", "pokemon-set-b", language="EN")
        result = disambiguate_pokemon_candidates("42/100 Near Mint", [a, b])
        assert result.status == "ambiguous"
        assert len(result.candidates) == 2


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

    def test_language_hint_filters_candidates_before_scoring(self):
        # Cas réel : annonce eBay 157610454970, OP06-118 -- 11 items en
        # base pour ce seul code (6 EN + 5 JP), qualificatif de variante
        # ("Manga Alt Art") écrit en clair, jamais entre crochets. Sans le
        # filtre langue, "Roronoa Zoro" (EN, sans qualificatif) et son
        # équivalent JP sans qualificatif finissent à égalité de score --
        # ambigu. Avec le filtre "JP" détecté dans le texte, seuls les
        # candidats JP restent en lice, et le qualificatif en clair
        # ("Manga Alt Art" ~ "[Alternate Art Manga]") tranche clairement.
        en_base = _card(1, "Roronoa Zoro", "OP06-118", language="EN")
        en_alt_manga = _card(2, "Roronoa Zoro (Alternate Art) (Manga)", "OP06-118", language="EN")
        jp_base = _card(3, "Roronoa Zoro", "OP06-118", language="JP")
        jp_alt_manga = _card(4, "Roronoa Zoro [Alternate Art Manga]", "OP06-118", language="JP")
        jp_alt_only = _card(5, "Roronoa Zoro [Alternate Art]", "OP06-118", language="JP")
        text = "PSA 10 One Piece JP Roronoa Zoro Manga Alt Art OP06 [#118]"

        result = disambiguate_candidates(text, [en_base, en_alt_manga, jp_base, jp_alt_manga, jp_alt_only])

        assert result.status == "matched"
        assert result.card is jp_alt_manga

    def test_language_hint_filter_is_additive_not_exclusive(self):
        # Aucun candidat dans la langue détectée (donnée suspecte/absente,
        # ici aucun candidat JP alors que le texte mentionne "JP") -- repli
        # sur tous les candidats plutôt que de perdre le match, même
        # principe que le repli de recherche Population Analysis.
        base = _card(1, "Izo", "ST22-002", language="EN")
        parallel = _card(2, "Izo (Parallel)", "ST22-002", language="EN")
        text = "Izo (Parallel) ST22-002 JP"
        result = disambiguate_candidates(text, [base, parallel])
        assert result.status == "matched"
        assert result.card is parallel

    def test_unbracketed_qualifier_words_are_recognized(self):
        # Le qualificatif du texte libre n'est pas toujours entre crochets
        # (cf. test_language_hint_filters_candidates_before_scoring) --
        # vérifié isolément ici, sans filtre langue en jeu.
        base = _card(1, "Izo", "ST22-002")
        parallel = _card(2, "Izo (Parallel)", "ST22-002")
        text = "Izo ST22-002 Parallel Super Rare One Piece Near Mint"  # "Parallel" en clair
        result = disambiguate_candidates(text, [base, parallel])
        assert result.status == "matched"
        assert result.card is parallel


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

    def test_pokemon_number_delegates_to_pokemon_lookup(self, monkeypatch):
        # Cas réel qui a motivé toute cette extension : annonce eBay.fr
        # 800613059079, aucun code One Piece dans le titre -> doit passer
        # par le numéro Pokémon, jamais par le fuzzy One Piece (qui
        # renvoyait à tort des cartes One Piece sans rapport, cf. session).
        card = _poke_card(64196, "Mega Rayquaza ex", "110", "pokemon-jp-storm-emeralda",
                           rarity="Special Art Rare", language="JP")
        monkeypatch.setattr("pricing.matching.fetch_pokemon_items_by_number", lambda number: [card])

        result = identify_card(text="Mega Rayquaza EX 110/078 Storm Emerald Japonais CCC 9.5 PV 280 Dragon")

        assert result.status == "matched"
        assert result.card is card
        assert result.strategy == "pokemon_number"

    def test_one_piece_code_takes_priority_over_pokemon_lookup(self, monkeypatch):
        card = _card(1, "Cavendish", "OP10-105")
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [card])
        called = []
        monkeypatch.setattr("pricing.matching.fetch_pokemon_items_by_number", lambda number: called.append(number) or [])

        result = identify_card(text="Cavendish (105) OP10-105 Royal Blood Regular")

        assert result.status == "matched"
        assert result.card is card
        assert not called  # jamais tenté : le code One Piece a déjà tranché

    def test_pokemon_number_recognized_but_not_in_catalog_falls_back_to_fuzzy(self, monkeypatch):
        # Contrairement au code One Piece (regex ancrée -> "not_found"
        # direct si absent), un numéro Pokémon "reconnu" mais sans
        # candidat peut être un faux positif regex -- on retombe sur le
        # fuzzy plutôt que de conclure à tort.
        candidate = _poke_card(1, "Mega Rayquaza ex", "110", "pokemon-jp-storm-emeralda")
        monkeypatch.setattr("pricing.matching.fetch_pokemon_items_by_number", lambda number: [])
        monkeypatch.setattr("pricing.matching.fetch_items_by_name_tokens", lambda tokens, **k: [candidate])

        result = identify_card(text="Mega Rayquaza EX 110/078 Storm Emerald")

        assert result.status == "matched"
        assert result.strategy == "fuzzy_name_rarity"

    def test_image_url_falls_back_to_ocr_then_code_lookup(self, monkeypatch):
        card = _card(1, "Izo", "ST22-002")
        monkeypatch.setattr("pricing.matching.extract_text_from_image",
                             lambda url: "IZO ST22-002 SR ONE PIECE FOIL LP")
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [card])

        result = identify_card(image_url="https://example.com/listing.jpg")

        assert result.status == "matched"
        assert result.card is card

    def test_image_url_with_no_ocr_text_is_not_found(self, monkeypatch):
        monkeypatch.setattr("pricing.matching.extract_text_from_image", lambda url: None)

        result = identify_card(image_url="https://example.com/listing.jpg")

        assert result.status == "not_found"
        assert result.message is not None and "ocr" in result.message.lower()

    def test_text_takes_priority_over_image_url(self, monkeypatch):
        card = _card(1, "Izo", "ST22-002")
        monkeypatch.setattr("pricing.matching.fetch_items_by_code", lambda code: [card])
        called = []
        monkeypatch.setattr("pricing.matching.extract_text_from_image", lambda url: called.append(url))

        result = identify_card(text="IZO ST22-002 SR", image_url="https://example.com/listing.jpg")

        assert result.status == "matched"
        assert not called  # OCR jamais appelé quand text est fourni

    def test_nothing_provided_is_not_found(self):
        result = identify_card()
        assert result.status == "not_found"
