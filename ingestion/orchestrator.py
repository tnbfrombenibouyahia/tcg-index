"""Orchestrateur du run quotidien : enchaîne les syncs qui doivent tourner sans
intervention manuelle, pour que l'historique s'accumule tout seul (cf. handoff
§9 point 5, §11 "connu, pas résolu" — jusqu'ici chaque sync était lancée à la
main).

Chaque source garde son propre CLI (`python -m ingestion.sources.X`) pour un
usage manuel/debug ; ce script est l'enchaînement pensé pour un cron
(GitHub Actions, cf. .github/workflows/).

Deux cadences distinctes, pas une seule, à cause du coût très différent des
deux opérations PriceCharting (cf. pricecharting.py) :
- quotidien : référentiel (API TCG) + prix ungraded sur tous les sets mappés
  (1 requête HTTP par page de set).
- 2-3x/semaine (`--grades`) : gradation PSA + historique de ventes
  individuelles eBay/TCGPlayer/... sur les sets récents seulement (1 requête
  HTTP PAR CARTE en plus -- tout le catalogue prendrait ~12h, cf. mémoire
  projet). Les deux infos viennent de la même page carte, donc de la même
  requête. Plus fréquent qu'un simple hebdo car la table de ventes
  PriceCharting plafonne à ~30 lignes visibles par palier -- trop espacé,
  on perd des ventes (cf. mémoire projet "sales_volume_tracking").

JustTCG n'est volontairement pas appelé ici : en pause depuis l'incident 401
du 2026-07-29 (cf. mémoire projet), reprise à la main quand voulu via
`python -m ingestion.sources.justtcg`.
"""
import argparse
import sys
import time

from dotenv import load_dotenv

from ingestion.sources import apitcg, pricecharting
from shared.db import get_connection

TCGS = ["pokemon", "one-piece"]

# Fenêtre "sets récents" pour la gradation PSA hebdo -- même valeur que le
# scope déjà en place (cf. mémoire projet "grading_tiers").
GRADES_SINCE_MONTHS = 18


def run_items_sync() -> None:
    print("\n=== Référentiel (API TCG) ===")
    for tcg in TCGS:
        print(f"-- {tcg} --")
        total = apitcg.sync_items(tcg)
        print(f"   {total} produits upsertés.")


def run_price_sync(fetch_grades: bool) -> list[dict]:
    label = "prix + gradation PSA + ventes (sets récents)" if fetch_grades else "prix (tous les sets mappés)"
    print(f"\n=== PriceCharting : {label} ===")
    since_months = GRADES_SINCE_MONTHS if fetch_grades else None
    results = pricecharting.sync_all_mapped_sets(fetch_grades=fetch_grades, since_months=since_months)
    errors = [r for r in results if r.get("error")]
    if errors:
        print(f"\n{len(errors)} set(s) en erreur :")
        for r in errors:
            print(f"  {r['set_code']}: {r['error']}")
    return errors


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
        "--grades", action="store_true",
        help=(
            f"En plus des prix, récupère la gradation PSA et l'historique de ventes pour les "
            f"sets sortis dans les {GRADES_SINCE_MONTHS} derniers mois. Coûteux (1 requête/carte) : "
            f"pensé pour un cron 2-3x/semaine, pas quotidien."
        ),
    )
    parser.add_argument(
        "--skip-items", action="store_true",
        help="Saute la sync référentiel API TCG (le run grades/ventes n'a pas besoin de la refaire, déjà faite par le run quotidien).",
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
        errors = run_price_sync(fetch_grades=args.grades)
        had_errors = had_errors or bool(errors)
    except Exception as exc:
        had_errors = True
        print(f"\n!! Erreur pendant la sync prix : {exc}")

    print_storage_usage()

    elapsed = time.monotonic() - started
    status = "avec erreurs" if had_errors else "OK"
    print(f"\n=== Terminé en {elapsed / 60:.1f} min ({status}) ===")
    return 1 if had_errors else 0


if __name__ == "__main__":
    sys.exit(main())
