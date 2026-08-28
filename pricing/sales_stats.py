"""Statistiques de ventes récentes (médiane récente / moy. 10 dernières
ventes) -- pure, à partir d'une liste déjà triée par
pricing/repository.py::fetch_recent_sales (la plus récente en premier).
Jamais de requête ici : séparé de la lecture DB comme
median_reference_price/classify le sont déjà dans shared/verdict.py.
"""
import statistics
from dataclasses import dataclass
from datetime import date

# Fenêtre adaptative (remplace le 2026-08-28 une moyenne fixe des 3
# dernières ventes, cf. mémoire projet) : base de 3 ventes, étendue à 4 puis
# 5 SEULEMENT si ces ventes supplémentaires restent proches en date de la
# 3e (l'ancre) -- jamais de "aujourd'hui", une carte peu échangée n'ayant
# souvent aucune vente récente au sens calendaire.
_RECENT_WINDOW_MIN = 3
_RECENT_WINDOW_MAX = 5
_RECENT_WINDOW_MAX_GAP_DAYS = 180


@dataclass
class SalesStats:
    median_recent: float | None
    avg_last_10: float | None
    sample_size_recent: int  # taille réelle de la fenêtre adaptative -- entre 0 et 5
    sample_size_10: int      # idem, peut être < 10 ; jamais masqué à l'appelant
    currency: str | None     # None si aucune vente exploitable


def _adaptive_recent_window(sales_same_currency: list[tuple[float, date]]) -> list[float]:
    """`sales_same_currency` : (price, sale_date), déjà filtrées sur une
    seule devise, triées la plus récente d'abord.

    Fenêtre de base = 3 premières ventes (comportement inchangé si <3
    ventes connues -- dégrade proprement à ce qu'il y a). Les ventes #4 et
    #5 ne rejoignent la fenêtre que si elles restent à <= 180 jours de la
    3e vente (l'ancre, pas la plus récente ni aujourd'hui) : au-delà, ce
    n'est plus un point de "maintenant" mais une vraie tendance de marché
    sur une carte peu liquide -- les y mélanger biaiserait le signal au
    lieu de le robustifier.

    Validé en conditions réelles le 2026-08-28 (cf. mémoire projet) : sur
    l'ensemble de la table `sales`, comparé à price_snapshots (référence
    indépendante, non dérivée des ventes) -- médiane de 5 ventes bat
    nettement médiane de 3 quand l'écart 3e->5e vente est <180j, mais PERD
    contre médiane de 3 au-delà (13,7% d'écart moyen à la référence pour
    médiane-3 vs 22,2% pour médiane-5 sur les groupes à ventes espacées de
    plus d'un an)."""
    if len(sales_same_currency) < _RECENT_WINDOW_MIN:
        return [price for price, _ in sales_same_currency]

    base = sales_same_currency[:_RECENT_WINDOW_MIN]
    anchor_date = base[-1][1]
    window = list(base)
    for price, sale_date in sales_same_currency[_RECENT_WINDOW_MIN:_RECENT_WINDOW_MAX]:
        if (anchor_date - sale_date).days > _RECENT_WINDOW_MAX_GAP_DAYS:
            break
        window.append((price, sale_date))
    return [price for price, _ in window]


def compute_sales_stats(recent_sales: list[tuple[float, str, date]]) -> SalesStats:
    """`recent_sales` : (price, currency, sale_date), triées la plus
    récente d'abord, déjà limitées à N côté requête (cf. fetch_recent_sales).
    Ne mélange jamais deux devises dans un même calcul -- même principe que
    shared/verdict.py::compute_verdict_for_card (LIMITE CONNUE documentée là
    aussi) : ne garde que les ventes dans la devise de la plus récente, les
    autres sont ignorées plutôt que fondues dans le calcul.

    `median_recent` : médiane sur la fenêtre adaptative de 3-5 ventes (cf.
    _adaptive_recent_window) -- remplace le 2026-08-28 une moyenne
    arithmétique fixe des 3 dernières ventes (`avg_last_3`), qu'une seule
    vente aberrante au milieu d'un échantillon de 3 suffisait à fausser
    entièrement (cas réel : carte Roronoa Zoro OP06-118 [Alternate Art
    Manga], vente à $30,64 mêlée à des ventes à $1475/$1750/$1999 -- une
    vente d'un tirage/état visiblement différent mal classée par la source,
    cf. mémoire projet). La médiane neutralise ce genre de valeur isolée
    sans supprimer aucune ligne de `sales`, contrairement à un filtre en
    amont qui devrait deviner laquelle est fausse.

    `avg_last_10` reste une moyenne arithmétique simple, inchangée -- sert
    de repli plus généreux (shared/verdict.py::compute_extended_signals),
    pas le signal principal."""
    if not recent_sales:
        return SalesStats(median_recent=None, avg_last_10=None, sample_size_recent=0, sample_size_10=0, currency=None)

    currency = recent_sales[0][1]
    same_currency = [(price, sale_date) for price, cur, sale_date in recent_sales if cur == currency]
    prices = [price for price, _ in same_currency]

    recent_window = _adaptive_recent_window(same_currency)
    last_10 = prices[:10]
    return SalesStats(
        median_recent=statistics.median(recent_window) if recent_window else None,
        avg_last_10=statistics.fmean(last_10) if last_10 else None,
        sample_size_recent=len(recent_window),
        sample_size_10=len(last_10),
        currency=currency,
    )
