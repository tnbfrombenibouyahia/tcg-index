"""Client référentiel : API TCG (apitcg.com).

Documentation : https://docs.apitcg.com/ (spec source :
https://github.com/apitcg/docs.apitcg.com/blob/main/openapi.json)

Rôle : lister tcgs/sets/produits, et peupler/maj la table `items` (référentiel).
Ne touche pas aux prix — ça, c'est le rôle des sources de prix (cf. justtcg.py).

Limitations connues du catalogue (constatées en conditions réelles) :
- Pas de champ `language` structuré : sur 217 sets Pokémon, un seul porte un
  indicateur de langue dans son *nom* ("... (JP Exclusive)"), rien d'exploitable
  en base. Le catalogue est quasi exclusivement anglais (source TCGPlayer) :
  `DEFAULT_LANGUAGE` ci-dessous force 'EN' pour tous les items en attendant
  mieux (JP/FR viendront d'une autre source si besoin un jour).
- Pas de distinction structurée scellé display / ETB / autre : seul `type`
  ('sealed' vs 'card') est fiable, la granularité fine n'existe que dans le nom
  libre du produit. `TYPE_TO_CATEGORY` mappe donc 'sealed' -> 'sealed' tel quel,
  pas de sous-catégorie pour l'instant.
"""
import os
from datetime import datetime

import requests
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://api.apitcg.com"
PAGE_SIZE = 500

DEFAULT_LANGUAGE = "EN"

TYPE_TO_CATEGORY = {
    "sealed": "sealed",
    "card": "single",
}


def _headers() -> dict:
    api_key = os.environ["APITCG_API_KEY"]
    return {"x-api-key": api_key}


def list_tcgs() -> list[dict]:
    resp = requests.get(f"{BASE_URL}/api/tcgs", headers=_headers())
    resp.raise_for_status()
    return resp.json()["data"]


def list_sets(tcg: str) -> list[dict]:
    resp = requests.get(f"{BASE_URL}/api/{tcg}/sets", headers=_headers())
    resp.raise_for_status()
    return resp.json()["data"]


def list_products(
    tcg: str | None = None,
    set_id: str | None = None,
    product_type: str | None = None,
    page: int = 1,
    limit: int = 100,
) -> dict:
    """Une page de /api/products. Voir `total` dans la réponse pour paginer."""
    params = {"page": page, "limit": limit}
    if tcg:
        params["tcg"] = tcg
    if set_id:
        params["set"] = set_id
    if product_type:
        params["type"] = product_type
    resp = requests.get(f"{BASE_URL}/api/products", headers=_headers(), params=params)
    resp.raise_for_status()
    return resp.json()


def list_all_products(
    tcg: str | None = None,
    set_id: str | None = None,
    product_type: str | None = None,
) -> list[dict]:
    """Boucle sur la pagination de /api/products jusqu'à épuisement de `total`."""
    items: list[dict] = []
    page = 1
    while True:
        payload = list_products(tcg=tcg, set_id=set_id, product_type=product_type, page=page)
        items.extend(payload["data"])
        if len(items) >= payload["total"] or not payload["data"]:
            break
        page += 1
    return items


def get_history_prices(product_id: str) -> dict:
    resp = requests.get(f"{BASE_URL}/api/history-prices/{product_id}", headers=_headers())
    resp.raise_for_status()
    return resp.json()


def _parse_release_date(set_obj: dict):
    raw = set_obj.get("release_date") or set_obj.get("releaseDate") or set_obj.get("date")
    if not raw:
        return None
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()


def _image_url(product: dict) -> str | None:
    images = product.get("images") or []
    if not images:
        return None
    first = images[0]
    return first.get("medium") or first.get("small") or first.get("large")


def _map_product_to_item(tcg: str, product: dict) -> tuple:
    markets = product.get("markets", {})
    set_obj = product.get("set") or {}
    product_type = product.get("type")
    return (
        str(product["_id"]),                                            # external_id
        "apitcg",                                                       # source
        markets.get("cardmarket", {}).get("id"),                        # cardmarket_id
        markets.get("tcgplayer", {}).get("id"),                         # tcgplayer_id
        tcg,                                                            # tcg
        TYPE_TO_CATEGORY.get(product_type, product_type),               # category
        set_obj.get("_id") or set_obj.get("name"),                      # set_code
        _parse_release_date(set_obj),                                   # release_date
        product.get("code"),                                            # code
        _image_url(product),                                            # image_url
        DEFAULT_LANGUAGE,                                                # language
        product.get("name", ""),                                        # name
    )


_UPSERT_ITEMS_SQL = """
    INSERT INTO items
        (external_id, source, cardmarket_id, tcgplayer_id, tcg, category, set_code, release_date, code, image_url, language, name)
    VALUES %s
    ON CONFLICT (source, external_id) DO UPDATE SET
        cardmarket_id = EXCLUDED.cardmarket_id,
        tcgplayer_id  = EXCLUDED.tcgplayer_id,
        category      = EXCLUDED.category,
        set_code      = EXCLUDED.set_code,
        release_date  = EXCLUDED.release_date,
        code          = EXCLUDED.code,
        image_url     = EXCLUDED.image_url,
        language      = EXCLUDED.language,
        name          = EXCLUDED.name
"""


def sync_items(tcg: str, page_size: int = PAGE_SIZE) -> int:
    """Peuple/maj la table `items` avec le catalogue produit d'API TCG pour un TCG.

    Idempotent (upsert sur `(source, external_id)`) : rejouable sans créer de
    doublons ni perdre l'`id` existant d'un item déjà connu.
    """
    conn = get_connection()
    total_fetched = 0
    page = 1
    try:
        with conn.cursor() as cur:
            while True:
                payload = list_products(tcg=tcg, page=page, limit=page_size)
                data = payload["data"]
                if not data:
                    break
                rows = [_map_product_to_item(tcg, p) for p in data]
                execute_values(cur, _UPSERT_ITEMS_SQL, rows)
                conn.commit()
                total_fetched += len(data)
                print(f"  page {page}: +{len(data)} produits ({total_fetched}/{payload['total']})")
                if total_fetched >= payload["total"]:
                    break
                page += 1
    finally:
        conn.close()
    return total_fetched


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--tcg", default="pokemon")
    args = parser.parse_args()

    print(f"== Sync items pour tcg={args.tcg} ==")
    total = sync_items(args.tcg)
    print(f"\nTerminé : {total} produits upsertés dans `items`.")


if __name__ == "__main__":
    main()
