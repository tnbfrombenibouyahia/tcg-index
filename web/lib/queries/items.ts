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
      i.id::int4 AS id, i.name, i.tcg, i.category,
      i.set_code AS "setCode", i.code, i.image_url AS "imageUrl", i.language, i.rarity,
      i.interest_tier AS "interestTier",
      s.logo_url AS "setLogoUrl"
    FROM items i
    LEFT JOIN sets s ON s.tcg = i.tcg AND s.set_code = i.set_code
    WHERE (i.name ILIKE ${pattern} OR i.code ILIKE ${pattern})
      ${params.tcg ? sql`AND i.tcg = ${params.tcg}` : sql``}
      ${params.setCode ? sql`AND i.set_code = ${params.setCode}` : sql``}
    -- id ASC final : tiebreaker déterministe. Sans lui, plusieurs cartes
    -- au nom strictement identique (ex. plusieurs "Pikachu") sont à égalité
    -- sur toutes les clés de tri -- l'ordre renvoyé devient alors non
    -- garanti par le SQL et peut différer d'un moteur à l'autre (repéré en
    -- comparant Supabase/CockroachDB, cf. db/COCKROACHDB_MIGRATION.md).
    ORDER BY
      (i.code ILIKE ${q}) DESC,
      (i.code ILIKE ${q + "/%"}) DESC,
      (i.name ILIKE ${q}) DESC,
      i.name ASC,
      i.id ASC
    LIMIT ${limit}
  `;

  return rows;
}
