"""Calcule et écrit `items.interest_tier` (cf. `index/interest_tier.py` pour
la logique de classification) sur tout le catalogue Pokémon singles.
Peu coûteux (matching texte pur sur `name`/`rarity` déjà en base, pas de
requête réseau ni de jointure lourde) -- recalculé en entier à chaque run
plutôt que seulement les lignes changées, cf. `main()`. Appelé depuis le
cron quotidien après le backfill de `rarity` (cf. orchestrator.py) pour que
le tier reste à jour au fil des nouveaux sets/rarités backfillées."""
from __future__ import annotations

from psycopg2.extras import execute_values

from index.interest_tier import classify
from shared.db import get_connection


def sync_interest_tiers() -> dict:
    """Recalcule `interest_tier` pour tout le catalogue Pokémon singles.
    Retourne un résumé (total traité, décompte par tier)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, name, rarity FROM items
                   WHERE tcg = 'pokemon' AND category = 'single'"""
            )
            rows = cur.fetchall()

        counts: dict[str, int] = {}
        updates: list[tuple[int, str | None]] = []
        for item_id, name, rarity in rows:
            tier = classify(name, rarity)
            counts[tier] = counts.get(tier, 0) + 1
            updates.append((item_id, tier))

        with conn.cursor() as cur:
            execute_values(
                cur,
                "UPDATE items SET interest_tier = data.tier FROM (VALUES %s) AS data (id, tier) WHERE items.id = data.id",
                updates,
                page_size=len(updates),
            )
        conn.commit()
    finally:
        conn.close()

    return {"total": len(rows), "counts": counts}


def main():
    from dotenv import load_dotenv

    load_dotenv()
    print("== Calcul des tiers d'intérêt (Pokémon) ==")
    result = sync_interest_tiers()
    print(f"{result['total']} carte(s) traitée(s) :")
    for tier, n in sorted(result["counts"].items(), key=lambda kv: -kv[1]):
        print(f"  {tier or '(aucun)'}: {n}")


if __name__ == "__main__":
    main()
