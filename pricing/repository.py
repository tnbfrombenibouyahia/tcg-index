"""Lectures DB sur `items`, `sales`, `active_listings` et `price_snapshots`
pour le module pricing. Même style que shared/sync_log.py : connexion dédiée
par appel, try/finally: conn.close(), SQL inline (pas d'ORM, cohérent avec
le reste du repo).
"""
import re
import statistics
import unicodedata
from datetime import date

from pricing.grading_roi import GradingRoiInputs
from pricing.models import Card
from shared.db import get_connection

_CARD_COLUMNS = "id, name, code, set_code, tcg, category, language, rarity, image_url"
_SALES_STATS_LIMIT = 10  # borne haute -- moy. 3 ET moy. 10 se calculent sur la même liste (cf. pricing/sales_stats.py)

# Score de qualificatif entre parenthèses/crochets (ex. "(Alternate Art)
# (Manga)", "[Alternate Art Manga]") -- même regex/seuil que
# pricing/matching.py::_qualifier_tokens et pricing/sources/
# pricecharting_source.py::_qualifier_tokens, dupliqué ici en miniature
# plutôt qu'importé : même convention que ces deux fichiers (modules de
# matching volontairement autonomes, pas de dépendance croisée entre eux).
# Utilisé par fetch_language_siblings ci-dessous.
_QUALIFIER_RE = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")
_QUALIFIER_MATCH_THRESHOLD = 0.5


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


def _qualifier_tokens(text: str) -> frozenset:
    contents = [c for c in _QUALIFIER_RE.findall(text) if not c.strip().isdigit()]
    return frozenset(_normalize(" ".join(contents)).split())


def _dice(a: frozenset, b: frozenset) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def _best_qualifier_match(card: Card, pool: list[Card]) -> Card | None:
    """Départage `pool` (plusieurs items d'une même langue partageant le
    même (tcg, set_code, code)) par qualificatif de nom, retient le mieux
    assorti à `card`. None si ambigu (meilleur score sous le seuil, ou
    égalité en tête) -- même discipline que pricing/sources/
    pricecharting_source.py::_find_row_for_card : mieux ne rien retourner
    qu'associer la mauvaise variante."""
    if len(pool) == 1:
        return pool[0]
    card_qual = _qualifier_tokens(card.name)
    scored = sorted(
        ((_dice(card_qual, _qualifier_tokens(c.name)), c) for c in pool),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best_card = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _QUALIFIER_MATCH_THRESHOLD or tie:
        return None
    return best_card


def _row_to_card(row: tuple) -> Card:
    return Card(
        id=row[0], name=row[1], code=row[2], set_code=row[3],
        tcg=row[4], category=row[5], language=row[6], rarity=row[7], image_url=row[8],
    )


def fetch_items_by_code(code: str) -> list[Card]:
    """items.tcg='one-piece' AND UPPER(code) = UPPER(%s) -- peut renvoyer
    plusieurs lignes (carte de base + Parallel/Alternate Art/Manga Art
    partageant le même code, cf. ingestion/sources/limitlesstcg.py)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = 'one-piece' AND UPPER(code) = UPPER(%s)",
                (code,),
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_items_by_name_tokens(tokens: set[str], *, tcg: str | None = "one-piece", limit: int = 200) -> list[Card]:
    """Pré-filtre par ILIKE '%token%' sur name pour chaque token (OR),
    optionnellement restreint à un `tcg` -- réduit le set de candidats
    avant le scoring Dice fait en Python par pricing/matching.py (pas de
    scan de tout le catalogue à chaque requête). `limit` en filet de
    sécurité si les tokens sont trop génériques.

    Trié par nombre de tokens matchés décroissant avant application de
    `limit` -- sans ça, un token très générique (ex. "ex", présent dans le
    nom de milliers de cartes Pokémon modernes type "... ex") peut à lui
    seul remplir les `limit` lignes avec des résultats sans rapport avant
    même que Postgres n'atteigne la ligne recherchée, qui matche pourtant
    PLUSIEURS tokens à la fois (ex. "mega"+"rayquaza"+"ex") -- l'ordre
    naturel de la table n'a aucune raison de favoriser les lignes les plus
    pertinentes. Repéré en testant le repli fuzzy Pokémon (cf.
    pricing/matching.py::fuzzy_match_by_name_and_rarity) sur "Mega
    Rayquaza ex ...", absent des 200 premières lignes à cause de "ex" seul.

    `tcg=None` ne filtre pas par jeu -- recherche cross-catalogue,
    utilisée par le repli fuzzy multi-TCG (cf.
    pricing/matching.py::fuzzy_match_by_name_and_rarity) quand le texte
    libre ne contient ni code officiel One Piece ni numéro de carte
    Pokémon reconnaissable : plutôt que de deviner le jeu à partir
    d'indices peu fiables, on cherche partout et on laisse le score Dice
    sur le nom complet départager (le vocabulaire des deux jeux ne se
    recoupe quasiment jamais)."""
    if not tokens:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            like_params = [f"%{token}%" for token in tokens]
            or_clause = " OR ".join(["name ILIKE %s"] * len(tokens))
            match_count_expr = " + ".join(["(name ILIKE %s)::int"] * len(tokens))
            where = f"({or_clause})"
            # `like_params` répété : une 1ère fois pour le score de
            # pertinence dans le SELECT, une 2e pour le filtre WHERE --
            # deux jeux de placeholders distincts sur la même requête.
            params = list(like_params) + list(like_params)
            if tcg is not None:
                where += " AND tcg = %s"
                params.append(tcg)
            params.append(limit)
            cur.execute(
                f"SELECT {_CARD_COLUMNS}, {match_count_expr} AS match_count FROM items "
                f"WHERE {where} ORDER BY match_count DESC LIMIT %s",
                params,
            )
            return [_row_to_card(row[:9]) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_pokemon_items_by_number(number: str) -> list[Card]:
    """items.tcg='pokemon' AND numérateur du code (partie avant un '/' s'il
    y en a un, zéros de tête ignorés des deux côtés) OU code promo
    alphanumérique = `number` normalisé (cf.
    pricing/matching.py::extract_pokemon_number). Une seule expression
    couvre les deux formats observés en base -- EN (source apitcg) stocke
    souvent "101/159" (numérateur/dénominateur), JP (source pricecharting,
    pas de dénominateur disponible côté JP) stocke le numérateur seul
    ("58") parfois avec ou sans zéros de tête selon le set ; un code promo
    alphanumérique ("SWSH029") n'a pas de '/', split_part le laisse intact
    et le retrait de zéros de tête ne mord jamais sur un préfixe de lettre.

    Peut renvoyer des dizaines de lignes : un numéro Pokémon est TOUJOURS
    unique AU SEIN d'un set (jamais entre sets différents, cf.
    ingestion/sources/limitlesstcg.py, docstring module + fonction
    build_pokemon_set_mapping) -- la désambiguïsation (quel set/langue)
    se fait ensuite en Python, cf.
    pricing/matching.py::disambiguate_pokemon_candidates."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = 'pokemon' AND code IS NOT NULL AND "
                "UPPER(regexp_replace(split_part(code, '/', 1), '^0+', '')) "
                "= UPPER(regexp_replace(%s, '^0+', ''))",
                (number,),
            )
            return [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_card_by_id(item_id: int) -> Card | None:
    """Utilisé par shared/verdict.py::compute_verdict_for_card quand le
    matching a déjà été fait en amont (card_id déjà connu)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {_CARD_COLUMNS} FROM items WHERE id = %s", (item_id,))
            row = cur.fetchone()
            return _row_to_card(row) if row else None
    finally:
        conn.close()


def fetch_recent_sales(item_id: int, grade: str, *, limit: int = _SALES_STATS_LIMIT) -> list[tuple[float, str, date]]:
    """`limit` dernières ventes (item_id, grade), plus récente d'abord --
    couvre médiane récente ET moy. 10 en une seule requête (cf.
    pricing/sales_stats.py), sur l'index idx_sales_item_date (item_id,
    sale_date DESC). Liste vide si aucune vente connue -- jamais
    d'exception pour "pas de données", cohérent avec fetch_card_by_id.

    `sale_date` inclus depuis le 2026-08-28 (en plus de price/currency) --
    nécessaire à la fenêtre adaptative de pricing/sales_stats.py::compute_sales_stats,
    qui doit savoir si les ventes #4/#5 sont assez récentes pour rejoindre
    la fenêtre plutôt que de mélanger une vraie tendance de marché ancienne
    au signal "maintenant"."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price, currency, sale_date FROM sales WHERE item_id = %s AND grade = %s "
                "ORDER BY sale_date DESC, id DESC LIMIT %s",
                (item_id, grade, limit),
            )
            return [(float(price), currency, sale_date) for price, currency, sale_date in cur.fetchall()]
    finally:
        conn.close()


def count_sales_since(item_id: int, grade: str, since: date) -> int:
    """Nb de ventes conclues depuis `since` -- alimente la fenêtre glissante
    de liquidité (90j, cf. pricing/liquidity.py). 0 est une réponse valide
    (carte illiquide confirmée), à ne jamais confondre avec le None de
    fetch_latest_active_listing_count (jamais scrapé, cf. son docstring)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM sales WHERE item_id = %s AND grade = %s AND sale_date >= %s",
                (item_id, grade, since),
            )
            return cur.fetchone()[0]
    finally:
        conn.close()


def fetch_latest_active_listing_count(item_id: int, grade: str) -> int | None:
    """Dernière ligne connue, quel que soit son âge -- None si aucune ligne
    (jamais scrapé pour cet item/grade) -- PAS 0. `grade` : 'ungraded' ou
    'graded' (toutes notes PSA confondues, eBay ne permet pas de filtrer
    plus finement -- cf. docstring de ingestion/sources/ebay.py). Jamais un
    grade PSA précis ici, il n'existera jamais en base.

    Deux régimes de fraîcheur selon `items.category`, cf.
    pricing/active_listings_source.py pour le détail :
    - 'sealed' : couvert par le batch hebdomadaire existant
      (`ingestion/sources/ebay.py::run_ebay_listings_sync`) -- cette
      fonction reste le seul point de lecture, jamais plus vieille qu'une
      semaine pour un item déjà repéré une fois.
    - 'single' : depuis le 2026-08-22, scrapé À LA DEMANDE au moment de la
      consultation (cf. active_listings_source.py) -- ne JAMAIS appeler
      cette fonction directement pour un single, elle ne fait aucun scrape
      live et renverrait une ligne périmée ou None. L'ancien batch par
      rotation (~5 semaines/cycle) est retiré : rejeté après une semaine
      d'usage réel -- un chiffre vieux d'un mois n'aide personne à décider
      d'un achat, cf. discussion utilisateur du 2026-08-22."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_count FROM active_listings WHERE item_id = %s AND grade = %s "
                "ORDER BY captured_at DESC LIMIT 1",
                (item_id, grade),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def fetch_active_listing_count_for_date(item_id: int, grade: str, captured_at: date) -> int | None:
    """Lecture STRICTE à une date précise (contrairement à
    fetch_latest_active_listing_count, qui prend la plus récente quel que
    soit son âge) -- utilisée par pricing/active_listings_source.py pour
    savoir si le cache du jour est déjà chaud avant de scraper en direct.
    None si pas encore scrapé CE jour précis pour cet item/grade (même si
    une ligne plus ancienne existe)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_count FROM active_listings "
                "WHERE item_id = %s AND grade = %s AND captured_at = %s",
                (item_id, grade, captured_at),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


_UPSERT_ACTIVE_LISTING_SQL = """
    INSERT INTO active_listings (item_id, captured_at, marketplace, buying_option, grade, listing_count)
    VALUES (%s, %s, 'ebay', 'all', %s, %s)
    ON CONFLICT (item_id, captured_at, marketplace, buying_option, grade) DO NOTHING
"""


def upsert_active_listing_count(item_id: int, grade: str, listing_count: int, captured_at: date) -> None:
    """DO NOTHING sur conflit (pas DO UPDATE) : une seule écriture par
    (item, jour, grade) suffit -- si deux requêtes concurrentes scrapent le
    même item le même jour (rare mais possible côté verdict ponctuel), la
    première gagne, la seconde n'écrase pas pour un chiffre qui n'a de
    toute façon quasi aucune chance d'avoir bougé entre les deux appels."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_UPSERT_ACTIVE_LISTING_SQL, (item_id, captured_at, grade, listing_count))
        conn.commit()
    finally:
        conn.close()


def fetch_latest_price_snapshot(item_id: int, grade: str) -> tuple[float, str] | None:
    """Dernier prix connu (`price_snapshots`), même table que
    lib/queries/gradingRoi.ts côté site -- réutilise
    idx_price_snapshots_item_grade_captured (déjà trié captured_at DESC,
    created_at DESC). None si jamais snapshotté à ce grade."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price, currency FROM price_snapshots WHERE item_id = %s AND grade = %s "
                "ORDER BY captured_at DESC, created_at DESC LIMIT 1",
                (item_id, grade),
            )
            row = cur.fetchone()
            return (float(row[0]), row[1]) if row else None
    finally:
        conn.close()


def _fetch_language_candidates(card: Card, *, same_set: bool) -> list[Card]:
    """Coeur commun de fetch_language_siblings/fetch_language_variants_loose
    -- même requête/désambiguïsation, seule la présence du filtre set_code
    change (cf. les deux fonctions ci-dessous pour le pourquoi de chaque
    mode)."""
    if not card.code or (same_set and not card.set_code):
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if same_set:
                cur.execute(
                    f"SELECT {_CARD_COLUMNS} FROM items "
                    "WHERE tcg = %s AND set_code = %s AND UPPER(code) = UPPER(%s) "
                    "AND category = %s AND language != %s",
                    (card.tcg, card.set_code, card.code, card.category, card.language),
                )
            else:
                cur.execute(
                    f"SELECT {_CARD_COLUMNS} FROM items "
                    "WHERE tcg = %s AND UPPER(code) = UPPER(%s) "
                    "AND category = %s AND language != %s",
                    (card.tcg, card.code, card.category, card.language),
                )
            rows = [_row_to_card(row) for row in cur.fetchall()]
    finally:
        conn.close()

    by_language: dict[str, list[Card]] = {}
    for row in rows:
        by_language.setdefault(row.language, []).append(row)

    matches = []
    for pool in by_language.values():
        best = _best_qualifier_match(card, pool)
        if best is not None:
            matches.append(best)
    return matches


def fetch_language_siblings(card: Card) -> list[Card]:
    """Même carte (set_code + code), langues différentes -- PAS de repli
    fuzzy sur l'IDENTITÉ (contrairement à pricing/matching.py) : le code est
    déjà connu et fiable à ce stade (carte déjà identifiée).

    MAIS (tcg, set_code, code) seul ne désigne pas une carte unique : base/
    Alternate Art/Manga/2nd Anniversary... partagent souvent le même code
    (cf. fetch_items_by_code plus haut, et vérifié en base le 2026-08-23 sur
    OP06-118 : 3 lignes EN, 3 lignes JP pour ce seul code). Sans filtrage
    supplémentaire, une carte "Alternate Art Manga" récupérait TOUTES les
    variantes de l'autre langue comme "siblings" -- bug réel constaté en
    test (comparaison par langue affichant plusieurs lignes par langue avec
    des prix qui ne correspondaient pas à la carte affichée). Départagé ici
    par qualificatif de nom (cf. _best_qualifier_match), un seul sibling
    retenu PAR langue -- aucun si ambigu, jamais deviné.

    Résultat utilisé pour des PRIX affichés (comparaison par langue, cf.
    shared/verdict.py::_build_language_comparison) -- exige donc le même
    set_code exact : deux tirages différents d'une même carte n'ont pas
    forcément la même cote, le prix d'un tirage ne doit jamais représenter
    celui d'un autre. Cf. fetch_language_variants_loose pour un
    appariement moins strict, réservé aux liens de vérification (jamais un
    prix).

    Renvoie [] pour le scellé (card.code est NULL, cf. db/schema.sql::items)."""
    return _fetch_language_candidates(card, same_set=True)


def fetch_language_variants_loose(card: Card) -> list[Card]:
    """Version PLUS PERMISSIVE de fetch_language_siblings : même
    désambiguïsation par qualificatif (cf. _best_qualifier_match), MAIS sans
    exiger le même set_code -- seulement (tcg, code, category), langues
    différentes. Vérifié en base le 2026-08-23 : certains tirages EN
    (ex. une compilation "The Best") n'ont tout simplement aucune ligne JP
    cataloguée sous ce set_code exact (référentiel apitcg incomplet), alors
    qu'un autre tirage JP du même code existe bien chez PriceCharting --
    fetch_language_siblings renvoie [] dans ce cas, ce repli trouve quand
    même un candidat "assez proche" par qualificatif.

    RÉSERVÉ aux liens de double-vérification PriceCharting (cf.
    shared/verdict.py::_build_language_comparison) : contrairement à
    fetch_language_siblings, le tirage retenu n'est pas garanti être
    EXACTEMENT le même que `card` (juste le meilleur qualificatif
    disponible, même seuil 0.5) -- jamais utilisé pour afficher un prix
    (qui pourrait alors représenter le mauvais tirage), seulement pour
    proposer un lien à vérifier soi-même, demande utilisateur (2026-08-23).

    Renvoie [] pour le scellé (card.code est NULL, cf. db/schema.sql::items)."""
    return _fetch_language_candidates(card, same_set=False)


def fetch_sealed_display_for_set(tcg: str, set_code: str | None, language: str) -> Card | None:
    """Le display scellé (Booster Box -- `category='sealed_display'` est
    déjà ce grain précis, pas besoin de filtrer Case/ETB/Tin séparément, cf.
    db/schema.sql::items) du même set ET de la même langue que la carte
    consultée. Filtré par langue plutôt qu'un premier trouvé au hasard :
    comparer une carte JP au prix d'un display EN serait trompeur. None si
    ce couple set/langue n'a pas de display référencé -- jamais deviné."""
    if not set_code:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CARD_COLUMNS} FROM items "
                "WHERE tcg = %s AND set_code = %s AND category = 'sealed_display' AND language = %s "
                "LIMIT 1",
                (tcg, set_code, language),
            )
            row = cur.fetchone()
            return _row_to_card(row) if row else None
    finally:
        conn.close()


_GRADING_ROI_INPUTS_COLUMNS = (
    "ungraded_price, psa7_price, psa8_price, psa9_price, psa95_price, psa10_price, "
    "card_n7, card_n8, card_n9, card_n95, card_n10, "
    "sr_n7, sr_n8, sr_n9, sr_n95, sr_n10, "
    "set_n7, set_n8, set_n9, set_n95, set_n10, "
    "tcg_n7, tcg_n8, tcg_n9, tcg_n95, tcg_n10"
)


def fetch_grading_roi_inputs(item_id: int) -> GradingRoiInputs | None:
    """None si jamais matérialisé pour cet item -- `grading_roi_inputs` n'est
    rempli que par un run --tier (cf. index/grading_roi_inputs.py), pas le
    run quotidien : une carte pas encore repassée dans son palier n'a
    simplement pas de ligne. L'appelant doit traiter ça comme "calculateur
    indisponible pour l'instant", jamais comme un ROI nul."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_GRADING_ROI_INPUTS_COLUMNS} FROM grading_roi_inputs "
                "WHERE item_id = %s ORDER BY captured_at DESC LIMIT 1",
                (item_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            (ungraded, p7, p8, p9, p95, p10,
             c7, c8, c9, c95, c10,
             sr7, sr8, sr9, sr95, sr10,
             set7, set8, set9, set95, set10,
             tcg7, tcg8, tcg9, tcg95, tcg10) = row

            grade_prices: dict[str, float] = {}
            for grade, price in (("psa7", p7), ("psa8", p8), ("psa9", p9), ("psa9.5", p95), ("psa10", p10)):
                if price is not None:
                    grade_prices[grade] = float(price)

            def _counts(n7, n8, n9, n95, n10) -> dict[str, int]:
                return {"psa7": n7, "psa8": n8, "psa9": n9, "psa9.5": n95, "psa10": n10}

            return GradingRoiInputs(
                ungraded_price=float(ungraded),
                grade_prices=grade_prices,
                grade_counts={
                    "card": _counts(c7, c8, c9, c95, c10),
                    "set_rarity": _counts(sr7, sr8, sr9, sr95, sr10),
                    "set": _counts(set7, set8, set9, set95, set10),
                    "tcg": _counts(tcg7, tcg8, tcg9, tcg95, tcg10),
                },
            )
    finally:
        conn.close()


def set_label_from_code(set_code: str | None, tcg: str) -> str | None:
    """Dérive un libellé humain du set_code -- aucun nom de set lisible
    n'est stocké ailleurs pour ces items, ni EN ni JP (réimplémentation
    volontairement séparée de
    ingestion/sources/pricecharting.py::_set_label_from_code, qui fait la
    même chose : ce module-là est volumineux et fragile selon sa propre
    docstring, pas une dépendance à ajouter ici pour 4 lignes). Ex.
    'one-piece-wings-of-the-captain' -> 'Wings Of The Captain'. None si
    `set_code` est None (item sans set, cas rare)."""
    if not set_code:
        return None
    prefix = tcg + "-"
    bare = set_code[len(prefix):] if set_code.startswith(prefix) else set_code
    if bare.startswith("jp-"):
        bare = bare[len("jp-"):]
    return bare.replace("-", " ").title()


def fetch_set_release_year(tcg: str, set_code: str | None) -> int | None:
    """Année du set, dérivée de items.release_date -- None si absente pour
    TOUT item de ce (tcg, set_code), y compris quand `release_date` est
    structurellement absente côté JP (aucun référentiel JP ne le fournit,
    cf. ingestion/sources/pricecharting.py). One Piece JP réutilise le MÊME
    set_code que son homonyme EN (contrairement à Pokémon, dont les
    set_code JP/EN sont disjoints -- cf. discussion projet du 2026-08-22,
    vérifié 100% de correspondance sur ce TCG) : cette requête, filtrée sur
    tcg+set_code SANS filtrer par langue, retrouve donc déjà l'année EN pour
    une carte JP, sans repli explicite à coder. MIN() plutôt que MAX() ou un
    LIMIT 1 arbitraire : un set peut avoir plusieurs release_date légèrement
    différentes en base (ex. cartes bonus ajoutées après coup) -- l'année de
    sortie initiale est la plus utile pour situer un set dans le temps."""
    if not set_code:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MIN(release_date) FROM items WHERE tcg = %s AND set_code = %s AND release_date IS NOT NULL",
                (tcg, set_code),
            )
            row = cur.fetchone()
            return row[0].year if row and row[0] else None
    finally:
        conn.close()


# -- Panneau extension "v3" (population/divergence/positionnement, cf.
# shared/verdict.py::_compute_population_signal et suivants) ----------------

def fetch_population_snapshot_latest(item_id: int) -> tuple[date, int, int, int, int, int, int] | None:
    """Dernier population_snapshots connu pour CETTE carte précise (pas le
    set) -- (captured_at, pop_grade10, pop_grade9, pop_grade8, pop_grade7,
    pop_grade6, pop_total). Mêmes 5 paliers que le Terminal (PSA10/9/8/7/
    ≤6, cf. web/components/cardquant/population/GradeDistributionPanel.tsx)
    pour un vocabulaire identique Terminal/extension. None si cet item n'a
    jamais été snapshotté (hors du batch de population, cf.
    ingestion/sources/pricecharting.py)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT captured_at, pop_grade10, pop_grade9, pop_grade8, pop_grade7, pop_grade6, pop_total "
                "FROM population_snapshots WHERE item_id = %s ORDER BY captured_at DESC LIMIT 1",
                (item_id,),
            )
            row = cur.fetchone()
            return tuple(row) if row else None
    finally:
        conn.close()


def fetch_population_snapshot_before(item_id: int, cutoff: date) -> tuple[date, int] | None:
    """Snapshot le plus récent À OU AVANT `cutoff` -- (captured_at,
    pop_grade10) seulement, suffisant pour la delta "POP 10 · 30j" du
    panneau extension. None si aucun snapshot n'existe encore à cette
    ancienneté (item trop récemment entré dans le tracking de population) --
    jamais un delta calculé contre un 0 implicite."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT captured_at, pop_grade10 FROM population_snapshots "
                "WHERE item_id = %s AND captured_at <= %s ORDER BY captured_at DESC LIMIT 1",
                (item_id, cutoff),
            )
            row = cur.fetchone()
            return (row[0], row[1]) if row else None
    finally:
        conn.close()


def fetch_sales_window_stats(item_id: int, grade: str, start: date, end: date) -> tuple[int, float | None]:
    """Nb de ventes + prix médian sur [start, end) -- fenêtre fermée à
    gauche, ouverte à droite (deux fenêtres contiguës s'enchaînent sans
    chevauchement ni trou, cf. shared/verdict.py::_compute_volume_divergence).
    Médiane None si la fenêtre ne contient aucune vente -- jamais 0 $
    affiché comme un vrai prix."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price FROM sales WHERE item_id = %s AND grade = %s AND sale_date >= %s AND sale_date < %s",
                (item_id, grade, start, end),
            )
            prices = [float(row[0]) for row in cur.fetchall()]
    finally:
        conn.close()
    return len(prices), (statistics.median(prices) if prices else None)


def fetch_set_rank_by_price(item_id: int, tcg: str, set_code: str) -> tuple[int, int] | None:
    """Rang de item_id parmi les singles de (tcg, set_code) par prix
    ungraded le plus récent connu (price_snapshots), décroissant -- #1 =
    carte la plus chère du set. Même base de prix que
    web/lib/queries/setAnalysis.ts::getSetTopCards(sortBy='price') (grade
    'ungraded', DISTINCT ON captured_at/created_at DESC) -- définition
    identique Terminal/extension. None si cet item lui-même n'a aucun prix
    ungraded connu -- rang indéfini plutôt que deviné. `total` ne compte
    que les cartes du set qui ONT un prix connu, pas la taille nominale du
    set (une carte toute neuve sans prix encore scrapé ailleurs dans le set
    ne doit pas gonfler artificiellement le dénominateur)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH set_items AS (
                    SELECT id FROM items WHERE tcg = %s AND set_code = %s AND category = 'single'
                ),
                priced AS (
                    SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price
                    FROM price_snapshots ps JOIN set_items si ON si.id = ps.item_id
                    WHERE ps.grade = 'ungraded'
                    ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
                ),
                ranked AS (
                    SELECT item_id, RANK() OVER (ORDER BY price DESC) AS rnk, COUNT(*) OVER () AS total
                    FROM priced
                )
                SELECT rnk, total FROM ranked WHERE item_id = %s
                """,
                (tcg, set_code, item_id),
            )
            row = cur.fetchone()
            return (int(row[0]), int(row[1])) if row else None
    finally:
        conn.close()
