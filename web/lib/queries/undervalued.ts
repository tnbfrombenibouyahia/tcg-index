import sql from "@/lib/db";
import type { UndervaluedRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

interface UndervaluedQueryRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  rarity: string | null;
  capturedAt: string;
  packPrice: number | null;
  pullRate: number | null;
  pullCost: number | null;
  characterMultiplier: number | null;
  theoreticalValue: number;
  marketPrice: number;
  undervaluedScore: number;
}

// Colonnes de tri acceptées — enum fermé, jamais interpolé directement en SQL.
export type UndervaluedSort =
  | "score_desc"
  | "score_asc"
  | "market_desc"
  | "market_asc"
  | "language_asc"
  | "language_desc";

// `l.item_id ASC` final sur chaque branche : tiebreaker déterministe.
// undervalued_score se répète souvent à l'identique (beaucoup de cartes de
// même rareté dans un même set partagent le même pull_rate/pack_price, cf.
// commentaire MVP du calcul) -- sans tiebreaker, LIMIT tronque un groupe de
// lignes à égalité de façon non garantie par le SQL, potentiellement
// différente d'un moteur à l'autre (repéré en comparant Supabase/
// CockroachDB, cf. db/COCKROACHDB_MIGRATION.md).
function orderFragment(sort?: UndervaluedSort) {
  if (sort === "score_asc")     return sql`ORDER BY l.undervalued_score ASC, l.item_id ASC`;
  if (sort === "market_desc")   return sql`ORDER BY l.market_price DESC, l.item_id ASC`;
  if (sort === "market_asc")    return sql`ORDER BY l.market_price ASC, l.item_id ASC`;
  if (sort === "language_asc")  return sql`ORDER BY i.language ASC, l.undervalued_score DESC, l.item_id ASC`;
  if (sort === "language_desc") return sql`ORDER BY i.language DESC, l.undervalued_score DESC, l.item_id ASC`;
  return sql`ORDER BY l.undervalued_score DESC, l.item_id ASC`; // défaut : score décroissant
}

export interface UndervaluedParams {
  tcg?: Tcg;
  minMarketPrice?: number;
  limit?: number;
  page?: number;
  sort?: UndervaluedSort;
}

// Filtre partagé entre getUndervalued et getUndervaluedCount (page + count
// exécutées en parallèle depuis app/undervalued/page.tsx, même pattern que
// lib/queries/sales.ts) -- évite que les deux divergent silencieusement.
//
// Plancher $5 (demande utilisateur 2026-08-09, "en dessous de ça on
// comptabilise pas") -- même défaut partout où ce filtre s'applique (ici,
// app/(app)/undervalued/page.tsx ; le dashboard CardQuant utilise le même
// plancher mais via getDivergence, cf. app/(cardquant)/dashboard/page.tsx),
// aligné sur le plancher déjà en place pour /divergence (minPrice: 5) : sous
// $5, le bruit sur des cartes quasi sans valeur dominait le classement.
function whereFragment(tcg: Tcg | undefined, minMarketPrice: number) {
  return sql`
    WHERE l.market_price >= ${minMarketPrice}
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
  `;
}

export async function getUndervalued({
  tcg,
  minMarketPrice = 5,
  limit = 50,
  page = 1,
  sort,
}: UndervaluedParams): Promise<UndervaluedRow[]> {
  const order = orderFragment(sort);
  const where = whereFragment(tcg, minMarketPrice);
  const offset = (Math.max(1, page) - 1) * limit;

  // DISTINCT ON (item_id) : ne garder que le score le plus récent par carte,
  // même si undervalued_scores est append-only et accumule un point par jour.
  const rows = await sql<UndervaluedQueryRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (item_id)
        item_id,
        captured_at,
        pack_price,
        pull_rate,
        pull_cost,
        character_multiplier,
        theoretical_value,
        market_price,
        undervalued_score
      FROM undervalued_scores
      ORDER BY item_id, captured_at DESC
    )
    SELECT
      l.item_id::int4                         AS "itemId",
      i.name,
      i.image_url                             AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code                              AS "setCode",
      i.rarity,
      l.captured_at::text                     AS "capturedAt",
      l.pack_price::float8                    AS "packPrice",
      l.pull_rate::float8                     AS "pullRate",
      l.pull_cost::float8                     AS "pullCost",
      l.character_multiplier::float8          AS "characterMultiplier",
      l.theoretical_value::float8             AS "theoreticalValue",
      l.market_price::float8                  AS "marketPrice",
      l.undervalued_score::float8             AS "undervaluedScore"
    FROM latest l
    JOIN items i ON i.id = l.item_id
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((r) => ({
    itemId: r.itemId,
    name: r.name,
    imageUrl: r.imageUrl,
    tcg: r.tcg as Tcg,
    language: r.language,
    setCode: r.setCode,
    rarity: r.rarity,
    capturedAt: r.capturedAt,
    packPrice: r.packPrice,
    pullRate: r.pullRate,
    pullCost: r.pullCost,
    characterMultiplier: r.characterMultiplier,
    theoreticalValue: r.theoreticalValue,
    marketPrice: r.marketPrice,
    undervaluedScore: r.undervaluedScore,
  }));
}

// Total de lignes matchant les mêmes filtres, pour calculer totalPages côté
// page.tsx (Promise.all avec getUndervalued, cf. app/undervalued/page.tsx).
// Même coût que la requête principale côté DISTINCT ON (l'essentiel du
// travail), mais sans le JOIN items ni le tri -- reste rapide.
export async function getUndervaluedCount({
  tcg,
  minMarketPrice = 5,
}: Pick<UndervaluedParams, "tcg" | "minMarketPrice">): Promise<number> {
  const where = whereFragment(tcg, minMarketPrice);

  const [row] = await sql<{ count: number }[]>`
    WITH latest AS (
      SELECT DISTINCT ON (item_id) item_id, market_price
      FROM undervalued_scores
      ORDER BY item_id, captured_at DESC
    )
    SELECT COUNT(*)::int4 AS count
    FROM latest l
    JOIN items i ON i.id = l.item_id
    ${where}
  `;

  return row?.count ?? 0;
}
