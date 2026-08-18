"""Cache de prix à TTL sur la table `prices` (cf. db/schema.sql). Sépare
volontairement la logique TTL PURE (is_fresh, testable sans DB/horloge
système) de l'orchestration DB+HTTP (get_price_with_cache).
"""
import os
from datetime import datetime, timedelta, timezone

from pricing.models import Card, PriceQuote
from pricing.sources.base import PriceSource
from shared.db import get_connection

_DEFAULT_TTL_HOURS = 12.0

_UPSERT_PRICE_SQL = """
    INSERT INTO prices (item_id, source, grade, price, currency, fetched_at)
    VALUES (%s, %s, %s, %s, %s, now())
    ON CONFLICT (item_id, source, grade)
    DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency,
                  fetched_at = EXCLUDED.fetched_at
"""

_SELECT_PRICE_SQL = """
    SELECT price, currency, fetched_at FROM prices
    WHERE item_id = %s AND source = %s AND grade = %s
"""


def _ttl_hours(override: float | None) -> float:
    if override is not None:
        return override
    return float(os.environ.get("PRICE_CACHE_TTL_HOURS", _DEFAULT_TTL_HOURS))


def is_fresh(fetched_at: datetime, ttl_hours: float, *, now: datetime | None = None) -> bool:
    """Pure, testable sans DB. Borne stricte : exactement au TTL = considéré
    périmé (cohérent avec "TTL = durée MAX de fraîcheur")."""
    now = now or datetime.now(timezone.utc)
    return (now - fetched_at) < timedelta(hours=ttl_hours)


def _read_price_row(item_id: int, source: str, grade: str) -> PriceQuote | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SELECT_PRICE_SQL, (item_id, source, grade))
            row = cur.fetchone()
            if row is None:
                return None
            price, currency, fetched_at = row
            return PriceQuote(source=source, grade=grade, price=float(price),
                               currency=currency, fetched_at=fetched_at)
    finally:
        conn.close()


def get_cached_price(item_id: int, source: str, grade: str, *, ttl_hours: float | None = None) -> PriceQuote | None:
    """None si absent OU périmé (cache froid) -- l'appelant doit alors
    rappeler la source. Cf. get_stale_price pour le repli explicite en cas
    d'échec source."""
    quote = _read_price_row(item_id, source, grade)
    if quote is None or quote.fetched_at is None:
        return None
    if not is_fresh(quote.fetched_at, _ttl_hours(ttl_hours)):
        return None
    return quote


def get_stale_price(item_id: int, source: str, grade: str) -> PriceQuote | None:
    """Lit la ligne quel que soit son âge -- utilisé UNIQUEMENT en repli si
    la source échoue et qu'aucun prix frais n'est disponible (mieux un
    verdict sur un prix légèrement périmé qu'aucun verdict du tout)."""
    return _read_price_row(item_id, source, grade)


def upsert_price(item_id: int, quote: PriceQuote) -> None:
    """UPSERT idempotent sur (item_id, source, grade) -- écrase
    price/currency/fetched_at, contrairement à price_snapshots qui
    n'autorise jamais d'UPDATE (historique append-only, sémantique
    différente, cf. commentaire de la table `prices` dans db/schema.sql)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_UPSERT_PRICE_SQL, (item_id, quote.source, quote.grade, quote.price, quote.currency))
        conn.commit()
    finally:
        conn.close()


def get_price_with_cache(card: Card, grade: str, source: PriceSource, *, ttl_hours: float | None = None) -> PriceQuote | None:
    """Point d'entrée unique utilisé par shared/verdict.py::compute_verdict_for_card :
    1. cache frais -> le retourne directement, `source.fetch_price` jamais appelé.
    2. cache froid ou absent -> appelle `source.fetch_price` ; succès ->
       upsert + retourne le prix frais ; échec (None, NotImplementedError, ou
       toute exception réseau -- capturée et journalisée via print(), jamais
       propagée, cohérent avec l'isolation d'erreurs de ingestion/) -> retombe
       sur get_stale_price (prix périmé si dispo) plutôt qu'un échec sec."""
    ttl = _ttl_hours(ttl_hours)
    cached = get_cached_price(card.id, source.name, grade, ttl_hours=ttl)
    if cached is not None:
        return cached

    try:
        fresh = source.fetch_price(card, grade)
    except Exception as exc:  # NotImplementedError (stubs) inclus
        print(f"  (source {source.name!r} en échec pour item_id={card.id}, grade={grade!r} : {exc})")
        fresh = None

    if fresh is not None:
        upsert_price(card.id, fresh)
        return fresh
    return get_stale_price(card.id, source.name, grade)
