"""Formules du calcul d'indice -- la partie « cœur de valeur » du projet
(cf. handoff doc, section 8). Fonctions pures, pas d'accès DB ici (ça, c'est
le rôle de calculate.py).

Méthode : indice chaîné équipondéré par rendements moyens journaliers, comme
les indices actions équipondérés (S&P Equal Weight, Value Line...). Chaque
jour, l'indice avance de la moyenne des variations relatives de prix des
items présents à la fois la veille et le jour même :

    I[t] = I[t-1] * (1 + moyenne_i(r_i))   où r_i = (P_i[t] - P_i[t-1]) / P_i[t-1]

Le chaînage est intrinsèque à la formule : un item qui entre dans l'univers
(nouveau set) ne contribue simplement pas tant qu'il n'a pas 2 jours
consécutifs de prix -- pas de saut à corriger après coup. Un item qui
disparaît (rupture, set retiré) sort silencieusement le jour suivant. Pas de
« facteur de chaînage » à calculer ou maintenir séparément, contrairement à
un indice à panier fixe rebasé périodiquement.

Le premier jour où un sous-indice a des données devient sa base 100 --
aucune date de référence figée en dur : si l'historique brut est un jour
entièrement rejoué (re-scrapé), le calcul repart naturellement de son propre
jour 1, sans code à toucher.
"""

BASE_VALUE = 100.0

# index_code -> filtre (tcg, category) sur `items`. `category: None` = pas de
# filtre, scellé + cartes regroupés dans un seul panier équipondéré.
#
# Deux niveaux, pensés pour un site grand public (pas un outil d'analyse) :
# - niveau 1, le chiffre vitrine : PKM_GLOBAL / OP_GLOBAL, "l'état du marché"
#   en un coup d'œil. Rien de spécial à calculer -- même formule que les
#   autres, juste un panier plus large (tout le TCG, pas une catégorie).
#   Les rendements % agrégés déjà utilisés partout ici gomment le problème
#   "un display à 90€ et une carte à 3€" : une variation de +5% compte pareil
#   pour les deux, peu importe le prix affiché.
# - niveau 2, le détail : les 4 sous-indices par catégorie, pour qui veut
#   comprendre *pourquoi* le chiffre vitrine a bougé (cf. handoff §8 --
#   équipondéré *au sein de chaque catégorie*, sous-indices séparés).
#
# Le gradé (PSA7-10) n'alimente aucun de ces sous-indices (donc pas non plus
# les GLOBAL) : sa couverture est scopée aux sets récents seulement (cf.
# mémoire projet "grading_tiers"), pas assez large pour porter un indice pour
# l'instant. Deviendra un sous-indice à part (ex. PKM_SINGLES_PSA10) une fois
# la couverture élargie.
INDEX_DEFINITIONS: dict[str, dict[str, str | None]] = {
    "PKM_GLOBAL":  {"tcg": "pokemon",   "category": None},
    "PKM_SEALED":  {"tcg": "pokemon",   "category": "sealed"},
    "PKM_SINGLES": {"tcg": "pokemon",   "category": "single"},
    "OP_GLOBAL":   {"tcg": "one-piece", "category": None},
    "OP_SEALED":   {"tcg": "one-piece", "category": "sealed"},
    "OP_SINGLES":  {"tcg": "one-piece", "category": "single"},
}


def next_value(previous_value: float, avg_return: float | None) -> float:
    """Un pas de chaînage. `avg_return` à None (aucun item avec 2 jours
    consécutifs de prix ce jour-là -- gap de collecte) : l'indice reste flat
    plutôt que de planter ou d'inventer une valeur.
    """
    if avg_return is None:
        return previous_value
    return previous_value * (1 + avg_return)


def build_series(daily_stats: list[tuple]) -> list[tuple]:
    """daily_stats : [(captured_at, avg_return|None, constituents), ...]
    trié par date croissante (avg_return du tout premier jour toujours None
    -- pas de veille à comparer, c'est ce jour-là qui devient la base 100).

    Retourne [(captured_at, value, constituents), ...], même longueur/ordre.
    """
    series = []
    value = BASE_VALUE
    for i, (captured_at, avg_return, constituents) in enumerate(daily_stats):
        if i > 0:
            value = next_value(value, avg_return)
        series.append((captured_at, round(value, 4), constituents))
    return series
