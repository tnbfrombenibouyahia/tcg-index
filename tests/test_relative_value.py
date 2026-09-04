"""Tests de la logique pure de index/relative_value.py (aucune DB) --
_qualifier_bucket, _leave_one_out_median, score_peer_group. Même esprit que
les tests de pricing/ : fonctions pures isolées de l'IO, comportement
vérifié directement plutôt que via calculate_relative_value (qui touche la
DB, cf. son docstring)."""
from index.relative_value import _leave_one_out_median, _qualifier_bucket, score_peer_group


class TestQualifierBucket:
    def test_no_qualifier_returns_empty_bucket(self):
        assert _qualifier_bucket("Yamato") == ""

    def test_purely_numeric_qualifier_is_ignored(self):
        # "(055)" est un numéro apitcg, pas une variante -- même exclusion
        # que pricing/repository.py::_qualifier_tokens.
        assert _qualifier_bucket("Nico Robin (055)") == ""

    def test_same_variant_different_bracket_style_share_a_bucket(self):
        assert _qualifier_bucket("Nico Robin [SP]") == _qualifier_bucket("Nico Robin (055) (SP)")

    def test_different_variants_get_different_buckets(self):
        # Découvert sur données réelles (dry-run 2026-08-30, one-piece-ex
        # EB01) : "(Alternate Art)" et "[Alternate Art Manga]" ont des prix
        # réels très différents -- volontairement PAS fusionnés.
        plain = _qualifier_bucket("Tony Tony.Chopper (Alternate Art)")
        manga = _qualifier_bucket("Tony Tony.Chopper [Alternate Art Manga]")
        assert plain != manga

    def test_qualifier_word_order_does_not_matter(self):
        assert _qualifier_bucket("Card [Manga Alternate Art]") == _qualifier_bucket("Card (Alternate Art) (Manga)")


class TestLeaveOneOutMedian:
    def test_excludes_the_element_at_index(self):
        # médiane de [10, 20, 40] (l'élément à l'index 1, 30, exclu) = 20
        assert _leave_one_out_median([10, 30, 20, 40], 1) == 20

    def test_single_other_element_returns_it_directly(self):
        assert _leave_one_out_median([5, 99], 1) == 5


class TestScorePeerGroup:
    def test_cheap_card_relative_to_peers_scores_above_one(self):
        # 3 cartes à popularité de personnage identique (multiplier=1.0) :
        # une à 1$, deux pairs à 10$ -- la carte à 1$ doit ressortir avec un
        # score élevé (10/1 = 10, exactement la médiane des DEUX pairs
        # puisque leave-one-out sur 2 valeurs égales).
        cards = [
            {"market_price": 1.0, "character_multiplier": 1.0},
            {"market_price": 10.0, "character_multiplier": 1.0},
            {"market_price": 10.0, "character_multiplier": 1.0},
        ]
        scored = score_peer_group(cards)
        assert scored[0]["relative_value_score"] == 10.0
        assert scored[0]["peer_median_normalized"] == 10.0

    def test_card_does_not_contaminate_its_own_baseline(self):
        # La carte notée (1$) ne doit JAMAIS entrer dans son propre
        # peer_median -- si elle y entrait, la médiane des 3 valeurs
        # [1, 10, 10] serait 10 quand même ici (coïncidence de cet exemple),
        # donc on vérifie plutôt avec un groupe où l'inclusion changerait le
        # résultat : médiane de tout [1, 2, 100] = 2, médiane leave-one-out
        # de [2, 100] (carte à 1$ exclue) = 51 -- très différent.
        cards = [
            {"market_price": 1.0, "character_multiplier": 1.0},
            {"market_price": 2.0, "character_multiplier": 1.0},
            {"market_price": 100.0, "character_multiplier": 1.0},
        ]
        scored = score_peer_group(cards)
        assert scored[0]["peer_median_normalized"] == 51.0

    def test_character_multiplier_normalizes_popularity_before_comparing(self):
        # Personnage populaire (multiplier 1.0) à 10$ et personnage obscur
        # (multiplier 0.5) à 5$ ont le MÊME normalized_price (10$) -- sous
        # le modèle théorique, ce n'est PAS une sous-évaluation relative,
        # juste l'effet attendu de la popularité (cf. docstring du module).
        cards = [
            {"market_price": 10.0, "character_multiplier": 1.0},
            {"market_price": 5.0, "character_multiplier": 0.5},
        ]
        scored = score_peer_group(cards)
        assert scored[0]["normalized_price"] == scored[1]["normalized_price"] == 10.0
        assert scored[0]["relative_value_score"] == scored[1]["relative_value_score"] == 1.0

    def test_zero_normalized_price_never_divides_by_zero(self):
        cards = [
            {"market_price": 0.0, "character_multiplier": 1.0},
            {"market_price": 5.0, "character_multiplier": 1.0},
        ]
        scored = score_peer_group(cards)
        assert scored[0]["relative_value_score"] == 0.0
