import sql from "@/lib/db";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Panneau "Arbitrage inter-langues" de l'écran Sous-évalué CardQuant (cf.
// mémoire projet "cardquant-rebrand") -- lib/queries/compareLanguage.ts
// résout UNE carte à la fois (fiche carte). Ici il faut le classement
// inverse : parmi TOUTES les paires EN/JP identifiées avec certitude,
// lesquelles ont l'écart de prix le plus large. Même règle de matching que
// compareLanguage.ts (nom + rareté, un seul candidat de chaque côté) mais en
// lot : GROUP BY ... HAVING COUNT(*) = 1 remplace le check "candidates.length
// !== 1" fait en JS pour un seul item.
// ─────────────────────────────────────────────────────────────────────────────

export interface LanguageArbitrageRow {
  tcg: Tcg;
  name: string;
  enItemId: number;
  jpItemId: number;
  enSetCode: string | null;
  jpSetCode: string | null;
  enPrice: number;
  jpPrice: number;
  gapPct: number; // (jp - en) / en * 100
}

export async function getLanguageArbitrage({ minGapPct = 15, limit = 12 }: { minGapPct?: number; limit?: number } = {}): Promise<LanguageArbitrageRow[]> {
  const rows = await sql<{ tcg: string; name: string; enItemId: number; jpItemId: number; enSetCode: string | null; jpSetCode: string | null; enPrice: number; jpPrice: number }[]>`
    WITH en_unique AS (
      SELECT MIN(id) AS id, tcg, lower(trim(name)) AS nm, lower(trim(rarity)) AS rr
      FROM items
      WHERE language = 'EN' AND category = 'single' AND rarity IS NOT NULL
      GROUP BY tcg, nm, rr HAVING COUNT(*) = 1
    ),
    jp_unique AS (
      SELECT MIN(id) AS id, tcg, lower(trim(name)) AS nm, lower(trim(rarity)) AS rr
      FROM items
      WHERE language = 'JP' AND category = 'single' AND rarity IS NOT NULL
      GROUP BY tcg, nm, rr HAVING COUNT(*) = 1
    ),
    pairs AS (
      SELECT en.id AS en_id, jp.id AS jp_id, en.tcg
      FROM en_unique en JOIN jp_unique jp USING (tcg, nm, rr)
    ),
    ids AS (SELECT en_id AS id FROM pairs UNION SELECT jp_id AS id FROM pairs),
    prices AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN ids ON ids.id = ps.item_id
      WHERE ps.grade = 'ungraded'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    )
    SELECT
      p.tcg, i_en.name,
      i_en.id::int4 AS "enItemId", i_jp.id::int4 AS "jpItemId",
      i_en.set_code AS "enSetCode", i_jp.set_code AS "jpSetCode",
      pe.price AS "enPrice", pj.price AS "jpPrice"
    FROM pairs p
    JOIN items i_en ON i_en.id = p.en_id
    JOIN items i_jp ON i_jp.id = p.jp_id
    JOIN prices pe ON pe.item_id = p.en_id
    JOIN prices pj ON pj.item_id = p.jp_id
    WHERE pe.price > 0
  `;

  return rows
    .map((r) => ({
      tcg: r.tcg as Tcg,
      name: r.name,
      enItemId: r.enItemId,
      jpItemId: r.jpItemId,
      enSetCode: r.enSetCode,
      jpSetCode: r.jpSetCode,
      enPrice: r.enPrice,
      jpPrice: r.jpPrice,
      gapPct: ((r.jpPrice - r.enPrice) / r.enPrice) * 100,
    }))
    .filter((r) => Math.abs(r.gapPct) >= minGapPct)
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
    .slice(0, limit);
}
