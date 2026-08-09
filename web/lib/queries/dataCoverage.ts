import sql from "@/lib/db";
import type { DataCoverageRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Recap de couverture -- demande utilisateur 2026-08-09, page /live : "quel %
// de données on a par TCG en fonction des langues, quel type de cartes" pour
// que la page serve au debug ("pourquoi cette carte n'a pas de prix ?").
// Deux requêtes plutôt qu'un seul LEFT JOIN : la table de base (items,
// ~74k lignes) groupée seule est un simple scan ; le coverage prix passe par
// price_snapshots (~130k lignes, testé <600ms en prod) -- un LEFT JOIN des
// deux gonflerait le premier groupBy sans bénéfice, un JOIN direct sur la
// seconde ne garde que les lignes qui matchent réellement (on n'a pas besoin
// des NULL ici, `totalItems` de la première requête suffit comme dénominateur).
//
// `tracked` (ajouté le même jour, suite à question utilisateur "comment on
// améliore ces scores sans mentir à l'utilisateur final") : `NOT (tcg =
// 'pokemon' AND category = 'single') OR interest_tier IS NOT NULL` --
// "toujours vrai sauf pour un single Pokémon sans interest_tier". Seul ce
// sous-ensemble Pokémon a une exclusion de scope délibérée (cf.
// ingestion/sources/pricecharting.py, [[project_price_sync_scope]]) ; pour
// tout le reste (scellé, singles One Piece -- interest_tier n'existe pas
// hors Pokémon), la condition est toujours vraie donc trackedItems = totalItems.
// ─────────────────────────────────────────────────────────────────────────────

const TRACKED_FILTER = sql`NOT (tcg = 'pokemon' AND category = 'single') OR interest_tier IS NOT NULL`;
const TRACKED_FILTER_ALIASED = sql`NOT (i.tcg = 'pokemon' AND i.category = 'single') OR i.interest_tier IS NOT NULL`;

interface BaseCoverageRow {
  tcg: Tcg;
  language: string;
  category: "sealed" | "single";
  totalItems: number;
  withRarity: number;
  withImage: number;
  trackedItems: number;
}

interface PriceCoverageRow {
  tcg: Tcg;
  language: string;
  category: "sealed" | "single";
  withAnyPrice: number;
  withRecentPrice: number;
  trackedWithPrice: number;
  trackedWithRecentPrice: number;
}

export async function getDataCoverage(): Promise<DataCoverageRow[]> {
  const [baseRows, priceRows] = await Promise.all([
    sql<BaseCoverageRow[]>`
      SELECT
        tcg, language, category,
        COUNT(*)::int4 AS "totalItems",
        COUNT(*) FILTER (WHERE rarity IS NOT NULL)::int4 AS "withRarity",
        COUNT(*) FILTER (WHERE image_url IS NOT NULL)::int4 AS "withImage",
        COUNT(*) FILTER (WHERE ${TRACKED_FILTER})::int4 AS "trackedItems"
      FROM items
      GROUP BY tcg, language, category
    `,
    sql<PriceCoverageRow[]>`
      SELECT
        i.tcg, i.language, i.category,
        COUNT(DISTINCT ps.item_id) FILTER (WHERE ps.grade = 'ungraded')::int4 AS "withAnyPrice",
        COUNT(DISTINCT ps.item_id)
          FILTER (WHERE ps.grade = 'ungraded' AND ps.captured_at >= CURRENT_DATE - 30)::int4 AS "withRecentPrice",
        COUNT(DISTINCT ps.item_id)
          FILTER (WHERE ps.grade = 'ungraded' AND (${TRACKED_FILTER_ALIASED}))::int4 AS "trackedWithPrice",
        COUNT(DISTINCT ps.item_id)
          FILTER (WHERE ps.grade = 'ungraded' AND ps.captured_at >= CURRENT_DATE - 30 AND (${TRACKED_FILTER_ALIASED}))::int4 AS "trackedWithRecentPrice"
      FROM price_snapshots ps
      JOIN items i ON i.id = ps.item_id
      GROUP BY i.tcg, i.language, i.category
    `,
  ]);

  const key = (r: { tcg: string; language: string; category: string }) => `${r.tcg}|${r.language}|${r.category}`;
  const priceByKey = new Map(priceRows.map((r) => [key(r), r]));

  return baseRows
    .map((row) => {
      const price = priceByKey.get(key(row));
      return {
        tcg: row.tcg,
        language: row.language,
        category: row.category,
        totalItems: row.totalItems,
        withAnyPrice: price?.withAnyPrice ?? 0,
        withRecentPrice: price?.withRecentPrice ?? 0,
        withRarity: row.withRarity,
        withImage: row.withImage,
        trackedItems: row.trackedItems,
        trackedWithPrice: price?.trackedWithPrice ?? 0,
        trackedWithRecentPrice: price?.trackedWithRecentPrice ?? 0,
      };
    })
    .sort((a, b) => a.tcg.localeCompare(b.tcg) || a.language.localeCompare(b.language) || a.category.localeCompare(b.category));
}
