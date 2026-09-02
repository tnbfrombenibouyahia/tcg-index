"""Classification vert/jaune/rouge d'un prix affiché face à un prix de
référence marché, à grade équivalent.

La partie pure (median_reference_price, classify) n'a aucune dépendance
DB/HTTP -- réutilisable telle quelle, testable sans environnement. Seule
compute_verdict_for_card importe `pricing.*` : elle orchestre matching de
prix + calcul, placée ici à la demande explicite (réutilisable par
pricing_api/ ET un futur script batch), même si cela introduit une
dépendance shared -> pricing inhabituelle pour ce module (shared/db.py et
shared/sync_log.py n'ont aujourd'hui aucune dépendance vers leurs frères).
"""
import os
import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta

from pricing.active_listings_source import get_active_listing_count
from pricing.cache import get_price_with_cache
from pricing.grading_roi import GradingRoiInputs
from pricing.liquidity import LiquidityMetrics, compute_liquidity
from pricing.models import Card, PriceQuote
from pricing.opportunity_score import compute_opportunity_score
from pricing.repository import (
    count_sales_since,
    fetch_card_by_id,
    fetch_grading_roi_inputs,
    fetch_language_siblings,
    fetch_language_variants_loose,
    fetch_latest_price_snapshot,
    fetch_population_snapshot_before,
    fetch_population_snapshot_latest,
    fetch_recent_sales,
    fetch_sales_window_stats,
    fetch_sealed_display_for_set,
    fetch_set_rank_by_price,
)
from pricing.sales_stats import SalesStats, compute_sales_stats
from pricing.sources.base import PriceSource
from pricing.sources.pricecharting_source import PriceChartingSource

_LIQUIDITY_WINDOW_DAYS = 90

_DEFAULT_GREEN_MAX_RATIO = 0.85
_DEFAULT_YELLOW_MAX_RATIO = 1.15


@dataclass
class Verdict:
    label: str  # 'green' | 'yellow' | 'red'
    ratio: float
    reference_price: float
    displayed_price: float
    grade: str


@dataclass
class VerdictOutcome:
    status: str  # 'ok' | 'card_not_found' | 'no_reference_price'
    card: Card | None = None
    verdict: Verdict | None = None
    sources_compared: list[PriceQuote] = field(default_factory=list)


def median_reference_price(prices: list[float]) -> float | None:
    """None si `prices` est vide -- pas d'exception, l'appelant décide."""
    return statistics.median(prices) if prices else None


def classify(displayed_price: float, reference_price: float, grade: str, *,
             green_max_ratio: float | None = None, yellow_max_ratio: float | None = None) -> Verdict:
    """Seuils lus depuis .env si non fournis (VERDICT_GREEN_MAX_RATIO /
    VERDICT_YELLOW_MAX_RATIO) -- paramétrables explicitement pour les tests,
    sans dépendance à l'environnement dans les cas unitaires. Bornes exactes
    conformes à la spec : vert strictement sous green_max, jaune inclusif
    jusqu'à yellow_max, rouge strictement au-dessus."""
    if green_max_ratio is None:
        green_max_ratio = float(os.environ.get("VERDICT_GREEN_MAX_RATIO", _DEFAULT_GREEN_MAX_RATIO))
    if yellow_max_ratio is None:
        yellow_max_ratio = float(os.environ.get("VERDICT_YELLOW_MAX_RATIO", _DEFAULT_YELLOW_MAX_RATIO))

    ratio = displayed_price / reference_price
    if ratio < green_max_ratio:
        label = "green"
    elif ratio <= yellow_max_ratio:
        label = "yellow"
    else:
        label = "red"
    return Verdict(label=label, ratio=ratio, reference_price=reference_price,
                    displayed_price=displayed_price, grade=grade)


def compute_verdict_for_card(displayed_price: float, card_id: int, grade: str = "ungraded", *,
                              sources: list[PriceSource] | None = None,
                              ttl_hours: float | None = None) -> VerdictOutcome:
    """Fonction demandée par la spec (section 3) : (prix_affiché, card_id,
    grade) -> verdict. Compare TOUJOURS à grade équivalent (le paramètre
    `grade` est propagé tel quel à chaque source, jamais de fallback vers un
    autre grade). `sources` par défaut = [PriceChartingSource()] (seule
    source branchée en MVP, cf. pricing/sources/) -- injectable pour les
    tests ou pour étendre plus tard sans changer la signature.

    LIMITE CONNUE (non traitée dans cette itération) : aucune conversion de
    devise -- si les sources renvoient des devises différentes entre elles,
    ou différentes de celle du prix affiché, la médiane mélange des montants
    non comparables. PriceCharting (seule source MVP) est exclusivement en
    USD -- acceptable tant qu'une seule source est branchée, à corriger
    avant d'en ajouter une 2e dans une devise différente (ex. CardMarket,
    EUR)."""
    card = fetch_card_by_id(card_id)
    if card is None:
        return VerdictOutcome(status="card_not_found")

    active_sources = sources if sources is not None else [PriceChartingSource()]
    quotes = []
    for source in active_sources:
        quote = get_price_with_cache(card, grade, source, ttl_hours=ttl_hours)
        if quote is not None:
            quotes.append(quote)

    reference = median_reference_price([q.price for q in quotes])
    if reference is None:
        return VerdictOutcome(status="no_reference_price", card=card, sources_compared=quotes)

    verdict = classify(displayed_price, reference, grade)
    return VerdictOutcome(status="ok", card=card, verdict=verdict, sources_compared=quotes)


@dataclass
class LanguageComparisonEntry:
    language: str
    card_id: int
    price: float | None      # None si aucun prix connu pour cette langue -- jamais deviné
    currency: str | None
    is_current_listing: bool
    # Page produit PriceCharting exacte pour CETTE langue -- None si pas
    # (encore) résolue, cf. _build_language_comparison. Sert au bouton de
    # double-vérification "Voir la version <langue>" du panneau extension
    # (demande utilisateur 2026-08-23) -- jamais un lien de recherche
    # deviné, même garde que renderPriceChartingLink côté extension.
    url: str | None = None


@dataclass
class PopulationSignal:
    """"Population par note" du panneau extension (maquette "CardQuant
    Panel", cf. mémoire projet "cardquant-rebrand") -- dernier
    population_snapshots connu pour CETTE carte précise (pas le set), mêmes
    5 paliers que le Terminal (PSA10/9/8/7/≤6, cf.
    web/components/cardquant/population/GradeDistributionPanel.tsx) --
    volontairement PAS les 4 paliers de la maquette d'origine (qui groupait
    "≤ PSA 7"), pour un vocabulaire identique Terminal/extension plutôt
    qu'un recoupage différent des mêmes colonnes selon l'écran.
    `grade10_delta_30d`/`premium_10_9` : None si non calculable (pas de
    snapshot assez ancien / pas de prix psa9 connu à ce jour) -- jamais
    deviné."""
    captured_at: date
    grade10: int
    grade9: int
    grade8: int
    grade7: int
    grade6: int
    total: int
    gem_rate_pct: float | None
    grade10_delta_30d: int | None
    premium_10_9: float | None


@dataclass
class VolumeDivergenceSignal:
    """"Divergence prix / volume" du panneau extension -- compare le nb de
    ventes et le prix médian sur les 30 derniers jours à la fenêtre des 30
    jours précédents (même grade que la consultation en cours, cf.
    _compute_volume_divergence). Champs `*_pct` à None quand la fenêtre de
    référence (`prior_*`) est vide -- un pourcentage contre un dénominateur
    nul n'aurait aucun sens, jamais affiché comme "+∞%" ou "0%"."""
    recent_sales: int
    prior_sales: int
    volume_delta_pct: float | None
    recent_median_price: float | None
    prior_median_price: float | None
    price_delta_pct: float | None


@dataclass
class SetPositionSignal:
    """"Positionnement dans le set" du panneau extension -- rang par prix
    ungraded décroissant parmi les singles du même set qui ont eux-mêmes un
    prix connu (cf. pricing/repository.py::fetch_set_rank_by_price)."""
    rank: int
    total: int


@dataclass
class ExtendedSignals:
    """Signaux de la maquette extension au-delà du verdict ponctuel : score
    d'opportunité, moy. ventes, liquidité, comparaison par langue, prix du
    display scellé, population par note, divergence prix/volume,
    positionnement dans le set. Séparé de VerdictOutcome à dessein (cf.
    compute_extended_signals)."""
    opportunity_score: int | None = None
    sales_stats: SalesStats | None = None
    liquidity: LiquidityMetrics | None = None
    language_comparison: list[LanguageComparisonEntry] = field(default_factory=list)
    sealed_display_price: PriceQuote | None = None
    grading_roi_inputs: GradingRoiInputs | None = None
    population: PopulationSignal | None = None
    volume_divergence: VolumeDivergenceSignal | None = None
    set_position: SetPositionSignal | None = None


def _build_language_comparison(card: Card, grade: str, *, current_price: float | None,
                                current_url: str | None = None) -> list[LanguageComparisonEntry]:
    """La ligne de la langue courante réutilise `current_price`/`current_url`
    (déjà calculés par compute_verdict_for_card -- source PriceCharting
    live, plus fraîche qu'un price_snapshot nocturne) plutôt que de
    re-requêter ; les langues sœurs n'ont pas de verdict en cours,
    price_snapshots (dernier connu) reste leur seule source de PRIX ici.
    Carte sans équivalent dans une langue donnée -> pas de ligne pour elle
    (pas de fabrication d'une entrée à 0).

    `url` de chaque langue sœur : résolue séparément via un 2e appel
    PriceChartingSource (même source, même cache TTL que la carte courante,
    cf. pricing/cache.py) -- price_snapshots ne stocke aucune URL (table
    alimentée par le batch nocturne, cf. db/schema.sql), impossible d'en
    déduire une sans un appel dédié. Coût borné par le cache : un scrape
    réseau seulement la première fois par langue sœur/grade, jamais répété
    avant expiration du TTL (par défaut 12h, cf. pricing/cache.py).

    Cet appel se fait TOUJOURS au grade 'ungraded', jamais `grade` (le
    paramètre de cette fonction) -- demande utilisateur (2026-08-23) : le
    bouton de vérification de la langue sœur disparaissait pour une carte
    consultée à un grade PSA précis (ex. psa9.5) dès que CE grade précis
    n'a pas de prix listé sur la page PriceCharting de la langue sœur (peu
    de ventes à cette note, cf. PriceChartingSource.fetch_price -- qui
    renvoie None, URL comprise, dès que le prix du grade demandé manque,
    même quand la page produit elle-même a bien été retrouvée). La page
    produit PriceCharting est pourtant UNE SEULE ET MÊME URL quel que soit
    le grade consulté dessus, et son prix 'ungraded' (le "loose price" en
    tête de page) est quasi toujours renseigné dès qu'une ligne existe --
    l'interroger systématiquement en 'ungraded' ici maximise donc les
    chances de récupérer le lien, SANS jamais changer le prix affiché par
    ailleurs pour cette langue sœur (qui reste price_snapshots, cf.
    ci-dessus -- ce 2e appel ne sert QU'À l'URL).

    Repli "lien seul" (fetch_language_variants_loose) après les siblings
    stricts -- demande utilisateur (2026-08-23) : certaines cartes n'ont
    AUCUN sibling au sens strict (même set_code) mais une autre impression
    du même code existe bien chez PriceCharting dans l'autre langue,
    vérifié en base sur un cas réel (compilation EN "The Best" sans ligne
    JP cataloguée sous ce set_code exact). Ce repli n'ajoute JAMAIS de prix
    (price=None, currency=None) -- seulement un lien à vérifier soi-même,
    jamais une valeur qui pourrait représenter le mauvais tirage. Sauté
    entièrement pour une langue déjà couverte par un sibling strict (pas de
    doublon), et pour toute langue où même ce repli ne résout aucune URL
    (rien à proposer)."""
    current = LanguageComparisonEntry(
        language=card.language, card_id=card.id,
        price=current_price, currency="USD" if current_price is not None else None,
        is_current_listing=True, url=current_url,
    )
    entries = [current]
    covered_languages = {card.language}

    for sibling in fetch_language_siblings(card):
        snapshot = fetch_latest_price_snapshot(sibling.id, grade)
        price, currency = snapshot if snapshot is not None else (None, None)
        sibling_quote = get_price_with_cache(sibling, "ungraded", PriceChartingSource())
        entries.append(LanguageComparisonEntry(
            language=sibling.language, card_id=sibling.id, price=price, currency=currency,
            is_current_listing=False, url=sibling_quote.url if sibling_quote else None,
        ))
        covered_languages.add(sibling.language)

    for variant in fetch_language_variants_loose(card):
        if variant.language in covered_languages:
            continue
        variant_quote = get_price_with_cache(variant, "ungraded", PriceChartingSource())
        if not variant_quote or not variant_quote.url:
            continue
        entries.append(LanguageComparisonEntry(
            language=variant.language, card_id=variant.id, price=None, currency=None,
            is_current_listing=False, url=variant_quote.url,
        ))
        covered_languages.add(variant.language)

    return entries


_POPULATION_DELTA_WINDOW_DAYS = 30
_VOLUME_DIVERGENCE_WINDOW_DAYS = 30


def _compute_population_signal(item_id: int) -> PopulationSignal | None:
    latest = fetch_population_snapshot_latest(item_id)
    if latest is None:
        return None
    captured_at, g10, g9, g8, g7, g6, total = latest
    gem_rate_pct = (g10 / total * 100) if total > 0 else None

    prior = fetch_population_snapshot_before(item_id, captured_at - timedelta(days=_POPULATION_DELTA_WINDOW_DAYS))
    grade10_delta_30d = (g10 - prior[1]) if prior is not None else None

    # Prime PSA 10 / 9 -- prix gradés directs (price_snapshots), PAS
    # grading_roi_inputs.grade_prices : ce dernier n'est matérialisé que par
    # le run --tier (cf. fetch_grading_roi_inputs), une couverture bien plus
    # étroite que price_snapshots pour un simple ratio de prime.
    psa10 = fetch_latest_price_snapshot(item_id, "psa10")
    psa9 = fetch_latest_price_snapshot(item_id, "psa9")
    premium_10_9 = (psa10[0] / psa9[0]) if psa10 and psa9 and psa9[0] > 0 else None

    return PopulationSignal(
        captured_at=captured_at, grade10=g10, grade9=g9, grade8=g8, grade7=g7, grade6=g6, total=total,
        gem_rate_pct=gem_rate_pct, grade10_delta_30d=grade10_delta_30d, premium_10_9=premium_10_9,
    )


def _compute_volume_divergence(item_id: int, grade: str) -> VolumeDivergenceSignal | None:
    today = date.today()
    recent_start = today - timedelta(days=_VOLUME_DIVERGENCE_WINDOW_DAYS)
    prior_start = today - timedelta(days=2 * _VOLUME_DIVERGENCE_WINDOW_DAYS)
    recent_count, recent_median = fetch_sales_window_stats(item_id, grade, recent_start, today + timedelta(days=1))
    prior_count, prior_median = fetch_sales_window_stats(item_id, grade, prior_start, recent_start)
    if recent_count == 0 and prior_count == 0:
        return None  # rien à comparer sur les deux fenêtres -- pas de signal plutôt qu'un "0%" trompeur

    volume_delta_pct = ((recent_count - prior_count) / prior_count * 100) if prior_count > 0 else None
    price_delta_pct = (
        ((recent_median - prior_median) / prior_median * 100)
        if recent_median is not None and prior_median is not None and prior_median > 0 else None
    )
    return VolumeDivergenceSignal(
        recent_sales=recent_count, prior_sales=prior_count, volume_delta_pct=volume_delta_pct,
        recent_median_price=recent_median, prior_median_price=prior_median, price_delta_pct=price_delta_pct,
    )


def _compute_set_position(card: Card) -> SetPositionSignal | None:
    # Positionnement dans un SET n'a de sens que pour un single (le scellé
    # n'appartient pas à un classement "carte par carte") -- même garde que
    # sealed_display_price/grading_roi_inputs plus bas, sens inverse.
    if card.category != "single" or not card.set_code:
        return None
    result = fetch_set_rank_by_price(card.id, card.tcg, card.set_code)
    return SetPositionSignal(rank=result[0], total=result[1]) if result else None


def compute_extended_signals(card: Card, grade: str, *, displayed_price: float | None = None,
                              reference_price: float | None = None, reference_url: str | None = None,
                              confidence: float = 1.0) -> ExtendedSignals:
    """Signaux additionnels de la maquette extension -- délibérément séparé
    de compute_verdict_for_card : celui-ci reste focalisé "prix vs
    référence" (réutilisable par un futur script batch qui n'a besoin
    d'aucun de ces signaux), celui-ci fait les requêtes DB en plus
    seulement quand l'appelant (pricing_api) en a besoin.

    `reference_price` : prix de référence PriceCharting déjà calculé par
    compute_verdict_for_card/classify() (outcome.verdict.reference_price) --
    None si status='no_reference_price'. Sert à la ligne "cette annonce" de
    la comparaison par langue (prix PriceCharting live, cf.
    _build_language_comparison) et de dernier repli pour le score
    d'opportunité si aucune vente récente n'est connue (cf. plus bas).
    `reference_url` : page produit PriceCharting de CETTE carte (même
    origine que reference_price, cf. outcome.sources_compared côté
    appelant) -- transmise telle quelle à la ligne "cette annonce" de la
    comparaison par langue, jamais re-résolue ici.
    `displayed_price` : prix affiché sur l'annonce (VerdictRequest.displayed_price,
    déjà en USD) -- combiné à `reference_price`/aux ventes récentes pour le
    score d'opportunité, cf. plus bas.
    `confidence` : confiance d'identification (pricing.matching), 0-1."""
    recent_sales = fetch_recent_sales(card.id, grade)
    sales_stats = compute_sales_stats(recent_sales)

    sales_last_90d = count_sales_since(card.id, grade, date.today() - timedelta(days=_LIQUIDITY_WINDOW_DAYS))
    # active_listings n'a que 2 valeurs de `grade` possibles en base :
    # 'ungraded' ou 'graded' (toutes notes confondues, cf.
    # ingestion/sources/ebay.py -- eBay ne permet pas de filtrer sur une
    # note précise). Une carte consultée à un grade PSA précis
    # (psa7..psa10) doit donc chercher sous 'graded', jamais sous son grade
    # exact qui n'existera jamais dans cette table -- toujours None sinon,
    # même si des annonces gradées existent bien.
    #
    # get_active_listing_count (pas fetch_latest_active_listing_count) :
    # pour un single, scrape À LA DEMANDE si pas déjà fait aujourd'hui (cf.
    # pricing/active_listings_source.py) -- remplace le 2026-08-22 un batch
    # par rotation jugé trop lent (~5 semaines/cycle) après retour
    # utilisateur. Le scellé, lui, continue de lire simplement le batch
    # hebdomadaire existant (même fonction en interne, aucun changement de
    # comportement pour lui).
    active_listings_grade = grade if grade == "ungraded" else "graded"
    active_listings = get_active_listing_count(card, active_listings_grade)
    liquidity = compute_liquidity(sales_last_90d, active_listings)

    language_comparison = _build_language_comparison(card, grade, current_price=reference_price, current_url=reference_url)

    sealed_display_price = None
    if card.category == "single":
        display_item = fetch_sealed_display_for_set(card.tcg, card.set_code, card.language)
        if display_item is not None:
            snapshot = fetch_latest_price_snapshot(display_item.id, "ungraded")
            if snapshot is not None:
                price, currency = snapshot
                sealed_display_price = PriceQuote(source="price_snapshots", grade="ungraded",
                                                    price=price, currency=currency)

    # Score d'opportunité : compare le prix affiché à ce qui s'est
    # RÉELLEMENT vendu récemment (médiane sur fenêtre adaptative de 3-5
    # ventes -- repli moy. 10 dernières si l'échantillon récent est vide,
    # repli reference_price PriceCharting en dernier recours si aucune vente
    # connue), PLUTÔT que reference_price seul comme avant -- demande
    # utilisateur (2026-08-23) : reference_price (prix PriceCharting du
    # moment, "catalogue"/demandé, pas forcément un prix réellement conclu)
    # pouvait afficher un score "Bonne affaire" alors que le prix affiché
    # était nettement AU-DESSUS de la moyenne des ventes réelles récentes
    # affichée juste au-dessus dans le panneau ("Analyse de prix") -- les
    # deux chiffres se contredisaient sans explication. Le verdict
    # vert/jaune/rouge (Verdict.label, cf. classify() plus haut) N'EST PAS
    # touché ici : il continue de comparer à reference_price, volontairement
    # inchangé (signal ponctuel déjà documenté séparément) -- seul le score
    # continu 0-100 change de référence.
    #
    # `median_recent` plutôt qu'une moyenne arithmétique fixe des 3
    # dernières ventes (2026-08-28, cf. pricing/sales_stats.py pour le détail
    # et la validation empirique) : une moyenne se fait fausser en entier par
    # une seule vente aberrante (ex. mauvais tirage/état mal classé par la
    # source) au milieu d'un échantillon de 3 -- la médiane neutralise cette
    # valeur isolée. Fenêtre étendue à 5 ventes quand elles restent proches
    # en date (<=180j de la 3e) pour plus de robustesse statistique sans
    # mélanger une vraie tendance de marché ancienne au signal "récent" sur
    # les cartes peu liquides.
    opportunity_reference = sales_stats.median_recent
    if opportunity_reference is None:
        opportunity_reference = sales_stats.avg_last_10
    if opportunity_reference is None:
        opportunity_reference = reference_price

    opportunity_ratio = (
        displayed_price / opportunity_reference
        if displayed_price is not None and opportunity_reference else None
    )
    opportunity_score = (
        compute_opportunity_score(opportunity_ratio, liquidity.sales_per_month, confidence)
        if opportunity_ratio is not None else None
    )

    # La gradation ne concerne que les singles (le scellé n'a pas de notion
    # de note PSA) -- même garde que sealed_display_price ci-dessus, sens
    # inverse. None si `grading_roi_inputs` n'a pas encore été matérialisé
    # pour cet item (rempli par run --tier seulement, cf.
    # index/grading_roi_inputs.py) : le calculateur reste alors indisponible
    # côté extension plutôt que d'afficher un ROI inventé.
    grading_roi_inputs = fetch_grading_roi_inputs(card.id) if card.category == "single" else None

    population = _compute_population_signal(card.id)
    volume_divergence = _compute_volume_divergence(card.id, grade)
    set_position = _compute_set_position(card)

    return ExtendedSignals(
        opportunity_score=opportunity_score,
        sales_stats=sales_stats,
        liquidity=liquidity,
        language_comparison=language_comparison,
        sealed_display_price=sealed_display_price,
        grading_roi_inputs=grading_roi_inputs,
        population=population,
        volume_divergence=volume_divergence,
        set_position=set_position,
    )
