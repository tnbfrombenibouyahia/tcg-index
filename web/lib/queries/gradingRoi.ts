import sql from "@/lib/db";
import {
  computeGradingRoi,
  DEFAULT_GRADING_ROI_ASSUMPTIONS,
  resolveGradeDistribution,
  type GradeCounts,
  type GradingRoiCandidate,
  type GradingRoiRow,
} from "@/lib/gradingRoi";
import type { GradedTier, Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Ingrédients bruts du calculateur ROI de gradation (demande utilisateur) :
// prix par grade (dernier snapshot) + comptage des ventes gradées à 4
// niveaux d'agrégation (carte / set+rareté / set / tcg), pour que
// resolveGradeDistribution (lib/gradingRoi.ts) choisisse le niveau le plus
// fin avec un échantillon suffisant. Tout le calcul EV/coût/ROI reste côté
// TS (lib/gradingRoi.ts, pur, réutilisable client-side pour le recalcul
// interactif) -- cette requête ne fait QUE remonter les données.
//
// Les niveaux set+rareté/set/tcg sont calculés par fenêtrage (SUM() OVER)
// sur TOUTES les singles ayant des ventes gradées, pas seulement les cartes
// éligibles au calcul (ungraded + ≥1 prix gradé) -- sinon le repli serait
// biaisé par le même filtre qui le rend nécessaire.
// ─────────────────────────────────────────────────────────────────────────────

interface RawRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  code: string | null;
  rarity: string | null;
  ungradedPrice: number;
  psa7Price: number | null;
  psa8Price: number | null;
  psa9Price: number | null;
  psa95Price: number | null;
  psa10Price: number | null;
  cardN7: number;
  cardN8: number;
  cardN9: number;
  cardN95: number;
  cardN10: number;
  srN7: number;
  srN8: number;
  srN9: number;
  srN95: number;
  srN10: number;
  setN7: number;
  setN8: number;
  setN9: number;
  setN95: number;
  setN10: number;
  tcgN7: number;
  tcgN8: number;
  tcgN9: number;
  tcgN95: number;
  tcgN10: number;
}

// Pas d'accès dynamique `row[`${prefix}N7`]` (RawRow n'a pas de signature
// d'index, et un `[key: string]: number` générique masquerait les vraies
// fautes de frappe de colonne) -- un branchement explicite par niveau reste
// juste aussi court et type-safe.
function counts(row: RawRow, prefix: "card" | "sr" | "set" | "tcg"): GradeCounts {
  if (prefix === "card") {
    return { psa7: row.cardN7, psa8: row.cardN8, psa9: row.cardN9, "psa9.5": row.cardN95, psa10: row.cardN10 };
  }
  if (prefix === "sr") {
    return { psa7: row.srN7, psa8: row.srN8, psa9: row.srN9, "psa9.5": row.srN95, psa10: row.srN10 };
  }
  if (prefix === "set") {
    return { psa7: row.setN7, psa8: row.setN8, psa9: row.setN9, "psa9.5": row.setN95, psa10: row.setN10 };
  }
  return { psa7: row.tcgN7, psa8: row.tcgN8, psa9: row.tcgN9, "psa9.5": row.tcgN95, psa10: row.tcgN10 };
}

function toCandidate(row: RawRow): GradingRoiCandidate {
  const gradePrices: Partial<Record<GradedTier, number>> = {};
  if (row.psa7Price != null) gradePrices.psa7 = row.psa7Price;
  if (row.psa8Price != null) gradePrices.psa8 = row.psa8Price;
  if (row.psa9Price != null) gradePrices.psa9 = row.psa9Price;
  if (row.psa95Price != null) gradePrices["psa9.5"] = row.psa95Price;
  if (row.psa10Price != null) gradePrices.psa10 = row.psa10Price;

  const { gradeMix, sourceLevel, sampleSize } = resolveGradeDistribution({
    card: counts(row, "card"),
    setRarity: counts(row, "sr"),
    set: counts(row, "set"),
    tcg: counts(row, "tcg"),
  });

  return {
    itemId: row.itemId,
    name: row.name,
    imageUrl: row.imageUrl,
    tcg: row.tcg as Tcg,
    language: row.language,
    setCode: row.setCode,
    code: row.code,
    rarity: row.rarity,
    ungradedPrice: row.ungradedPrice,
    gradePrices,
    gradeMix,
    distributionSourceLevel: sourceLevel,
    distributionSampleSize: sampleSize,
  };
}

// Coeur partagé : ingrédients de toutes les cartes éligibles (ungraded connu
// + au moins un prix gradé), filtrées par tcg/prix mini, ou d'un seul item.
// `hardCap` protège la requête liste (le tri par ROI% se fait ensuite en JS,
// cf. getGradingRoiRanking) -- pas de portée pour un seul item (itemId
// implique déjà au plus une ligne).
async function fetchCandidates({
  tcg,
  minUngradedPrice = 0,
  itemId,
  hardCap = 3000,
}: {
  tcg?: Tcg;
  minUngradedPrice?: number;
  itemId?: number;
  hardCap?: number;
}): Promise<GradingRoiCandidate[]> {
  const rows = await sql<RawRow[]>`
    WITH graded_prices AS (
      SELECT DISTINCT ON (item_id, grade) item_id, grade, price
      FROM price_snapshots
      WHERE grade IN ('ungraded', 'psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
      ORDER BY item_id, grade, captured_at DESC, created_at DESC
    ),
    prices AS (
      SELECT
        item_id,
        MAX(price) FILTER (WHERE grade = 'ungraded') AS ungraded_price,
        MAX(price) FILTER (WHERE grade = 'psa7')     AS psa7_price,
        MAX(price) FILTER (WHERE grade = 'psa8')     AS psa8_price,
        MAX(price) FILTER (WHERE grade = 'psa9')     AS psa9_price,
        MAX(price) FILTER (WHERE grade = 'psa9.5')   AS psa95_price,
        MAX(price) FILTER (WHERE grade = 'psa10')    AS psa10_price
      FROM graded_prices
      GROUP BY item_id
    ),
    item_grade_counts AS (
      SELECT
        item_id,
        COUNT(*) FILTER (WHERE grade = 'psa7')   AS n7,
        COUNT(*) FILTER (WHERE grade = 'psa8')   AS n8,
        COUNT(*) FILTER (WHERE grade = 'psa9')   AS n9,
        COUNT(*) FILTER (WHERE grade = 'psa9.5') AS n95,
        COUNT(*) FILTER (WHERE grade = 'psa10')  AS n10
      FROM sales
      WHERE grade IN ('psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
      GROUP BY item_id
    ),
    -- Contexte pour TOUTES les singles (pas juste les éligibles) : base des
    -- agrégats set+rareté/set/tcg, cf. commentaire d'en-tête.
    context AS (
      SELECT
        i.id AS item_id, i.tcg, i.set_code, i.rarity,
        COALESCE(g.n7, 0)  AS n7,
        COALESCE(g.n8, 0)  AS n8,
        COALESCE(g.n9, 0)  AS n9,
        COALESCE(g.n95, 0) AS n95,
        COALESCE(g.n10, 0) AS n10
      FROM items i
      LEFT JOIN item_grade_counts g ON g.item_id = i.id
      WHERE i.category = 'single'
    ),
    levels AS (
      SELECT
        item_id, n7, n8, n9, n95, n10,
        SUM(n7)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n7,
        SUM(n8)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n8,
        SUM(n9)  OVER (PARTITION BY tcg, set_code, rarity) AS sr_n9,
        SUM(n95) OVER (PARTITION BY tcg, set_code, rarity) AS sr_n95,
        SUM(n10) OVER (PARTITION BY tcg, set_code, rarity) AS sr_n10,
        SUM(n7)  OVER (PARTITION BY tcg, set_code) AS set_n7,
        SUM(n8)  OVER (PARTITION BY tcg, set_code) AS set_n8,
        SUM(n9)  OVER (PARTITION BY tcg, set_code) AS set_n9,
        SUM(n95) OVER (PARTITION BY tcg, set_code) AS set_n95,
        SUM(n10) OVER (PARTITION BY tcg, set_code) AS set_n10,
        SUM(n7)  OVER (PARTITION BY tcg) AS tcg_n7,
        SUM(n8)  OVER (PARTITION BY tcg) AS tcg_n8,
        SUM(n9)  OVER (PARTITION BY tcg) AS tcg_n9,
        SUM(n95) OVER (PARTITION BY tcg) AS tcg_n95,
        SUM(n10) OVER (PARTITION BY tcg) AS tcg_n10
      FROM context
    )
    SELECT
      i.id::int4             AS "itemId",
      i.name,
      i.image_url            AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code              AS "setCode",
      i.code,
      i.rarity,
      p.ungraded_price::float8 AS "ungradedPrice",
      p.psa7_price::float8   AS "psa7Price",
      p.psa8_price::float8   AS "psa8Price",
      p.psa9_price::float8   AS "psa9Price",
      p.psa95_price::float8  AS "psa95Price",
      p.psa10_price::float8  AS "psa10Price",
      l.n7::int4              AS "cardN7",
      l.n8::int4              AS "cardN8",
      l.n9::int4              AS "cardN9",
      l.n95::int4             AS "cardN95",
      l.n10::int4             AS "cardN10",
      l.sr_n7::int4           AS "srN7",
      l.sr_n8::int4           AS "srN8",
      l.sr_n9::int4           AS "srN9",
      l.sr_n95::int4          AS "srN95",
      l.sr_n10::int4          AS "srN10",
      l.set_n7::int4          AS "setN7",
      l.set_n8::int4          AS "setN8",
      l.set_n9::int4          AS "setN9",
      l.set_n95::int4         AS "setN95",
      l.set_n10::int4         AS "setN10",
      l.tcg_n7::int4           AS "tcgN7",
      l.tcg_n8::int4           AS "tcgN8",
      l.tcg_n9::int4           AS "tcgN9",
      l.tcg_n95::int4          AS "tcgN95",
      l.tcg_n10::int4          AS "tcgN10"
    FROM prices p
    JOIN items i ON i.id = p.item_id
    JOIN levels l ON l.item_id = p.item_id
    WHERE p.ungraded_price IS NOT NULL
      AND (
        p.psa7_price IS NOT NULL OR p.psa8_price IS NOT NULL OR p.psa9_price IS NOT NULL
        OR p.psa95_price IS NOT NULL OR p.psa10_price IS NOT NULL
      )
      ${itemId ? sql`AND i.id = ${itemId}` : sql``}
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      ${!itemId ? sql`AND p.ungraded_price >= ${minUngradedPrice}` : sql``}
    ORDER BY i.id
    ${itemId ? sql`` : sql`LIMIT ${hardCap}`}
  `;

  return rows.map(toCandidate);
}

export async function getGradingRoiCandidate(itemId: number): Promise<GradingRoiCandidate | null> {
  const [candidate] = await fetchCandidates({ itemId });
  return candidate ?? null;
}

export type GradingRoiSort =
  | "roi_desc"
  | "roi_asc"
  | "profit_desc"
  | "profit_asc"
  | "ungraded_desc"
  | "ungraded_asc"
  | "language_asc"
  | "language_desc";

function sortRows(rows: GradingRoiRow[], sort?: GradingRoiSort): GradingRoiRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "roi_asc":
      return sorted.sort((a, b) => a.defaultResult.roiPct - b.defaultResult.roiPct);
    case "profit_desc":
      return sorted.sort((a, b) => b.defaultResult.netProfit - a.defaultResult.netProfit);
    case "profit_asc":
      return sorted.sort((a, b) => a.defaultResult.netProfit - b.defaultResult.netProfit);
    case "ungraded_desc":
      return sorted.sort((a, b) => b.ungradedPrice - a.ungradedPrice);
    case "ungraded_asc":
      return sorted.sort((a, b) => a.ungradedPrice - b.ungradedPrice);
    case "language_asc":
      return sorted.sort((a, b) => a.language.localeCompare(b.language) || b.defaultResult.roiPct - a.defaultResult.roiPct);
    case "language_desc":
      return sorted.sort((a, b) => b.language.localeCompare(a.language) || b.defaultResult.roiPct - a.defaultResult.roiPct);
    case "roi_desc":
    default:
      return sorted.sort((a, b) => b.defaultResult.roiPct - a.defaultResult.roiPct);
  }
}

export interface GradingRoiRankingParams {
  tcg?: Tcg;
  minUngradedPrice?: number;
  sort?: GradingRoiSort;
  limit?: number;
}

// ROI% n'est pas une colonne DB (dépend d'hypothèses éditables côté client)
// -- le tri se fait donc en JS sur le set déjà filtré/plafonné par SQL
// (hardCap), avec les hypothèses PAR DÉFAUT (DEFAULT_GRADING_ROI_ASSUMPTIONS).
// C'est ce classement par défaut qui alimente /grading-roi ; ouvrir une
// carte permet ensuite de personnaliser (GradingRoiCalculator).
export async function getGradingRoiRanking({
  tcg,
  minUngradedPrice = 2,
  sort = "roi_desc",
  limit = 100,
}: GradingRoiRankingParams): Promise<GradingRoiRow[]> {
  const candidates = await fetchCandidates({ tcg, minUngradedPrice });
  const rows: GradingRoiRow[] = candidates.map((candidate) => ({
    ...candidate,
    defaultResult: computeGradingRoi(candidate, DEFAULT_GRADING_ROI_ASSUMPTIONS),
  }));
  return sortRows(rows, sort).slice(0, limit);
}
