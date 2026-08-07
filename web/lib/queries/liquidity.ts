import sql from "@/lib/db";
import type { LiquidityRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Page /liquidity : classement des items scellés EN qui ont à la fois un
// instantané `active_listings` (stock eBay) ET au moins une vente sur 90j
// (flux `sales`) -- même gate que le bloc "Liquidité" de la fiche produit
// (cf. lib/queries/itemDetail.ts), ~146 items aujourd'hui, cf. mémoire
// projet "liquidity_sell_through" pour pourquoi la population est si
// restreinte (sets fourre-tout jamais mappés + matcher scellé à 44%).
// PAS un carnet d'ordres (pas de bid/ask côté eBay) -- un taux d'écoulement.
// ─────────────────────────────────────────────────────────────────────────────

interface LiquidityQueryRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  capturedAt: string;
  listingCount: number;
  salesCount30d: number;
  salesCount90d: number;
}

export type LiquiditySort =
  | "sellthrough_desc"
  | "sellthrough_asc"
  | "listing_desc"
  | "listing_asc"
  | "sales_desc"
  | "sales_asc";

// sell_through = sales_30d / (sales_30d + listing_count) -- calculé dans le
// CTE (cf. base ci-dessous) pour pouvoir trier/paginer dessus côté SQL
// plutôt que de tout charger en JS.
function orderFragment(sort?: LiquiditySort) {
  if (sort === "sellthrough_asc") return sql`ORDER BY b.sell_through ASC, b.item_id ASC`;
  if (sort === "listing_desc")    return sql`ORDER BY b.listing_count DESC, b.item_id ASC`;
  if (sort === "listing_asc")     return sql`ORDER BY b.listing_count ASC, b.item_id ASC`;
  if (sort === "sales_desc")      return sql`ORDER BY b.sales_30d DESC, b.item_id ASC`;
  if (sort === "sales_asc")       return sql`ORDER BY b.sales_30d ASC, b.item_id ASC`;
  return sql`ORDER BY b.sell_through DESC, b.item_id ASC`; // défaut : taux d'écoulement décroissant
}

// Base commune à getLiquidity/getLiquidityCount : dernier instantané
// active_listings par item + comptage sales 30j/90j, filtré aux items avec
// au moins une vente sur 90j (même gate que la fiche produit -- un ratio à
// 0% serait trompeur, pas "personne n'achète", juste "pas encore mesuré").
const BASE_CTE = sql`
  WITH latest_listing AS (
    SELECT DISTINCT ON (item_id) item_id, captured_at, listing_count
    FROM active_listings
    ORDER BY item_id, captured_at DESC
  ), sales_counts AS (
    SELECT
      item_id,
      count(*) FILTER (WHERE sale_date >= current_date - interval '30 days') AS sales_30d,
      count(*) FILTER (WHERE sale_date >= current_date - interval '90 days') AS sales_90d
    FROM sales
    WHERE sale_date >= current_date - interval '90 days'
    GROUP BY item_id
  ), base AS (
    SELECT
      ll.item_id, ll.captured_at, ll.listing_count,
      sc.sales_30d, sc.sales_90d,
      sc.sales_30d::float8 / NULLIF(sc.sales_30d + ll.listing_count, 0)::float8 AS sell_through
    FROM latest_listing ll
    JOIN sales_counts sc ON sc.item_id = ll.item_id AND sc.sales_90d > 0
    JOIN items i_filter ON i_filter.id = ll.item_id
    -- listing_count = 0 n'est pas "tout vendu", c'est "eBay n'a jamais eu
    -- d'annonce pour ce type de produit dans les catégories Sealed Packs/
    -- Boxes interrogées" (ex. One Piece "DON!! Card" -- 53% des items OP
    -- éligibles avant ce filtre, tous à 0 stock). Sans ce garde, ça produit
    -- un faux 100% d'écoulement qui noie les vrais résultats en tête de
    -- classement (sort par défaut = taux décroissant). Vérifié via
    -- ingestion/probe_ebay.py --tcg one-piece le 2026-08-07.
    WHERE ll.listing_count > 0
      -- One Piece scellé restreint aux Booster Box (demande utilisateur
      -- 2026-08-07, après avoir vu des DON!! Card avec un vrai stock non-nul
      -- squatter le classement) -- les Starter Deck/Double Pack Set/Booster
      -- Pack simple ne sont pas comparables entre eux pour un classement de
      -- liquidité, même logique que sealed_ev déjà restreint aux Booster
      -- Box. Pokémon non touché (pas de DON!! Card côté Pokémon, sa
      -- population scellée reste variée par choix).
      AND (i_filter.tcg != 'one-piece' OR i_filter.name ILIKE '%Booster Box%')
  )
`;

export interface LiquidityParams {
  tcg?: Tcg;
  limit?: number;
  page?: number;
  sort?: LiquiditySort;
}

export async function getLiquidity({ tcg, limit = 50, page = 1, sort }: LiquidityParams): Promise<LiquidityRow[]> {
  const order = orderFragment(sort);
  const offset = (Math.max(1, page) - 1) * limit;

  const rows = await sql<LiquidityQueryRow[]>`
    ${BASE_CTE}
    SELECT
      b.item_id::int4       AS "itemId",
      i.name,
      i.image_url           AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code             AS "setCode",
      b.captured_at::text     AS "capturedAt",
      b.listing_count::int4   AS "listingCount",
      b.sales_30d::int4       AS "salesCount30d",
      b.sales_90d::int4       AS "salesCount90d"
    FROM base b
    JOIN items i ON i.id = b.item_id
    ${tcg ? sql`WHERE i.tcg = ${tcg}` : sql``}
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
    capturedAt: r.capturedAt,
    listingCount: r.listingCount,
    salesCount30d: r.salesCount30d,
    salesCount90d: r.salesCount90d,
    sellThroughRate30d:
      r.salesCount30d + r.listingCount > 0 ? r.salesCount30d / (r.salesCount30d + r.listingCount) : null,
  }));
}

export async function getLiquidityCount({ tcg }: Pick<LiquidityParams, "tcg">): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    ${BASE_CTE}
    SELECT COUNT(*)::int4 AS count
    FROM base b
    JOIN items i ON i.id = b.item_id
    ${tcg ? sql`WHERE i.tcg = ${tcg}` : sql``}
  `;
  return row?.count ?? 0;
}
