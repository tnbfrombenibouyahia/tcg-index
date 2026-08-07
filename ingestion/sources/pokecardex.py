"""Source d'images (scraping partiel) : PokéCardex (pokecardex.com).

Suite à une suggestion utilisateur de sourcer les images JP/CN sur ce site
(scans de meilleure qualité que TCGPlayer/PriceCharting sur certains sets),
évalué en profondeur le 2026-08-06. Deux découvertes ont scopé ce module à
beaucoup moins que "toutes les images" :

1. **Watermark pas systématique, mais pas prévisible à l'échelle du set.**
   Les scans PokéCardex sont propres sur les sets très récents, mais
   certaines cartes plus anciennes portent un filigrane -- parfois
   "POKECARDEX" (leur propre marque), parfois celui d'un contributeur tiers
   repris tel quel (ex. "viper.fox" trouvé sur PCG9/2006, un set pourtant
   postérieur à la coupure vintage évidente). Un unique sample par set ne
   suffit donc PAS à certifier un set "propre" -- vérifié à la main,
   carte par carte, pour chaque entrée de `POKECARDEX_IMAGE_SETS` ci-dessous.
   Sets non retenus : toute la coupure vintage (avant ~2006, filigranée de
   façon quasi systématique) + les sets récents dont la résolution
   PokéCardex s'est avérée égale ou inférieure à ce qu'on a déjà (voir point
   2) -- ne pas étendre cette liste sans reproduire la vérification manuelle
   (fetch `?class=original`, inspection visuelle du filigrane, comparaison
   de résolution avec `items.image_url` actuel).

2. **"Récent" ne veut pas dire "meilleure résolution".** Comparé
   set-par-set contre la source actuelle (TCGPlayer pour EN, PriceCharting
   pour JP -- déjà upscalées, cf. mémoire projet sur la qualité d'image), la
   moitié des sets récents testés étaient à résolution égale ou *inférieure*
   sur PokéCardex (ex. Stellar Crown EN 662x920 actuel vs 573x800 PokéCardex
   -- on garde l'existant). Chaque entrée listée ici a été vérifiée
   strictement meilleure sur un échantillon.

**CN jamais évalué** : pas de catalogue CN dans `items` à ce jour (JP
sealed/singles couvre Pokémon + One Piece, pas de Chinois, cf. mémoire
projet). Resterait à faire si le tracking CN démarre un jour.

Format d'URL (CDN public Bunny, aucune protection -- contrairement à l'API
`/api/carte/...` du site elle-même, gated par le WAF hébergeur "PowerBoost",
cf. session du 2026-08-06) :
- JP : `https://pokecardex-scans.b-cdn.net/sets_jp/{code}/{num}.jpg?class=original`
- EN (impression "US") : `https://pokecardex-scans.b-cdn.net/sets/{code}/US/{num}.jpg?class=original`

`{num}` = numéro imprimé sans padding ni total (ex. "7", pas "007/086") --
dérivé de `items.code` en retirant le zéro-padding et le "/XXX" final côté
EN, pris tel quel côté JP.
"""
import re
import time

import requests

from shared.db import get_connection

BASE_URL = "https://pokecardex-scans.b-cdn.net"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Pas de quota documenté (CDN statique, CORS ouvert), mais on reste poli
# comme pour PriceCharting.
MIN_SECONDS_BETWEEN_REQUESTS = 0.5

# items.set_code -> (zone PokéCardex, code de série PokéCardex)
# zone = "sets_jp" (JP) ou "sets" (EN, impression "US" -- ajouté par
# `image_url()` ci-dessous).
#
# Vérifié à la main le 2026-08-06 : filigrane absent (plusieurs cartes
# inspectées par set) ET résolution strictement meilleure que la source
# actuelle. Voir le docstring du module avant d'ajouter une entrée -- un
# sample unique ou une comparaison de résolution sautée a déjà produit un
# faux positif dans cette même session (Pitch Black EN, écarté après
# vérification : 744x1040 PokéCardex vs 752x1048 TCGPlayer déjà en place).
POKECARDEX_IMAGE_SETS = {
    "pokemon-jp-storm-emeralda": ("sets_jp", "M6"),       # 1085x1515 vs 868x1212 PriceCharting
    "pokemon-jp-black-bolt": ("sets_jp", "SV11B"),        # 868x1212 vs 513x730 PriceCharting
    "pokemon-jp-white-flare": ("sets_jp", "SV11W"),       # 868x1212 vs 520x730 PriceCharting
    "pokemon-sv-black-bolt": ("sets", "BLK"),             # 733x1024 vs 446x620 TCGPlayer
    "pokemon-sv-white-flare": ("sets", "WHT"),            # 733x1024 vs 446x620 TCGPlayer
}


def _extract_number(item_code):
    """items.code -> numéro imprimé nu pour l'URL PokéCardex.

    EN: "001/086" -> "1". JP: déjà nu ("1", "10") -> inchangé.
    Renvoie None si aucun nombre n'est extractible (carte sans numéro).
    """
    if not item_code:
        return None
    m = re.match(r"0*(\d+)", item_code)
    return m.group(1) if m else None


def image_url(set_code, item_code, image_class="original"):
    """Construit l'URL PokéCardex pour cet item, ou None si le set n'est
    pas dans `POKECARDEX_IMAGE_SETS` ou si le numéro n'est pas extractible.
    N'effectue aucune requête -- appelant responsable de vérifier le 200
    avant d'écrire en base (les numéros secrets/alt-art ne matchent pas
    tous, cf. `verify_image_url`).
    """
    mapping = POKECARDEX_IMAGE_SETS.get(set_code)
    if mapping is None:
        return None
    zone, pcx_code = mapping
    num = _extract_number(item_code)
    if num is None:
        return None
    lang_segment = "/US" if zone == "sets" else ""
    return f"{BASE_URL}/{zone}/{pcx_code}{lang_segment}/{num}.jpg?class={image_class}"


def verify_image_url(url, timeout=15):
    """True si l'URL répond 200 (CDN public, pas de session/cookie requis)."""
    try:
        r = requests.head(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        if r.status_code == 405:  # certains CDN n'aiment pas HEAD
            r = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
        return r.status_code == 200
    except requests.RequestException:
        return False


def sync_mapped_items(set_codes=None):
    """Backfill `items.image_url` pour les sets de `POKECARDEX_IMAGE_SETS`
    (déjà vérifiés à la main : sans filigrane et strictement mieux résolus
    que la source actuelle, cf. docstring module). Un seul item à la fois --
    catalogue concerné petit (5 sets), pas besoin d'`execute_values` -- et
    chaque URL est vérifiée en HEAD avant écriture, parce que les numéros
    secrets/alt-art ne matchent pas forcément le même schéma que PokéCardex
    (`verify_image_url`) : un miss laisse `image_url` inchangé plutôt que
    d'écrire une image cassée.

    Ce backfill n'a normalement besoin d'être rejoué qu'une fois par set (les
    scans PokéCardex ne changent pas) -- mais safe à relancer : idempotent,
    et les resyncs quotidiens (référentiel API TCG + prix PriceCharting JP)
    ne reviennent plus dessus, cf. le garde `LIKE 'https://pokecardex%'`
    ajouté à leurs `_UPSERT_*_SQL` (apitcg.py / pricecharting.py) --
    sans lui, l'écrasement serait silencieux au prochain run."""
    codes = list(POKECARDEX_IMAGE_SETS) if set_codes is None else list(set_codes)
    results = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for i, set_code in enumerate(codes):
                if i > 0:
                    time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                cur.execute(
                    "SELECT id, code FROM items WHERE set_code = %s AND category = 'single'",
                    (set_code,),
                )
                rows = cur.fetchall()
                checked = written = 0
                for item_id, code in rows:
                    url = image_url(set_code, code)
                    if url is None:
                        continue
                    checked += 1
                    time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                    if not verify_image_url(url):
                        continue
                    cur.execute("UPDATE items SET image_url = %s WHERE id = %s", (url, item_id))
                    written += 1
                conn.commit()
                stats = {"set_code": set_code, "items_total": len(rows), "checked": checked, "written": written}
                print(f"{set_code}: {written}/{checked} image(s) mise(s) à jour ({len(rows)} item(s) au total)")
                results.append(stats)
    finally:
        conn.close()
    return results


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--set-code",
        help="set_code interne (items.set_code) parmi POKECARDEX_IMAGE_SETS. Omis => tous les sets mappés.",
    )
    args = parser.parse_args()

    set_codes = [args.set_code] if args.set_code else None
    print(f"== Backfill images PokéCardex ({args.set_code or 'tous les sets mappés'}) ==")
    results = sync_mapped_items(set_codes)
    total_written = sum(r["written"] for r in results)
    total_checked = sum(r["checked"] for r in results)
    print(f"\nTerminé : {total_written}/{total_checked} image(s) mise(s) à jour sur {len(results)} set(s).")


if __name__ == "__main__":
    main()
