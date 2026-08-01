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
from index import sealed_ev as index_sealed_ev
from index import volume as index_volume
from index.methodology import INDEX_DEFINITIONS
from ingestion.sources import apitcg, pricecharting
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


def run_items_sync(run_type: str) -> None:
    print("\n=== Référentiel (API TCG) ===")
    for tcg in TCGS:
        print(f"-- {tcg} --")
        run_id = start_run(run_type, "items", tcg=tcg)
        try:
            total = apitcg.sync_items(tcg)
        except Exception as exc:
            finish_run(run_id, status="error", detail=str(exc))
            raise
        print(f"   {total} produits upsertés.")
        finish_run(run_id, status="success", rows_written=total, detail=f"{total} produits upsertés")


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
    args = parser.parse_args()
    run_type = "daily" if args.tier is None else "tier"

    started = time.monotonic()
    had_errors = False

    if not args.skip_items:
        try:
            run_items_sync(run_type)
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant la sync référentiel : {exc}")

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

    if args.tier is not None:
        try:
            run_volume_calculation(run_type)
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant le calcul du volume : {exc}")

    print_storage_usage()

    elapsed = time.monotonic() - started
    status = "avec erreurs" if had_errors else "OK"
    print(f"\n=== Terminé en {elapsed / 60:.1f} min ({status}) ===")
    return 1 if had_errors else 0


if __name__ == "__main__":
    sys.exit(main())
