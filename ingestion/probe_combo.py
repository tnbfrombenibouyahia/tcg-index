"""Test bloquant (section 4 du handoff) : valide le combo API TCG + JustTCG
sur quelques sets récents Pokémon + One Piece, avant de coder l'archi complète.

Réserve 1 — Profondeur du scellé chez JustTCG :
  Pour chaque produit type=sealed remonté par API TCG sur les sets testés,
  cherche le match tcgplayerId côté JustTCG et vérifie qu'il y a un historique
  exploitable (pas juste un prix spot).

Réserve 2 — Identifiant partagé :
  Mesure le taux de produits (scellé + singles) qui ont un markets.tcgplayer.id
  non-nul côté API TCG, et le taux de ces IDs qui matchent effectivement côté
  JustTCG.

Usage : python -m ingestion.probe_combo
Nécessite APITCG_API_KEY et JUSTTCG_API_KEY dans l'environnement (.env).
"""
import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

from ingestion.sources import apitcg, justtcg

load_dotenv()

# JustTCG free tier = 100 req/jour, 10/min : on reste volontairement petit
# et on utilise le batch (1 appel pour N produits) plutôt que du 1-par-1.
TCGS_TO_TEST = ["pokemon", "one-piece"]
SETS_PER_TCG = 2
SAMPLE_SINGLES_PER_SET = 10  # pas la peine d'interroger toutes les cartes d'un set

REPORT_DIR = Path(__file__).parent / "_probe_output"
REPORT_FILE = REPORT_DIR / "combo_report.json"


def _most_recent_sets(tcg: str, n: int) -> list[dict]:
    sets = apitcg.list_sets(tcg)
    date_keys = ["releaseDate", "release_date", "date"]

    def find_date(s):
        for k in date_keys:
            if s.get(k):
                return s[k]
        return None

    # Les buckets fourre-tout (ex. "Miscellaneous Cards & Products") n'ont pas
    # de date de sortie : ce ne sont pas de vrais sets, on les exclut plutôt
    # que de les laisser remonter dans le tri par défaut.
    dated = [(s, find_date(s)) for s in sets]
    dated = [(s, d) for s, d in dated if d]
    return [s for s, _ in sorted(dated, key=lambda pair: pair[1], reverse=True)[:n]]


def _check_products(tcg: str, set_obj: dict, product_type: str, sample_size: int | None = None) -> dict:
    set_id = set_obj.get("_id") or set_obj.get("id")
    products = apitcg.list_all_products(tcg=tcg, set_id=set_id, product_type=product_type)
    if sample_size:
        products = products[:sample_size]

    total = len(products)
    tcgplayer_ids = [
        p["markets"]["tcgplayer"]["id"]
        for p in products
        if p.get("markets", {}).get("tcgplayer", {}).get("id")
    ]

    matched = 0
    with_history = 0
    if tcgplayer_ids:
        try:
            cards = justtcg.get_cards_batch(tcgplayer_ids)
        except Exception as exc:
            print(f"    ! erreur batch JustTCG ({len(tcgplayer_ids)} ids): {exc}", file=sys.stderr)
            cards = []
        for card in cards:
            matched += 1
            variants = card.get("variants") or []
            if any(v.get("priceHistory") for v in variants):
                with_history += 1

    return {
        "tcg": tcg,
        "set": set_obj.get("name"),
        "product_type": product_type,
        "total_products": total,
        "with_tcgplayer_id": len(tcgplayer_ids),
        "matched_in_justtcg": matched,
        "matched_with_history": with_history,
    }


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tcgs", default=",".join(TCGS_TO_TEST),
        help="Liste de TCG à tester, séparés par des virgules (défaut: %(default)s)",
    )
    parser.add_argument("--sets-per-tcg", type=int, default=SETS_PER_TCG)
    parser.add_argument("--singles-sample", type=int, default=SAMPLE_SINGLES_PER_SET)
    return parser.parse_args()


def main():
    args = _parse_args()
    tcgs_to_test = [t.strip() for t in args.tcgs.split(",") if t.strip()]

    REPORT_DIR.mkdir(exist_ok=True)
    results = []

    for tcg in tcgs_to_test:
        print(f"== {tcg} ==")
        sets = _most_recent_sets(tcg, args.sets_per_tcg)
        if not sets:
            print(f"  ! aucun set retourné par API TCG pour {tcg}")
            continue
        for set_obj in sets:
            print(f"  set: {set_obj.get('name')}")
            sealed_result = _check_products(tcg, set_obj, "sealed")
            singles_result = _check_products(tcg, set_obj, "card", sample_size=args.singles_sample)
            results.append(sealed_result)
            results.append(singles_result)
            print(f"    scellé : {sealed_result}")
            print(f"    singles (échantillon) : {singles_result}")

    # Fusionne avec le rapport existant : on ne remplace que les lignes des
    # TCG retestés, pour ne pas perdre les résultats déjà validés des autres.
    previous = []
    if REPORT_FILE.exists():
        previous = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
    kept = [r for r in previous if r["tcg"] not in tcgs_to_test]
    merged = kept + results
    REPORT_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Synthèse (TCG testés dans ce run) ===")
    sealed_rows = [r for r in results if r["product_type"] == "sealed"]
    total_sealed = sum(r["total_products"] for r in sealed_rows)
    total_sealed_matched_hist = sum(r["matched_with_history"] for r in sealed_rows)
    print(
        f"Réserve 1 (scellé) : {total_sealed_matched_hist}/{total_sealed} produits scellés "
        f"ont un historique exploitable côté JustTCG."
    )

    all_with_id = sum(r["with_tcgplayer_id"] for r in results)
    all_total = sum(r["total_products"] for r in results)
    all_matched = sum(r["matched_in_justtcg"] for r in results)
    print(
        f"Réserve 2 (ID partagé) : {all_with_id}/{all_total} produits ont un tcgplayer.id côté "
        f"API TCG, dont {all_matched} matchent effectivement côté JustTCG."
    )
    print(f"\nDétail complet (fusionné) : {REPORT_FILE}")


if __name__ == "__main__":
    main()
