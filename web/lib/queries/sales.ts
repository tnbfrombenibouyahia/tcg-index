import sql from "@/lib/db";
import { GRADES } from "@/lib/constants";
import type { SaleRow, SalesFiltersResponse, SalesResponse, SetOption } from "@/lib/types";

export interface SalesFilterParams {
  tcg?: string;
  setCode?: string;
  itemId?: number;
  grade?: string;
  rarity?: string;
  sort?:
    | "date_desc"
    | "date_asc"
    | "price_desc"
    | "price_asc"
    | "language_asc"
    | "language_desc"
    | "rarity_asc"
    | "rarity_desc";
  page?: number;
  pageSize?: number;
}

// `WHERE 1=1` + fragments conditionnels : chaque filtre s'ajoute avec un `AND`
// sans avoir à suivre "est-ce la première condition ?" -- pattern standard
// documenté par postgres.js pour composer des requêtes dynamiques (les
// sous-fragments `sql\`...\`` s'imbriquent tels quels, toujours paramétrés,
// jamais de concaténation de chaîne).
function whereFragment(f: SalesFilterParams) {
  return sql`
    WHERE 1=1
    ${f.tcg ? sql`AND i.tcg = ${f.tcg}` : sql``}
    ${f.setCode ? sql`AND i.set_code = ${f.setCode}` : sql``}
    ${f.itemId ? sql`AND s.item_id = ${f.itemId}` : sql``}
    ${f.grade ? sql`AND s.grade = ${f.grade}` : sql``}
    ${f.rarity ? sql`AND i.rarity = ${f.rarity}` : sql``}
  `;
}

// Les colonnes/directions de tri ne peuvent pas être paramétrées via ${...}
// (ça les citerait comme chaîne, pas comme identifiant SQL) -- on part donc
// d'un enum fermé (`sort` typé) plutôt que d'accepter un nom de colonne libre.
function orderFragment(sort: SalesFilterParams["sort"]) {
  switch (sort) {
    case "date_asc":
      return sql`ORDER BY s.sale_date ASC, s.id ASC`;
    case "price_desc":
      return sql`ORDER BY s.price DESC, s.id DESC`;
    case "price_asc":
      return sql`ORDER BY s.price ASC, s.id ASC`;
    case "language_asc":
      return sql`ORDER BY i.language ASC, s.sale_date DESC, s.id DESC`;
    case "language_desc":
      return sql`ORDER BY i.language DESC, s.sale_date DESC, s.id DESC`;
    case "rarity_asc":
      return sql`ORDER BY i.rarity ASC NULLS LAST, s.sale_date DESC, s.id DESC`;
    case "rarity_desc":
      return sql`ORDER BY i.rarity DESC NULLS LAST, s.sale_date DESC, s.id DESC`;
    case "date_desc":
    default:
      return sql`ORDER BY s.sale_date DESC, s.id DESC`;
  }
}

interface SaleQueryRow {
  id: number;
  saleDate: string;
  price: number;
  currency: string;
  grade: string;
  marketplace: string;
  title: string | null;
  itemId: number;
  itemName: string;
  itemTcg: string;
  itemCategory: string;
  itemSetCode: string | null;
  itemCode: string | null;
  itemImageUrl: string | null;
  itemLanguage: string;
  itemRarity: string | null;
}

export async function getSales(filters: SalesFilterParams): Promise<SalesResponse> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const where = whereFragment(filters);
  const order = orderFragment(filters.sort);

  const [rows, countRows] = await Promise.all([
    sql<SaleQueryRow[]>`
      SELECT
        s.id::int AS id,
        s.sale_date::text AS "saleDate",
        s.price::float8 AS price,
        s.currency,
        s.grade,
        s.marketplace,
        s.title,
        i.id::int AS "itemId",
        i.name AS "itemName",
        i.tcg AS "itemTcg",
        i.category AS "itemCategory",
        i.set_code AS "itemSetCode",
        i.code AS "itemCode",
        i.image_url AS "itemImageUrl",
        i.language AS "itemLanguage",
        i.rarity AS "itemRarity"
      FROM sales s
      JOIN items i ON i.id = s.item_id
      ${where}
      ${order}
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM sales s
      JOIN items i ON i.id = s.item_id
      ${where}
    `,
  ]);

  const totalCount = countRows[0]?.count ?? 0;

  const sales: SaleRow[] = rows.map((r) => ({
    id: r.id,
    saleDate: r.saleDate,
    price: r.price,
    currency: r.currency,
    grade: r.grade as SaleRow["grade"],
    marketplace: r.marketplace,
    title: r.title,
    item: {
      id: r.itemId,
      name: r.itemName,
      tcg: r.itemTcg as SaleRow["item"]["tcg"],
      category: r.itemCategory as SaleRow["item"]["category"],
      setCode: r.itemSetCode,
      code: r.itemCode,
      imageUrl: r.itemImageUrl,
      language: r.itemLanguage,
      rarity: r.itemRarity,
    },
  }));

  return {
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    sales,
  };
}

export async function getSalesFilters(tcg: string): Promise<SalesFiltersResponse> {
  const [sets, rarityRows] = await Promise.all([
    sql<SetOption[]>`
      SELECT
        set_code AS "setCode",
        MIN(release_date)::text AS "releaseDate",
        COUNT(*)::int AS "itemCount"
      FROM items
      WHERE tcg = ${tcg} AND set_code IS NOT NULL
      GROUP BY set_code
      ORDER BY MIN(release_date) DESC NULLS LAST
    `,
    sql<{ rarity: string }[]>`
      SELECT DISTINCT rarity
      FROM items
      WHERE tcg = ${tcg} AND rarity IS NOT NULL
      ORDER BY rarity ASC
    `,
  ]);
  return { sets, grades: GRADES, rarities: rarityRows.map((r) => r.rarity) };
}
