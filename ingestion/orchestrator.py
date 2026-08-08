"""Orchestrateur du run quotidien : enchaîne les syncs qui doivent tourner sans
intervention manuelle, pour que l'historique s'accumule tout seul (cf. handoff
§9 point 5, §11 "connu, pas résolu" — jusqu'ici chaque sync était lancée à la
main).

Chaque source garde son propre CLI (`python -m ingestion.sources.X`) pour un
usage manuel/debug ; ce script est l'enchaînement pensé pour un cron
(GitHub Actions, cf. .github/workflows/).

Deux natures de sync, pas une seule, à cause du coût très différent des deux
opérations PriceCharting (cf. pricecharting.py) :
- quotidien, tous les sets mappés : référentiel (API TCG) + prix ungraded
  (1 requête HTTP par page de set -- pas cher, ~226 sets en 30 min).
- `--tier` : gradation PSA + historique de ventes individuelles eBay/
  TCGPlayer/... (1 requête HTTP PAR CARTE en plus -- tout le catalogue
  (~34k singles) prendrait ~35h, impossible à faire tenir dans un run,
  même sans limite de coût -- cf. mémoire "grading_tiers"/"sales_volume_tracking").

Système de paliers par âge de set (TIERS ci-dessous), pas une fenêtre fixe :
plus un set est récent, plus il est vérifié souvent -- c'est là que se joue
le pouls du marché (hype, nouveaux tirages) et que le plafond ~30 ventes/
palier PriceCharting risque de faire perdre des ventes si on espace trop.
Le palier "vintage" (36+ mois, ~77% du catalogue Pokémon à lui seul) est en
plus trop gros pour un seul run même à sa propre fréquence : il est découpé
en tranches tournantes (`rotation_slices`) réparties sur plusieurs semaines,
cf. `_current_vintage_slice` et `pricecharting._slice_set_codes`. Les bornes
d'âge se calculent depuis `items.release_date` (rempli à 100% pour les deux
TCG par le sync référentiel quotidien) -- pas de liste de sets codée en dur,
le système suit tout seul les nouvelles sorties.

JustTCG n'est volontairement pas appelé ici : en pause depuis l'incident 401
du 2026-07-29 (cf. mémoire projet), reprise à la main quand voulu via
`python -m ingestion.sources.justtcg`.

Après la sync, enchaîne aussi le calcul des indices (`index/calculate.py`)
et le ratio EV des scellés (`index/sealed_ev.py`) -- tous deux à chaque run,
puisqu'ils ne dépendent que de `price_snapshots`, mise à jour par les deux
natures de sync. Le volume (`index/volume.py`) est différent : il lit
`sales`, qui n'est mise à jour que par un run `--tier`, donc n'est recalculé
que sur ces runs-là (recalculer sur des données inchangées serait du travail
perdu).
"""
import argparse
import sys
import time
from datetime import date

from dotenv import load_dotenv

from index import calculate as index_calculate
from index import grading_roi_inputs as index_grading_roi_inputs
from index import sealed_ev as index_sealed_ev
from index import undervalued as index_undervalued
from index import volume as index_volume
from index.methodology import INDEX_DEFINITIONS
from ingestion import rarity_inherit
from ingestion.sources import apitcg, bulbapedia, ebay, limitlesstcg, pricecharting
from shared.db import get_connection
from shared.sync_log import finish_run, start_run

TCGS = ["pokemon", "one-piece"]

# Paliers par âge de set (bornes en mois, `None` = pas de limite de ce côté).
# Décidés avec la répartition réelle du catalogue (cf. mémoire projet) :
# vintage (36+ mois) = ~77% du catalogue Pokémon à lui seul, d'où la rotation
# sur 8 tranches (couverture complète tous les ~2 mois) plutôt qu'un run
# direct qui prendrait ~22h.
TIERS = {
    "hot":         {"min_age_months": None, "max_age_months": 6},
    "recent":      {"min_age_months": 6,    "max_age_months": 18},
    "established": {"min_age_months": 18,   "max_age_months": 36},
    "vintage":     {"min_age_months": 36,   "max_age_months": None, "rotation_slices": 8},
    # Pas un palier d'âge comme les 4 ci-dessus : les items singles JP n'ont
    # pas de release_date (aucun référentiel source ne le fournit côté JP,
    # cf. pricecharting.py PRICECHARTING_JP_ALL_SLUGS) donc pas de notion de
    # "hot"/"vintage" exploitable. Juste une rotation hash-based sur tout le
    # catalogue JP singles, même mécanisme que la tranche "vintage"
    # (`_slice_set_codes`) -- 12 tranches plutôt que 8 vu le volume comparable
    # à TOUT le catalogue EN réparti sur un seul palier au lieu de 4 (~40k
    # singles JP contre ~34k EN, cf. discussion 2026-08-01) : garde une taille
    # de tranche du même ordre de grandeur que le palier vintage EN.
    "jp_singles":  {"rotation_slices": 12},
}


def _current_vintage_slice(num_slices: int) -> int:
    """Rotation stable dans le temps (pas aléatoire) : `date.today().toordinal()
    // 7` incrémente en continu d'une semaine sur l'autre (contrairement à un
    numéro de semaine ISO qui repart à 1 chaque année), donc le cycle de
    `num_slices` semaines ne saute jamais et n'a besoin d'aucun état stocké."""
    return (date.today().toordinal() // 7) % num_slices


def run_items_sync(run_type: str) -> list[Exception]:
    """Un tcg qui échoue (quota, timeout...) ne doit pas empêcher l'autre
    d'être tenté -- avant ce fix, une exception ici remontait et coupait la
    boucle, donc one-piece (traité en second) n'était jamais synced les
    jours où pokemon (son catalogue est ~4.5x plus gros, donc plus vite en
    quota) échouait. Retourne la liste des erreurs plutôt que de lever,
    charge à l'appelant d'agréger (cf. `main`)."""
    print("\n=== Référentiel (API TCG) ===")
    errors: list[Exception] = []
    for tcg in TCGS:
        print(f"-- {tcg} --")
        run_id = start_run(run_type, "items", tcg=tcg)
        try:
            total = apitcg.sync_items(tcg)
        except Exception as exc:
            finish_run(run_id, status="error", detail=str(exc))
            errors.append(exc)
            continue
        print(f"   {total} produits upsertés.")
        finish_run(run_id, status="success", rows_written=total, detail=f"{total} produits upsertés")
    return errors


def run_price_sync(tier: str | None, run_type: str) -> list[dict]:
    """Un seul appel `sync_all_mapped_sets` couvre les deux TCG à la fois (cf.
    docstring module) -- on ouvre donc une ligne sync_runs par tcg avant
    l'appel (pour que le dashboard live voie les deux "en cours" pendant tout
    l'appel, potentiellement long sur --tier vintage), puis on scinde
    `results` par tcg après coup pour les refermer avec un décompte propre."""
    step = "prices" if tier is None else "grades_sales"
    run_ids = {tcg: start_run(run_type, step, tcg=tcg, tier=tier) for tcg in TCGS}

    results: list[dict] = []
    jp_sealed_results: list[dict] = []
    jp_singles_results: list[dict] = []
    try:
        if tier is None:
            print("\n=== PriceCharting : prix (tous les sets mappés) ===")
            results = pricecharting.sync_all_mapped_sets(fetch_grades=False)
            # Scellé JAPONAIS : items créés directement depuis PriceCharting
            # (One Piece + Pokémon depuis le 2026-08-01, cf.
            # PRICECHARTING_JP_SEALED_SLUGS). fetch_sales=True (contrairement
            # au reste de la branche quotidienne) : sans ça, ces items
            # n'apparaissent jamais dans Transactions en parcours normal (qui
            # lit `sales`, jamais peuplée sinon -- seule la recherche par nom
            # les trouve, cf. discussion 2026-08-01). Pas soumis au système de
            # paliers --tier comme le flux EN (cf. `sync_jp_sealed_items_for_set`) :
            # catalogue JP scellé encore petit (~400 items), une requête/item/
            # jour reste largement soutenable.
            print("\n=== PriceCharting : scellé JP (+ ventes) ===")
            jp_sealed_results = pricecharting.sync_all_jp_sealed_items(fetch_sales=True)
            # Singles JP : référentiel + prix ungraded seulement ici (1
            # requête/page de set, pas cher) -- la gradation PSA + ventes
            # individuelles (1 requête/carte, ~40k cartes) est bien trop
            # coûteuse pour du quotidien, cf. palier dédié "jp_singles"
            # ci-dessous (même logique que hot/recent/.../vintage pour l'EN).
            print("\n=== PriceCharting : singles JP ===")
            jp_singles_results = pricecharting.sync_all_jp_singles_items(fetch_grades=False)
        elif tier == "jp_singles":
            bounds = TIERS[tier]
            num_slices = bounds["rotation_slices"]
            slice_index = _current_vintage_slice(num_slices)
            sliced_set_codes = sorted(
                pricecharting._slice_set_codes(list(pricecharting.PRICECHARTING_JP_ALL_SLUGS), slice_index, num_slices)
            )
            print(
                f"\n=== PriceCharting : gradation + ventes singles JP "
                f"(tranche {slice_index + 1}/{num_slices}, {len(sliced_set_codes)} set(s)) ==="
            )
            jp_singles_results = pricecharting.sync_all_jp_singles_items(fetch_grades=True, set_codes=sliced_set_codes)
        else:
            bounds = TIERS[tier]
            vintage_slices = bounds.get("rotation_slices")
            vintage_slice = _current_vintage_slice(vintage_slices) if vintage_slices else None
            slice_label = f", tranche {vintage_slice + 1}/{vintage_slices}" if vintage_slices else ""
            print(f"\n=== PriceCharting : prix + gradation PSA + ventes (palier {tier}{slice_label}) ===")
            results = pricecharting.sync_all_mapped_sets(
                fetch_grades=True,
                min_age_months=bounds["min_age_months"],
                max_age_months=bounds["max_age_months"],
                vintage_slice=vintage_slice,
                vintage_slices=vintage_slices,
            )
    except Exception as exc:
        for run_id in run_ids.values():
            finish_run(run_id, status="error", detail=str(exc))
        raise

    for tcg, run_id in run_ids.items():
        tcg_results = [r for r in results if pricecharting._tcg_from_set_code(r["set_code"]) == tcg]
        tcg_errors = [r for r in tcg_results if r.get("error")]
        rows_written = sum(r.get("rows_matched", 0) for r in tcg_results if not r.get("error"))
        detail = f"{len(tcg_results)} set(s), {rows_written} prix" if tcg_results or tier != "jp_singles" else ""
        if tier is not None and tier != "jp_singles":
            sales_written = sum(r.get("sale_rows_written", 0) for r in tcg_results if not r.get("error"))
            detail += f", {sales_written} ventes"

        tcg_jp_results = [r for r in jp_sealed_results if pricecharting._tcg_from_set_code(r["set_code"]) == tcg]
        if tcg_jp_results:
            tcg_jp_errors = [r for r in tcg_jp_results if r.get("error")]
            jp_prices_written = sum(r.get("prices_written", 0) for r in tcg_jp_results if not r.get("error"))
            jp_sales_written = sum(r.get("sale_rows_written", 0) for r in tcg_jp_results if not r.get("error"))
            detail += f", {jp_prices_written} prix JP scellé, {jp_sales_written} ventes JP scellé"
            tcg_errors += tcg_jp_errors

        tcg_jp_singles_results = [r for r in jp_singles_results if pricecharting._tcg_from_set_code(r["set_code"]) == tcg]
        if tcg_jp_singles_results:
            tcg_jp_singles_errors = [r for r in tcg_jp_singles_results if r.get("error")]
            jp_singles_prices = sum(r.get("prices_written", 0) for r in tcg_jp_singles_results if not r.get("error"))
            detail += f", {jp_singles_prices} prix JP singles"
            if tier == "jp_singles":
                rows_written = jp_singles_prices
                jp_singles_grades = sum(r.get("grade_rows_written", 0) for r in tcg_jp_singles_results if not r.get("error"))
                jp_singles_sales = sum(r.get("sale_rows_written", 0) for r in tcg_jp_singles_results if not r.get("error"))
                detail += f", {jp_singles_grades} lignes gradées JP singles, {jp_singles_sales} ventes JP singles"
            tcg_errors += tcg_jp_singles_errors

        if tcg_errors:
            detail += f", {len(tcg_errors)} erreur(s)"
        finish_run(
            run_id,
            status="error" if tcg_errors else "success",
            rows_written=rows_written,
            detail=detail.lstrip(", "),
        )

    errors = (
        [r for r in results if r.get("error")]
        + [r for r in jp_sealed_results if r.get("error")]
        + [r for r in jp_singles_results if r.get("error")]
    )
    if errors:
        print(f"\n{len(errors)} set(s) en erreur :")
        for r in errors:
            print(f"  {r['set_code']}: {r['error']}")
    return errors



# (tcg, language, since_months) -- `since_months=None` = pas de filtre
# d'âge. Pokémon EN garde 18 mois : fenêtre héritée telle quelle du scope
# JustTCG/price_sync_scope (motivé par un quota qui n'existe pas côté
# eBay), pas remise en question quand One Piece a été ajouté le 2026-08-07.
# One Piece EN élargi à tout le catalogue le même jour (627 items scellés
# EN tous âges = 1254 requêtes, largement sous les 5000/jour ; élargir
# aussi Pokémon dépasserait le quota en un seul run -- 4737 items = 9474
# requêtes -- à traiter séparément si demandé, probablement en le
# découpant plutôt qu'en le retirant complètement). One Piece JP ajouté le
# même jour après validation (`probe_ebay.py --tcg one-piece --language JP` --
# singles 135/136, Booster Box JP échantillonnées toutes non-nulles) --
# Pokémon JP pas demandé, pas ajouté.
EBAY_SYNC_JOBS: list[tuple[str, str, int | None]] = [
    ("pokemon", "EN", 18),
    ("one-piece", "EN", None),
    ("one-piece", "JP", None),
]


def run_ebay_listings_sync(run_type: str) -> None:
    """Comptage de listings actifs eBay (pression vendeuse, cf. mémoire projet
    "ebay_active_listings" -- nouvelle dimension "supply", pas un prix).

    Les deux TCG désormais couverts : Pokémon (v1, 2026-08-06) puis One Piece
    EN+JP (2026-08-07, cf. `EBAY_SYNC_JOBS` pour le détail des validations
    -- singles 99%+ de précision de matching des deux côtés, scellé plausible
    sur les vrais produits, les zéros observés étant des catégories eBay
    réellement vides plutôt que des ratés de matching, cf.
    ingestion/_probe_output/ebay_report_*.json). Erreur sur un job isolée
    (cf. `run_items_sync`) : n'empêche pas les autres de tourner. Ce n'est
    pas une contrainte de quota (5000 req/jour eBay est large, cf. ebay.py)
    -- juste la même prudence "valider avant d'élargir" que le reste du
    projet, cf. mémoire "phased_by_tcg". Appelé séparément du run quotidien/
    --tier (cf. `main`, flag `--ebay-listings`) : nouvelle source, cadence
    hebdomadaire, sans lien avec le système de paliers PriceCharting (TIERS
    ci-dessus, propre à un tout autre coût de requête)."""
    print("\n=== eBay : listings actifs (scellé) ===")
    for tcg, language, since_months in EBAY_SYNC_JOBS:
        print(f"-- {tcg} / {language} --")
        run_id = start_run(run_type, "active_listings", tcg=tcg)
        try:
            stats = ebay.sync_active_listings_for_tcg(tcg, since_months=since_months, language=language)
        except Exception as exc:
            finish_run(run_id, status="error", detail=str(exc))
            print(f"  ! erreur : {exc}")
            continue
        n_errors = len(stats["errors"])
        detail = f"{language} : {stats['items_processed']} item(s), {stats['rows_written']} ligne(s)"
        if n_errors:
            detail += f", {n_errors} erreur(s)"
        print(f"  {detail}")
        finish_run(run_id, status="error" if n_errors else "success", rows_written=stats["rows_written"], detail=detail)


def run_rarity_backfill_sync(run_type: str) -> None:
    """Backfill `items.rarity` via LimitlessTCG (cf. ingestion/sources/limitlesstcg.py
    -- scraping d'appoint tant que le quota API TCG ne fournit pas
    `attributes.Rarity` sur tout le catalogue). Idempotent (UPDATE), donc sûr à
    rejouer périodiquement -- c'est justement le but : récupérer la rareté des
    cartes des nouveaux sets sortis depuis le dernier passage (Pokémon EN+JP,
    One Piece + promos individuels), sans quoi la couverture se fige comme le
    run manuel ponctuel du 2026-08-02 (cf. mémoire projet
    "limitlesstcg_rarity_backfill"). Cadence hebdomadaire (comme eBay listings,
    cf. `run_ebay_listings_sync`) : un nouveau set ne sort pas assez souvent
    pour justifier plus, cf. `--rarity-backfill` /
    .github/workflows/rarity-backfill-sync.yml. Erreur sur un TCG isolée (même
    prudence que `run_items_sync`/`run_ebay_listings_sync`) : n'empêche pas
    l'autre de tourner."""
    print("\n=== Rareté : backfill LimitlessTCG ===")
    for tcg in TCGS:
        print(f"-- {tcg} --")
        run_id = start_run(run_type, "rarity_backfill", tcg=tcg)
        try:
            if tcg == "pokemon":
                en_result = limitlesstcg.sync_all_pokemon_rarities()
                jp_result = limitlesstcg.sync_all_pokemon_jp_rarities()
                n_promo = limitlesstcg.sync_promo_rarities(
                    "pokemon", "EN", limitlesstcg.EN_PROMO_SET_CODES
                ) + limitlesstcg.sync_promo_rarities(
                    "pokemon", "JP", limitlesstcg.JP_PROMO_SET_CODES
                )
                inherit_result = rarity_inherit.sync_rarity_inheritance()
                bulba_result = bulbapedia.sync_all_jp_rarities()
                jp_result = {
                    **jp_result,
                    "total": (
                        jp_result["total"] + n_promo + inherit_result["inherited"]
                        + inherit_result["promo_tagged"] + bulba_result["total"]
                    ),
                    "skipped": jp_result["skipped"] + bulba_result["skipped"],
                    "errors": jp_result["errors"] + bulba_result["errors"],
                }
            else:
                en_result = limitlesstcg.sync_all_one_piece_rarities()
                jp_result = limitlesstcg.sync_all_one_piece_promos()
            result = {
                "total": en_result["total"] + jp_result["total"],
                "skipped": en_result["skipped"] + jp_result["skipped"],
                "errors": en_result["errors"] + jp_result["errors"],
            }
        except Exception as exc:
            finish_run(run_id, status="error", detail=str(exc))
            print(f"  ! erreur : {exc}")
            continue
        n_errors = len(result["errors"])
        detail = f"{result['total']} carte(s) traitée(s), {len(result['skipped'])} set(s)/slug(s) ignoré(s)"
        if n_errors:
            detail += f", {n_errors} erreur(s)"
        print(f"  {detail}")
        finish_run(run_id, status="error" if n_errors else "success", rows_written=result["total"], detail=detail)


def run_index_calculation(run_type: str) -> None:
    """Recalcule tous les indices de prix (cf. index/methodology.py) à partir
    des prix qu'on vient de synchroniser. Tourne à chaque run (quotidien et
    --tier) puisque `price_snapshots` est mise à jour par les deux."""
    print("\n=== Calcul des indices de prix ===")
    run_id = start_run(run_type, "index")
    total = 0
    conn = get_connection()
    try:
        for code in sorted(INDEX_DEFINITIONS):
            definition = INDEX_DEFINITIONS[code]
            n = index_calculate.calculate_index(conn, code, definition["tcg"], definition["category"])
            total += n
            print(f"  {code}: {n} jour(s) calculé(s)." if n else f"  {code}: aucune donnée.")
    except Exception as exc:
        finish_run(run_id, status="error", detail=str(exc))
        raise
    finally:
        conn.close()
    finish_run(run_id, status="success", rows_written=total, detail=f"{total} jour(s)-indice recalculé(s)")


def run_sealed_ev_calculation(run_type: str) -> None:
    """Recalcule le ratio EV des scellés Booster Box (cf. index/sealed_ev.py)
    à partir de `price_snapshots`. Tourne à chaque run comme le calcul
    d'indice -- ne dépend que du prix, pas de `sales`."""
    print("\n=== Calcul du ratio EV des scellés ===")
    run_id = start_run(run_type, "sealed_ev")
    conn = get_connection()
    try:
        n = index_sealed_ev.calculate_sealed_ev(conn)
        print(f"  {n} Booster Box(es) mis à jour." if n else "  Aucun Booster Box avec prix + singles trouvé.")
    except Exception as exc:
        finish_run(run_id, status="error", detail=str(exc))
        raise
    finally:
        conn.close()
    finish_run(run_id, status="success", rows_written=n, detail=f"{n} Booster Box(es) mis à jour")


def run_undervalued_calculation(run_type: str) -> None:
    """Calcule les scores de sous-évaluation (cf. index/undervalued.py) à
    partir de `price_snapshots` + `sealed_ev`. Tourne à chaque run comme le
    calcul d'indice et le ratio EV -- dépend des deux (prix marché + prix
    box), donc s'exécute après `run_sealed_ev_calculation`."""
    print("\n=== Calcul des scores undervalued ===")
    run_id = start_run(run_type, "undervalued")
    conn = get_connection()
    try:
        results = index_undervalued.calculate_undervalued(conn)
        n = len(results)
        print(f"  {n} single(s) scoré(s)." if n else "  Aucun single avec prix marché + pack price trouvé.")
    except Exception as exc:
        finish_run(run_id, status="error", detail=str(exc))
        raise
    finally:
        conn.close()
    finish_run(run_id, status="success", rows_written=n, detail=f"{n} single(s) scoré(s)")


def run_grading_roi_inputs_calculation(run_type: str) -> None:
    """Matérialise les ingrédients du calculateur ROI de gradation (cf.
    index/grading_roi_inputs.py) à partir de `price_snapshots` (prix par
    grade) + `sales` (comptage des ventes gradées). Comme le volume, ne
    dépend que de données mises à jour par un run --tier, donc n'est
    recalculé que sur ces runs-là (recalculer sur des données inchangées
    serait du travail perdu)."""
    print("\n=== Calcul des ingrédients ROI de gradation ===")
    run_id = start_run(run_type, "grading_roi")
    conn = get_connection()
    try:
        n = index_grading_roi_inputs.calculate_grading_roi_inputs(conn)
        print(f"  {n} candidat(s) ROI de gradation calculé(s)." if n else "  Aucun candidat éligible trouvé.")
    except Exception as exc:
        finish_run(run_id, status="error", detail=str(exc))
        raise
    finally:
        conn.close()
    finish_run(run_id, status="success", rows_written=n, detail=f"{n} candidat(s) calculé(s)")


def run_volume_calculation(run_type: str) -> None:
    """Recalcule le volume de ventes (cf. index/volume.py) à partir de
    `sales`. Seulement appelé sur un run --tier, cf. docstring du module."""
    print("\n=== Calcul du volume de ventes ===")
    run_id = start_run(run_type, "volume")
    total = 0
    conn = get_connection()
    try:
        for code in sorted(INDEX_DEFINITIONS):
            definition = INDEX_DEFINITIONS[code]
            n = index_volume.calculate_volume(conn, code, definition["tcg"], definition["category"])
            total += n
            print(f"  {code}: {n} jour(s) de volume calculé(s)." if n else f"  {code}: aucune vente.")
    except Exception as exc:
        finish_run(run_id, status="error", detail=str(exc))
        raise
    finally:
        conn.close()
    finish_run(run_id, status="success", rows_written=total, detail=f"{total} jour(s)-volume recalculé(s)")


def print_storage_usage() -> None:
    """Visibilité dans le log du cron sur la taille de la base -- Supabase Free
    plafonne à 500 MB (cf. mémoire projet) et l'historique s'accumule chaque
    jour sans jamais être purgé (append-only)."""
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
                size = cur.fetchone()[0]
            print(f"\nTaille de la base : {size} (plan Free = 500 MB)")
        finally:
            conn.close()
    except Exception as exc:
        print(f"\n!! Impossible de lire la taille de la base : {exc}")


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tier", choices=sorted(TIERS), default=None,
        help=(
            "En plus des prix, récupère la gradation PSA et l'historique de ventes (coûteux, "
            "1 requête/carte) pour les sets du palier choisi (cf. TIERS -- âge des sets, palier "
            "vintage découpé en tranches tournantes). Omis => juste le prix ungraded sur tout le "
            "catalogue mappé, comme le run quotidien."
        ),
    )
    parser.add_argument(
        "--skip-items", action="store_true",
        help="Saute la sync référentiel API TCG (un run --tier n'a pas besoin de la refaire, déjà faite par le run quotidien).",
    )
    parser.add_argument(
        "--ebay-listings", action="store_true",
        help=(
            "Lance UNIQUEMENT la sync eBay active listings (cf. run_ebay_listings_sync) et sort -- "
            "n'entre pas dans le pipeline prix/index quotidien, nouvelle source indépendante à cadence "
            "hebdomadaire (cf. .github/workflows/ebay-listings-sync.yml)."
        ),
    )
    parser.add_argument(
        "--rarity-backfill", action="store_true",
        help=(
            "Lance UNIQUEMENT le backfill rareté LimitlessTCG (cf. run_rarity_backfill_sync) et sort -- "
            "n'entre pas dans le pipeline prix/index quotidien, nouvelle source indépendante à cadence "
            "hebdomadaire (cf. .github/workflows/rarity-backfill-sync.yml)."
        ),
    )
    args = parser.parse_args()

    if args.ebay_listings:
        started = time.monotonic()
        had_errors = False
        try:
            run_ebay_listings_sync("weekly")
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant la sync eBay active listings : {exc}")
        elapsed = time.monotonic() - started
        print(f"\n=== Terminé en {elapsed / 60:.1f} min ({'avec erreurs' if had_errors else 'OK'}) ===")
        return 1 if had_errors else 0

    if args.rarity_backfill:
        started = time.monotonic()
        had_errors = False
        try:
            run_rarity_backfill_sync("weekly")
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant le backfill rareté : {exc}")
        elapsed = time.monotonic() - started
        print(f"\n=== Terminé en {elapsed / 60:.1f} min ({'avec erreurs' if had_errors else 'OK'}) ===")
        return 1 if had_errors else 0

    run_type = "daily" if args.tier is None else "tier"

    started = time.monotonic()
    had_errors = False

    items_had_errors = False
    if not args.skip_items:
        try:
            items_errors = run_items_sync(run_type)
            items_had_errors = bool(items_errors)
            for exc in items_errors:
                print(f"\n!! Erreur pendant la sync référentiel : {exc}")
        except Exception as exc:
            items_had_errors = True
            print(f"\n!! Erreur pendant la sync référentiel : {exc}")
        # Volontairement PAS répercuté dans `had_errors` (donc pas dans le code
        # de sortie) : le référentiel échoue couramment sur le seul quota API
        # TCG (1000 req/mois, cf. mémoire projet "apitcg_quota"), ce qui
        # n'empêche pas le reste du run (prix/gradation/ventes/index) de
        # tourner normalement -- avant ce fix, ça déclenchait un mail GitHub
        # Actions "failure" quotidien pour un run qui avait en fait réussi à
        # ~95%. L'erreur reste visible ci-dessus et dans sync_runs (status
        # "error" par tcg, cf. run_items_sync) pour qui veut la voir.

    try:
        errors = run_price_sync(tier=args.tier, run_type=run_type)
        had_errors = had_errors or bool(errors)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant la sync prix : {exc}")

    try:
        run_index_calculation(run_type)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant le calcul des indices : {exc}")

    try:
        run_sealed_ev_calculation(run_type)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant le calcul du ratio EV des scellés : {exc}")

    try:
        run_undervalued_calculation(run_type)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant le calcul des scores undervalued : {exc}")

    if args.tier is not None:
        try:
            run_volume_calculation(run_type)
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant le calcul du volume : {exc}")

        try:
            run_grading_roi_inputs_calculation(run_type)
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant le calcul des ingrédients ROI de gradation : {exc}")

    print_storage_usage()

    elapsed = time.monotonic() - started
    if had_errors:
        status = "avec erreurs"
    elif items_had_errors:
        status = "OK, référentiel en erreur (non bloquant)"
    else:
        status = "OK"
    print(f"\n=== Terminé en {elapsed / 60:.1f} min ({status}) ===")
    return 1 if had_errors else 0


if __name__ == "__main__":
    sys.exit(main())
