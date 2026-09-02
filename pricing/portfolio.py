"""Portefeuille personnel (écran PnL CardQuant, cf. mémoire projet
"cardquant-rebrand") : positions déclarées par l'utilisateur (prix payé,
quantité, éventuel prix de revente) -- CRUD complet, contrairement à
favorites.py (juste add/remove). Même identité que favorites.py
(firebase_uid, pas de table `users` locale) et même style (connexion dédiée
par appel, try/finally: conn.close(), SQL inline).

L'enrichissement marché (prix actuel, nom/image de la carte) reste côté
pricing_api/main.py (comme _favorite_out pour favorites.py) -- ce module ne
connaît que la table portfolio_positions elle-même.
"""
from dataclasses import dataclass
from datetime import date

from shared.db import get_connection

_COLUMNS = (
    "id, firebase_uid, item_id, grade, quantity, "
    "buy_price, buy_currency, buy_date, sell_price, sell_currency, sell_date, note"
)


@dataclass
class Position:
    id: int
    firebase_uid: str
    item_id: int
    grade: str
    quantity: int
    buy_price: float
    buy_currency: str
    buy_date: date
    sell_price: float | None
    sell_currency: str | None
    sell_date: date | None
    note: str | None


def _row_to_position(row: tuple) -> Position:
    return Position(
        id=row[0], firebase_uid=row[1], item_id=row[2], grade=row[3], quantity=row[4],
        buy_price=float(row[5]), buy_currency=row[6], buy_date=row[7],
        sell_price=float(row[8]) if row[8] is not None else None,
        sell_currency=row[9], sell_date=row[10], note=row[11],
    )


def fetch_positions(firebase_uid: str) -> list[Position]:
    """Positions de l'utilisateur, plus récemment créée d'abord."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLUMNS} FROM portfolio_positions WHERE firebase_uid = %s ORDER BY created_at DESC",
                (firebase_uid,),
            )
            return [_row_to_position(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_position(firebase_uid: str, position_id: int) -> Position | None:
    """Une position, SEULEMENT si elle appartient à firebase_uid -- le
    firebase_uid fait partie du WHERE, pas une vérification après coup, pour
    qu'un utilisateur ne puisse jamais lire/modifier la position d'un autre
    en devinant un id (pas de contrôle d'accès séparé à oublier ailleurs)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLUMNS} FROM portfolio_positions WHERE firebase_uid = %s AND id = %s",
                (firebase_uid, position_id),
            )
            row = cur.fetchone()
            return _row_to_position(row) if row else None
    finally:
        conn.close()


def add_position(
    firebase_uid: str, item_id: int, grade: str, quantity: int,
    buy_price: float, buy_currency: str, buy_date_value: date, note: str | None,
) -> int | None:
    """Renvoie l'id créé, ou None si item_id n'existe pas."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM items WHERE id = %s", (item_id,))
            if cur.fetchone() is None:
                return None
            cur.execute(
                "INSERT INTO portfolio_positions "
                "(firebase_uid, item_id, grade, quantity, buy_price, buy_currency, buy_date, note) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (firebase_uid, item_id, grade, quantity, buy_price, buy_currency, buy_date_value, note),
            )
            new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()


def update_position(
    firebase_uid: str, position_id: int, *,
    sell_price: float | None = None, sell_currency: str | None = None,
    sell_date_value: date | None = None, note: str | None = None, clear_sale: bool = False,
) -> bool:
    """Édition partielle -- pensée pour deux usages : clore une position
    (sell_price/sell_currency/sell_date_value fournis) ou juste éditer la
    note. `clear_sale=True` rouvre une position close (utilisateur qui
    corrige une erreur de saisie) -- remet les 3 colonnes de vente à NULL
    plutôt que de forcer une suppression + recréation. Renvoie False si la
    position n'existe pas ou n'appartient pas à firebase_uid (cf.
    fetch_position pour le même principe de portée)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if clear_sale:
                cur.execute(
                    "UPDATE portfolio_positions SET sell_price = NULL, sell_currency = NULL, sell_date = NULL, "
                    "updated_at = now() WHERE firebase_uid = %s AND id = %s",
                    (firebase_uid, position_id),
                )
            else:
                cur.execute(
                    "UPDATE portfolio_positions SET "
                    "sell_price = COALESCE(%s, sell_price), "
                    "sell_currency = COALESCE(%s, sell_currency), "
                    "sell_date = COALESCE(%s, sell_date), "
                    "note = COALESCE(%s, note), "
                    "updated_at = now() "
                    "WHERE firebase_uid = %s AND id = %s",
                    (sell_price, sell_currency, sell_date_value, note, firebase_uid, position_id),
                )
            updated = cur.rowcount == 1
        conn.commit()
        return updated
    finally:
        conn.close()


def delete_position(firebase_uid: str, position_id: int) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM portfolio_positions WHERE firebase_uid = %s AND id = %s", (firebase_uid, position_id))
            removed = cur.rowcount == 1
        conn.commit()
        return removed
    finally:
        conn.close()
