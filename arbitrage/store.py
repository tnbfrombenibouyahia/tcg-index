"""Anti-doublon des alertes : table `arbitrage_alerts` (cf. db/schema.sql).

Une annonce déjà alertée n'est repostée que si son prix a baissé d'au moins
`REALERT_DROP` depuis la dernière alerte -- sinon le salon se remplit du même
slab à chaque exécution horaire.
"""
import psycopg2.errors

from arbitrage.models import Alert
from shared.db import get_connection

REALERT_DROP = 0.05  # re-alerter si le prix a baissé d'au moins 5 %


def should_alert(previous_price: float | None, price: float) -> bool:
    if previous_price is None:
        return True
    return price <= previous_price * (1 - REALERT_DROP)


def fetch_last_prices(marketplace: str, listing_ids: list[str], *, tolerate_missing_table: bool = False) -> dict[str, float]:
    """{listing_id: prix de la dernière alerte}. `tolerate_missing_table` sert
    au --dry-run (la table peut ne pas encore exister sur la base visée) ;
    un vrai run doit échouer bruyamment plutôt que reposter en boucle."""
    if not listing_ids:
        return {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT listing_id, price FROM arbitrage_alerts "
                    "WHERE marketplace = %s AND listing_id = ANY(%s)",
                    (marketplace, listing_ids),
                )
            except psycopg2.errors.UndefinedTable:
                if not tolerate_missing_table:
                    raise
                print("  (table arbitrage_alerts absente -- dédoublonnage ignoré en dry-run)")
                return {}
            return {r[0]: float(r[1]) for r in cur.fetchall()}
    finally:
        conn.close()


_UPSERT_SQL = """
    INSERT INTO arbitrage_alerts
        (marketplace, listing_id, item_id, grader, grade, price, currency, breakeven_p10, multiple)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (marketplace, listing_id) DO UPDATE SET
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        breakeven_p10 = EXCLUDED.breakeven_p10,
        multiple = EXCLUDED.multiple,
        alerted_at = now()
"""


def record_alerts(alerts: list[Alert]) -> None:
    if not alerts:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for a in alerts:
                cur.execute(_UPSERT_SQL, (
                    a.marketplace, a.listing_id, a.candidate.item_id, a.grader, a.grade,
                    a.price, a.currency, round(a.opportunity.breakeven_p10, 4), round(a.opportunity.multiple, 2),
                ))
        conn.commit()
    finally:
        conn.close()
