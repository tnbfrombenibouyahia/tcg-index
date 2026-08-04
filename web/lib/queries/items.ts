import sql from "@/lib/db";
import type { ItemSummary } from "@/lib/types";

export interface ItemSearchParams {
  q: string;
  tcg?: string;
  setCode?: string;
  limit?: number;
}

// Recherche catalogue générale (demande utilisateur : nom OU numéro de carte
// dans le même champ) -- `code` porte le numéro dans le set (ex. '065/165'),
// `name` le nom de la carte/du produit scellé. Une correspondance exacte sur
// le numéro (recherche "065" ou "065/165") remonte avant les correspondances
// de nom pour aller droit à la carte cherchée ; sinon tri alphabétique.
export async function searchItems(params: ItemSearchParams): Promise<ItemSummary[]> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const q = params.q.trim();
  const pattern = `%${q}%`;

  const rows = await sql<ItemSummary[]>`
    SELECT
      id::int AS id, name, tcg, category,
      set_code AS "setCode", code, image_url AS "imageUrl", language, rarity
    FROM items
    WHERE (name ILIKE ${pattern} OR code ILIKE ${pattern})
      ${params.tcg ? sql`AND tcg = ${params.tcg}` : sql``}
      ${params.setCode ? sql`AND set_code = ${params.setCode}` : sql``}
    ORDER BY
      (code ILIKE ${q}) DESC,
      (code ILIKE ${q + "/%"}) DESC,
      (name ILIKE ${q}) DESC,
      name ASC
    LIMIT ${limit}
  `;

  return rows;
}
