import sql from "@/lib/db";
import type { ItemSummary } from "@/lib/types";

export interface ItemSearchParams {
  q: string;
  tcg?: string;
  setCode?: string;
  limit?: number;
}

export async function searchItems(params: ItemSearchParams): Promise<ItemSummary[]> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const pattern = `%${params.q}%`;

  const rows = await sql<ItemSummary[]>`
    SELECT
      id::int AS id, name, tcg, category,
      set_code AS "setCode", code, image_url AS "imageUrl", language
    FROM items
    WHERE name ILIKE ${pattern}
      ${params.tcg ? sql`AND tcg = ${params.tcg}` : sql``}
      ${params.setCode ? sql`AND set_code = ${params.setCode}` : sql``}
    ORDER BY name ASC
    LIMIT ${limit}
  `;

  return rows;
}
