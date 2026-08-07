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
- Pas de quota documenté, mais bien réel : incident du 2026-07-31, le run
  quotidien s'est fait 429 par api.apitcg.com en page 38/66 de la pagination
  Pokémon (32 532 produits/500 par page), aucune pause entre pages jusque-là.
  `_request` ci-dessous absorbe les 429 par retry/backoff (respecte
  `Retry-After` si présent), et `PAGE_PAUSE_SECONDS` espace les pages de
  `sync_items` pour limiter le risque d'y retomber.
  **2026-08-02 : quota réel bien plus bas qu'estimé (1000 req/mois, cf. compte
  apitcg.com de l'utilisateur)** -- un sync complet quotidien des deux TCG
  (~66 pages Pokémon + ~15 One Piece = ~81 requêtes) coûtait à lui seul
  ~2400/mois, largement au-dessus du budget. `sync_items` fait donc
  maintenant un sync incrémental par défaut (`updatedSince`, cf. son
  docstring) -- le sync complet (`--full`) reste disponible pour un
  rattrapage manuel occasionnel, largement soutenable au tarif d'une fois de
  temps en temps plutôt que quotidien.
- `rarity` (cf. `_rarity` ci-dessous) vient de `attributes.Rarity`, documenté
  dans l'openapi.json comme un attribut dynamique par carte (varie par TCG :
  codes courts type 'R'/'SR'/'SEC' pour One Piece, noms longs type 'Rare
  Holo'/'Illustration Rare' pour Pokémon a priori) -- non vérifié en
  conditions réelles au moment d'écrire ceci (quota épuisé, cf. mémoire
  projet), à ajuster si le format observé diffère une fois le quota reset.
"""
import os
import re
import time
from datetime import datetime

import requests
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://api.apitcg.com"
PAGE_SIZE = 500
PAGE_PAUSE_SECONDS = 0.5

DEFAULT_LANGUAGE = "EN"

TYPE_TO_CATEGORY = {
    "sealed": "sealed",
    "card": "single",
}

MAX_429_RETRIES = 5
DEFAULT_BACKOFF_SECONDS = 20.0


def _headers() -> dict:
    api_key = os.environ["APITCG_API_KEY"]
    return {"x-api-key": api_key}


class MonthlyQuotaExceeded(RuntimeError):
    """Plafond mensuel API TCG atteint (cf. incident 2026-07-31/08-01) --
    distinct du 429 rolling-window (RateLimit-Policy: 300;w=60, lui transitoire
    et couvert par le retry ci-dessous). Aucun retry ne peut résoudre celui-ci :
    le corps de réponse dit explicitement "Request limit reached for this
    month.", ça ne se dégage pas en quelques secondes ni en quelques minutes."""


def _request(url: str, params: dict | None = None) -> requests.Response:
    """GET avec retry/backoff sur 429 rolling-window. Respecte `Retry-After`
    quand le serveur le fournit, sinon backoff exponentiel (20s, 40s, 60s...).
    Sur un 429 de type quota mensuel, échoue immédiatement (MonthlyQuotaExceeded)
    plutôt que de gaspiller ~4 min de retry sur un mur qui ne bougera pas."""
    for attempt in range(MAX_429_RETRIES + 1):
        resp = requests.get(url, headers=_headers(), params=params)
        if resp.status_code != 429:
            resp.raise_for_status()
            return resp
        try:
            message = resp.json().get("error", "")
        except ValueError:
            message = ""
        if "month" in message.lower():
            raise MonthlyQuotaExceeded(message or "Request limit reached for this month.")
        if attempt == MAX_429_RETRIES:
            resp.raise_for_status()
        retry_after = resp.headers.get("Retry-After")
        wait = float(retry_after) if retry_after and retry_after.isdigit() else min(60.0, DEFAULT_BACKOFF_SECONDS * (2 ** attempt))
        print(f"  429 (rate limit API TCG), pause {wait:.0f}s avant retry ({attempt + 1}/{MAX_429_RETRIES})...")
        time.sleep(wait)
    raise AssertionError("unreachable")  # raise_for_status() ci-dessus lève toujours au dernier essai


def list_tcgs() -> list[dict]:
    return _request(f"{BASE_URL}/api/tcgs").json()["data"]


def list_sets(tcg: str) -> list[dict]:
    return _request(f"{BASE_URL}/api/{tcg}/sets").json()["data"]


def list_products(
    tcg: str | None = None,
    set_id: str | None = None,
    product_type: str | None = None,
    page: int = 1,
    limit: int = 100,
    updated_since: str | None = None,
) -> dict:
    """Une page de /api/products. Voir `total` dans la réponse pour paginer.

    `updated_since` (ISO 8601) ne renvoie que les produits modifiés depuis
    cette date côté API TCG -- cf. `sync_items`/incident quota mensuel
    (mémoire projet), c'est ce qui permet un sync quotidien sans retélécharger
    tout le catalogue à chaque fois."""
    params = {"page": page, "limit": limit}
    if tcg:
        params["tcg"] = tcg
    if set_id:
        params["set"] = set_id
    if product_type:
        params["type"] = product_type
    if updated_since:
        params["updatedSince"] = updated_since
    return _request(f"{BASE_URL}/api/products", params=params).json()


def list_all_products(
    tcg: str | None = None,
    set_id: str | None = None,
    product_type: str | None = None,
    updated_since: str | None = None,
) -> list[dict]:
    """Boucle sur la pagination de /api/products jusqu'à épuisement de `total`."""
    items: list[dict] = []
    page = 1
    while True:
        payload = list_products(tcg=tcg, set_id=set_id, product_type=product_type, page=page, updated_since=updated_since)
        items.extend(payload["data"])
        if len(items) >= payload["total"] or not payload["data"]:
            break
        page += 1
    return items


def get_history_prices(product_id: str) -> dict:
    return _request(f"{BASE_URL}/api/history-prices/{product_id}").json()


def _parse_release_date(set_obj: dict):
    raw = set_obj.get("release_date") or set_obj.get("releaseDate") or set_obj.get("date")
    if not raw:
        return None
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()


_TCGPLAYER_IMAGE_ID_RE = re.compile(r"tcgplayer-cdn\.tcgplayer\.com/product/(\d+)_")


def _image_url(product: dict) -> str | None:
    """L'API renvoie `images[0].{small,medium,large}`, tous servis depuis
    `tcgplayer-cdn.tcgplayer.com/product/{id}_{200,400}w.jpg` -- plafonné à
    400x400px réel quelle que soit la clé demandée (confirmé 2026-08-04,
    retour utilisateur "qualité vraiment très médiocre"), donc le choix entre
    small/medium/large ne change rien à la résolution.

    TCGPlayer sert par ailleurs la même image en pleine résolution (jusqu'à
    ~900x900 sur les exemples testés, ~5x plus de pixels) sur un host
    séparé : `product-images.tcgplayer.com/{id}.jpg`, avec le même id
    produit numérique. Confirmé sur un échantillon stratifié de 80 items
    (sets anciens/récents x Pokémon/One Piece) : 0 régression, l'image
    pleine résolution est disponible partout où la miniature l'est, sauf
    pour une poignée de sorties One Piece très récentes où TCGPlayer n'a pas
    encore traité l'image (déjà cassé côté miniature aussi -- pas une
    régression introduite ici)."""
    images = product.get("images") or []
    if not images:
        return None
    first = images[0]
    thumb = first.get("medium") or first.get("small") or first.get("large")
    if not thumb:
        return None
    match = _TCGPLAYER_IMAGE_ID_RE.search(thumb)
    if match:
        return f"https://product-images.tcgplayer.com/{match.group(1)}.jpg"
    return thumb


def _rarity(product: dict) -> str | None:
    """`attributes.Rarity` (cf. openapi.json d'apitcg.com, "Dynamic card
    attributes (Rarity, Color, etc.)") -- NULL pour le scellé (pas
    d'attributs de carte) et casse pas vérifiée en conditions réelles faute
    de quota disponible au moment d'écrire ceci (cf. mémoire projet incident
    quota 2026-07-31/08-01), d'où le fallback sur plusieurs casses."""
    attributes = product.get("attributes") or {}
    return attributes.get("Rarity") or attributes.get("rarity")


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
        _rarity(product),                                               # rarity
    )


_UPSERT_ITEMS_SQL = """
    INSERT INTO items
        (external_id, source, cardmarket_id, tcgplayer_id, tcg, category, set_code, release_date, code, image_url, language, name, rarity)
    VALUES %s
    ON CONFLICT (source, external_id) DO UPDATE SET
        cardmarket_id = EXCLUDED.cardmarket_id,
        tcgplayer_id  = EXCLUDED.tcgplayer_id,
        category      = EXCLUDED.category,
        set_code      = EXCLUDED.set_code,
        release_date  = EXCLUDED.release_date,
        code          = EXCLUDED.code,
        -- Ne pas écraser une image PokéCardex déjà backfillée (résolution
        -- meilleure que TCGPlayer sur les quelques sets de
        -- pokecardex.POKECARDEX_IMAGE_SETS, vérifié à la main) -- sans ce
        -- garde, le sync incrémental quotidien reviendrait dessus au
        -- prochain passage sur ces produits, cf. pokecardex.sync_mapped_items.
        image_url     = CASE
            WHEN items.image_url LIKE 'https://pokecardex-scans.b-cdn.net/%%' THEN items.image_url
            ELSE EXCLUDED.image_url
        END,
        language      = EXCLUDED.language,
        name          = EXCLUDED.name,
        rarity        = EXCLUDED.rarity
"""


def _last_synced_at(tcg: str) -> str | None:
    """Timestamp (ISO 8601) du dernier sync `items` réussi pour ce tcg,
    lu dans `sync_runs` (alimentée par shared/sync_log.py depuis
    l'orchestrateur) -- sert de borne `updatedSince` pour un sync
    incrémental. `None` si jamais syncé avec succès via l'orchestrateur
    (premier run, ou seulement des runs manuels hors orchestrateur qui
    n'écrivent pas dans `sync_runs`) : `sync_items` retombe alors sur un
    sync complet."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT MAX(started_at) FROM sync_runs
                   WHERE step = 'items' AND tcg = %s AND status = 'success'""",
                (tcg,),
            )
            row = cur.fetchone()
            return row[0].isoformat() if row and row[0] else None
    finally:
        conn.close()


def sync_items(tcg: str, page_size: int = PAGE_SIZE, incremental: bool = True) -> int:
    """Peuple/maj la table `items` avec le catalogue produit d'API TCG pour un TCG.

    Idempotent (upsert sur `(source, external_id)`) : rejouable sans créer de
    doublons ni perdre l'`id` existant d'un item déjà connu.

    `incremental=True` (défaut, utilisé par le cron quotidien) : ne redemande
    que les produits modifiés depuis le dernier sync réussi (`updatedSince`,
    cf. `_last_synced_at`) -- un jour calme coûte ~1-2 requêtes au lieu des
    ~66 (Pokémon) / ~15 (One Piece) d'un sync complet (cf. incident quota
    mensuel 1000 req/mois, mémoire projet -- un sync complet quotidien des
    deux TCG en consommait ~2400/mois à lui seul). Retombe automatiquement
    sur un sync complet si aucun sync réussi n'est enregistré.

    `incremental=False` (`--full` du CLI ci-dessous) : sync complet forcé, à
    lancer manuellement de temps en temps pour rattraper d'éventuels ratés
    d'`updatedSince` et pour backfiller un champ ajouté après coup (ex.
    `rarity`) sur des items déjà en base mais pas "updated" récemment côté
    API TCG.
    """
    updated_since = _last_synced_at(tcg) if incremental else None
    if incremental:
        print(f"  sync incrémental depuis {updated_since}" if updated_since else "  aucun sync réussi antérieur -- sync complet")

    conn = get_connection()
    total_fetched = 0
    page = 1
    try:
        with conn.cursor() as cur:
            while True:
                if page > 1:
                    time.sleep(PAGE_PAUSE_SECONDS)
                payload = list_products(tcg=tcg, page=page, limit=page_size, updated_since=updated_since)
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
    parser.add_argument(
        "--full", action="store_true",
        help="Sync complet (ignore updatedSince) -- backfill ou rattrapage manuel, cf. docstring sync_items.",
    )
    args = parser.parse_args()

    print(f"== Sync items pour tcg={args.tcg} ({'complet' if args.full else 'incrémental'}) ==")
    total = sync_items(args.tcg, incremental=not args.full)
    print(f"\nTerminé : {total} produits upsertés dans `items`.")


if __name__ == "__main__":
    main()
