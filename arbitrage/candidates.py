"""Cartes candidates à l'arbitrage, lues dans price_snapshots (prix PSA en USD).

Une carte est candidate si son dernier PSA 9 ET son dernier PSA 10 sont
connus, récents, et assez éloignés (PSA 10 >= `min_psa_spread` x PSA 9) : sans
grand écart, un slab BGS/CGC bon marché ne peut pas valoir un regrade. Le
pré-filtrage SQL évite d'interroger eBay pour des cartes où l'alerte est
mathématiquement impossible (quota Browse API : 5000 req/jour, cf.
ingestion/sources/ebay.py).

Périmètre réel (mesuré le 2026-09-28) : seules les cartes dont le `code`
contient autre chose que des chiffres sont retenues (`OP01-017`, `132/182`).
Les cartes Pokémon JP de la base n'ont qu'un numéro nu ("51") : le même
numéro existe dans des dizaines de sets aux prix PSA très différents, et les
titres eBay écrivent "051/087" -- l'appariement serait un pari. Pokémon EN
n'a, lui, aucun prix PSA ingéré (uniquement 'ungraded'). Résultat : One
Piece EN/JP aujourd'hui ; élargir à Pokémon demande un appariement par set
et/ou l'ingestion PSA Pokémon EN, cf. tcg-index-handoff.md §04.
"""
from arbitrage.economics import Thresholds
from arbitrage.models import Candidate
from shared.db import get_connection

# DISTINCT ON (item_id, grade) trié par captured_at DESC : même motif que
# lib/queries/gradingRoi.ts, servi par idx_price_snapshots_item_grade_captured.
# La borne captured_at écarte d'emblée les prix périmés (et réduit le scan).
_SQL = """
    WITH latest AS (
        SELECT DISTINCT ON (item_id, grade)
               item_id, grade, price, captured_at
        FROM price_snapshots
        WHERE grade IN ('psa9', 'psa10')
          AND currency = 'USD'
          AND captured_at >= CURRENT_DATE - %(max_age_days)s
        ORDER BY item_id, grade, captured_at DESC, created_at DESC
    )
    SELECT i.id, i.name, i.code, i.set_code, i.tcg, i.language, i.rarity, i.image_url,
           p9.price, p9.captured_at, p10.price, p10.captured_at
    FROM items i
    JOIN latest p9  ON p9.item_id  = i.id AND p9.grade  = 'psa9'
    JOIN latest p10 ON p10.item_id = i.id AND p10.grade = 'psa10'
    WHERE i.category = 'single'
      AND i.code ~ '[^0-9]'
      AND p9.price  >= %(min_psa9)s
      AND p10.price >= %(min_psa10)s
      AND p10.price >= p9.price * %(min_spread)s
    ORDER BY i.id
"""


def fetch_candidates(t: Thresholds) -> list[Candidate]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SQL, {
                "max_age_days": t.max_psa_age_days,
                "min_psa9": t.min_psa9_usd,
                "min_psa10": t.min_psa10_usd,
                "min_spread": t.min_psa_spread,
            })
            return [
                Candidate(
                    item_id=r[0], name=r[1], code=r[2], set_code=r[3], tcg=r[4], language=r[5],
                    rarity=r[6], image_url=r[7],
                    psa9_usd=float(r[8]), psa9_date=r[9], psa10_usd=float(r[10]), psa10_date=r[11],
                )
                for r in cur.fetchall()
            ]
    finally:
        conn.close()
