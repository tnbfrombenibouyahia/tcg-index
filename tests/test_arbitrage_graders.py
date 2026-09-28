"""Tests de arbitrage/graders.py : lecture grader + note dans un titre d'annonce."""
import pytest

from arbitrage.graders import Slab, parse_slab


class TestParseSlab:
    @pytest.mark.parametrize("title,expected", [
        ("Pikachu 25/165 BGS 9.5 Gem Mint", Slab("bgs", 9.5, False)),
        ("Charizard 4/102 CGC 10 Pristine", Slab("cgc", 10.0, False)),
        ("Charizard CGC Pristine 10", Slab("cgc", 10.0, False)),
        ("Dracaufeu Beckett 9,5 Base Set", Slab("bgs", 9.5, False)),
        ("Beckett Gem Mint 9.5 Charizard", Slab("bgs", 9.5, False)),
        ("Charizard BGS10", Slab("bgs", 10.0, False)),
        ("Charizard PSA10 Holo", Slab("psa", 10.0, False)),
        ("charizard psa 9 base set", Slab("psa", 9.0, False)),
        ("Luffy OP05-119 Beckett Gold Label 9.5", Slab("bgs", 9.5, False)),
    ])
    def test_reads_grader_and_grade(self, title, expected):
        assert parse_slab(title) == expected

    def test_black_label_flagged_premium(self):
        slab = parse_slab("Charizard BGS 10 Black Label")
        assert slab == Slab("bgs", 10.0, True)

    def test_cgc_perfect_10_flagged_premium(self):
        slab = parse_slab("Charizard CGC Perfect 10")
        assert slab == Slab("cgc", 10.0, True)

    @pytest.mark.parametrize("title", [
        None,
        "",
        "Charizard 4/102 Base Set holo",                 # aucun grader
        "Charizard CGC 9 comparable PSA 10",             # deux graders : ambigu
        "Charizard BGS 9.5 (BGS 10 sur la photo)",       # deux notes pour le même grader
        "CGC 2023 Pokemon Charizard",                    # année, pas une note
        "Charizard BGS 9.7",                             # pas un demi-point valide
        "Charizard BGS 11",                              # hors plage
        "Charizard CGCards",                             # grader collé à un mot
    ])
    def test_returns_none_when_unreadable_or_ambiguous(self, title):
        assert parse_slab(title) is None
