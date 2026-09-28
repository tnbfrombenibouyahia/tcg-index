"""Job d'alertes d'arbitrage : cartes candidates -> eBay -> Discord.

Lancé par Cloud Scheduler via l'image d'ingestion (flag `--arbitrage-alerts`
de ingestion.orchestrator) ou à la main :

    python -m arbitrage.job --dry-run --max-cards 5

Budget eBay : chaque carte coûte 1 requête par place de marché (BGS, Beckett
et CGC sont regroupés en une requête OR, cf. ebay_slabs.GRADER_QUERY). Le
quota Browse API (5000 req/jour) est PARTAGÉ avec les autres jobs eBay du
projet (ingestion-ebay-listings, cf. tcg-index-handoff.md §04) : le plafond
par exécution (`ARBITRAGE_MAX_REQUESTS_PER_RUN`, défaut 100) est calé pour
une exécution horaire (100 x 24 = 2400/jour) en laissant de la marge. Si le
pool de cartes candidates dépasse le plafond, il est parcouru par tranches
tournantes (cf. economics.select_slice), jamais tronqué toujours au même
endroit.
"""
import argparse
import os
import sys
import time

from dotenv import load_dotenv

from arbitrage import discord_webhook, ebay_slabs, fx, store
from arbitrage.candidates import fetch_candidates
from arbitrage.economics import Thresholds, select_slice
from arbitrage.models import Alert

# Même politesse que ingestion/sources/ebay.py (pas de limite par seconde
# documentée, seulement le plafond quotidien).
MIN_SECONDS_BETWEEN_REQUESTS = 0.3


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


def _dedupe_and_filter_fresh(alerts: list[Alert], *, dry_run: bool) -> list[Alert]:
    """Retire les annonces déjà signalées (sauf baisse de prix >= 5 %) et les
    doublons au sein du même run."""
    best: dict[tuple[str, str], Alert] = {}
    for a in alerts:
        key = (a.marketplace, a.listing_id)
        if key not in best or a.price < best[key].price:
            best[key] = a
    by_marketplace: dict[str, list[Alert]] = {}
    for a in best.values():
        by_marketplace.setdefault(a.marketplace, []).append(a)

    fresh: list[Alert] = []
    for marketplace, group in by_marketplace.items():
        last = store.fetch_last_prices(marketplace, [a.listing_id for a in group], tolerate_missing_table=dry_run)
        fresh += [a for a in group if store.should_alert(last.get(a.listing_id), a.price)]
    return fresh


def run_arbitrage_alerts(
    *, dry_run: bool = False, max_cards: int | None = None, marketplaces: tuple[str, ...] | None = None,
) -> dict:
    thresholds = Thresholds.from_env()
    webhook_url = os.environ.get("DISCORD_ARBITRAGE_WEBHOOK_URL")
    if not dry_run and not webhook_url:
        raise RuntimeError(
            "DISCORD_ARBITRAGE_WEBHOOK_URL absent : impossible de poster (utiliser --dry-run pour tester sans Discord)."
        )

    marketplaces = marketplaces or tuple(
        m.strip().upper() for m in os.environ.get("ARBITRAGE_EBAY_MARKETPLACES", "EBAY_FR").split(",") if m.strip()
    )
    buyer_country = os.environ.get("ARBITRAGE_BUYER_COUNTRY", "FR")
    max_alerts = _env_int("ARBITRAGE_MAX_ALERTS_PER_RUN", 20)
    slice_seconds = _env_int("ARBITRAGE_RUN_PERIOD_SECONDS", 3600)
    if max_cards is None:
        max_requests = _env_int("ARBITRAGE_MAX_REQUESTS_PER_RUN", 100)
        max_cards = max(1, max_requests // len(marketplaces))

    candidates = fetch_candidates(thresholds)
    selected = select_slice(candidates, max_cards, time.time(), slice_seconds)
    print(
        f"{len(candidates)} carte(s) candidate(s), {len(selected)} traitée(s) ce run "
        f"({', '.join(marketplaces)}, dry_run={dry_run})."
    )

    found: list[Alert] = []
    errors: list[dict] = []
    searches = 0
    for candidate in selected:
        for marketplace_id in marketplaces:
            if searches or errors:
                time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
            try:
                found += ebay_slabs.search_alerts(
                    candidate,
                    marketplace_id=marketplace_id, buyer_country=buyer_country,
                    thresholds=thresholds, usd_per_unit=fx.usd_per_unit,
                )
                searches += 1
            except Exception as exc:
                print(f"    ! erreur pour {candidate.name!r} (id={candidate.item_id}, {marketplace_id}): {exc}")
                errors.append({"item_id": candidate.item_id, "marketplace": marketplace_id, "error": str(exc)})

    fresh = _dedupe_and_filter_fresh(found, dry_run=dry_run)
    # Les meilleures d'abord : seuil de rentabilité le plus bas, puis plus gros multiple.
    fresh.sort(key=lambda a: (a.opportunity.breakeven_p10, -a.opportunity.multiple))
    to_post = fresh[:max_alerts]
    if len(fresh) > max_alerts:
        print(f"  {len(fresh)} alertes fraîches, plafonnées à {max_alerts} pour ce run (les autres reviendront).")

    for a in to_post:
        o = a.opportunity
        print(
            f"  {'[dry-run] ' if dry_run else ''}{a.candidate.name} {a.grader.upper()} {a.grade:g} "
            f"- {a.price:.2f} {a.currency} - x{o.multiple:.1f} - équilibre PSA10 {o.breakeven_p10 * 100:.0f} % - {a.url}"
        )

    posted = 0
    if to_post and not dry_run:
        posted = discord_webhook.post_alerts(webhook_url, to_post, on_posted=store.record_alerts)

    stats = {
        "candidates": len(candidates),
        "cards_processed": len(selected),
        "searches": searches,
        "listings_matching": len(found),
        "fresh_alerts": len(fresh),
        "posted": posted,
        "errors": errors,
    }
    print(f"\nTerminé : { {k: v for k, v in stats.items() if k != 'errors'} } ({len(errors)} erreur(s))")
    return stats


def main() -> int:
    load_dotenv()
    # Console Windows (cp1252) : un titre d'annonce avec emoji/kanji ferait
    # planter les print() du dry-run. Sans effet sous Cloud Run (déjà UTF-8).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="N'envoie rien à Discord, n'écrit rien en base.")
    parser.add_argument("--max-cards", type=int, default=None, help="Plafonne le nombre de cartes interrogées ce run.")
    parser.add_argument("--marketplaces", default=None, help="Ex. EBAY_FR,EBAY_US (défaut : ARBITRAGE_EBAY_MARKETPLACES ou EBAY_FR).")
    args = parser.parse_args()
    marketplaces = tuple(m.strip().upper() for m in args.marketplaces.split(",")) if args.marketplaces else None
    stats = run_arbitrage_alerts(dry_run=args.dry_run, max_cards=args.max_cards, marketplaces=marketplaces)
    # Échec seulement si RIEN n'a pu être interrogé (eBay/FX/DB en panne) ;
    # quelques erreurs isolées sont déjà loguées et comptées ci-dessus.
    return 1 if stats["errors"] and stats["searches"] == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
