"""Scraper d'appoint : LimitlessTCG (onepiece.limitlesstcg.com) -- backfill de
`items.rarity` pour One Piece pendant que le quota API TCG est bloqué (cf.
mémoire projet "apitcg_quota_1000_incremental_sync", reset estimé ~35 jours
au moment d'écrire ceci). One Piece uniquement : Pokémon a une nomenclature
de set (`BST`, etc.) qui ne correspond pas à nos `set_code`/`code` API TCG,
mapping non trivial -- cf. discussion, pas fait ici.

Pourquoi ce site : proposé par l'utilisateur un autre site
(pokemoncard.io) d'abord, écarté -- son robots.txt bloque explicitement
ClaudeBot. onepiece.limitlesstcg.com n'a aucune restriction
(`User-agent: * / Disallow:` vide), c'est une base de données communautaire
de référence pour le jeu compétitif (même famille de sites que
limitlesstcg.com côté Pokémon).

Une requête par SET (pas par carte) via `/cards/{slug}?display=full`, qui
renvoie toutes les cartes du set en une page -- ~61 sets réels trouvés dans
nos `code` existants (cf. `list_code_prefixes`), donc ~61 requêtes pour tout
backfiller, indépendant du quota API TCG.

Le `set_code` qu'on a déjà (issu d'API TCG) ne sert PAS à dériver le slug
LimitlessTCG : c'est un bucket "catalogue" qui mélange plusieurs vrais sets
d'origine (ex. `one-piece-500-years-in-the-future` contient des cartes
OP01/OP03/OP05/OP06/OP07/ST10 pêle-mêle -- même défaut que documenté pour
les sets junk, cf. mémoire projet apitcg_junk_sets). Le vrai set d'origine
est en fait déjà présent dans le `code` de chaque carte (le préfixe avant le
tiret, ex. "OP01" dans "OP01-016") -- c'est directement le slug LimitlessTCG,
d'où `list_code_prefixes` plutôt qu'une table de correspondance manuelle.

Un `code` (ex. "OP01-016") correspond souvent à PLUSIEURS lignes `items`
(carte de base + versions Parallel/Alternate Art/Full Art/Manga, distinguées
uniquement par un suffixe dans `name`, ex. "Roronoa Zoro (001) (Parallel)").
La rareté officielle (Common/Rare/Super Rare/...) est la même pour toutes
ces versions -- seul le traitement graphique du print change, pas la
rareté -- donc on applique la même rareté à toutes les lignes qui partagent
un `code`, sans essayer de distinguer laquelle est "la Parallel".
`KNOWN_RARITIES` sert à repérer, parmi les blocs d'un même code (une carte
avec un print alternatif dans le même set apparaît comme un bloc séparé),
lequel porte la vraie rareté plutôt qu'un libellé de traitement visuel
("Alternate Art", "Full Art", "Manga Art"...).

Limites connues, acceptées (pas la peine de creuser plus pour ce backfill
d'appoint) :
- Le bucket promo (préfixe `code` = "P", ~349 cartes) : `/cards/P` fait 404
  et `/cards/promos` (le vrai slug LimitlessTCG) ne renvoie aucun bloc
  `card-page-main` avec `display=full` -- structure de page différente pour
  ce bucket, non creusée ici.
- "1/1000" (1 seule ligne) : artefact de données côté API TCG, pas un vrai
  préfixe de set.
Les deux échouent proprement (fetch en erreur ou 0 rareté trouvée) et sont
simplement comptés dans `skipped`, pas une exception qui casse le run.
"""
import time

import requests
from bs4 import BeautifulSoup
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://onepiece.limitlesstcg.com"
REQUEST_PAUSE_SECONDS = 1.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Rareté officielle One Piece (cf. docstring module) -- tout libellé absent
# de cet ensemble est un traitement de print (Alternate Art, Full Art,
# Manga Art...), pas une rareté, et est ignoré plutôt que mal-assigné.
KNOWN_RARITIES = {
    "Leader",
    "Common",
    "Uncommon",
    "Rare",
    "Super Rare",
    "Secret Rare",
    "Special",
    "Treasure Rare",
    "Promo",
    "Don!!",
    "Double Rare",
}


def list_code_prefixes() -> list[str]:
    """Préfixes de `code` réellement présents en base pour One Piece (ex.
    "OP01", "ST12", "EB03") -- ce sont directement les slugs de set
    LimitlessTCG, cf. docstring module."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT DISTINCT split_part(code, '-', 1) AS prefix
                   FROM items
                   WHERE tcg = 'one-piece' AND source = 'apitcg' AND code IS NOT NULL
                   ORDER BY prefix"""
            )
            return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def fetch_set_page(slug: str) -> str:
    resp = requests.get(f"{BASE_URL}/cards/{slug}", params={"display": "full"}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_set_rarities(html: str) -> dict[str, str]:
    """Une carte (`code`) -> rareté officielle. Cf. docstring module pour le
    filtre `KNOWN_RARITIES` (ignore les blocs "Alternate Art" etc.)."""
    soup = BeautifulSoup(html, "html.parser")
    by_code: dict[str, str] = {}
    for block in soup.select("div.card-page-main"):
        code_el = block.select_one(".card-text-id")
        if not code_el:
            continue
        code = code_el.get_text(strip=True)
        rarity_spans = block.select(".card-prints-current .prints-current-details span")
        if len(rarity_spans) < 2:
            continue
        label = rarity_spans[1].get_text(strip=True)
        if label in KNOWN_RARITIES:
            by_code[code] = label
    return by_code


_UPDATE_RARITY_SQL = """
    UPDATE items SET rarity = data.rarity
    FROM (VALUES %s) AS data (code, rarity)
    WHERE items.tcg = 'one-piece' AND items.source = 'apitcg' AND items.code = data.code
"""


def sync_set_rarities(slug: str) -> int:
    """Scrape un set LimitlessTCG et met à jour `items.rarity` pour tous les
    codes trouvés (base + Parallel/Alternate Art/... qui partagent le même
    code, cf. docstring module). Retourne le nombre de codes traités (pas le
    nombre de lignes -- `cur.rowcount` ne reflète que le dernier lot interne
    d'`execute_values` quand il pagine, donc pas fiable comme décompte total
    ; un `page_size` couvrant toutes les lignes en un seul lot évite le
    problème côté écriture, mais le décompte reste sur les codes)."""
    html = fetch_set_page(slug)
    by_code = parse_set_rarities(html)
    if not by_code:
        return 0
    rows = list(by_code.items())
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            execute_values(cur, _UPDATE_RARITY_SQL, rows, page_size=len(rows))
        conn.commit()
    finally:
        conn.close()
    return len(rows)


def sync_all_rarities(slugs: list[str] | None = None) -> dict:
    """Boucle sur tous les préfixes/slugs -- une requête par set, pause
    entre chaque pour rester poli avec le site. `skipped` recense les slugs
    qui n'ont renvoyé ni erreur HTTP fatale ni rareté exploitable (cf.
    "Limites connues" du docstring module)."""
    if slugs is None:
        slugs = list_code_prefixes()

    total_updated = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, slug in enumerate(slugs):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            updated = sync_set_rarities(slug)
        except Exception as exc:
            print(f"  {slug}: erreur -- {exc}")
            errors.append({"slug": slug, "error": str(exc)})
            continue
        if updated == 0:
            skipped.append(slug)
            print(f"  {slug}: aucune rareté trouvée (ignoré)")
        else:
            total_updated += updated
            print(f"  {slug}: {updated} code(s) traité(s)")

    return {"total_updated": total_updated, "skipped": skipped, "errors": errors}


def main():
    from dotenv import load_dotenv

    load_dotenv()
    print("== Backfill rareté One Piece (LimitlessTCG) ==")
    result = sync_all_rarities()
    print(f"\nTerminé : {result['total_updated']} code(s) traité(s) au total.")
    if result["skipped"]:
        print(f"Ignorés (aucune rareté trouvée) : {', '.join(result['skipped'])}")
    if result["errors"]:
        print(f"Erreurs : {result['errors']}")


if __name__ == "__main__":
    main()
