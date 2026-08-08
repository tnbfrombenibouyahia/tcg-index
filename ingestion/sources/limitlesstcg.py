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
- One Piece : `/cards/promos` n'est pas une page de set classique mais un
  index d'environ 75 produits promo individuels (Welcome Pack, Tournament
  Pack, Event Pack...), chacun avec son propre slug -- cf.
  `list_one_piece_promo_releases`/`sync_all_one_piece_promos`, qui scrapent
  ces ~75 pages séparément (pas juste `/cards/P` qui 404). Une partie de ces
  produits n'a toujours aucune rareté exploitable (cartes en Alternate Art
  d'un code déjà couvert par le set d'origine, ou aucun libellé du tout) --
  laissé de côté au-delà de l'inférence "Promo" pour les codes "P-XXX" sans
  libellé. "1/1000" (1 seule ligne) : artefact de données API TCG.
- Pokémon : ~15 sets LimitlessTCG sur 152 restent sans correspondance
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


def parse_one_piece_set_rarities(html: str, infer_promo_prefix: str | None = None) -> dict[str, str]:
    """Une carte (`code`) -> rareté officielle. Cf. docstring module pour le
    filtre `ONE_PIECE_KNOWN_RARITIES` (ignore les blocs "Alternate Art" etc.).

    `infer_promo_prefix` (utilisé pour les pages de promo individuelles, cf.
    `sync_one_piece_promo_release`) : une carte dont le code a ce préfixe
    (ex. "P-") et n'a AUCUN libellé de rareté affiché est une carte promo
    "pure" sans palier de rareté propre côté LimitlessTCG -- on lui assigne
    "Promo" nous-mêmes plutôt que de la laisser vide, cf. docstring module."""
    soup = BeautifulSoup(html, "html.parser")
    by_code: dict[str, str] = {}
    for block in soup.select("div.card-page-main"):
        code_el = block.select_one(".card-text-id")
        if not code_el:
            continue
        code = code_el.get_text(strip=True)
        rarity_spans = block.select(".card-prints-current .prints-current-details span")
        label = rarity_spans[1].get_text(strip=True) if len(rarity_spans) >= 2 else ""
        if label in ONE_PIECE_KNOWN_RARITIES:
            by_code[code] = label
        elif not label and infer_promo_prefix and code.startswith(infer_promo_prefix):
            by_code[code] = "Promo"
    return by_code


_UPDATE_ONE_PIECE_RARITY_SQL = """
    UPDATE items SET rarity = data.rarity
    FROM (VALUES %s) AS data (code, rarity)
    WHERE items.tcg = 'one-piece' AND items.code = data.code
"""
# Pas de filtre `source = 'apitcg'` : `code` (ex. "OP09-022") est unique
# globalement pour One Piece (contrairement à Pokémon où "033/163" se
# répète d'un set à l'autre, cf. mémoire projet) -- il matche donc aussi
# bien les doublons JP créés par pricecharting.py (`sync_all_jp_singles_items`,
# qui réutilise le code EN, cf. mémoire projet "jp_singles_tracking") que
# les entrées apitcg elles-mêmes. Découvert via un vrai cas utilisateur :
# "Lim [Alternate Art]" (JP, source pricecharting) n'avait aucune rareté
# alors que "Lim (022)" (EN, source apitcg) partageant le même code
# OP09-022 en avait une -- la rareté officielle d'une carte ne change pas
# entre éditions EN/JP, seul le physique (langue, print) change.


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


def list_one_piece_promo_releases() -> dict[str, str]:
    """slug -> nom lisible pour chaque produit promo individuel, depuis
    `/cards/promos` -- PAS une page de set classique (aucun bloc
    `card-page-main`, cf. mémoire projet) mais un index d'environ 75
    mini-produits (Welcome Pack, Tournament Pack, Event Pack...), chacun
    avec son propre slug à scraper séparément."""
    resp = requests.get(f"{ONE_PIECE_BASE_URL}/cards/promos", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    main = soup.select_one("main") or soup
    date_re = re.compile(r"^[A-Za-z]{3} \d{2}$")
    stat_re = re.compile(r"^\d")
    releases: dict[str, str] = {}
    for a in main.select('a[href^="/cards/"]'):
        slug = a.get("href").split("/")[-1]
        if slug in releases:
            continue
        text = a.get_text(strip=True)
        if not text or date_re.match(text) or stat_re.match(text):
            continue
        releases[slug] = text
    return releases


def sync_one_piece_promo_release(slug: str) -> int:
    """Scrape un produit promo individuel. Deux cas de figure trouvés en
    conditions réelles (cf. docstring module) : certaines cartes de ces
    produits réutilisent le code d'un set déjà scrapé par
    `sync_one_piece_set_rarities` avec un libellé de traitement de print
    ("Alternate Art") -- ignorées ici comme ailleurs, déjà couvertes ;
    d'autres ont un vrai code "P-XXX" propre à la carte promo, sans rareté
    listée -- `infer_promo_prefix="P-"` leur assigne "Promo"."""
    html = fetch_one_piece_set_page(slug)
    by_code = parse_one_piece_set_rarities(html, infer_promo_prefix="P-")
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


def sync_all_one_piece_promos(releases: dict[str, str] | None = None) -> dict:
    """Boucle sur tous les produits promo individuels -- une requête par
    produit, pause entre chaque."""
    if releases is None:
        releases = list_one_piece_promo_releases()

    total = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, slug in enumerate(releases):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            n = sync_one_piece_promo_release(slug)
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
_PLURAL_NORMALIZE = {"promos": "promo", "energies": "energy", "cards": "card", "fighters": "fighter"}
# `\d*` (pas `\d+`) -- redonne bien un tel token nu quand il n'y a pas de
# chiffre ("xy", "sm"...), volontairement : "pokemon-xy-evolutions" doit
# pouvoir matcher le nom LimitlessTCG "Evolutions" (qui n'a PAS "XY" dans son
# propre nom) une fois "xy" strippé de notre côté. cf. commentaire de
# `_best_match_with_tiebreak` pour comment la collision "SM Promos"/
# "XY Promos" (qui se réduisent alors toutes deux à {"promo"}) est gérée
# SANS perdre ce cas -- pas en touchant ce regex (essayé, cassait
# xy-evolutions et probablement d'autres, cf. mémoire projet
# "limitlesstcg_rarity_backfill"), mais en détectant l'égalité de score.
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


# Table manuelle vérifiée à la main (nom officiel du set, pas juste un score
# de tokens) pour les `set_code` que `build_pokemon_set_mapping` ne peut pas
# résoudre seul -- soit parce que LimitlessTCG nomme le set sans le suffixe
# descriptif que porte notre set_code ("Scarlet & Violet" vs
# "scarlet-violet-base-set"), soit parce que c'est une sous-collection dont
# le nom diverge trop du set parent pour un score de Jaccard fiable
# ("Shiny Vault" au sein de "Hidden Fates"). Découvert en creusant l'écart de
# couverture EN, cf. mémoire projet "limitlesstcg_rarity_backfill" -- chaque
# entrée vérifiée individuellement contre le nom officiel du set, PAS un
# score de similarité automatique (trop de faux positifs à ce niveau de
# rapprochement, ex. "Base Set" matcherait n'importe quel set contenant
# "base"+"set"). A priorité sur le matching automatique (cf. usage dans
# `build_pokemon_set_mapping`).
EN_SET_CODE_OVERRIDES: dict[str, str] = {
    "pokemon-sv01-scarlet-violet-base-set": "SVI",
    "pokemon-sv-scarlet-violet-151": "MEW",
    "pokemon-swsh01-sword-shield-base-set": "SSH",
    "pokemon-sm-base-set": "SUM",
    "pokemon-heartgold-soulsilver": "HS",
    "pokemon-firered-leafgreen": "RG",
    "pokemon-base-set-shadowless": "BS",
    "pokemon-hidden-fates-shiny-vault": "HIF",
    "pokemon-legendary-treasures-radiant-collection": "LTR",
    "pokemon-swsh10-astral-radiance-trainer-gallery": "ASR",
}
# Élagué le 2026-08-08 après un run réel : 11 entrées d'origine (SVP, SVE,
# SP, SMP, HSP, BWP, DPP, NP, WP, RM, MEE) pointaient vers de vraies pages
# LimitlessTCG (pas d'erreur 404) mais 0 rareté extraite -- confirmé que ces
# pages "Promos"/produit promotionnel dédié n'ont structurellement pas de
# palier de rareté par carte. Retirées d'ici (inutile de refaire la requête
# à chaque run) ; les `set_code` concernés sont soit dans
# EN_PROMO_SET_CODES (tag direct 'Promo'), soit volontairement laissés NULL
# (pokemon-rumble -- cf. commentaire sous EN_PROMO_SET_CODES).

# `set_code` reconnus comme des produits promotionnels purs (pas de palier de
# rareté compétitif -- prime McDonald's/Burger King, deck de récompense de
# championnat, carte jumbo...) : LimitlessTCG n'aura jamais de page dédiée
# pour ces buckets (comme les autres `EN_PROMO_SET_CODES`, ce sont des
# regroupements produit, pas des vrais sets numérotés) -- inutile de les
# chercher, cf. `sync_promo_rarities`. Volontairement conservateur : exclut
# tout bucket ambigu (ex. "miscellaneous-cards-products", "jumbo-cards",
# trainer kits...) qui pourrait contenir des réimpressions dont la vraie
# rareté existe mais n'est pas connue -- mieux vaut NULL (non trié) que
# "Promo" appliqué à tort.
EN_PROMO_SET_CODES: frozenset[str] = frozenset({
    "pokemon-mcdonalds-promos-2011", "pokemon-mcdonalds-promos-2012",
    "pokemon-mcdonalds-promos-2014", "pokemon-mcdonalds-promos-2015",
    "pokemon-mcdonalds-promos-2016", "pokemon-mcdonalds-promos-2017",
    "pokemon-mcdonalds-promos-2018", "pokemon-mcdonalds-promos-2019",
    "pokemon-mcdonalds-promos-2022", "pokemon-mcdonalds-promos-2023",
    "pokemon-mcdonalds-promos-2024", "pokemon-mcdonalds-25th-anniversary-promos",
    "pokemon-burger-king-promos", "pokemon-kids-wb-promos",
    "pokemon-professor-program-promos", "pokemon-alternate-art-promos",
    "pokemon-me-mega-evolution-promo", "pokemon-pikachu-world-collection-promos",
    "pokemon-countdown-calendar-promos", "pokemon-best-of-promos",
    "pokemon-league-championship-cards", "pokemon-world-championship-decks",
    "pokemon-prize-pack-series-cards",
    # Ajoutés après vérification empirique : ces `set_code` avaient une
    # entrée dans EN_SET_CODE_OVERRIDES pointant vers une vraie page
    # LimitlessTCG (slug correct, pas d'erreur 404), mais la page renvoie 0
    # rareté extraite -- les pages "Promos"/produit promotionnel dédié de
    # LimitlessTCG ne portent structurellement pas de palier de rareté par
    # carte (logique : un promo n'a qu'une seule "rareté", "Promo" lui-même).
    # Confirmé pour chacun avant ajout (pas une supposition) via le run du
    # 2026-08-08, cf. mémoire projet "limitlesstcg_rarity_backfill".
    "pokemon-swsh-sword-shield-promo-cards", "pokemon-sm-promos",
    "pokemon-sv-scarlet-violet-promo-cards", "pokemon-xy-promos",
    "pokemon-black-and-white-promos", "pokemon-nintendo-promos",
    "pokemon-wotc-promo", "pokemon-diamond-and-pearl-promos",
    "pokemon-hgss-promos", "pokemon-kalos-starter-set",
    "pokemon-first-partner-pack", "pokemon-sve-scarlet-violet-energies",
    "pokemon-mee-mega-evolution-energies",
    # Format physique intrinsèquement non-standard (oversize/saisonnier),
    # peu importe le personnage représenté -- jamais une carte "légale
    # tournoi" avec sa propre rareté compétitive, cf. échantillon vérifié
    # (jumbo = toujours une réimpression oversize promotionnelle).
    "pokemon-jumbo-cards",
    "pokemon-trick-or-trade-booster-bundle",
    "pokemon-trick-or-trade-booster-bundle-2023",
    "pokemon-trick-or-trade-booster-bundle-2024",
})

# `set_code` volontairement PAS dans EN_PROMO_SET_CODES malgré une couverture
# nulle, après échantillonnage réel du contenu (cf. mémoire projet) : ce sont
# des réimpressions de vraies cartes d'autres sets numérotés (le nom cite le
# set d'origine et le numéro réel, ex. "Scrafty - 74/99 (Next Destinies)"),
# PAS des promos pures -- leur vraie rareté existe (celle du set cité) mais
# n'est pas reliée ici. Un futur backfill par extraction du set/numéro cité
# dans `name` serait la bonne approche, pas un tag "Promo" qui serait faux :
# pokemon-miscellaneous-cards-products, pokemon-deck-exclusives,
# pokemon-blister-exclusives, pokemon-battle-academy(-2022/-2024),
# pokemon-*-trainer-kit-*, pokemon-ex-trainer-kit-*, pokemon-dp-trainer-kit-*,
# pokemon-me-30th-celebration (mélange en plus de produits scellés mal
# catégorisés côté source), pokemon-trading-card-game-classic,
# pokemon-ex-battle-stadium, pokemon-southern-islands.
# pokemon-rumble : tenté via LimitlessTCG (slug RM existe bien) mais 0
# rareté extraite -- pas un catch-all "Promo" légitime pour autant (spin-off
# avec ses propres paliers Common/Rare historiques, juste non capturés par
# cette page), laissé NULL plutôt que mal étiqueté.


def sync_promo_rarities(tcg: str, language: str, promo_set_codes: frozenset[str]) -> int:
    """Assigne rarity='Promo' directement (sans passer par LimitlessTCG) aux
    `set_code` reconnus comme des buckets promotionnels purs (cf.
    `EN_PROMO_SET_CODES`/`JP_PROMO_SET_CODES`). `WHERE rarity IS NULL` --
    n'écrase jamais une valeur déjà connue (ex. si l'API TCG l'avait déjà
    fournie)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE items SET rarity = 'Promo'
                   WHERE tcg = %s AND language = %s AND category = 'single'
                     AND rarity IS NULL AND set_code = ANY(%s)""",
                (tcg, language, list(promo_set_codes)),
            )
            n = cur.rowcount
        conn.commit()
        return n
    finally:
        conn.close()


def _best_match_with_tiebreak(target_toks: set[str], candidates: dict[str, set[str]]) -> str | None:
    """Meilleur candidat par score de Jaccard, `None` si égalité entre au
    moins deux candidats au meilleur score -- plutôt que trancher au hasard
    selon l'ordre d'itération (silencieux, découvert sur la collision "SM
    Promos"/"XY Promos" qui se réduisent toutes deux à {"promo"} une fois le
    token de génération strippé, cf. commentaire sous `_PLURAL_NORMALIZE` :
    un seul des deux gagnait le match, l'autre restait bloqué à 0% de
    rareté sans qu'aucune erreur ne le signale)."""
    best_key, best_score, tie = None, 0.0, False
    for key, toks in candidates.items():
        if not toks:
            continue
        union = target_toks | toks
        s = len(target_toks & toks) / len(union) if union else 0.0
        if s > best_score:
            best_score, best_key, tie = s, key, False
        elif s == best_score and s > 0:
            tie = True
    return None if tie else best_key


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
        best_code = _best_match_with_tiebreak(ltoks, our_tokens)
        if best_code and ltoks == our_tokens[best_code]:  # score == 1.0
            raw_matches[slug] = best_code

    by_code: dict[str, list[str]] = {}
    for slug, code in raw_matches.items():
        by_code.setdefault(code, []).append(slug)
    mapping = {slug: code for slug, code in raw_matches.items() if len(by_code[code]) == 1}

    # La table manuelle (EN_SET_CODE_OVERRIDES) a priorité sur le matching
    # automatique -- retire d'abord tout auto-match qui pointerait déjà vers
    # un `set_code` qu'on override, pour ne pas le traiter deux fois avec
    # deux slugs différents.
    mapping = {slug: code for slug, code in mapping.items() if code not in EN_SET_CODE_OVERRIDES}
    for code, slug in EN_SET_CODE_OVERRIDES.items():
        mapping[slug] = code
    return mapping


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
        # `.split("?")[0]` avant de prendre le dernier segment -- nécessaire
        # côté JP (`/cards/jp/M6/1?translate=en`), sans effet côté EN
        # (jamais de query string dans ces href-là).
        number = name_link.get("href").split("?")[0].split("/")[-1]
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


# ─────────────────────────────────────────────────────────────────────────
# Pokémon JP -- même technique que le Pokémon EN ci-dessus, mais sur la
# section japonaise dédiée de limitlesstcg.com (pas un "extra" bricolé :
# c'est un vrai catalogue de sets JP séparé, avec traduction anglaise
# disponible via `?translate=en`). Trouvé après coup (l'utilisateur a
# remarqué que la rareté JP n'était pas couverte) -- nos items JP viennent
# de pricecharting.py (cf. mémoire projet jp_singles_tracking), `code` y est
# un simple numéro sans "/total" (contrairement au format EN "033/163"), et
# `set_code` est un slug natif ("pokemon-jp-mega-brave") déjà en anglais
# traduit -- il matche très bien par recouvrement de tokens contre les noms
# de sets JP de LimitlessTCG (131 matchs propres sur 262, zéro collision,
# testé avant d'écrire quoi que ce soit).
#
# PLAFOND STRUCTUREL découvert en creusant l'écart de couverture JP (25-26%
# de stagnation malgré plusieurs runs, cf. mémoire projet
# "limitlesstcg_rarity_backfill") : la section JP de LimitlessTCG ne remonte
# QUE jusqu'à Black & White (~2011, cf. `BW1b`/`BW1w` = les slugs les plus
# anciens de `fetch_pokemon_jp_set_list`). Tout le JP vintage (Carddass avant
# 1996, Topsun, Vending, e-Card/Expedition, ère Neo/Diamond & Pearl...) n'a
# donc AUCUNE page équivalente là-bas -- ce n'est pas un problème de matching
# de noms, ces sets ne sont juste pas dans leur base. `JP_SET_CODE_OVERRIDES`
# / `JP_PROMO_SET_CODES` ci-dessous couvrent ce qui est post-BW et
# récupérable ; le vintage pré-2011 reste `NULL` (pas de source gratuite
# connue à ce jour -- cf. mémoire "psa_pop_report_blocked" pour un autre
# exemple de source bloquée sur ce projet).
# ─────────────────────────────────────────────────────────────────────────

# Même principe que EN_SET_CODE_OVERRIDES (cf. son docstring) : vérifié nom
# par nom contre le catalogue JP LimitlessTCG (`fetch_pokemon_jp_set_list`),
# pas un score automatique. Se limite volontairement aux cas où le nom
# officiel du produit correspond sans ambiguïté (Pokémon + type de produit
# identiques des deux côtés) -- beaucoup de "half deck"/"starter deck" JP
# restent non mappés faute de certitude suffisante (score de Jaccard élevé
# mais sur un Pokémon différent = collision, pas un match, cf. commentaire
# dans le module de diagnostic ayant servi à construire cette table).
JP_SET_CODE_OVERRIDES: dict[str, str] = {
    "pokemon-jp-terastal-festival": "SV8a",
    "pokemon-jp-go": "S10b",
    "pokemon-jp-matchless-fighter": "S5a",
}
# Élagué le 2026-08-08 après un run réel : 39 autres entrées vérifiées à la
# main (start-deck-100*, tous les *-starter-deck/-half-deck/-battle-strength-
# deck/-high-class, best-of-xy, v-union-special-set, trainer-battle-decks...)
# pointaient vers de vraies pages LimitlessTCG (bon slug, pas de 404) mais 0
# rareté extraite -- confirmation que LimitlessTCG JP n'a de palier de
# rareté que pour les sets boostérisés classiques, jamais pour les produits
# préconstruits (structure deck / half deck / starter set / high-class
# deck), quelle que soit la langue (même constat côté EN, cf. le commentaire
# d'élagage sous EN_SET_CODE_OVERRIDES). Contrairement aux buckets promo EN,
# PAS reclassées "Promo" : contenu échantillonné (cf. mémoire projet) sans
# citation d'un autre set d'origine dans `name`, mais aussi sans certitude
# que "Promo" soit la bonne étiquette plutôt que NULL -- laissées NULL par
# prudence plutôt que mal étiquetées.

# Cf. EN_PROMO_SET_CODES pour la logique -- buckets promo purs identifiés
# sans ambiguïté (glossaires magazine, tie-ins film/marque, cartes cadeaux).
# Volontairement PAS "Promo" : `pokemon-jp-old-maid`/`-hanafuda`/`-family`
# (jeux différents du vrai TCG, aucune notion de rareté n'a de sens ici,
# "Promo" serait tout aussi faux que NULL) -- laissés NULL en connaissance
# de cause.
JP_PROMO_SET_CODES: frozenset[str] = frozenset({
    "pokemon-jp-promo",
    "pokemon-jp-meiji-promo",
    "pokemon-jp-cd-promo",
    "pokemon-jp-movie-commemoration-random",
    "pokemon-jp-movie-commemoration-vs-pack",
    "pokemon-jp-10th-movie-commemoration-promo",
    "pokemon-jp-11th-movie-commemoration-promo",
    "pokemon-jp-world-hobby-fair",
    "pokemon-jp-ana-gold-boarding-pass",
    "pokemon-jp-amada-super-dx",
    "pokemon-jp-25th-anniversary-promo",
    "pokemon-jp-trainers-magazine",
})


def fetch_pokemon_jp_set_list() -> dict[str, str]:
    """slug -> nom lisible (déjà traduit en anglais par LimitlessTCG) pour
    chaque set Pokémon JP, depuis `/cards/jp` (une seule requête)."""
    resp = requests.get(f"{POKEMON_BASE_URL}/cards/jp", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    date_re = re.compile(r"^\d{1,2} [A-Za-z]{3} \d{2}$")
    stat_re = re.compile(r"^\d+\s")
    sets: dict[str, str] = {}
    for a in soup.select('table a[href^="/cards/jp/"]'):
        slug = a.get("href").split("?")[0].split("/")[-1]
        if slug in sets:
            continue
        ann = a.select_one(".code.annotation")
        ann_text = ann.get_text(strip=True) if ann else ""
        name = a.get_text(" ", strip=True).replace(ann_text, "").strip()
        if not name or date_re.match(name) or stat_re.match(name):
            continue
        sets[slug] = name
    return sets


def build_pokemon_jp_set_mapping() -> dict[str, str]:
    """slug LimitlessTCG JP -> notre `set_code` JP, même logique de score de
    Jaccard que `build_pokemon_set_mapping` (cf. sa docstring pour le
    detail/les leçons apprises), appliquée aux 370 `set_code` JP au lieu des
    `set_code` EN."""
    limitless_sets = fetch_pokemon_jp_set_list()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT DISTINCT set_code FROM items
                   WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                     AND set_code IS NOT NULL"""
            )
            our_codes = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    def jp_tokens(s: str) -> set[str]:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
        s = s.lower()
        s = re.sub(r"^pokemon-jp-", "", s)
        s = s.replace("'", "")
        s = s.replace("&", " and ")
        s = re.sub(r"[^a-z0-9]+", " ", s)
        toks = {_PLURAL_NORMALIZE.get(t, t) for t in s.split() if t}
        return toks

    our_tokens = {code: jp_tokens(code) for code in our_codes}

    raw_matches: dict[str, str] = {}
    for slug, name in limitless_sets.items():
        ltoks = jp_tokens(name)
        if not ltoks:
            continue
        best_code = _best_match_with_tiebreak(ltoks, our_tokens)
        if best_code and ltoks == our_tokens[best_code]:  # score == 1.0
            raw_matches[slug] = best_code

    by_code: dict[str, list[str]] = {}
    for slug, code in raw_matches.items():
        by_code.setdefault(code, []).append(slug)
    mapping = {slug: code for slug, code in raw_matches.items() if len(by_code[code]) == 1}

    # JP_SET_CODE_OVERRIDES a priorité sur le matching automatique -- même
    # logique que build_pokemon_set_mapping (cf. son commentaire).
    mapping = {slug: code for slug, code in mapping.items() if code not in JP_SET_CODE_OVERRIDES}
    for code, slug in JP_SET_CODE_OVERRIDES.items():
        mapping[slug] = code
    return mapping


def fetch_pokemon_jp_set_page(slug: str) -> str:
    resp = requests.get(
        f"{POKEMON_BASE_URL}/cards/jp/{slug}",
        params={"translate": "en", "display": "full"},
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def sync_pokemon_jp_set_rarities(slug: str, set_code: str) -> int:
    """Comme `sync_pokemon_set_rarities`, mais le `code` de nos items JP est
    un simple numéro sans "/total" (ex. "33", pas "033/163") -- pas de split
    sur "/" nécessaire, juste la normalisation du padding."""
    html = fetch_pokemon_jp_set_page(slug)
    by_number = parse_pokemon_set_rarities(html)
    if not by_number:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, code FROM items
                   WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                     AND set_code = %s AND code IS NOT NULL""",
                (set_code,),
            )
            rows = cur.fetchall()

        updates = []
        for item_id, code in rows:
            numerator = _normalize_numerator(code)
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


def sync_all_pokemon_jp_rarities(mapping: dict[str, str] | None = None) -> dict:
    """Boucle sur le mapping slug JP -> set_code JP -- une requête par set,
    pause entre chaque."""
    if mapping is None:
        mapping = build_pokemon_jp_set_mapping()

    total = 0
    skipped: list[str] = []
    errors: list[dict] = []
    for i, (slug, set_code) in enumerate(mapping.items()):
        if i > 0:
            time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            n = sync_pokemon_jp_set_rarities(slug, set_code)
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
        print("\n== Backfill rareté One Piece -- produits promo individuels ==")
        promo_result = sync_all_one_piece_promos()
        result = {
            "total": result["total"] + promo_result["total"],
            "skipped": result["skipped"] + promo_result["skipped"],
            "errors": result["errors"] + promo_result["errors"],
        }
    else:
        print("== Backfill rareté Pokémon EN (LimitlessTCG) ==")
        mapping = build_pokemon_set_mapping()
        print(f"{len(mapping)} set(s) LimitlessTCG mis en correspondance :")
        for slug, set_code in mapping.items():
            print(f"  {slug} -> {set_code}")
        print()
        result = sync_all_pokemon_rarities(mapping)

        print("\n== Backfill rareté Pokémon JP (LimitlessTCG) ==")
        jp_mapping = build_pokemon_jp_set_mapping()
        print(f"{len(jp_mapping)} set(s) JP LimitlessTCG mis en correspondance :")
        for slug, set_code in jp_mapping.items():
            print(f"  {slug} -> {set_code}")
        print()
        jp_result = sync_all_pokemon_jp_rarities(jp_mapping)
        result = {
            "total": result["total"] + jp_result["total"],
            "skipped": result["skipped"] + jp_result["skipped"],
            "errors": result["errors"] + jp_result["errors"],
        }

        print("\n== Backfill rareté Pokémon -- buckets promo purs (sans LimitlessTCG) ==")
        n_promo_en = sync_promo_rarities("pokemon", "EN", EN_PROMO_SET_CODES)
        n_promo_jp = sync_promo_rarities("pokemon", "JP", JP_PROMO_SET_CODES)
        print(f"  EN : {n_promo_en} carte(s) -> 'Promo'")
        print(f"  JP : {n_promo_jp} carte(s) -> 'Promo'")
        result["total"] += n_promo_en + n_promo_jp

        print("\n== Backfill rareté Pokémon -- héritage depuis le set d'origine cité ==")
        from ingestion.rarity_inherit import sync_rarity_inheritance

        inherit_result = sync_rarity_inheritance()
        print(
            f"  {inherit_result['inherited']} héritée(s), "
            f"{inherit_result['promo_tagged']} 'Promo', "
            f"{inherit_result['unresolved']} non résolue(s)"
        )
        result["total"] += inherit_result["inherited"] + inherit_result["promo_tagged"]

        print("\n== Backfill rareté Pokémon JP -- Bulbapedia (vintage hors couverture LimitlessTCG) ==")
        from ingestion.sources import bulbapedia

        bulba_result = bulbapedia.sync_all_jp_rarities()
        print(f"  {bulba_result['total']} carte(s) traitée(s)")
        result["total"] += bulba_result["total"]
        result["skipped"] += bulba_result["skipped"]
        result["errors"] += bulba_result["errors"]

        print("\n== Backfill rareté Pokémon JP -- TCGdex (reliquat hors couverture Bulbapedia) ==")
        from ingestion.sources import tcgdex

        tcgdex_result = tcgdex.sync_all_remaining_jp_rarities()
        print(f"  {tcgdex_result['total']} carte(s) traitée(s)")
        result["total"] += tcgdex_result["total"]
        result["skipped"] += tcgdex_result["skipped"]
        result["errors"] += tcgdex_result["errors"]

    print(f"\nTerminé : {result['total']} traité(s) au total.")
    if result["skipped"]:
        print(f"Ignorés (aucune rareté trouvée) : {', '.join(result['skipped'])}")
    if result["errors"]:
        print(f"Erreurs : {result['errors']}")


if __name__ == "__main__":
    main()
