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
}


def _current_vintage_slice(num_slices: int) -> int:
    """Rotation stable dans le temps (pas aléatoire) : `date.today().toordinal()
    // 7` incrémente en continu d'une semaine sur l'autre (contrairement à un
    numéro de semaine ISO qui repart à 1 chaque année), donc le cycle de
    `num_slices` semaines ne saute jamais et n'a besoin d'aucun état stocké."""
    return (date.today().toordinal() // 7) % num_slices


def run_items_sync() -> None:
    print("\n=== Référentiel (API TCG) ===")
    for tcg in TCGS:
        print(f"-- {tcg} --")
        total = apitcg.sync_items(tcg)
        print(f"   {total} produits upsertés.")


def run_price_sync(tier: str | None) -> list[dict]:
    if tier is None:
        print("\n=== PriceCharting : prix (tous les sets mappés) ===")
        results = pricecharting.sync_all_mapped_sets(fetch_grades=False)
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
    errors = [r for r in results if r.get("error")]
    if errors:
        print(f"\n{len(errors)} set(s) en erreur :")
        for r in errors:
            print(f"  {r['set_code']}: {r['error']}")
    return errors


def run_index_calculation() -> None:
    """Recalcule tous les indices de prix (cf. index/methodology.py) à partir
    des prix qu'on vient de synchroniser. Tourne à chaque run (quotidien et
    --tier) puisque `price_snapshots` est mise à jour par les deux."""
    print("\n=== Calcul des indices de prix ===")
    conn = get_connection()
    try:
        for code in sorted(INDEX_DEFINITIONS):
            definition = INDEX_DEFINITIONS[code]
            n = index_calculate.calculate_index(conn, code, definition["tcg"], definition["category"])
            print(f"  {code}: {n} jour(s) calculé(s)." if n else f"  {code}: aucune donnée.")
    finally:
        conn.close()


def run_sealed_ev_calculation() -> None:
    """Recalcule le ratio EV des scellés Booster Box (cf. index/sealed_ev.py)
    à partir de `price_snapshots`. Tourne à chaque run comme le calcul
    d'indice -- ne dépend que du prix, pas de `sales`."""
    print("\n=== Calcul du ratio EV des scellés ===")
    conn = get_connection()
    try:
        n = index_sealed_ev.calculate_sealed_ev(conn)
        print(f"  {n} Booster Box(es) mis à jour." if n else "  Aucun Booster Box avec prix + singles trouvé.")
    finally:
        conn.close()


def run_volume_calculation() -> None:
    """Recalcule le volume de ventes (cf. index/volume.py) à partir de
    `sales`. Seulement appelé sur un run --tier, cf. docstring du module."""
    print("\n=== Calcul du volume de ventes ===")
    conn = get_connection()
    try:
        for code in sorted(INDEX_DEFINITIONS):
            definition = INDEX_DEFINITIONS[code]
            n = index_volume.calculate_volume(conn, code, definition["tcg"], definition["category"])
            print(f"  {code}: {n} jour(s) de volume calculé(s)." if n else f"  {code}: aucune vente.")
    finally:
        conn.close()


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

    started = time.monotonic()
    had_errors = False

    if not args.skip_items:
        try:
            run_items_sync()
        except Exception as exc:
            had_errors = True
            print(f"\n!! Erreur pendant la sync référentiel : {exc}")

    try:
        errors = run_price_sync(tier=args.tier)
        had_errors = had_errors or bool(errors)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant la sync prix : {exc}")

    try:
        run_index_calculation()
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant le calcul des indices : {exc}")

    try:
        run_sealed_ev_calculation()
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant le calcul du ratio EV des scellés : {exc}")

    if args.tier is not None:
        try:
            run_volume_calculation()
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
