"""Watchlist utilisateur (favoris) : cartes qu'un utilisateur veut
surveiller, ajoutées/retirées depuis le panneau extension ou le site (§10
tcg-index-handoff.md). Contrairement à sales/price_snapshots (append-only),
un favori se retire -- add/remove, pas juste insert. Pas de table `users`
locale : l'identité vient de Firebase Auth (cf. pricing.auth.verify_id_token),
`firebase_uid` sert directement de clé, comme le reste de l'auth de ce repo
(cf. pricing_api/main.py::require_user). Même style que
pricing/repository.py : connexion dédiée par appel, try/finally:
conn.close(), SQL inline.

`language` n'est jamais stocké ici à part : EN et JP sont deux `items`
distincts (cf. items.language), donc `item_id` porte déjà la langue suivie
-- favoriser la version EN et la version JP d'une même carte, ce sont deux
lignes `favorites` différentes.
"""
from pricing.models import Card
from shared.db import get_connection

_CARD_COLUMNS = "i.id, i.name, i.code, i.set_code, i.tcg, i.category, i.language, i.rarity, i.image_url"

# 3 favoris gratuits, au-delà réservé aux comptes premium. Modèle payant
# final (fournisseur, montant) pas encore tranché (§10 handoff, proposé le
# 2026-08-25) -- ce seuil et user_entitlements.is_premium (cf. db/schema.sql)
# sont un jalon minimal en attendant cette décision, pas le système de
# facturation définitif.
FREE_FAVORITES_LIMIT = 3


def _row_to_card(row: tuple) -> Card:
    return Card(id=row[0], name=row[1], code=row[2], set_code=row[3], tcg=row[4],
                category=row[5], language=row[6], rarity=row[7], image_url=row[8])


def fetch_favorites(firebase_uid: str) -> list[Card]:
    """Cartes favorites de l'utilisateur, plus récemment ajoutée d'abord."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM favorites f JOIN items i ON i.id = f.item_id "
                "WHERE f.firebase_uid = %s ORDER BY f.created_at DESC",
                (firebase_uid,),
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def count_favorites(firebase_uid: str) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM favorites WHERE firebase_uid = %s", (firebase_uid,))
            return cur.fetchone()[0]
    finally:
        conn.close()


def is_favorited(firebase_uid: str, item_id: int) -> bool:
    """Utilisé côté pricing_api pour exempter du plafond gratuit un ajout
    qui n'en est pas vraiment un (reclique sur un favori déjà présent --
    retry réseau, double clic depuis le panneau extension)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM favorites WHERE firebase_uid = %s AND item_id = %s", (firebase_uid, item_id))
            return cur.fetchone() is not None
    finally:
        conn.close()


def is_premium(firebase_uid: str) -> bool:
    """False par défaut (aucune ligne user_entitlements) -- pas encore de
    parcours de paiement, cf. FREE_FAVORITES_LIMIT ci-dessus."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT is_premium FROM user_entitlements WHERE firebase_uid = %s", (firebase_uid,))
            row = cur.fetchone()
            return bool(row[0]) if row else False
    finally:
        conn.close()


def add_favorite(firebase_uid: str, item_id: int) -> str:
    """Ajoute item_id aux favoris de firebase_uid. Renvoie 'added',
    'already_favorited' (idempotent, pas une erreur) ou 'item_not_found'.
    Ne connaît pas FREE_FAVORITES_LIMIT/is_premium -- à l'appelant
    (pricing_api) de vérifier l'entitlement avant d'appeler cette fonction,
    cette dernière ne fait que l'écriture."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM items WHERE id = %s", (item_id,))
            if cur.fetchone() is None:
                return "item_not_found"
            cur.execute(
                "INSERT INTO favorites (firebase_uid, item_id) VALUES (%s, %s) "
                "ON CONFLICT (firebase_uid, item_id) DO NOTHING",
                (firebase_uid, item_id),
            )
            added = cur.rowcount == 1
        conn.commit()
        return "added" if added else "already_favorited"
    finally:
        conn.close()


def remove_favorite(firebase_uid: str, item_id: int) -> bool:
    """True si un favori a bien été retiré, False s'il n'existait pas déjà
    (idempotent, pas une erreur -- retirer un favori déjà absent n'est pas
    un cas d'échec côté appelant)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM favorites WHERE firebase_uid = %s AND item_id = %s", (firebase_uid, item_id))
            removed = cur.rowcount == 1
        conn.commit()
        return removed
    finally:
        conn.close()
