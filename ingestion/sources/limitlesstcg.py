"""Scraper d'appoint : LimitlessTCG -- backfill de `items.rarity` pour One
Piece (onepiece.limitlesstcg.com) et Pokémon (limitlesstcg.com) pendant que
le quota API TCG est bloqué (cf. mémoire projet
"apitcg_quota_1000_incremental_sync", reset estimé ~35 jours au moment
d'écrire ceci).

Pourquoi ce site : l'utilisateur a proposé un autre site (pokemoncard.io)
d'abord, écarté -- son robots.txt bloque explicitement ClaudeBot. Les deux
sites LimitlessTCG (même plateforme, un par jeu) n'ont aucune restriction
(`User-agent: * / Disallow:` vide), ce sont les bases de données
communautaires de référence pour le jeu compétitif.

Une requête par SET (pas par carte) via `/cards/{slug}?display=full`, qui
renvoie toutes les cartes du set en une page.

One Piece et Pokémon utilisent la même technique de scraping mais un
mapping slug-de-set différent, cf. les deux sections ci-dessous :

- **One Piece** : le `set_code` qu'on a déjà (issu d'API TCG) ne sert PAS à
  dériver le slug LimitlessTCG -- c'est un bucket "catalogue" qui mélange
  plusieurs vrais sets d'origine (ex. `one-piece-500-years-in-the-future`
  contient des cartes OP01/OP03/OP05/OP06/OP07/ST10 pêle-mêle -- même défaut
  que documenté pour les sets junk, cf. mémoire projet apitcg_junk_sets). Le
  vrai set d'origine est en fait déjà présent dans le `code` de chaque carte
  (le préfixe avant le tiret, ex. "OP01" dans "OP01-016") -- c'est
  directement le slug LimitlessTCG, d'où `list_one_piece_code_prefixes`
  plutôt qu'une table de correspondance manuelle. Un `code` (ex.
  "OP01-016") correspond souvent à PLUSIEURS lignes `items` (carte de base +
  versions Parallel/Alternate Art/Full Art/Manga, distinguées uniquement par
  un suffixe dans `name`). La rareté officielle est la même pour toutes ces
  versions -- seul le traitement graphique du print change -- donc on
  l'applique à toutes les lignes qui partagent un `code`.
  `ONE_PIECE_KNOWN_RARITIES` sert à repérer, parmi les blocs d'un même code,
  lequel porte la vraie rareté plutôt qu'un libellé de traitement visuel
  ("Alternate Art", "Full Art", "Manga Art"...).

- **Pokémon** : pas de raccourci équivalent -- le `code` Pokémon ("033/182")
  ne porte pas le set. Il faut faire correspondre le nom de chaque set
  LimitlessTCG (page `/cards`, une seule requête pour tout lister) à notre
  `set_code`, par recouvrement de tokens de nom normalisés (cf.
  `build_pokemon_set_mapping`) -- les correspondances ambiguës (plusieurs
  slugs LimitlessTCG matchant le même `set_code`, signe d'un bucket
  fourre-tout côté API TCG, ex. "Mega Evolution"/"Mega Evolution
  Energy"/"Mega Promos" qui collent tous au même
  `pokemon-me-mega-evolution-promo`) sont exclues plutôt que résolues au
  hasard. Contrairement à One Piece, un numéro de carte Pokémon est TOUJOURS
  unique au sein d'un set (vérifié : aucun doublon sur plusieurs sets
  échantillon) -- une version Parallel/Alternate Art a son propre numéro,
  donc pas besoin d'un filtre "rareté connue" pour désambiguïser : on garde
  simplement tout bloc qui a une rareté listée, et on ignore ceux qui n'en
  ont pas (Energies de base dans les sets vintage, dont le libellé reste
  juste "#N" sans rareté après le point median).

Limites connues, acceptées (pas la peine de creuser plus pour ce backfill
d'appoint) :
- One Piece : le bucket promo (préfixe `code` = "P", ~349 cartes) --
  `/cards/P` fait 404 et `/cards/promos` (le vrai slug) ne renvoie aucun bloc
  `card-page-main` avec `display=full` -- structure de page différente, non
  creusée ici. "1/1000" (1 seule ligne) : artefact de données API TCG.
- Pokémon : ~30 sets LimitlessTCG sur 152 restent sans correspondance
  (ambigus ou score de matching trop faible) -- cf. `build_pokemon_set_mapping`.
Tout échoue proprement (fetch en erreur ou 0 rareté trouvée) et est compté
dans `skipped`/`errors`, jamais une exception qui casse tout le run.
"""
import re
import time
import unicodedata

# Numérateur de `code` -> forme canonique comparable au numéro nu
# LimitlessTCG : gère le préfixe alpha optionnel (sous-collections type
# Trainer Gallery/Shiny Vault/Galarian Gallery, ex. "TG01" -> "TG1",
# "SV001" -> "SV1", "GG01" -> "GG1") et les zéros de padding -- cf. mémoire
# projet, découvert en creusant pourquoi ces sous-collections ne matchaient
# jamais alors que leur set_code matchait bien.
_NUMERATOR_RE = re.compile(r"^([A-Za-z]*)0*(\d+)$")


def _normalize_numerator(raw: str) -> str | None:
    m = _NUMERATOR_RE.match(raw)
    if not m:
        return None
    prefix, digits = m.groups()
    return f"{prefix}{digits}"

import requests
from bs4 import BeautifulSoup
from psycopg2.extras import execute_values

from shared.db import get_connection

ONE_PIECE_BASE_URL = "https://onepiece.limitlesstcg.com"
POKEMON_BASE_URL = "https://limitlesstcg.com"
REQUEST_PAUSE_SECONDS = 1.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# ─────────────────────────────────────────────────────────────────────────
# One Piece
# ─────────────────────────────────────────────────────────────────────────

# Rareté officielle One Piece (cf. docstring module) -- tout libellé absent
# de cet ensemble est un traitement de print (Alternate Art, Full Art,
# Manga Art...), pas une rareté, et est ignoré plutôt que mal-assigné.
ONE_PIECE_KNOWN_RARITIES = {
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


def list_one_piece_code_prefixes() -> list[str]:
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


def fetch_one_piece_set_page(slug: str) -> str:
    resp = requests.get(f"{ONE_PIECE_BASE_URL}/cards/{slug}", params={"display": "full"}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_one_piece_set_rarities(html: str) -> dict[str, str]:
    """Une carte (`code`) -> rareté officielle. Cf. docstring module pour le
    filtre `ONE_PIECE_KNOWN_RARITIES` (ignore les blocs "Alternate Art" etc.)."""
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
        if label in ONE_PIECE_KNOWN_RARITIES:
            by_code[code] = label
    return by_code


_UPDATE_ONE_PIECE_RARITY_SQL = """
    UPDATE items SET rarity = data.rarity
    FROM (VALUES %s) AS data (code, rarity)
    WHERE items.tcg = 'one-piece' AND items.source = 'apitcg' AND items.code = data.code
"""


def sync_one_piece_set_rarities(slug: str) -> int:
    """Scrape un set LimitlessTCG et met à jour `items.rarity` pour tous les
    codes trouvés (base + Parallel/Alternate Art/... qui partagent le même
    code, cf. docstring module). Retourne le nombre de codes traités (pas le
    nombre de lignes -- `cur.rowcount` ne reflète que le dernier lot interne
    d'`execute_values` quand il pagine, donc pas fiable comme décompte total
    ; un `page_size` couvrant toutes les lignes en un seul lot évite le
    problème côté écriture, mais le décompte reste sur les codes)."""
    html = fetch_one_piece_set_page(slug)
    by_code = parse_one_piece_set_rarities(html)
    if not by_code:
        return 0
    rows = list(by_code.items())
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            execute_values(cur, _UPDATE_ONE_PIECE_RARITY_SQL, rows, page_size=len(rows))
        conn.commit()
    finally:
        conn.close()
    return len(rows)


def sync_all_one_piece_rarities(slugs: list[str] | None = None) -> dict:
    """Boucle sur tous les préfixes/slugs -- une requête par set, pause
    entre chaque pour rester poli avec le site. `skipped` recense les slugs
    qui n'ont renvoyé ni erreur HTTP fatale ni rareté exploitable (cf.
    "Limites connues" du docstring module)."""
    if slugs is None:
        slugs = list_one_piece_code_prefixes()

    total = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, slug in enumerate(slugs):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            n = sync_one_piece_set_rarities(slug)
        except Exception as exc:
            print(f"  {slug}: erreur -- {exc}")
            errors.append({"slug": slug, "error": str(exc)})
            continue
        if n == 0:
            skipped.append(slug)
            print(f"  {slug}: aucune rareté trouvée (ignoré)")
        else:
            total += n
            print(f"  {slug}: {n} code(s) traité(s)")

    return {"total": total, "skipped": skipped, "errors": errors}


# ─────────────────────────────────────────────────────────────────────────
# Pokémon
# ─────────────────────────────────────────────────────────────────────────

# Normalisation singulier/pluriel -- LimitlessTCG dit "Mega Promos", notre
# set_code dit "...-promo" (singulier) : sans ça, les deux ne partagent pas
# le même token alors qu'ils désignent la même notion. Pas un retrait pur
# (contrairement à une v1 de ce module) : un retrait complet de "promo"
# faisait matcher "Mega Evolution" et "Mega Evolution Promo" comme
# identiques, un faux positif -- cf. mémoire projet.
_PLURAL_NORMALIZE = {"promos": "promo", "energies": "energy", "cards": "card"}
_GEN_CODE_RE = re.compile(r"^(sv|swsh|sm|xy|bw|dp|ex|hgss|me)\d*$")


def _set_name_tokens(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"^pokemon-", "", s)
    s = s.replace("'", "")
    s = s.replace("&", " and ")  # LimitlessTCG "Black & White" vs our "black-and-white"
    s = re.sub(r"[^a-z0-9]+", " ", s)
    toks = {_PLURAL_NORMALIZE.get(t, t) for t in s.split() if t}
    return {t for t in toks if not _GEN_CODE_RE.fullmatch(t)}


def fetch_pokemon_set_list() -> dict[str, str]:
    """slug -> nom lisible pour chaque set Pokémon, depuis la page /cards de
    limitlesstcg.com (une seule requête, liste tous les sets)."""
    resp = requests.get(f"{POKEMON_BASE_URL}/cards", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    date_re = re.compile(r"^\d{1,2} [A-Za-z]{3} \d{2}$")
    stat_re = re.compile(r"^\d+\s")
    sets: dict[str, str] = {}
    for a in soup.select('table a[href^="/cards/"]'):
        slug = a.get("href").split("/")[-1]
        if slug in sets:
            continue
        ann = a.select_one(".code.annotation")
        ann_text = ann.get_text(strip=True) if ann else ""
        name = a.get_text(" ", strip=True).replace(ann_text, "").strip()
        if not name or date_re.match(name) or stat_re.match(name):
            continue
        sets[slug] = name
    return sets


def build_pokemon_set_mapping() -> dict[str, str]:
    """slug LimitlessTCG -> notre `set_code`, par recouvrement de tokens de
    nom (cf. docstring module -- pas de raccourci direct comme pour One
    Piece). Score de Jaccard symétrique (intersection/union des tokens
    significatifs des deux côtés) : un match ne compte que si les deux noms
    ont exactement le même ensemble de tokens significatifs (score 1.0).
    Une comparaison asymétrique ("tous les tokens du plus petit sont dans
    le plus grand") a été essayée d'abord et faisait matcher "Base Set 2"
    aussi bien contre "pokemon-base-set" que "pokemon-base-set-2" (le
    premier n'a pas le token "2" en trop qui pénalise, mais rien ne
    pénalisait le second d'en avoir un de moins) -- cf. mémoire projet.
    Les `set_code` réclamés par plusieurs slugs LimitlessTCG à la fois
    restent exclus (bucket réellement fourre-tout côté API TCG) plutôt que
    résolus au hasard."""
    limitless_sets = fetch_pokemon_set_list()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT DISTINCT set_code FROM items
                   WHERE tcg = 'pokemon' AND source = 'apitcg' AND set_code IS NOT NULL"""
            )
            our_codes = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    our_tokens = {code: _set_name_tokens(code) for code in our_codes}

    raw_matches: dict[str, str] = {}
    for slug, name in limitless_sets.items():
        ltoks = _set_name_tokens(name)
        if not ltoks:
            continue
        best_code, best_score = None, 0.0
        for code, otoks in our_tokens.items():
            if not otoks:
                continue
            union = ltoks | otoks
            s = len(ltoks & otoks) / len(union) if union else 0.0
            if s > best_score:
                best_score, best_code = s, code
        if best_score >= 1.0:
            raw_matches[slug] = best_code

    by_code: dict[str, list[str]] = {}
    for slug, code in raw_matches.items():
        by_code.setdefault(code, []).append(slug)
    return {slug: code for slug, code in raw_matches.items() if len(by_code[code]) == 1}


def fetch_pokemon_set_page(slug: str) -> str:
    resp = requests.get(f"{POKEMON_BASE_URL}/cards/{slug}", params={"display": "full"}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_pokemon_set_rarities(html: str) -> dict[str, str]:
    """numéro de carte (str, ex. "1") -> rareté. Contrairement à One Piece,
    un numéro Pokémon est toujours unique au sein d'un set (vérifié sur
    plusieurs sets échantillon, aucun doublon) -- pas de filtre "rareté
    connue" nécessaire, juste ignorer les blocs sans rareté listée
    (Energies de base dans les sets vintage : le libellé reste "#N" sans
    "· rareté" derrière)."""
    soup = BeautifulSoup(html, "html.parser")
    by_number: dict[str, str] = {}
    for block in soup.select("div.card-page-main"):
        name_link = block.select_one(".card-text-name a")
        if not name_link:
            continue
        number = name_link.get("href").split("/")[-1]
        spans = block.select(".card-prints-current .prints-current-details span")
        if len(spans) < 2:
            continue
        raw = spans[1].get_text(strip=True)
        parts = raw.split("·")
        if len(parts) < 2:
            continue
        by_number[number] = parts[-1].strip()
    return by_number


def sync_pokemon_set_rarities(slug: str, set_code: str) -> int:
    """Scrape un set LimitlessTCG et met à jour `items.rarity` pour les
    cartes de ce `set_code` dont le numérateur de `code` (ex. "33" dans
    "033/182") correspond au numéro trouvé. Match par `id` (pas par
    set_code+numérateur en SQL) pour éviter de caster des `code` mal formés
    (promos sans "/", etc.) côté base -- filtré ici en Python à la place."""
    html = fetch_pokemon_set_page(slug)
    by_number = parse_pokemon_set_rarities(html)
    if not by_number:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, code FROM items
                   WHERE tcg = 'pokemon' AND source = 'apitcg' AND set_code = %s AND code IS NOT NULL""",
                (set_code,),
            )
            rows = cur.fetchall()

        updates = []
        for item_id, code in rows:
            numerator = _normalize_numerator(code.split("/")[0])
            if numerator is None:
                continue
            rarity = by_number.get(numerator)
            if rarity:
                updates.append((item_id, rarity))

        if not updates:
            return 0

        with conn.cursor() as cur:
            execute_values(
                cur,
                "UPDATE items SET rarity = data.rarity FROM (VALUES %s) AS data (id, rarity) WHERE items.id = data.id",
                updates,
                page_size=len(updates),
            )
        conn.commit()
    finally:
        conn.close()
    return len(updates)


def sync_all_pokemon_rarities(mapping: dict[str, str] | None = None) -> dict:
    """Boucle sur le mapping slug->set_code (calculé si non fourni) -- une
    requête par set, pause entre chaque."""
    if mapping is None:
        mapping = build_pokemon_set_mapping()

    total = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, (slug, set_code) in enumerate(mapping.items()):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            n = sync_pokemon_set_rarities(slug, set_code)
        except Exception as exc:
            print(f"  {slug} ({set_code}): erreur -- {exc}")
            errors.append({"slug": slug, "set_code": set_code, "error": str(exc)})
            continue
        if n == 0:
            skipped.append(slug)
            print(f"  {slug} ({set_code}): aucune rareté trouvée (ignoré)")
        else:
            total += n
            print(f"  {slug} ({set_code}): {n} carte(s) traitée(s)")

    return {"total": total, "skipped": skipped, "errors": errors}


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--tcg", choices=["one-piece", "pokemon"], default="one-piece")
    args = parser.parse_args()

    if args.tcg == "one-piece":
        print("== Backfill rareté One Piece (LimitlessTCG) ==")
        result = sync_all_one_piece_rarities()
    else:
        print("== Backfill rareté Pokémon (LimitlessTCG) ==")
        mapping = build_pokemon_set_mapping()
        print(f"{len(mapping)} set(s) LimitlessTCG mis en correspondance :")
        for slug, set_code in mapping.items():
            print(f"  {slug} -> {set_code}")
        print()
        result = sync_all_pokemon_rarities(mapping)

    print(f"\nTerminé : {result['total']} traité(s) au total.")
    if result["skipped"]:
        print(f"Ignorés (aucune rareté trouvée) : {', '.join(result['skipped'])}")
    if result["errors"]:
        print(f"Erreurs : {result['errors']}")


if __name__ == "__main__":
    main()
