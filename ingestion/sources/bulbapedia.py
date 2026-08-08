"""Scraper d'appoint : Bulbapedia -- backfill de `items.rarity` pour le
Pokémon JP vintage que LimitlessTCG ne peut structurellement pas couvrir
(sa section JP ne remonte qu'à Black & White ~2011, cf. docstring
`ingestion/sources/limitlesstcg.py` et mémoire projet
"limitlesstcg_rarity_backfill"). Robots.txt de bulbapedia.bulbagarden.net
ouvert (`Crawl-delay: 5`, pas de blocage de bot nommé, contrairement à
pokemoncard.io déjà écarté) -- vérifié le 2026-08-08 avant d'écrire quoi
que ce soit.

Bulbapedia est un MediaWiki : on utilise son API officielle
(`action=parse&prop=wikitext`) plutôt que du scraping HTML, pour du
wikitext structuré en templates cohérents plutôt que du HTML rendu fragile.
Chaque set utilise un template `{{Setlist/*entry|NUM/TOTAL|{{TCG ID|...}}|
Type|...|Rareté}}` -- vérifié cohérent sur 3 époques très différentes
(Base Set 1996, Neo Genesis 2000, ère Diamond & Pearl 2007) avant de
construire ce module.

Contrairement à LimitlessTCG, pas besoin d'énumérer "tous les sets" côté
source : le titre d'article se devine directement depuis notre `set_code`
(déjà un slug anglais lisible, cf. mémoire projet "jp_singles_tracking") --
`_guess_title` + convention Bulbapedia "Nom Du Set (TCG)". Beaucoup de
titres JP redirigent vers l'article combiné EN+JP (ex.
"Secret of the Lakes (TCG)" -> "Mysterious Treasures (TCG)"), géré via
`redirects=1` côté API. `JP_BULBAPEDIA_TITLE_OVERRIDES` couvre les cas où
le guess échoue.

Deux voies de correspondance carte -> rareté, selon ce que porte `items.code`
(cf. mémoire projet "jp_singles_tracking" -- simple numéro, pas de "/total") :
1. Numérateur (voie principale, la grande majorité des sets JP vintage ont
   un `code` numérique) -- comparé au numérateur du template `NUM/TOTAL`.
2. Nom de carte normalisé (repli pour les sets où `code` est NULL, ex.
   "pokemon-jp-secret-of-the-lakes") -- seulement si le nom est SANS
   AMBIGUÏTÉ dans le set (une seule carte de ce nom) des deux côtés, sinon
   ignoré plutôt que deviné (une carte "Unown" en multiples formes rendrait
   ça faux sans plus de contexte).

Fetch via `requests` avec un User-Agent DESCRIPTIF, PAS un User-Agent de
navigateur usurpé (contrairement à limitlesstcg.py/pricecharting.py) --
testé en direct le 2026-08-08 : le Cloudflare de bulbagarden.net bloque
systématiquement (403 "Just a moment...") un client qui prétend être Chrome
sans en avoir la vraie empreinte TLS/JS, qu'il s'agisse de `requests` ou de
`curl` -- ce n'était donc pas une question de librairie HTTP. Un UA
descriptif honnête (identifiant l'outil, cf. étiquette officielle de l'API
MediaWiki) passe sans souci des deux côtés. Cf. mémoire projet
"psa_pop_report_blocked" pour le précédent inverse (Cloudflare bloquant
tout, source écartée) -- ici le blocage ciblait spécifiquement l'usurpation,
pas l'accès programmatique en tant que tel."""
from __future__ import annotations

import re
import time

import requests
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://bulbapedia.bulbagarden.net/w/api.php"
HEADERS = {"User-Agent": "tcg-index-rarity-backfill/1.0 (research script, JP vintage Pokémon TCG rarity)"}
# Le robots.txt du site annonce Crawl-delay: 5 (plus prudent que les 1.0s de
# limitlesstcg.py, cf. mémoire projet) -- on le respecte à la lettre côté
# scraper de prod, même si l'API `parse` est probablement plus légère qu'un
# vrai chargement de page.
REQUEST_PAUSE_SECONDS = 5.0

# "no" volontairement absent -- ambigu ("The Town on No Map" : "No" est une
# négation, pas une préposition à minusculiser, cf. mémoire projet
# "limitlesstcg_rarity_backfill" pour comment ce faux positif a été trouvé.
_SMALL_WORDS = {"a", "an", "the", "of", "to", "in", "and", "at", "on", "for", "from", "vs"}

# Abréviations qui doivent rester intégralement en majuscules dans le titre
# plutôt que d'être title-casées ("Ex"/"Gx"/"Vmax" seraient faux) -- vues en
# sondant les vrais titres Bulbapedia (ex. "EX Battle Boost (TCG)",
# "VMAX Climax (TCG)", "GX Ultra Shiny (TCG)").
_UPPERCASE_WORDS = {"ex", "gx", "v", "vmax", "vstar", "vunion", "dx", "sp", "tcg"}


def _guess_title(set_code: str) -> str:
    """`pokemon-jp-golden-sky-silvery-ocean` -> `Golden Sky Silvery Ocean
    (TCG)` -- convention de titre Bulbapedia (Title Case + suffixe
    désambiguïsation)."""
    s = re.sub(r"^pokemon-jp-", "", set_code)
    words = s.split("-")
    out = []
    for i, w in enumerate(words):
        if w.lower() in _UPPERCASE_WORDS:
            out.append(w.upper())
        elif i > 0 and w.lower() in _SMALL_WORDS:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out) + " (TCG)"


# set_code -> titre d'article Bulbapedia exact, pour les cas où le guess
# automatique échoue (nom JP traduit trop différemment du titre anglais
# officiel de l'article, ou article organisé sous un autre nom d'ère).
#
# BARRE DE SÉCURITÉ appliquée en construisant cette table (2026-08-08) :
# un titre deviné qui renvoie une page avec du contenu Setlist NE SUFFIT PAS
# à confirmer que c'est le bon set -- découvert sur un vrai faux positif en
# sondant : deviner "Mega Brave (TCG)" pour `pokemon-jp-mega-dream-ex`
# renvoie une vraie page avec un Setlist... mais pour un produit DIFFÉRENT
# ("Mega Brave"/"Mega Symphonia" sont des slugs LimitlessTCG distincts de
# "Mega Dream ex", cf. `limitlesstcg.fetch_pokemon_jp_set_list`). L'utiliser
# aurait écrit une rareté empruntée au mauvais set -- pire qu'un NULL. Même
# écueil sur `pokemon-jp-shiny-treasure-ex` -> "Paldean Fates (TCG)" (le set
# JP "Shiny Treasure ex" est nettement plus gros que le sous-ensemble EN
# "Paldean Fates", periметre différent, risque de mauvais matching par
# numérateur). Ci-dessous, seulement deux catégories d'entrées :
# 1. Le titre deviné résout SANS redirect vers lui-même (donc c'est
#    directement la bonne page, pas une coïncidence de redirect).
# 2. Correspondances EN/JP historiquement établies (ère Neo / e-Card-Delta
#    Species / Diamond & Pearl), documentées de façon identique dans
#    n'importe quelle référence sérieuse du TCG (Bulbapedia elle-même,
#    Serebii, TCG Collector...) -- pas une supposition issue du seul
#    sondage de ce run.
JP_BULBAPEDIA_TITLE_OVERRIDES: dict[str, str] = {
    # Titre deviné != notre set_code slugifié, mais résout vers lui-même.
    "pokemon-jp-terastal-festival": "Terastal Fest ex (TCG)",
    "pokemon-jp-space-time": "Space-Time Creation (TCG)",
    "pokemon-jp-golden-sky-silvery-ocean": "Golden Sky, Silvery Ocean (TCG)",
    "pokemon-jp-holon-research": "Holon Research Tower (TCG)",
    "pokemon-jp-vs": "VS (TCG)",
    "pokemon-jp-darkness-and-to-light": "Darkness, and to Light... (TCG)",
    "pokemon-jp-gold-silver-new-world": "Gold, Silver, to a New World... (TCG)",
    "pokemon-jp-sky-splitting-charisma": "Sky-Splitting Charisma (TCG)",
    "pokemon-jp-crossing-the-ruins": "Crossing the Ruins... (TCG)",
    "pokemon-jp-magma-vs-aqua-two-ambitions": "Team Magma vs Team Aqua (TCG)",
    # Correspondances EN/JP historiques établies (nom JP traduit très
    # différent du titre anglais officiel de l'article combiné EN+JP).
    "pokemon-jp-heartgold-collection": "HeartGold & SoulSilver (TCG)",
    "pokemon-jp-soulsilver-collection": "HeartGold & SoulSilver (TCG)",
}


def fetch_wikitext(title: str) -> tuple[str, str] | None:
    """Renvoie (wikitext, titre_résolu_après_redirect) ou None si la page
    n'existe pas."""
    resp = requests.get(
        BASE_URL,
        params={"action": "parse", "page": title, "prop": "wikitext", "redirects": 1, "format": "json"},
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        return None
    return data["parse"]["wikitext"]["*"], data["parse"].get("title", title)


def _split_template_params(inner: str) -> list[str]:
    """Découpe les paramètres d'un appel de template MediaWiki sur les '|'
    de premier niveau seulement -- ignore ceux à l'intérieur d'un
    sous-template imbriqué (ex. `{{TCG ID|Set|Carte|Num}}` a ses propres
    '|' qui ne doivent pas fragmenter le split)."""
    params: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    while i < len(inner):
        two = inner[i:i + 2]
        if two == "{{":
            depth += 1
            current.append(two)
            i += 2
            continue
        if two == "}}":
            depth -= 1
            current.append(two)
            i += 2
            continue
        if inner[i] == "|" and depth == 0:
            params.append("".join(current))
            current = []
            i += 1
            continue
        current.append(inner[i])
        i += 1
    params.append("".join(current))
    return params


def _find_template_blocks(wikitext: str, name_prefix: str) -> list[str]:
    """Trouve tous les appels `{{name_prefix...}}` avec équilibrage
    d'accolades (pas une regex naïve -- casserait sur les sous-templates
    imbriqués comme `{{TCG ID|...}}`). Retourne le contenu interne (sans
    les `{{`/`}}` externes)."""
    blocks = []
    marker = "{{" + name_prefix
    search_from = 0
    while True:
        start = wikitext.find(marker, search_from)
        if start == -1:
            break
        depth = 0
        i = start
        while i < len(wikitext):
            two = wikitext[i:i + 2]
            if two == "{{":
                depth += 1
                i += 2
                continue
            if two == "}}":
                depth -= 1
                i += 2
                if depth == 0:
                    break
                continue
            i += 1
        blocks.append(wikitext[start + 2:i - 2])
        search_from = i
    return blocks


# Vocabulaire de rareté observé sur Bulbapedia (vintage + moderne, EN -- les
# articles restent en anglais même pour la section JP). Utilisé pour
# repérer la rareté par contenu plutôt que par position fixe dans le
# template : la position varie selon les tableaux (le tableau "Additional
# cards" n'a par ex. pas de colonne rareté du tout, cf. docstring module),
# alors que chercher "le premier paramètre qui est un mot de rareté connu"
# reste fiable partout.
KNOWN_RARITIES: frozenset[str] = frozenset({
    "Common", "Uncommon", "Rare", "Rare Holo", "Rare Holo EX", "Rare Holo GX",
    "Rare Holo LV.X", "Rare Holo Star", "Rare Holo V", "Rare Holo VMAX",
    "Rare Holo VSTAR", "Rare Ultra", "Rare Secret", "Rare Rainbow",
    "Rare Rainbow Alt", "Rare Shiny", "Rare Shiny GX", "Rare Shiny V",
    "Rare Shiny Vmax", "Rare Prism Star", "Rare BREAK", "Rare ACE",
    "Rare Prime", "Amazing Rare", "Radiant Rare", "Double Rare",
    "Illustration Rare", "Special Illustration Rare", "Hyper Rare",
    "ACE SPEC Rare", "Shiny Rare", "Shiny Ultra Rare", "Classic Collection",
    "Promo",
    # Volontairement PAS "None" -- Bulbapedia l'utilise littéralement pour
    # les Energies de base vintage sans symbole de rareté du tout. Le
    # laisser matcher écrirait "None" en base, faussement plus informatif
    # qu'un vrai NULL alors que ça n'apporte rien pour le tri -- cohérent
    # avec `limitlesstcg.py` qui ignore ces mêmes cartes plutôt que de leur
    # assigner quoi que ce soit (cf. son docstring module).
})


def parse_setlist_rarities(wikitext: str) -> tuple[dict[str, str], dict[str, str]]:
    """(numérateur -> rareté, nom de carte normalisé -> rareté) depuis tous
    les blocs `Setlist/*entry` de la page. `numérateur` est la partie avant
    le "/" du premier paramètre positionnel (ex. "1" pour "1/102"). Le nom
    de carte vient du 2e paramètre positionnel (`{{TCG ID|Set|Carte|Num}}`),
    normalisé (minuscule, sans variante d'édition) pour le repli par nom.
    Une carte présente en double dans un même set (formes multiples type
    Unown) est retirée du dict par nom -- ambiguë, pas de faux match."""
    by_numerator: dict[str, str] = {}
    name_counts: dict[str, int] = {}
    name_rarity: dict[str, str] = {}

    for prefix in ("Setlist/nmentry", "Setlist/entry"):
        for block in _find_template_blocks(wikitext, prefix):
            params = _split_template_params(block)
            if len(params) < 3:
                continue
            numerator_field = params[1].strip()
            numerator = numerator_field.split("/")[0].strip()
            if not numerator.isdigit():
                numerator = None

            rarity = next((p.strip() for p in params[3:] if p.strip() in KNOWN_RARITIES), None)
            if not rarity:
                continue

            if numerator:
                by_numerator.setdefault(numerator, rarity)

            tcg_id_match = re.search(r"\{\{TCG ID\|[^|}]*\|([^|}]+)", params[2])
            if tcg_id_match:
                card_name = tcg_id_match.group(1).strip().lower()
                name_counts[card_name] = name_counts.get(card_name, 0) + 1
                name_rarity[card_name] = rarity

    by_name = {name: rarity for name, rarity in name_rarity.items() if name_counts[name] == 1}
    return by_numerator, by_name


_EDITION_SUFFIX_RE = re.compile(r"\s*\[[^\]]*\]\s*$")


def _normalize_card_name(name: str) -> str:
    """`"Chimecho [1st Edition]"` -> `"chimecho"` -- retire le marqueur
    d'édition/impression entre crochets, sans effet sur les noms qui n'en
    ont pas."""
    return _EDITION_SUFFIX_RE.sub("", name).strip().lower()


def sync_set_rarities(set_code: str, title: str | None = None) -> int:
    """Backfill `items.rarity` pour un `set_code` JP donné. `title` force le
    titre d'article (sinon `JP_BULBAPEDIA_TITLE_OVERRIDES` puis
    `_guess_title`). Retourne le nombre de cartes mises à jour, 0 si la page
    n'existe pas ou n'a rien d'exploitable (jamais une exception -- cf.
    `sync_all_jp_rarities`)."""
    title = title or JP_BULBAPEDIA_TITLE_OVERRIDES.get(set_code) or _guess_title(set_code)
    result = fetch_wikitext(title)
    if result is None:
        return 0
    wikitext, _resolved_title = result
    by_numerator, by_name = parse_setlist_rarities(wikitext)
    if not by_numerator and not by_name:
        return 0

    # Plafond de vraisemblance pour le chemin numérateur (cf. docstring
    # `JP_BULBAPEDIA_TITLE_OVERRIDES` -- un titre deviné peut résoudre vers
    # une vraie page Setlist qui n'est PAS le bon set). PAR CARTE, pas un
    # verdict tout-ou-rien sur le set entier : découvert sur
    # `pokemon-jp-secret-of-the-lakes` où une bonne partie de `code` sont en
    # fait des numéros de Pokédex national (jusqu'à 298, "Dpbp301"...) plutôt
    # que des positions dans le set, mélangés à des lignes `code IS NULL`
    # censées passer par le chemin nom -- un garde-fou au niveau du set
    # entier aurait aussi bloqué à tort ces lignes-là, qui ne dépendent pas
    # du numérateur. `page_max * 1.5` : marge au-delà du plus grand
    # numérateur réellement trouvé sur la page -- un `code` largement
    # au-delà ne peut pas être une vraie position dans CE set.
    page_max = max((int(n) for n in by_numerator), default=0)
    numerator_ceiling = int(page_max * 1.5) if page_max else 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, name, code FROM items
                   WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                     AND set_code = %s AND rarity IS NULL""",
                (set_code,),
            )
            rows = cur.fetchall()

        updates = []
        for item_id, name, code in rows:
            rarity = None
            if code and code.isdigit() and int(code) <= numerator_ceiling:
                rarity = by_numerator.get(code.lstrip("0") or "0")
            if not rarity:
                rarity = by_name.get(_normalize_card_name(name))
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


def sync_all_jp_rarities() -> dict:
    """Boucle sur tous les `set_code` JP ayant encore des cartes sans
    rareté -- une requête par set, pause `REQUEST_PAUSE_SECONDS` entre
    chaque (politesse, cf. Crawl-delay du robots.txt)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT set_code FROM items
                WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                  AND rarity IS NULL AND set_code IS NOT NULL
                ORDER BY set_code
            """)
            set_codes = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    total = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, set_code in enumerate(set_codes):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            n = sync_set_rarities(set_code)
        except Exception as exc:
            print(f"  {set_code}: erreur -- {exc}")
            errors.append({"set_code": set_code, "error": str(exc)})
            continue
        if n == 0:
            skipped.append(set_code)
            print(f"  {set_code}: aucune rareté trouvée (ignoré)")
        else:
            total += n
            print(f"  {set_code}: {n} carte(s) traitée(s)")

    return {"total": total, "skipped": skipped, "errors": errors}


def main():
    from dotenv import load_dotenv

    load_dotenv()
    print("== Backfill rareté Pokémon JP (Bulbapedia) ==")
    result = sync_all_jp_rarities()
    print(f"\nTerminé : {result['total']} traité(s) au total.")
    if result["skipped"]:
        print(f"Ignorés (aucune rareté trouvée) : {', '.join(result['skipped'])}")
    if result["errors"]:
        print(f"Erreurs : {result['errors']}")


if __name__ == "__main__":
    main()
