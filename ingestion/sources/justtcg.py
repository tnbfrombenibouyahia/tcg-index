"""Source de prix : JustTCG (justtcg.com).

Documentation : https://justtcg.com/docs

Limites tier gratuit (à date de la rédaction) : 10 req/min, 100 req/jour,
1000 req/mois. Batch cards : la doc générique annonce 200 max, mais le tier
gratuit plafonne en réalité à 20 par appel (même palier que la pagination
GET /cards) — confirmé en conditions réelles via probe_combo.py.

Attention : le schéma Card documenté (/docs/schema/card) n'expose ni catégorie
(scellé vs single) ni langue ni cardmarketId. La clé de jointure côté API TCG
disponible ici est `tcgplayerId`. La profondeur du scellé (Réserve 1 du
handoff) n'est validable qu'en interrogeant l'API en conditions réelles —
d'où probe_combo.py.
"""
import os
import time
from datetime import datetime, timezone

import requests
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://api.justtcg.com/v1"

# Taille de batch max observée sur le tier gratuit (la doc générique annonce
# 200, mais l'API renvoie 400 INVALID_REQUEST au-delà de 20 sur ce plan).
FREE_TIER_BATCH_SIZE = 20


def _headers() -> dict:
    api_key = os.environ["JUSTTCG_API_KEY"]
    return {"x-api-key": api_key}


def list_games() -> list[dict]:
    resp = requests.get(f"{BASE_URL}/games", headers=_headers())
    resp.raise_for_status()
    return resp.json()["data"]


def list_sets(game: str | None = None, q: str | None = None) -> list[dict]:
    params = {}
    if game:
        params["game"] = game
    if q:
        params["q"] = q
    resp = requests.get(f"{BASE_URL}/sets", headers=_headers(), params=params)
    resp.raise_for_status()
    return resp.json()["data"]


def get_card_by_tcgplayer_id(tcgplayer_id: str) -> dict | None:
    """Lookup direct par identifiant partagé avec API TCG (markets.tcgplayer.id)."""
    resp = requests.get(
        f"{BASE_URL}/cards", headers=_headers(), params={"tcgplayerId": tcgplayer_id}
    )
    resp.raise_for_status()
    payload = resp.json()
    data = payload["data"]
    return data[0] if data else None



# Tier gratuit = 10 req/min sur toute l'API (toutes routes confondues).
# Marge de sécurité au-delà de 60/10=6s pour absorber les autres appels faits
# par ailleurs (list_games, list_sets, get_card_by_tcgplayer_id...).
MIN_SECONDS_BETWEEN_REQUESTS = 6.5


def get_cards_batch(tcgplayer_ids: list[str], chunk_size: int = FREE_TIER_BATCH_SIZE) -> list[dict]:
    """POST batch, chunké automatiquement selon la limite du plan.

    Un gros set (des centaines de produits) peut nécessiter plusieurs dizaines
    de chunks : sans pause, ça dépasse la limite 10/min et l'API renvoie 429
    (observé en conditions réelles sur un set de 896 produits).
    """
    results: list[dict] = []
    for i in range(0, len(tcgplayer_ids), chunk_size):
        if i > 0:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        chunk = tcgplayer_ids[i : i + chunk_size]
        body = [{"tcgplayerId": tid} for tid in chunk]
        resp = requests.post(f"{BASE_URL}/cards", headers=_headers(), json=body)
        resp.raise_for_status()
        results.extend(resp.json()["data"])
    return results


# Un item peut avoir plusieurs variantes JustTCG (condition x printing) mais
# `price_snapshots` n'a de la place que pour un seul prix par item/jour :
# on choisit une variante canonique plutôt que d'en moyenner plusieurs.
CONDITION_PRIORITY = ["Sealed", "Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"]
PRINTING_PRIORITY = ["Normal"]


def _variant_rank(variant: dict) -> tuple:
    condition = variant.get("condition")
    printing = variant.get("printing")
    condition_rank = CONDITION_PRIORITY.index(condition) if condition in CONDITION_PRIORITY else len(CONDITION_PRIORITY)
    printing_rank = PRINTING_PRIORITY.index(printing) if printing in PRINTING_PRIORITY else len(PRINTING_PRIORITY)
    return (condition_rank, printing_rank)


def _pick_priced_variant(card: dict) -> dict | None:
    """Variante canonique : Sealed pour le scellé, sinon Near Mint / Normal en priorité."""
    priced = [v for v in card.get("variants") or [] if v.get("price") is not None]
    if not priced:
        return None
    return min(priced, key=_variant_rank)


def _variant_daily_prices(variant: dict) -> dict:
    """Un point de prix par jour, en combinant l'historique fourni et le prix courant.

    `priceHistory` donne ~7 jours de points quotidiens gratuitement dans la même
    requête : autant les capturer plutôt que de partir d'un seul jour et
    attendre une semaine pour avoir le même historique.
    """
    points: dict = {}
    for entry in variant.get("priceHistory") or []:
        captured_at = datetime.fromtimestamp(entry["t"], tz=timezone.utc).date()
        points[captured_at] = entry["p"]
    if variant.get("price") is not None and variant.get("lastUpdated"):
        captured_at = datetime.fromtimestamp(variant["lastUpdated"], tz=timezone.utc).date()
        points[captured_at] = variant["price"]
    return points


# JustTCG (TCGPlayer) coté en USD ; le volume de ventes n'est pas exposé par
# cette route (`variant` n'a pas de champ volume/sales) -> NULL, autorisé par
# le schéma (cf. handoff §5).
CURRENCY = "USD"

# La contrainte UNIQUE porte sur (item_id, captured_at, source, grade) depuis
# l'ajout de la gradation côté PriceCharting : même en omettant `grade`
# (colonne à défaut 'ungraded' — JustTCG n'a pas de notion de gradation PSA),
# ON CONFLICT doit cibler les 4 colonnes, pas les 3 d'origine.
_UPSERT_PRICE_SNAPSHOTS_SQL = """
    INSERT INTO price_snapshots (item_id, captured_at, price, currency, volume, source)
    VALUES %s
    ON CONFLICT (item_id, captured_at, source, grade) DO NOTHING
"""


def sync_price_snapshots(
    tcg: str,
    max_requests: int,
    category: str | None = "sealed",
    since_months: int | None = 18,
    chunk_size: int = FREE_TIER_BATCH_SIZE,
) -> dict:
    """Interroge JustTCG pour les items connus d'un TCG et archive leurs prix.

    `max_requests` est un garde-fou explicite : le tier gratuit JustTCG plafonne
    à 100 requêtes/jour et 1000/mois, largement en dessous de ce qu'il faudrait
    pour couvrir tout le catalogue en une fois (cf. mémoire projet). L'appelant
    doit choisir consciemment combien de requêtes il autorise pour ce run.

    Par défaut, restreint aux produits scellés des sets sortis dans les
    `since_months` derniers mois : le catalogue complet (32k+ items pour
    Pokémon, sets remontant à 1998) ne tient pas dans ce quota, et la priorité
    du projet est le scellé récent (positionnement du handoff). `category=None`
    ou `since_months=None` désactive le filtre correspondant.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            where = ["tcg = %s", "tcgplayer_id IS NOT NULL"]
            params: list = [tcg]
            if category:
                where.append("category = %s")
                params.append(category)
            if since_months:
                where.append("release_date >= (CURRENT_DATE - %s * INTERVAL '1 month')")
                params.append(since_months)
            cur.execute(
                f"SELECT tcgplayer_id, id FROM items WHERE {' AND '.join(where)}",
                params,
            )
            item_id_by_tcgplayer_id = dict(cur.fetchall())

        all_tcgplayer_ids = list(item_id_by_tcgplayer_id)
        max_items = max_requests * chunk_size
        tcgplayer_ids = all_tcgplayer_ids[:max_items]
        print(
            f"{len(all_tcgplayer_ids)} items éligibles pour tcg={tcg}, "
            f"{len(tcgplayer_ids)} traités ce run (max_requests={max_requests})."
        )

        total_snapshot_rows = 0
        items_with_price = 0
        with conn.cursor() as cur:
            for i in range(0, len(tcgplayer_ids), chunk_size):
                if i > 0:
                    time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                chunk = tcgplayer_ids[i : i + chunk_size]
                body = [{"tcgplayerId": tid} for tid in chunk]
                resp = requests.post(f"{BASE_URL}/cards", headers=_headers(), json=body)
                resp.raise_for_status()
                cards = resp.json()["data"]

                rows = []
                for card in cards:
                    item_id = item_id_by_tcgplayer_id.get(card.get("tcgplayerId"))
                    if item_id is None:
                        continue
                    variant = _pick_priced_variant(card)
                    if variant is None:
                        continue
                    items_with_price += 1
                    for captured_at, price in _variant_daily_prices(variant).items():
                        rows.append((item_id, captured_at, price, CURRENCY, None, "justtcg"))

                if rows:
                    execute_values(cur, _UPSERT_PRICE_SNAPSHOTS_SQL, rows)
                    conn.commit()
                    total_snapshot_rows += len(rows)

                done = min(i + chunk_size, len(tcgplayer_ids))
                print(f"  {done}/{len(tcgplayer_ids)} items interrogés, {total_snapshot_rows} lignes de prix upsertées")
    finally:
        conn.close()

    return {
        "tcg": tcg,
        "items_requested": len(tcgplayer_ids),
        "items_with_price": items_with_price,
        "snapshot_rows": total_snapshot_rows,
    }


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--tcg", default="pokemon")
    parser.add_argument(
        "--max-requests", type=int, required=True,
        help="Garde-fou explicite : nb max de requêtes JustTCG pour ce run (tier gratuit = 100/jour, 1000/mois).",
    )
    parser.add_argument(
        "--category", default="sealed",
        help="Filtre items.category ('sealed', 'single'...). Vide/'' pour désactiver le filtre.",
    )
    parser.add_argument(
        "--since-months", type=int, default=18,
        help="Ne garder que les items dont le set est sorti il y a au plus N mois. 0 pour désactiver.",
    )
    args = parser.parse_args()
    category = args.category or None
    since_months = args.since_months or None

    print(
        f"== Sync price_snapshots pour tcg={args.tcg} "
        f"(max_requests={args.max_requests}, category={category}, since_months={since_months}) =="
    )
    stats = sync_price_snapshots(
        args.tcg, max_requests=args.max_requests, category=category, since_months=since_months,
    )
    print(f"\nTerminé : {stats}")


if __name__ == "__main__":
    main()
