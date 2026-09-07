"""Mapping `items.set_code` (interne) <-> set PokéCardex, pré-requis au
backfill d'images pleine échelle (cf. `pokecardex.py::sync_mapped_items`) et
à l'affichage des logos de set (cf. `sets` table, db/schema.sql).

Aucun nom de set lisible n'existe en base pour comparer -- réutilise donc
`pricing/repository.py::set_label_from_code` (déjà la source de vérité pour
le libellé humain affiché ailleurs, ex. `pricing_api`) comme texte de
requête, et fuzzy-matche par coefficient de Dice sur tokens normalisés contre
le catalogue scrapé (`pokecardex_scrape.py::scrape_set_catalog`). Même
principe que `pricing/matching.py`/`pricecharting.py::_best_single_match`
(normalisation NFKD, Dice sur tokens) -- réimplémenté ici en ~10 lignes
plutôt qu'importé, ces deux modules étant explicitement documentés comme
fragiles / non pensés pour être des dépendances externes.

Ne devine jamais un set ambigu : si le meilleur score est sous le seuil, ou
si le deuxième meilleur score est trop proche du premier, le set est laissé
de côté (catégorie "ambiguous"/"unmatched" du rapport) plutôt qu'auto-accepté
-- un set mal identifié écrirait la carte d'une TOUTE AUTRE édition en base,
ce qui est un bug de justesse, pas juste une image de moindre qualité (ce
dernier point est, lui, tranché : "uniformité totale", cf. mémoire projet/
discussion du 2026-09-06 -- mais ça ne concerne que le choix entre deux
scans d'UNE MÊME carte, pas l'identification du set)."""
import argparse
import json
import re
import unicodedata
from pathlib import Path

from dotenv import load_dotenv

from ingestion.sources.pokecardex_scrape import PoliteBrowser, scrape_set_catalog
from pricing.repository import set_label_from_code
from shared.db import get_connection

REPORT_PATH = Path(__file__).resolve().parents[1] / "_probe_output" / "pokecardex_set_mapping_report.json"

# cf. docstring module -- seuils calqués sur pricing/matching.py
# (_FUZZY_NAME_MATCH_THRESHOLD=0.6). Relevé empirique (2026-09-06, première
# passe à 0.5) : sous ~0.6, des collisions nettes apparaissent -- ex. deux
# starter decks JP différents ("Zekrom EX Battle Strength Deck" ET "Reshiram
# EX Battle Strength Deck") matchés tous les deux sur le même set PokéCardex
# "EX Battle Boost" (score 0.5 -- vocabulaire commun "ex"/"battle"/"deck"/
# "strength" trop générique face à un jeu de tokens aussi court). Remonté à
# 0.62 : élimine ces cas manifestes sans perdre les bons matchs sains
# observés au-dessus (ex. "Legends Awakened" -> "Diamond & Pearl : Legends
# Awakened", 0.67).
MATCH_THRESHOLD = 0.62
# Si le 2e meilleur score est à moins de cette marge du 1er, on ne tranche
# pas tout seul (cf. disambiguate_pokemon_candidates dans pricing/matching.py,
# même logique de "tie -> ambigu").
AMBIGUOUS_MARGIN = 0.1

_LANGUAGE_TO_ZONE = {"EN": "sets", "JP": "sets_jp"}
_LANGUAGE_TO_SCRAPE_ZONE = {"EN": "en", "JP": "jp"}

# Revue manuelle des 42 cas ambigus/collisions du 2026-09-06 (demande
# utilisateur "grappiller un peu plus de couverture") -- vérifiés un par un
# (scrape direct, date de sortie interne, ou inclusion de sous-chaîne exacte
# du libellé), PAS un score automatique qu'on aurait fini par accepter :
# cf. commentaire par entrée. set_code -> code PokéCardex forcé.
MANUAL_OVERRIDES = {
    # Tie "XY" (générique, un token partagé par TOUS les libellés d'ère
    # xy-*) vs le code spécifique -- le générique n'est qu'un artefact de
    # tokenisation (même nombre de tokens en commun par construction), le
    # nom spécifique est toujours réellement le bon.
    "pokemon-xy-breakthrough": "BKT",
    "pokemon-xy-breakpoint": "BKP",
    "pokemon-xy-evolutions": "EVO",
    "pokemon-xy-flashfire": "FLF",
    # Marge de désambiguïsation (0.1) trop stricte pour un score déjà net et
    # sans ambiguïté réelle (le nom du 2e candidat est un set totalement
    # différent, pas une variante du 1er).
    "pokemon-black-and-white-promos": "PRBW",   # "Promos Black Star Black & White" vs base "Black & White"
    "pokemon-team-rocket-returns": "TRR",       # "EX: Team Rocket Returns" vs "Team Rocket" (2000, set différent)
    # Le nom PokéCardex contient le libellé interne comme sous-chaîne
    # EXACTE ("Dream Shine Collection" dans "Mythical & Legendary Dream
    # Shine Collection"), le concurrent ("Legendary Shine Collection") ne
    # partage que des mots isolés.
    "pokemon-jp-dream-shine-collection": "CP5",
    "pokemon-legendary-treasures-radiant-collection": "LTR",  # vs "Legendary Collection", set 2002 sans rapport
    # Confirmé par date de sortie interne (2003-11-24) : "EX: Dragon" est le
    # bon set de cette ère, pas "Dragon Majesty" (2018) ni "Dragon Vault" (2011).
    "pokemon-dragon": "DR",
    # Convention de nommage interne : seules les éditions -2023/-2024
    # portent un suffixe d'année (vérifié, toutes deux déjà matchées sans
    # ambiguïté) -- la variante nue est donc la première édition, 2022.
    "pokemon-trick-or-trade-booster-bundle": "TOT22",
    # Confirmé par scrape direct (2026-09-06) : MEW renvoie 207 cartes
    # numérotées .../165 avec Bulbasaur en position 1 -- correspond
    # exactement au catalogue interne ("001/165 Bulbasaur").
    "pokemon-sv-scarlet-violet-151": "MEW",
    # Le libellé dérivé du slug ("Sm/Xy Base Set") est trompeur : PriceCharting
    # nomme ainsi le PREMIER set de chaque ère (Sun & Moon 2017 / XY 2014),
    # PAS une réimpression du Base Set 1999 -- confirmé par le dénominateur
    # réel des cartes (149/146, correspond aux vrais totaux Sun & Moon/XY)
    # et la date de sortie. Sans cet override, ces deux set_code entraient en
    # collision avec le vrai Base Set (voir _split_out_collisions).
    "pokemon-sm-base-set": "SM01",
    "pokemon-xy-base-set": "XY",
    # Bundles à deux demi-decks : PokéCardex les liste comme deux tuiles
    # séparées (une par personnage) là où le catalogue interne n'a qu'UN
    # set_code pour les deux -- code ci-dessous juste représentatif (logo +
    # ligne `sets`), le backfill d'images scrape RÉELLEMENT les deux codes
    # séparément et route chaque item vers le bon deck par score de nom (cf.
    # pokecardex.py::MULTI_CODE_SETS).
    "pokemon-sm-trainer-kit-alolan-sandslash-alolan-ninetales": "TK11-S",
    "pokemon-battle-academy": "ADC-M",
    "pokemon-ex-trainer-kit-1-latias-latios": "TK1-LO",
    "pokemon-battle-academy-2022": "ADC2-E",
    "pokemon-ex-trainer-kit-2-plusle-minun": "TK2-P",
    "pokemon-hgss-trainer-kit-gyarados-raichu": "TK4-R",
    "pokemon-xy-trainer-kit-latias-latios": "TK8-LO",
    "pokemon-battle-academy-2024": "ADC3-D",
    "pokemon-xy-trainer-kit-sylveon-noivern": "TK6-B",
    "pokemon-xy-trainer-kit-bisharp-wigglytuff": "TK7-G",

    # Revue complémentaire du 2026-09-06 (demande utilisateur "grappiller
    # encore plus de couverture", 2e passe sur les set_code auparavant
    # "unmatched") :
    # Le libellé dérivé ("SwshNN ... Trainer Gallery") ne colle à aucun
    # candidat au-dessus du seuil (0.571 max) -- confirmé qu'il s'agit bien
    # du sous-ensemble "Trainer Gallery" de CE set principal (même famille
    # que Shiny Vault/Galarian Gallery ci-dessus, numérotation "TGxx"
    # probable côté carte -- couverture d'images attendue faible/nulle mais
    # le logo est correct et sans risque).
    "pokemon-swsh09-brilliant-stars-trainer-gallery": "BRS",
    "pokemon-swsh10-astral-radiance-trainer-gallery": "ASR",
    "pokemon-swsh11-lost-origin-trainer-gallery": "LOR",
    "pokemon-swsh12-silver-tempest-trainer-gallery": "SIT",
    # Même schéma que "Sm/Xy Base Set" plus haut : le tout premier set d'une
    # ère, PAS le Base Set 1999 (avec lequel il était à égalité parfaite de
    # score, "Base Set" partageant les mêmes tokens génériques).
    "pokemon-swsh01-sword-shield-base-set": "SWSH1",
    "pokemon-sv01-scarlet-violet-base-set": "SVI",
    # Candidat unique net (0.571, aucun concurrent proche) une fois le nom
    # complet comparé -- juste sous l'ancien seuil car "Deck Build Box" est
    # un qualificatif que PokéCardex n'incncut pas dans le nom du set lui-même.
    "pokemon-jp-stellar-miracle-deck-build-box": "SV7",
    "pokemon-jp-battle-partners-deck-build-box": "SV9",
    # Autre paire de bundles à deux demi-decks (même motif que la première
    # série ci-dessus, cf. pokecardex.py::MULTI_CODE_SETS).
    "pokemon-dp-trainer-kit-manaphy-lucario": "TK3-M",
    "pokemon-bw-trainer-kit-excadrill-zoroark": "TK5-M",
    # NOTE (2026-09-06) : un cluster de 5 decks JP "X ex Mega Battle Deck" ->
    # "M2A", un autre de 4 "X EX Battle Strength Deck" -> "EBB", et un
    # cluster de 6 promos hétérogènes (Nintendo/HGSS/SM/Burger King/Kids WB/
    # Professeur) -> "PRAL" ont été essayés puis RETIRÉS après vérification :
    # le scrape direct de M2A/EBB/PRAL montre des sets complets (250, 99, 79
    # cartes) sans rapport thématique avec ces petits produits (M2A/EBB sont
    # de vraies extensions autonomes, pas des pages regroupant plusieurs
    # decks ; PRAL est spécifiquement les promos "alternate art" de l'ère XY,
    # pas un fourre-tout). Les rares images obtenues via le repli nom-seul
    # étaient probablement des coïncidences sur des cartes génériques
    # (Energies, Dresseurs communs) plutôt qu'un vrai rattachement au bon
    # produit -- retiré plutôt que de garder un mapping structurellement
    # faux (logo trompeur), même sans risque d'écriture erronée carte par
    # carte (le garde-fou aurait de toute façon bloqué les cas manifestes).
}


def _normalize_name(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


# Racinisation minimale (juste le pluriel anglais courant) -- ajoutée après
# un cas réel manqué : "pokemon-mee-mega-evolution-energies" (label "Mee Mega
# Evolution Energies") perdait son seul candidat correct ("MEE - Mega
# Evolution Energy") face au générique "MEG - Mega Evolution", uniquement
# parce que "energies" != "energy" en comparaison de tokens bruts -- alors
# que "Promos"/"Promo" et "Energies"/"Energy" sont exactement le genre de
# variation qu'un set de cartes et son propre libellé PokéCardex peuvent
# porter (pluriel générique côté libellé interne, singulier côté nom réel du
# produit, ou l'inverse). Volontairement PAS un vrai stemmer (Porter etc.) --
# juste les deux formes de pluriel anglais standard, sur des tokens déjà
# courts (noms de sets, pas du texte libre) où le risque de collision
# fortuite est faible.
def _destem(word):
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def _tokens(text):
    return frozenset(_destem(w) for w in _normalize_name(text).split())


def _dice(a, b):
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def _fetch_internal_sets(tcg):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT set_code, language FROM items WHERE tcg = %s AND set_code IS NOT NULL",
                (tcg,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def scrape_catalogs():
    """Scrape les deux catalogues PokéCardex (EN "International" + JP) une
    seule fois -- réutilisé pour tout le mapping, ~250-370 tuiles par zone,
    quelques secondes au total (cf. pokecardex_scrape.py::scrape_set_catalog,
    pas de virtualisation constatée sur cette page)."""
    with PoliteBrowser() as pb:
        en_catalog = scrape_set_catalog(pb.page, "en")
        pb.throttle()
        jp_catalog = scrape_set_catalog(pb.page, "jp")
    for row in en_catalog + jp_catalog:
        row["_tokens"] = _tokens(row["name"])
    return {"EN": en_catalog, "JP": jp_catalog}


def build_mapping(tcg="pokemon", catalogs=None):
    """Fuzzy-matche chaque (set_code, language) interne contre le catalogue
    PokéCardex de sa langue. `catalogs` optionnel (déjà scrapé) pour éviter un
    re-scrape si l'appelant l'a déjà fait (ex. tests). Renvoie
    {"matched": [...], "ambiguous": [...], "unmatched": [...]}."""
    internal_sets = _fetch_internal_sets(tcg)
    if catalogs is None:
        catalogs = scrape_catalogs()

    matched, ambiguous, unmatched = [], [], []
    for set_code, language in internal_sets:
        label = set_label_from_code(set_code, tcg)
        catalog = catalogs.get(language)
        if not catalog:
            unmatched.append({
                "set_code": set_code, "language": language, "label": label,
                "reason": "langue non couverte par PokéCardex",
            })
            continue
        query_tokens = _tokens(label)
        scored = sorted(
            ((_dice(query_tokens, row["_tokens"]), row) for row in catalog),
            key=lambda pair: pair[0],
            reverse=True,
        )
        best_score, best_row = scored[0]
        if best_score < MATCH_THRESHOLD:
            unmatched.append({
                "set_code": set_code, "language": language, "label": label,
                "best_score": round(best_score, 3),
                "best_candidate": best_row["name"],
            })
            continue
        tie = len(scored) >= 2 and (best_score - scored[1][0]) < AMBIGUOUS_MARGIN
        entry = {
            "set_code": set_code,
            "language": language,
            "label": label,
            "pokecardex_code": best_row["code"],
            "pokecardex_name": best_row["name"],
            "logo_url": best_row["logo_url"],
            "pokecardex_zone": _LANGUAGE_TO_ZONE[language],
            "score": round(best_score, 3),
        }
        if tie:
            entry["runner_up"] = {
                "pokecardex_code": scored[1][1]["code"],
                "pokecardex_name": scored[1][1]["name"],
                "score": round(scored[1][0], 3),
            }
            ambiguous.append(entry)
        else:
            matched.append(entry)
    # Overrides AVANT le tri des collisions : un override peut retirer un
    # set_code d'un groupe de collision en le pointant vers une tout autre
    # cible (cf. "pokemon-sm-base-set"/"pokemon-xy-base-set" dans
    # MANUAL_OVERRIDES -- une fois sortis, "pokemon-base-set" et
    # "pokemon-base-set-shadowless" redeviennent une paire propre au lieu
    # d'une collision à 4).
    matched, ambiguous, unmatched = _apply_manual_overrides(matched, ambiguous, unmatched, catalogs, tcg)
    matched, ambiguous = _split_out_collisions(matched, ambiguous)
    return {"matched": matched, "ambiguous": ambiguous, "unmatched": unmatched}


def _split_out_collisions(matched, ambiguous):
    """Un code PokéCardex donné (dans une langue donnée) ne peut être la
    bonne cible que d'un ou deux set_code internes -- si le scoring
    individuel en a fait gagner TROIS ou plus, ce n'est pas un signe de bon
    match, c'est le signe que le vocabulaire de leurs libellés se recouvre
    trop (ex. cas réel relevé le 2026-09-06 : "Base Set"/"Base Set
    Shadowless"/"Sm Base Set"/"Xy Base Set" gagnaient tous les 4 sur le
    même "BS", alors que les deux derniers sont en fait des sets d'ère
    totalement différents mal étiquetés -- cf. MANUAL_OVERRIDES). Ces
    groupes de 3+ sont retirés de `matched` et basculés en `ambiguous`.

    Un groupe de taille 2, en revanche, est un motif connu et sûr à laisser
    passer (revue manuelle du 2026-09-06, cf. MANUAL_OVERRIDES) : un set
    principal + sa "sous-galerie" (Shiny Vault, Galarian Gallery, Special...)
    publiés sur UNE MÊME page PokéCardex -- le garde-fou carte-par-carte de
    `pokecardex.py::sync_set_images` (numéro ET nom doivent correspondre)
    empêche déjà qu'une carte de l'un s'écrive à tort sous l'autre, donc
    partager la même cible ici ne risque jamais une mauvaise écriture,
    seulement une non-couverture si les numéros ne s'alignent pas.

    Un groupe de 3+ N'EST PAS démoté quand AU MOINS UN de ses membres porte
    `"override"` (donc déjà vérifié à la main, cf. MANUAL_OVERRIDES) --
    revue du 2026-09-06 : plusieurs decks JP différents ("Diancie ex Mega
    Battle Deck", "Gengar ex Mega Battle Deck", "Rayquaza ex Mega Battle
    Deck"...) partagent légitimement UNE SEULE page PokéCardex ("M2A - MEGA
    Dream ex"), au même titre que le set de base "pokemon-jp-mega-dream-ex"
    lui-même (qui matche CE MÊME code naturellement, sans override -- exiger
    que TOUS les membres soient override aurait démoté ce cas sain avec les
    autres, régression relevée en session). Le site ne distingue pas ces
    decks par un code séparé contrairement aux Trainer Kit EN. Le garde-fou
    carte-par-carte protège identiquement ce cas -- seul un groupe SANS AUCUN
    membre vérifié à la main reste traité comme une collision suspecte
    (règle d'origine, ex. Base Set/Sm Base Set/Xy Base Set avant leurs
    overrides respectifs)."""
    by_target = {}
    for entry in matched:
        by_target.setdefault((entry["language"], entry["pokecardex_code"]), []).append(entry)
    clean, demoted = [], []
    for group in by_target.values():
        any_overridden = any("override" in e for e in group)
        if len(group) <= 2 or any_overridden:
            if len(group) >= 2:
                for entry in group:
                    entry["shared_with"] = [e["set_code"] for e in group if e is not entry]
            clean.extend(group)
            continue
        for entry in group:
            entry["reason"] = "code PokéCardex revendiqué par 3+ set_code internes"
            entry["collides_with"] = [e["set_code"] for e in group if e is not entry]
            demoted.append(entry)
    return clean, ambiguous + demoted


def _apply_manual_overrides(matched, ambiguous, unmatched, catalogs, tcg):
    """Applique MANUAL_OVERRIDES (revue manuelle du 2026-09-06, cf. son
    commentaire) : retire l'entrée existante de son bucket courant (matched/
    ambiguous/unmatched, où qu'elle soit) et la remplace par le mapping
    forcé. Un set_code absent des 3 buckets (jamais rencontré dans
    `items`) est simplement ignoré -- MANUAL_OVERRIDES peut survivre au-delà
    du catalogue réel sans erreur."""
    all_entries = {e["set_code"]: e for e in matched + ambiguous + unmatched}
    matched = [e for e in matched if e["set_code"] not in MANUAL_OVERRIDES]
    ambiguous = [e for e in ambiguous if e["set_code"] not in MANUAL_OVERRIDES]
    unmatched = [e for e in unmatched if e["set_code"] not in MANUAL_OVERRIDES]
    for set_code, pokecardex_code in MANUAL_OVERRIDES.items():
        existing = all_entries.get(set_code)
        if existing is None:
            continue
        language = existing["language"]
        catalog = catalogs.get(language, [])
        row = next((r for r in catalog if r["code"] == pokecardex_code), None)
        if row is None:
            continue
        matched.append({
            "set_code": set_code,
            "language": language,
            "label": existing["label"],
            "pokecardex_code": row["code"],
            "pokecardex_name": row["name"],
            "logo_url": row["logo_url"],
            "pokecardex_zone": _LANGUAGE_TO_ZONE[language],
            "score": 1.0,
            "override": "manuel (revue 2026-09-06, cf. MANUAL_OVERRIDES)",
        })
    return matched, ambiguous, unmatched


def write_matched_to_db(matched, tcg="pokemon"):
    """UPSERT des matches haute confiance dans `sets` (cf. db/schema.sql).
    Idempotent -- rejouable sans dupliquer (PRIMARY KEY (tcg, set_code))."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for entry in matched:
                cur.execute(
                    """
                    INSERT INTO sets (
                        tcg, set_code, language, pokecardex_zone, pokecardex_code,
                        name, logo_url, match_confidence, matched_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (tcg, set_code) DO UPDATE SET
                        language = EXCLUDED.language,
                        pokecardex_zone = EXCLUDED.pokecardex_zone,
                        pokecardex_code = EXCLUDED.pokecardex_code,
                        name = EXCLUDED.name,
                        logo_url = EXCLUDED.logo_url,
                        match_confidence = EXCLUDED.match_confidence,
                        matched_at = now()
                    """,
                    (
                        tcg, entry["set_code"], entry["language"], entry["pokecardex_zone"],
                        entry["pokecardex_code"], entry["pokecardex_name"], entry["logo_url"],
                        entry["score"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write", action="store_true",
        help="Écrit les matches haute confiance dans `sets` (sinon dry-run : rapport seul, rien en base).",
    )
    args = parser.parse_args()

    print("== Mapping sets internes <-> PokéCardex (Pokémon EN+JP) ==")
    result = build_mapping()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"Matched: {len(result['matched'])}  Ambigus: {len(result['ambiguous'])}  "
        f"Non-matchés: {len(result['unmatched'])}"
    )
    print(f"Rapport détaillé : {REPORT_PATH}")
    if args.write:
        write_matched_to_db(result["matched"])
        print(f"{len(result['matched'])} set(s) écrit(s)/mis à jour dans la table `sets`.")
    else:
        print("Dry-run (rien écrit en base) -- relancer avec --write une fois le rapport revu.")


if __name__ == "__main__":
    main()
