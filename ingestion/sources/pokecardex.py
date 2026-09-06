"""Source d'images : PokéCardex (pokecardex.com) -- backfill `items.image_url`
pour TOUT le catalogue Pokémon (EN + JP) mappé dans la table `sets`.

Historique -- pourquoi ce module a longtemps été limité à 5 sets
------------------------------------------------------------------
Ce module s'est d'abord arrêté à une allowlist manuelle de 5 sets
(`POKECARDEX_IMAGE_SETS`, retirée le 2026-09-06, cf. git history si besoin),
suite à une évaluation du 2026-08-06 qui avait trouvé :
1. **Filigrane pas systématique mais pas prévisible à l'échelle du set** --
   les scans PokéCardex sont propres sur les sets très récents, mais
   certaines cartes plus anciennes portent un filigrane, vérifié carte par
   carte à la main.
2. **"Récent" ne veut pas dire "meilleure résolution"** -- comparé
   set-par-set contre la source actuelle (TCGPlayer EN, PriceCharting JP),
   la moitié des sets récents testés étaient à résolution égale ou
   *inférieure*.

Décision utilisateur du 2026-09-06 (cf. mémoire projet/plan de session) :
**uniformité totale** -- PokéCardex remplace la source actuelle pour tout le
catalogue mappé, même si ça réintroduit un filigrane sur du vintage ou une
résolution parfois inférieure. Ce module ne compare donc plus watermark/
résolution -- ce garde-fou est explicitement abandonné, sur demande.

Ce qui RESTE un garde-fou (indépendant du choix ci-dessus, cf.
`pokecardex_mapping.py`) : le set PokéCardex ciblé doit être identifié
correctement (via la table `sets`, remplie par un fuzzy-match qui refuse de
trancher les cas ambigus), et la carte scrapée doit correspondre par NUMÉRO
ET PAR NOM à l'item interne avant écriture -- un set mal identifié ou un
numéro qui ne correspond pas écrirait la carte d'une tout autre édition, ce
qui est un bug de justesse, pas une simple différence de qualité.

Mécanique : scraping du set entier via Playwright (cf. `pokecardex_scrape.py`
-- les pages du site sont une SPA React, aucune donnée exploitable en HTML
brut), qui renvoie directement (numéro imprimé, nom, URL image pleine
résolution) par carte -- plus besoin de deviner un numéro et de vérifier en
HEAD comme dans les versions précédentes de ce module.

Format d'URL des scans (CDN public Bunny, aucune protection) :
- JP : `https://pokecardex-scans.b-cdn.net/sets_jp/{code}/{num}.jpg?class=original`
- EN (impression "US") : `https://pokecardex-scans.b-cdn.net/sets/{code}/US/{num}.jpg?class=original`
"""
import argparse
import re
import time
import unicodedata

from dotenv import load_dotenv

from ingestion.sources import pokecardex_scrape
from ingestion.sources.pokecardex_scrape import PoliteBrowser, scrape_set_cards
from shared.db import get_connection

BASE_URL = "https://pokecardex-scans.b-cdn.net"

# En dessous de ce score de Dice (nom carte scrapée <-> items.name), on
# considère que le numéro imprimé ne pointe pas vers la même carte (numéro
# secret/alt-art qui ne s'aligne pas entre les deux catalogues, ou set mal
# identifié en amont) -- on n'écrit rien plutôt que de deviner. Seuil plus
# permissif que pricing/matching.py (cartes courtes -- "Pikachu" vs "Pikachu
# ex" ne doit pas être rejeté) : affiné à la main sur quelques sets si le
# taux de "skipped" s'avère anormalement élevé.
NAME_MATCH_THRESHOLD = 0.4

# Seuil du repli nom-seul (cf. sync_set_images, cas items.code = numéro de
# Pokédex/SKU produit plutôt que position imprimée) -- bien plus strict que
# NAME_MATCH_THRESHOLD : sans numéro pour ancrer, seule une quasi-identité de
# nom (après nettoyage des qualificatifs) est acceptée, jamais un simple
# recouvrement partiel de tokens.
NAME_FALLBACK_THRESHOLD = 0.8


def _extract_number(item_code):
    """items.code -> numéro imprimé nu, pour l'apparier au numéro scrapé
    PokéCardex (lui-même normalisé en int ci-dessous, donc peu importe le
    padding des deux côtés). EN: "001/086" -> 1. JP: déjà nu ("1", "10").
    Préfixe alpha optionnel toléré (ex. "SWSH001" -> 1, cf. cartes promo
    Sword & Shield relevées 2026-09-06 : un code promo peut porter un
    préfixe d'ère SANS "/", contrairement à "001/086") -- le garde-fou reste
    le score de nom avant écriture, pas cette extraction. None si aucun
    nombre n'est extractible (carte sans numéro...)."""
    if not item_code:
        return None
    m = re.match(r"^[A-Za-z]*0*(\d+)", item_code)
    return int(m.group(1)) if m else None


# items.name porte souvent un qualificatif/numéro que le nom scrapé (brut,
# juste "Charmeleon") n'a jamais -- ex. relevé 2026-09-06 sur les sets
# Battle Academy : "Charmeleon - 8/68 (#30 Charizard Stamped)" (le "#30"
# identifie un exemplaire numéroté du même produit stampé, pas une variante
# de carte différente). Sans ce nettoyage, le score de Dice s'effondrait
# sous NAME_MATCH_THRESHOLD (trop de tokens de bruit type "8"/"68"/"30"/
# "stamped" face au nom scrapé nu) -- ~50% de faux "nom discordant" sur ces
# sets alors que la carte était la bonne. Même principe que
# pricing/matching.py::_qualifier_tokens (parenthèses/crochets = bruit de
# variante), mais ici on le RETIRE avant comparaison plutôt que de le
# comparer à part : cette fonction ne fait qu'identifier LA carte, pas
# départager des variantes entre elles.
_QUALIFIER_RE = re.compile(r"[\(\[][^\)\]]*[\)\]]")
_TRAILING_NUMBER_RE = re.compile(r"\s*-\s*\d+[\w/]*\s*$")


def _clean_card_name(name):
    name = _QUALIFIER_RE.sub(" ", name or "")
    name = _TRAILING_NUMBER_RE.sub("", name)
    return name


def _normalize_name(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


def _dice(a, b):
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def _name_score(a, b):
    return _dice(
        frozenset(_normalize_name(_clean_card_name(a)).split()),
        frozenset(_normalize_name(_clean_card_name(b)).split()),
    )


def _fetch_mapped_sets(tcg="pokemon", only_unsynced=False):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = (
                "SELECT set_code, language, pokecardex_zone, pokecardex_code "
                "FROM sets WHERE tcg = %s"
            )
            if only_unsynced:
                query += " AND images_synced_at IS NULL"
            cur.execute(query, (tcg,))
            return cur.fetchall()
    finally:
        conn.close()


# Bundles à deux demi-decks (revue manuelle du 2026-09-06, cf.
# pokecardex_mapping.py::MANUAL_OVERRIDES) : PokéCardex liste chaque
# personnage du kit comme une tuile/set séparée là où le catalogue interne
# n'a qu'UN set_code pour les deux (vérifié : mêmes numéros imprimés
# réutilisés par les deux decks, ex. items "10/30 Fairy Energy" ET "10/30
# Psychic Energy" coexistent sous le même set_code -- un seul `by_number`
# écraserait l'un des deux). `sets.pokecardex_code` ne porte donc qu'un code
# représentatif (logo) pour ces set_code -- le backfill ci-dessous scrape
# RÉELLEMENT les deux codes listés ici et route chaque item vers celui des
# deux dont le nom correspond le mieux, jamais un choix arbitraire entre les
# deux images candidates.
MULTI_CODE_SETS = {
    "pokemon-sm-trainer-kit-alolan-sandslash-alolan-ninetales": ["TK11-S", "TK11-F"],
    "pokemon-battle-academy": ["ADC-M", "ADC-P"],
    "pokemon-ex-trainer-kit-1-latias-latios": ["TK1-LO", "TK1-LA"],
    "pokemon-battle-academy-2022": ["ADC2-E", "ADC2-P"],
    "pokemon-ex-trainer-kit-2-plusle-minun": ["TK2-P", "TK2-N"],
    "pokemon-hgss-trainer-kit-gyarados-raichu": ["TK4-R", "TK4-L"],
    "pokemon-xy-trainer-kit-latias-latios": ["TK8-LO", "TK8-LA"],
    "pokemon-battle-academy-2024": ["ADC3-D", "ADC3-P"],
    "pokemon-xy-trainer-kit-sylveon-noivern": ["TK6-B", "TK6-N"],
    "pokemon-xy-trainer-kit-bisharp-wigglytuff": ["TK7-G", "TK7-S"],
    # 2e passe de revue (2026-09-06, cf. pokecardex_mapping.py::MANUAL_OVERRIDES).
    "pokemon-dp-trainer-kit-manaphy-lucario": ["TK3-M", "TK3-L"],
    "pokemon-bw-trainer-kit-excadrill-zoroark": ["TK5-M", "TK5-Z"],
}


def sync_set_images(page, tcg, set_code, language, pokecardex_zone, pokecardex_code):
    """Backfill `items.image_url` pour un seul set déjà mappé (`sets`) : un
    scrape complet du set PokéCardex (ou des DEUX codes si `set_code` est un
    bundle à deux demi-decks, cf. MULTI_CODE_SETS), puis appariement par
    numéro imprimé + vérification du nom avant chaque écriture. Renvoie des
    stats pour le résumé du run appelant."""
    scrape_zone = "jp" if pokecardex_zone == "sets_jp" else "en"
    codes = MULTI_CODE_SETS.get(set_code, [pokecardex_code])
    decks = []  # liste de by_number (un dict par code scrapé)
    all_cards = []
    for i, code in enumerate(codes):
        if i > 0:
            time.sleep(pokecardex_scrape.MIN_SECONDS_BETWEEN_PAGES)
        cards = scrape_set_cards(page, scrape_zone, code)
        all_cards.extend(cards)
        by_number = {}
        for card in cards:
            by_number.setdefault(int(card["number"]), card)
        decks.append(by_number)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, code, name FROM items WHERE tcg = %s AND set_code = %s AND category = 'single'",
                (tcg, set_code),
            )
            rows = cur.fetchall()
            matched = skipped_no_number = skipped_no_card = skipped_name_mismatch = 0
            matched_by_name_fallback = 0
            for item_id, code, name in rows:
                number = _extract_number(code)
                best_card = None
                if number is not None:
                    # Plusieurs decks (MULTI_CODE_SETS) : le même numéro peut
                    # exister dans chacun (cartes différentes) -- on garde le
                    # meilleur score de nom parmi tous les decks candidats,
                    # jamais le premier trouvé arbitrairement.
                    candidates = [deck[number] for deck in decks if number in deck]
                    if candidates:
                        candidate = max(candidates, key=lambda c: _name_score(name, c["name"]))
                        if _name_score(name, candidate["name"]) >= NAME_MATCH_THRESHOLD:
                            best_card = candidate
                if best_card is not None:
                    cur.execute("UPDATE items SET image_url = %s WHERE id = %s", (best_card["image_url"], item_id))
                    matched += 1
                    continue
                # Repli nom-seul (sans ancrage numéro) : certains vieux sets JP
                # stockent en fait un numéro de Pokédex national ou un SKU
                # produit dans items.code, PAS la position imprimée sur la
                # carte (relevé 2026-09-06, ex. items.code="228" pour
                # "Mismagius" -- son n° de Pokédex national, pas sa position
                # dans le set JP "Space-Time Creation" -- ou items.code=NULL
                # pour d'autres lignes du même set). Le numéro ne sert alors à
                # rien : on cherche la meilleure correspondance de nom dans
                # TOUT le pool scrapé, avec un seuil bien plus strict que
                # NAME_MATCH_THRESHOLD (aucun numéro pour départager deux
                # cartes au nom proche, donc on n'accepte qu'une quasi-identité).
                best_anywhere = max(all_cards, key=lambda c: _name_score(name, c["name"]), default=None)
                if best_anywhere is not None and _name_score(name, best_anywhere["name"]) >= NAME_FALLBACK_THRESHOLD:
                    cur.execute("UPDATE items SET image_url = %s WHERE id = %s", (best_anywhere["image_url"], item_id))
                    matched += 1
                    matched_by_name_fallback += 1
                    continue
                if number is None:
                    skipped_no_number += 1
                elif not any(number in deck for deck in decks):
                    skipped_no_card += 1
                else:
                    skipped_name_mismatch += 1
            cur.execute(
                "UPDATE sets SET images_synced_at = now() WHERE tcg = %s AND set_code = %s",
                (tcg, set_code),
            )
        conn.commit()
    finally:
        conn.close()
    return {
        "set_code": set_code,
        "language": language,
        "items_total": len(rows),
        "cards_scraped": len(all_cards),
        "matched": matched,
        "matched_by_name_fallback": matched_by_name_fallback,
        "skipped_no_number": skipped_no_number,
        "skipped_no_card": skipped_no_card,
        "skipped_name_mismatch": skipped_name_mismatch,
    }


def sync_all_mapped_sets(tcg="pokemon", only_unsynced=True):
    """Parcourt tous les sets mappés (`sets`, cf. `pokecardex_mapping.py`) et
    backfille leurs images. `only_unsynced=True` (défaut) saute les sets déjà
    traités (`images_synced_at` non NULL) -- reprise après interruption sans
    tout refaire ; passer `only_unsynced=False` pour forcer un re-sync
    complet (ex. après un changement du site source)."""
    targets = _fetch_mapped_sets(tcg, only_unsynced=only_unsynced)
    results = []
    with PoliteBrowser() as pb:
        for i, (set_code, language, pokecardex_zone, pokecardex_code) in enumerate(targets):
            if i > 0:
                pb.throttle()
            try:
                stats = sync_set_images(pb.page, tcg, set_code, language, pokecardex_zone, pokecardex_code)
            except Exception as exc:
                stats = {"set_code": set_code, "language": language, "error": str(exc)}
            results.append(stats)
            if "error" in stats:
                print(f"  ! {set_code} ({language}): erreur -- {stats['error']}")
            else:
                fallback_note = f", {stats['matched_by_name_fallback']} par repli nom-seul" if stats["matched_by_name_fallback"] else ""
                print(
                    f"  {set_code} ({language}): {stats['matched']}/{stats['items_total']} image(s) "
                    f"({stats['cards_scraped']} carte(s) scrapée(s), "
                    f"{stats['skipped_no_card']} sans correspondance, "
                    f"{stats['skipped_name_mismatch']} nom discordant{fallback_note})"
                )
    return results


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--resync-all", action="store_true",
        help="Retraite aussi les sets déjà backfillés (par défaut, ne traite que ceux avec images_synced_at NULL).",
    )
    parser.add_argument("--set-code", help="Limite le run à un seul set_code interne (debug).")
    args = parser.parse_args()

    print("== Backfill images PokéCardex (catalogue Pokémon mappé) ==")
    started = time.monotonic()
    if args.set_code:
        rows = _fetch_mapped_sets(only_unsynced=False)
        rows = [r for r in rows if r[0] == args.set_code]
        if not rows:
            print(f"'{args.set_code}' absent de la table `sets` (pas mappé ou pas encore --write dans pokecardex_mapping).")
            return
        with PoliteBrowser() as pb:
            results = [sync_set_images(pb.page, "pokemon", *rows[0])]
    else:
        results = sync_all_mapped_sets(only_unsynced=not args.resync_all)

    ok = [r for r in results if "error" not in r]
    errors = [r for r in results if "error" in r]
    total_matched = sum(r["matched"] for r in ok)
    total_items = sum(r["items_total"] for r in ok)
    elapsed = time.monotonic() - started
    print(
        f"\nTerminé en {elapsed / 60:.1f} min : {total_matched}/{total_items} image(s) mise(s) à jour "
        f"sur {len(ok)} set(s) ({len(errors)} erreur(s))."
    )


if __name__ == "__main__":
    main()
