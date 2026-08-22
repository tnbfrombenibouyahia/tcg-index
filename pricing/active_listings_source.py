"""Comptage d'annonces actives eBay pour un SINGLE, à la demande -- même
principe que pricing/sources/pricecharting_source.py pour le prix (scrape
live + cache), appliqué ici au comptage d'annonces plutôt qu'au prix.

Remplace le 2026-08-22 un premier essai en batch par rotation (~5
semaines/cycle pour couvrir tout le pool de 68 202 singles, cf. l'ancien
ingestion/orchestrator.py::run_ebay_singles_listings_sync, retiré) : rejeté
après une semaine d'usage réel, un chiffre vieux d'un mois n'aide personne à
décider d'un achat (retour utilisateur explicite). Le scellé, lui, reste sur
son batch hebdomadaire existant (`ingestion/sources/ebay.py::run_ebay_listings_sync`)
-- catalogue assez petit pour tenir en un seul run, pas besoin de rotation
ni de passage à la demande.

Cache = 1 ligne `active_listings` par (item, grade, JOUR CALENDAIRE) --
grain quotidien déjà celui du reste de la table (`captured_at DATE`, pas un
TTL en heures comme `prices.fetched_at`) : "déjà scrapé aujourd'hui" suffit
comme notion de fraîcheur pour un comptage qui ne bouge pas vite. Un cache
froid coûte 1 requête eBay + ~0.3-1s de latence sur CE `/verdict`
(cf. ingestion/sources/ebay.py::MIN_SECONDS_BETWEEN_REQUESTS) -- acceptable
pour une carte qu'un utilisateur regarde activement, contrairement à un
batch qui scraperait des cartes que personne ne consulte.
"""
from datetime import date

from ingestion.sources.ebay import search_single
from pricing.models import Card
from pricing.repository import (
    fetch_active_listing_count_for_date,
    fetch_latest_active_listing_count,
    upsert_active_listing_count,
)


def get_active_listing_count(card: Card, grade_bucket: str) -> int | None:
    """`grade_bucket` : 'ungraded' ou 'graded' (jamais un grade PSA précis
    -- cf. shared/verdict.py::compute_extended_signals pour la conversion,
    déjà faite par l'appelant avant ce point).

    Scellé : inchangé, lit simplement le batch hebdomadaire existant (pas
    de scrape live ici -- le scellé n'entre jamais dans ce chemin, cf.
    docstring module).

    Single sans `code` : None sans requête -- même garde que le reste du
    matching (`ne jamais deviner`), une recherche eBay sans code part trop
    générique (cf. ingestion/sources/ebay.py -- jusqu'à 143k "annonces
    actives" observées pour un nom seul comme "Mew")."""
    if card.category != "single":
        return fetch_latest_active_listing_count(card.id, grade_bucket)
    if not card.code:
        return None

    today = date.today()
    cached = fetch_active_listing_count_for_date(card.id, grade_bucket, today)
    if cached is not None:
        return cached

    item = {"id": card.id, "name": card.name, "code": card.code}
    try:
        total = search_single(item, grade=grade_bucket, limit=1).get("total", 0)
    except Exception as exc:
        # Échec réseau/quota eBay (429, timeout...) -- jamais casser le
        # verdict pour ça, même philosophie que le reste du repo (cf.
        # pricing/cache.py::get_price_with_cache). Repli sur une ligne
        # périmée si une existe (mieux qu'un None sec), sinon None franc.
        print(f"  (active_listings à la demande : échec pour item_id={card.id}, grade={grade_bucket!r} : {exc})")
        return fetch_latest_active_listing_count(card.id, grade_bucket)

    upsert_active_listing_count(card.id, grade_bucket, total, today)
    return total
