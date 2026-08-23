"""Source de prix PriceCharting pour le service de verdict à la demande.

Écrit INDÉPENDAMMENT de ingestion/sources/pricecharting.py (2649 lignes,
fragile, non modifié) : seuls les symboles PUBLICS de ce module
(PRICECHARTING_SET_SLUGS, fetch_all_console_rows, fetch_card_details) sont
réutilisés par import -- la logique de MATCHING (_extract_number,
_code_numerator, _qualifier_*) est privée là-bas et réimplémentée ici, en
plus simple : items.code pour One Piece EST déjà le code complet
('OP10-105'), pas besoin d'une extraction de numéro fragile -- on cherche
directement ce code en substring dans les titres PriceCharting scrapés.

Contrairement au batch (qui scrape une page de set puis matche TOUS ses
items en une passe), cette fonction est appelée à la demande pour UNE seule
carte -- elle scrape quand même la page de set entière (PriceCharting n'a
pas de recherche par carte), mais le cache TTL (pricing/cache.py) évite de
la re-scraper à chaque requête utilisateur.
"""
import re
import unicodedata

from ingestion.sources.pricecharting import (
    PRICECHARTING_JP_ALL_SLUGS,
    PRICECHARTING_SET_SLUGS,
    fetch_all_console_rows,
    fetch_card_details,
)
from pricing.models import Card, PriceQuote
from pricing.sources.base import PriceSource

_QUALIFIER_RE = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")
# Même seuil que pricing/matching.py::_CODE_QUALIFIER_MATCH_THRESHOLD --
# cohérence volontaire, sans importer (source volontairement autonome).
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


def _find_row_for_card(card: Card, rows: list[dict]) -> dict | None:
    """Cherche le code exact (substring, insensible à la casse) dans les
    titres scrapés. Pas de repli par simple numéro de fin de titre
    (contrairement à pricecharting.py) : trop fragile pour One Piece où
    STxx/EBxx partagent des numéros de fin identiques entre préfixes
    différents -- mieux vaut ne rien trouver que deviner. Si plusieurs
    lignes contiennent le code (variantes Parallel/Alt Art scrapées
    séparément), départage par qualificatif entre parenthèses -- même
    esprit que pricing/matching.py::disambiguate_candidates, dupliqué ici en
    miniature pour rester une source autonome (pas de dépendance vers
    pricing.matching)."""
    if not card.code:
        return None
    code_lower = card.code.lower()
    matches = [row for row in rows if code_lower in row["title"].lower()]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]

    card_qual = _qualifier_tokens(card.name)
    scored = sorted(
        ((_dice(card_qual, _qualifier_tokens(row["title"])), row) for row in matches),
        key=lambda pair: pair[0], reverse=True,
    )
    best_score, best_row = scored[0]
    tie = len(scored) >= 2 and scored[1][0] == best_score
    if best_score < _QUALIFIER_MATCH_THRESHOLD or tie:
        return None
    return best_row


class PriceChartingSource(PriceSource):
    name = "pricecharting"

    def fetch_price(self, card: Card, grade: str) -> PriceQuote | None:
        """`grade='ungraded'` : suffit du prix de la page de set
        (`used_price`, déjà extrait par fetch_all_console_rows). `grade`
        gradé (psa7..psa10) : requiert un 2e appel HTTP sur la page produit
        individuelle (fetch_card_details) -- coûteux, mais un seul appel par
        requête de verdict grâce au cache TTL en amont. Retourne None
        (jamais d'exception) si le set_code n'est pas mappé, si le scraping
        échoue, ou si aucune ligne ne matche le code."""
        # One Piece JP réutilise EXACTEMENT le même set_code que son
        # homonyme EN (cf. pricing/repository.py::fetch_set_release_year) --
        # sans ce branchement sur card.language, PRICECHARTING_SET_SLUGS
        # (clé = set_code, EN uniquement) matche quand même et fait scraper
        # la page de set ANGLAISE pour une carte JAPONAISE : le code
        # (ex. "OP06-118") est identique dans les deux langues donc
        # _find_row_for_card matche sans erreur apparente, mais renvoie le
        # prix/URL de la MAUVAISE carte -- bug réel constaté en test (2026-
        # 08-23 : carte JP PSA10 affichée à 4688$ (~PSA10 EN) et lien
        # PriceCharting pointant vers la fiche anglaise). PRICECHARTING_JP_
        # ALL_SLUGS (déjà construit et utilisé par le batch JP singles, cf.
        # ingestion/sources/pricecharting.py) donne le bon slug JP pour la
        # même clé set_code -- Pokémon JP n'a pas cette ambiguïté (set_code
        # JP synthétique déjà distinct, cf. mémoire projet), ce branchement
        # reste donc correct pour les deux TCG.
        slugs = PRICECHARTING_JP_ALL_SLUGS if card.language == "JP" else PRICECHARTING_SET_SLUGS
        slug = slugs.get(card.set_code or "")
        if not slug:
            return None

        try:
            rows = fetch_all_console_rows(slug)
        except Exception as exc:
            print(f"  (pricecharting: échec du scraping du set {slug!r} : {exc})")
            return None

        row = _find_row_for_card(card, rows)
        if row is None:
            return None

        if grade == "ungraded":
            if row["used_price"] is None:
                return None
            return PriceQuote(source=self.name, grade=grade, price=row["used_price"], currency="USD",
                               url=row.get("url"))

        if not row.get("url"):
            return None
        try:
            details = fetch_card_details(row["url"])
        except Exception as exc:
            print(f"  (pricecharting: échec de la récupération de {row['url']!r} : {exc})")
            return None
        price = details.get("grades", {}).get(grade)
        if price is None:
            return None
        return PriceQuote(source=self.name, grade=grade, price=price, currency="USD", url=row["url"])
