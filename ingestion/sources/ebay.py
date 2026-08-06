"""Source de supply active : eBay Browse API (item_summary/search).

Contrairement à JustTCG/PriceCharting (prix), cette source ne donne pas un
prix mais un COMPTAGE de listings actifs (auction + fixed-price) par carte --
proxy de pression vendeuse ("combien de gens essaient de se débarrasser de
l'objet"), cf. mémoire projet "ebay_active_listings". Alimente la future
table `active_listings` (grain gauge, pas prix/transaction).

Auth : OAuth2 client_credentials (token app-level, scope public
`https://api.ebay.com/oauth/api_scope`, pas de login utilisateur nécessaire
pour /buy/browse). Keyset Production créé 2026-08-06 (Cert ID roté une fois
côté dashboard eBay -- le premier copié était tronqué). Le token expire
~7200s ; mis en cache en mémoire process seulement (pas persisté, négligeable
au regard du quota).

Quota (tier par défaut, vérifié dans le dashboard developer.ebay.com le
2026-08-06) : Browse API item_summary/search = 5000 req/jour. Largement
au-dessus de nos besoins (scope sealed + sets récents, cadence hebdomadaire
prévue -- cf. mémoire projet "price_sync_scope", même filtre envisagé ici).

Catégories eBay (Taxonomy API, category_tree_id=0/EBAY_US, découvertes le
2026-08-06 via get_category_suggestions) :
- 183454 "CCG Individual Cards" -- singles
- 183456 "CCG Sealed Packs"     -- scellé (boosters/packs)
- 261044 "CCG Sealed Boxes"     -- scellé (display/box/ETB)
`category_ids` n'accepte qu'UNE SEULE valeur par requête (erreur eBay 12030
"exceeded the limit... reduce to 1 or less" sinon, confirmé en conditions
réelles) -- le scellé nécessite donc 2 appels (packs + boxes) si on veut
couvrir les deux familles de produits.

Condition IDs (confirmés en conditions réelles, cf. probe_ebay.py) :
- 4000 = "Ungraded" (pas 3000/"Used" générique -- eBay réutilise un ID
  générique mais avec un libellé spécifique repris pour cette catégorie TCG)
- 2750 = "Graded"
Seul 'ungraded' est ingéré en v1 (cf. schéma `active_listings.grade` prévu
par défaut 'ungraded' dans la mémoire projet) ; CONDITION_GRADED est exposé
pour un futur découpage par tier PSA si besoin, pas encore branché.

Précision du matching : `q` (recherche plein texte) n'est PAS un ET strict --
eBay classe par pertinence et peut remonter un numéro de carte différent de
celui demandé (ex. 'Charizard 6/102' remonte des Charizard 4/102, le vrai
numéro Base Set -- 6/102 est en fait Gyarados). Entourer le numéro de
guillemets (`"4/102"`) force un match exact de cette sous-chaîne dans le
titre et élimine ce bruit -- confirmé en conditions réelles le 2026-08-06,
d'où `build_single_query` qui quote systématiquement `item["code"]`.
"""
import base64
import os
import time
from datetime import date

import requests
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://api.ebay.com"
TOKEN_URL = f"{BASE_URL}/identity/v1/oauth2/token"
SEARCH_URL = f"{BASE_URL}/buy/browse/v1/item_summary/search"

CATEGORY_SINGLES = "183454"
CATEGORY_SEALED_PACKS = "183456"
CATEGORY_SEALED_BOXES = "261044"

CONDITION_UNGRADED = "4000"
CONDITION_GRADED = "2750"

MARKETPLACE_ID = "EBAY_US"  # catalogue EN -- JP hors scope v1, cf. mémoire "phased_by_tcg"

# Pas de limite par seconde documentée dans le dashboard (seulement un
# plafond quotidien, cf. docstring module), mais on reste poli comme pour
# PriceCharting plutôt que de rafale sans retenue.
MIN_SECONDS_BETWEEN_REQUESTS = 0.3

_token_cache = {"value": None, "expires_at": 0.0}


def _get_token() -> str:
    now = time.time()
    if _token_cache["value"] and now < _token_cache["expires_at"]:
        return _token_cache["value"]

    app_id = os.environ["EBAY_APP_ID"]
    cert_id = os.environ["EBAY_CERT_ID"]
    creds = base64.b64encode(f"{app_id}:{cert_id}".encode()).decode()
    resp = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"},
    )
    resp.raise_for_status()
    payload = resp.json()
    # Marge de sécurité de 60s avant l'expiration annoncée par eBay (~7200s).
    _token_cache["value"] = payload["access_token"]
    _token_cache["expires_at"] = now + payload["expires_in"] - 60
    return _token_cache["value"]


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_get_token()}",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
    }


def search(q: str, category_id: str, condition_ids: list[str] | None = None, limit: int = 1) -> dict:
    """Appel brut item_summary/search. `limit=1` par défaut : en usage prod on
    ne veut généralement que `total`, pas les items eux-mêmes -- le coût de
    requête (quota) est le même quel que soit `limit` (doc eBay), donc pas de
    raison de demander plus que nécessaire. Le probe passe un `limit` plus
    grand pour inspecter des titres."""
    filt = "buyingOptions:{FIXED_PRICE|AUCTION}"
    if condition_ids:
        filt += f",conditionIds:{{{'|'.join(condition_ids)}}}"
    resp = requests.get(
        SEARCH_URL,
        headers=_headers(),
        params={"q": q, "category_ids": category_id, "filter": filt, "limit": limit},
    )
    resp.raise_for_status()
    return resp.json()


def build_single_query(item: dict) -> str:
    """Nom + numéro entre guillemets (cf. docstring module -- élimine le
    bruit de pertinence sur le numéro)."""
    code = (item.get("code") or "").strip()
    parts = [item["name"]]
    if code:
        parts.append(f'"{code}"')
    return " ".join(parts)


def search_single(item: dict, grade: str = "ungraded", limit: int = 1) -> dict:
    condition_ids = [CONDITION_UNGRADED if grade == "ungraded" else CONDITION_GRADED]
    return search(build_single_query(item), CATEGORY_SINGLES, condition_ids=condition_ids, limit=limit)


def search_sealed(item: dict, limit: int = 1) -> list[dict]:
    """Le scellé n'a pas de notion de gradation -- pas de filtre conditionIds.
    Retourne les 2 réponses brutes (packs, boxes) séparément : pas de `total`
    combiné ici, à l'appelant de sommer (comptage) ou de regarder les titres
    des deux (contrôle de précision)."""
    results = []
    for i, category_id in enumerate((CATEGORY_SEALED_PACKS, CATEGORY_SEALED_BOXES)):
        if i > 0:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        results.append(search(item["name"], category_id, limit=limit))
    return results


# La contrainte UNIQUE porte sur (item_id, captured_at, marketplace,
# buying_option, grade) -- DO NOTHING comme price_snapshots (gauge écrit une
# fois par jour, un re-run le même jour ne doit pas planter ni écraser).
_UPSERT_ACTIVE_LISTINGS_SQL = """
    INSERT INTO active_listings (item_id, captured_at, marketplace, buying_option, grade, listing_count)
    VALUES %s
    ON CONFLICT (item_id, captured_at, marketplace, buying_option, grade) DO NOTHING
"""


def sync_active_listings_for_tcg(
    tcg: str, category: str = "sealed", since_months: int | None = 18, max_items: int | None = None,
) -> dict:
    """Comptage de listings actifs par item scellé, alimente `active_listings`.

    Même filtre que price_sync_scope/JustTCG par défaut (`category='sealed'`,
    `since_months=18`, cf. mémoire projet) : scope volontairement restreint en
    v1, pas une histoire de quota ici (5000 req/jour eBay est large, cf.
    ebay.py) mais de validation progressive (cf. mémoire projet
    "phased_by_tcg") -- les singles ont pourtant une précision mesurée à 98%
    (probe_ebay.py), mais élargir le scope est une décision à prendre
    explicitement, pas un effet de bord de ce commit.

    Pour chaque item, somme CCG Sealed Packs + CCG Sealed Boxes (2 requêtes) :
    impossible de router de façon fiable vers une seule des deux catégories à
    partir du nom produit (des Tins/Blisters similaires atterrissent des deux
    côtés côté eBay, cf. probe_ebay.py), donc on interroge systématiquement
    les deux plutôt que de risquer de perdre du volume.

    `max_items` plafonne le nombre d'items traités (utile pour tester ou pour
    un run à budget limité) -- même rôle que dans pricecharting.py.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            where = ["tcg = %s", "category = %s", "language = 'EN'"]
            params: list = [tcg, category]
            if since_months:
                where.append("release_date >= (CURRENT_DATE - %s * INTERVAL '1 month')")
                params.append(since_months)
            cur.execute(
                f"SELECT id, name, set_code FROM items WHERE {' AND '.join(where)} ORDER BY id",
                params,
            )
            items = [{"id": r[0], "name": r[1], "set_code": r[2]} for r in cur.fetchall()]

        if max_items is not None:
            items = items[:max_items]
        print(f"{len(items)} item(s) éligibles pour tcg={tcg}, category={category} (max_items={max_items}).")

        today = date.today()
        # Batch vidé après chaque flush (contrairement à un simple compteur
        # de modulo) : sinon un flush périodique renvoie encore les lignes
        # déjà commitées aux tours suivants -- ON CONFLICT DO NOTHING absorbe
        # l'erreur mais gaspille de la bande passante en O(n²) sur un run de
        # ~1300 items. Même pattern que justtcg.py (rows remis à zéro par chunk).
        batch: list[tuple] = []
        rows_written = 0
        errors = []
        with conn.cursor() as cur:
            for i, item in enumerate(items):
                if i > 0:
                    time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                try:
                    packs_resp, boxes_resp = search_sealed(item, limit=1)
                except Exception as exc:
                    print(f"    ! erreur eBay pour {item['name']!r} (id={item['id']}): {exc}")
                    errors.append({"item_id": item["id"], "name": item["name"], "error": str(exc)})
                    continue
                total = packs_resp.get("total", 0) + boxes_resp.get("total", 0)
                batch.append((item["id"], today, "ebay", "all", "ungraded", total))

                if len(batch) >= 100:
                    execute_values(cur, _UPSERT_ACTIVE_LISTINGS_SQL, batch)
                    conn.commit()
                    rows_written += len(batch)
                    print(f"  {i + 1}/{len(items)} items traités, {rows_written} lignes upsertées jusqu'ici.")
                    batch = []

            if batch:
                execute_values(cur, _UPSERT_ACTIVE_LISTINGS_SQL, batch)
                conn.commit()
                rows_written += len(batch)
    finally:
        conn.close()

    return {
        "tcg": tcg,
        "category": category,
        "items_processed": len(items),
        "rows_written": rows_written,
        "errors": errors,
    }


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--tcg", default="pokemon")
    parser.add_argument("--category", default="sealed")
    parser.add_argument("--since-months", type=int, default=18)
    parser.add_argument("--max-items", type=int, default=None)
    args = parser.parse_args()
    since_months = args.since_months or None

    print(
        f"== Sync active_listings pour tcg={args.tcg} "
        f"(category={args.category}, since_months={since_months}, max_items={args.max_items}) =="
    )
    stats = sync_active_listings_for_tcg(
        args.tcg, category=args.category, since_months=since_months, max_items=args.max_items,
    )
    print(f"\nTerminé : {stats}")


if __name__ == "__main__":
    main()
