import sql from "@/lib/db";
import type { SealedEvMode, SealedEvRow } from "@/lib/types";

interface SealedEvQueryRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  capturedAt: string;
  boxPrice: number;
  boxPriceSource: string;
  boxSalesUsed: number;
  boxReliabilityScore: number | null;
  singlesCount: number;
  singlesTotalValue: number;
  singlesTop10Value: number;
  evRatioTotal: number;
  evRatioTop10: number;
}

// Les colonnes de tri ne peuvent pas être paramétrées via ${...} (ça les
// citerait comme chaîne) -- enum fermé comme dans queries/sales.ts. `sort`
// (langue) est optionnel et prioritaire sur le tri par ratio EV piloté par
// `mode` -- le ratio EV reste le tri par défaut de la page.
export type SealedEvSort = "language_asc" | "language_desc";

// `l.item_id ASC` final sur chaque branche : tiebreaker déterministe, même
// raison que undervalued.ts orderFragment (cf. son commentaire).
function orderFragment(mode: SealedEvMode, sort?: SealedEvSort) {
  if (sort === "language_asc") return sql`ORDER BY i.language ASC, l.ev_ratio_total DESC, l.item_id ASC`;
  if (sort === "language_desc") return sql`ORDER BY i.language DESC, l.ev_ratio_total DESC, l.item_id ASC`;
  return mode === "top10"
    ? sql`ORDER BY l.ev_ratio_top10 DESC, l.item_id ASC`
    : sql`ORDER BY l.ev_ratio_total DESC, l.item_id ASC`;
}

export interface SealedEvParams {
  mode: SealedEvMode;
  tcg?: string;
  limit?: number;
  sort?: SealedEvSort;
}

export async function getSealedEv({ mode, tcg, limit = 50, sort }: SealedEvParams): Promise<SealedEvRow[]> {
  const order = orderFragment(mode, sort);

  // `sealed_ev` est append-only (une ligne par item/jour) -- DISTINCT ON
  // pour ne garder que le dernier calcul par Booster Box, même si l'historique
  // s'accumule au fil des runs du cron.
  const rows = await sql<SealedEvQueryRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (item_id) *
      FROM sealed_ev
      ORDER BY item_id, captured_at DESC
    )
    SELECT
      l.item_id::int4 AS "itemId",
      i.name,
      i.image_url AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code AS "setCode",
      l.captured_at::text AS "capturedAt",
      l.box_price::float8 AS "boxPrice",
      l.box_price_source AS "boxPriceSource",
      l.box_sales_used::int4 AS "boxSalesUsed",
      l.box_reliability_score::float8 AS "boxReliabilityScore",
      l.singles_count::int4 AS "singlesCount",
      l.singles_total_value::float8 AS "singlesTotalValue",
      l.singles_top10_value::float8 AS "singlesTop10Value",
      l.ev_ratio_total::float8 AS "evRatioTotal",
      l.ev_ratio_top10::float8 AS "evRatioTop10"
    FROM latest l
    JOIN items i ON i.id = l.item_id
    ${tcg ? sql`WHERE i.tcg = ${tcg}` : sql``}
    ${order}
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    itemId: r.itemId,
    name: r.name,
    imageUrl: r.imageUrl,
    tcg: r.tcg as SealedEvRow["tcg"],
    language: r.language,
    setCode: r.setCode,
    capturedAt: r.capturedAt,
    boxPrice: r.boxPrice,
    boxPriceSource: r.boxPriceSource as SealedEvRow["boxPriceSource"],
    boxSalesUsed: r.boxSalesUsed,
    boxReliabilityScore: r.boxReliabilityScore,
    singlesCount: r.singlesCount,
    singlesTotalValue: r.singlesTotalValue,
    singlesTop10Value: r.singlesTop10Value,
    evRatioTotal: r.evRatioTotal,
    evRatioTop10: r.evRatioTop10,
  }));
}
