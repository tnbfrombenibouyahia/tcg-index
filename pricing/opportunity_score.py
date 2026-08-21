"""Score d'opportunité 0-100 affiché dans la jauge de l'extension.

DISTINCT de la table `opportunity_scores` (§06 du handoff) : celle-ci est un
signal structurel site-only (rareté x popularité du personnage vs marché,
recalculé chaque nuit, table dédiée). Celui-ci est le signal ponctuel de
l'extension (signal A), recalculé à chaque /verdict à partir de ce qui est
déjà connu au moment de la requête : écart vs marché, liquidité, confiance
d'identification. Formule volontairement simple et documentée ici -- une
seule implémentation, jamais côté extension (chaque chiffre affiché doit
avoir une source traçable).
"""
import os

# Poids modifiables par env, même pattern que shared/verdict.py::classify
# (VERDICT_*_MAX_RATIO) -- override possible sans redéploiement pour ajuster
# le mix en prod.
_DEFAULT_WEIGHT_PRICE = 0.6
_DEFAULT_WEIGHT_LIQUIDITY = 0.25
_DEFAULT_WEIGHT_CONFIDENCE = 0.15

_LIQUID_MIN_PER_MONTH = 3.0  # même seuil que pricing/liquidity.py -- score plafonné au-delà


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _price_component(ratio: float) -> float:
    """ratio = prix_affiché / prix_référence (même ratio que
    shared/verdict.py::classify). 50 = prix pile au marché ; chaque point de
    remise/majoration de 1% déplace le score de 2 points -- calibré pour que
    les bornes vert/jaune de classify() (ratio 0.85 / 1.15) tombent
    respectivement autour de 80 et 20."""
    discount = 1 - ratio
    return _clamp(50 + discount * 200)


def _liquidity_component(sales_per_month: float) -> float:
    """Continu, pas 3 paliers bruts -- une carte à 2.9 ventes/mois ne doit
    pas décrocher brutalement du seuil 'liquide' (3.0). Plafonné à
    _LIQUID_MIN_PER_MONTH : au-delà, plus de ventes/mois n'ajoute rien
    (déjà pleinement liquide)."""
    return _clamp(100 * min(sales_per_month, _LIQUID_MIN_PER_MONTH) / _LIQUID_MIN_PER_MONTH)


def compute_opportunity_score(ratio: float, sales_per_month: float, confidence: float, *,
                               weight_price: float | None = None,
                               weight_liquidity: float | None = None,
                               weight_confidence: float | None = None) -> int:
    """0-100, entier (affichage jauge). `confidence` = confiance
    d'identification issue de pricing.matching (0-1) -- une bonne affaire
    sur un match incertain compte moins qu'une bonne affaire sur un match
    exact. `ratio` et `sales_per_month` sont déjà calculés en amont
    (shared/verdict.py::classify, pricing/liquidity.py::compute_liquidity) --
    jamais recalculés ici, une seule source de vérité par valeur."""
    w_price = weight_price if weight_price is not None else float(
        os.environ.get("OPPORTUNITY_WEIGHT_PRICE", _DEFAULT_WEIGHT_PRICE))
    w_liquidity = weight_liquidity if weight_liquidity is not None else float(
        os.environ.get("OPPORTUNITY_WEIGHT_LIQUIDITY", _DEFAULT_WEIGHT_LIQUIDITY))
    w_confidence = weight_confidence if weight_confidence is not None else float(
        os.environ.get("OPPORTUNITY_WEIGHT_CONFIDENCE", _DEFAULT_WEIGHT_CONFIDENCE))

    score = (
        w_price * _price_component(ratio)
        + w_liquidity * _liquidity_component(sales_per_month)
        + w_confidence * _clamp(confidence * 100)
    )
    return round(_clamp(score))
