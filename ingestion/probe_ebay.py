"""Test bloquant : valide la précision du matching eBay Browse API (source
prévue en mémoire projet "ebay_active_listings", nouvelle dimension "active
listings" / pression vendeuse) sur un échantillon d'items avant de coder la
table `active_listings` et l'ingestion complète.

Vérifie deux choses :
1. Que `total` (comptage de listings actifs renvoyé par l'API) n'est pas
   pollué par du bruit de pertinence -- cf. ebay.py sur le cas 'Charizard
   6/102' qui remonte des Charizard 4/102 sans le guillemetage du numéro.
   Mesuré ici en comptant, parmi un échantillon de titres retournés, combien
   contiennent effectivement le numéro de carte demandé.
2. Que le scellé (sans numéro à vérifier) remonte des comptes non nuls et
   des titres plausibles.

Usage : python -m ingestion.probe_ebay
Nécessite EBAY_APP_ID / EBAY_CERT_ID dans l'environnement (.env).
"""
import argparse
import json
import time
from pathlib import Path

from dotenv import load_dotenv

from ingestion.sources import ebay
from shared.db import get_connection

load_dotenv()

REPORT_DIR = Path(__file__).parent / "_probe_output"

DEFAULT_SAMPLE_SIZE = 15
# Même fenêtre que le scope JustTCG (cf. mémoire projet "price_sync_scope") --
# on prévoit de réutiliser ce filtre pour active_listings aussi.
DEFAULT_SINCE_MONTHS = 18


def _sample_items(tcg: str, single: bool, since_months: int | None, sample_size: int, language: str = "EN") -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            where = ["tcg = %s", "language = %s"]
            params: list = [tcg, language]
            where.append("category = 'single'" if single else "category != 'single'")
            if since_months:
                where.append("release_date >= (CURRENT_DATE - %s * INTERVAL '1 month')")
                params.append(since_months)
            cur.execute(
                f"SELECT id, category, code, name, set_code FROM items "
                f"WHERE {' AND '.join(where)} ORDER BY random() LIMIT %s",
                params + [sample_size],
            )
            cols = ["id", "category", "code", "name", "set_code"]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def _probe_singles(items: list[dict]) -> list[dict]:
    results = []
    for i, item in enumerate(items):
        if i > 0:
            time.sleep(ebay.MIN_SECONDS_BETWEEN_REQUESTS)
        data = ebay.search_single(item, grade="ungraded", limit=10)
        titles = [s["title"] for s in data.get("itemSummaries", [])]
        code = (item.get("code") or "").strip()
        confirmed = sum(1 for t in titles if code and code in t)
        results.append({
            "item_id": item["id"], "name": item["name"], "code": code, "set_code": item["set_code"],
            "total_ungraded": data.get("total", 0), "sample_size": len(titles),
            "sample_confirmed": confirmed, "sample_titles": titles[:5],
        })
        print(
            f"  [{code}] {item['name']}: total={data.get('total', 0)}, "
            f"{confirmed}/{len(titles)} titres échantillon confirment le numéro"
        )
    return results


def _probe_sealed(items: list[dict]) -> list[dict]:
    results = []
    for i, item in enumerate(items):
        if i > 0:
            time.sleep(ebay.MIN_SECONDS_BETWEEN_REQUESTS)
        packs_resp, boxes_resp = ebay.search_sealed(item, limit=5)
        total = packs_resp.get("total", 0) + boxes_resp.get("total", 0)
        titles = [s["title"] for s in packs_resp.get("itemSummaries", [])] + \
                 [s["title"] for s in boxes_resp.get("itemSummaries", [])]
        results.append({
            "item_id": item["id"], "name": item["name"], "set_code": item["set_code"],
            "total_packs": packs_resp.get("total", 0), "total_boxes": boxes_resp.get("total", 0),
            "total": total, "sample_titles": titles[:5],
        })
        print(f"  {item['name']}: total={total} (packs={packs_resp.get('total', 0)}, boxes={boxes_resp.get('total', 0)})")
    return results


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tcg", default="pokemon")
    parser.add_argument("--language", default="EN", help="EN ou JP -- items.language (cf. mémoire projet jp_sealed/jp_singles_tracking).")
    parser.add_argument("--sample-size", type=int, default=DEFAULT_SAMPLE_SIZE)
    parser.add_argument("--since-months", type=int, default=DEFAULT_SINCE_MONTHS)
    return parser.parse_args()


def main():
    args = _parse_args()
    REPORT_DIR.mkdir(exist_ok=True)

    print(f"== singles ({args.tcg}, language={args.language}, since_months={args.since_months}) ==")
    singles = _sample_items(args.tcg, single=True, since_months=args.since_months, sample_size=args.sample_size, language=args.language)
    if not singles:
        print("  ! aucun single trouvé pour ce scope")
    singles_results = _probe_singles(singles)

    print(f"\n== scellé ({args.tcg}, language={args.language}, since_months={args.since_months}) ==")
    sealed = _sample_items(args.tcg, single=False, since_months=args.since_months, sample_size=args.sample_size, language=args.language)
    if not sealed:
        print("  ! aucun scellé trouvé pour ce scope")
    sealed_results = _probe_sealed(sealed)

    report = {"tcg": args.tcg, "language": args.language, "singles": singles_results, "sealed": sealed_results}
    # Un fichier par (tcg, language) -- sinon un probe JP écraserait le
    # rapport EN déjà commité (cf. git log ingestion/_probe_output).
    report_file = REPORT_DIR / f"ebay_report_{args.tcg}_{args.language.lower()}.json"
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Synthèse ===")
    with_code = [r for r in singles_results if r["code"]]
    if with_code:
        total_sample = sum(r["sample_size"] for r in with_code)
        total_confirmed = sum(r["sample_confirmed"] for r in with_code)
        zero_total = sum(1 for r in with_code if r["total_ungraded"] == 0)
        print(
            f"Singles : {total_confirmed}/{total_sample} titres échantillonnés confirment le numéro "
            f"demandé ({len(with_code)} cartes testées, {zero_total} avec total=0)."
        )
    if sealed_results:
        zero_total = sum(1 for r in sealed_results if r["total"] == 0)
        print(f"Scellé : {len(sealed_results)} produits testés, {zero_total} avec total=0.")
    print(f"\nDétail complet : {report_file}")


if __name__ == "__main__":
    main()
