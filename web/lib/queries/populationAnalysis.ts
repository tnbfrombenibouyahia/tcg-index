import sql from "@/lib/db";
import type { PopulationRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Classement /population-analysis : population PSA+CGC réelle par carte (pas
// un prix -- cf. db/schema.sql::population_snapshots, [[project_population_analysis]]).
// Même squelette que lib/queries/gradingRoi.ts (candidats chargés en mémoire,
// bornés par `hardCap`, triés + paginés côté JS -- pas de COUNT séparé, cf.
// son commentaire pour la justification) : le volume de cartes avec
// population connue est du même ordre de grandeur que grading_roi_inputs
// (~14k), largement sous le plafond.
//
// `ungradedPrice`/`psa8Price`/`psa9Price`/`psa10Price` viennent de
// `grading_roi_inputs` (déjà matérialisé pour /grading-roi) en LEFT JOIN --
// contexte de valeur affiché à côté de la population. Par défaut c'est
// juste du contexte, jamais un filtre implicite (une carte sans prix gradé
// connu reste dans le classement) -- SAUF si l'appelant fournit
// `priceGrade`/`minPrice` (demande utilisateur 2026-08-10 : "afficher
// uniquement les cartes de minimum X € en loose/PSA8/9/10"), auquel cas le
// filtre est appliqué en SQL (pas en JS après coup) pour rester correct même
// si le nombre de candidats dépasse un jour `hardCap`.
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
  ungradedPrice: number | null;
  psa8Price: number | null;
  psa9Price: number | null;
  psa10Price: number | null;
  capturedAt: string;
  popGrade6: number;
  popGrade7: number;
  popGrade8: number;
  popGrade9: number;
  popGrade10: number;
  popTotal: number;
}

function toRow(r: RawRow): PopulationRow {
  return {
    itemId: r.itemId,
    name: r.name,
    imageUrl: r.imageUrl,
    tcg: r.tcg as Tcg,
    language: r.language,
    setCode: r.setCode,
    code: r.code,
    rarity: r.rarity,
    ungradedPrice: r.ungradedPrice,
    psa8Price: r.psa8Price,
    psa9Price: r.psa9Price,
    psa10Price: r.psa10Price,
    population: {
      capturedAt: r.capturedAt,
      popGrade6: r.popGrade6,
      popGrade7: r.popGrade7,
      popGrade8: r.popGrade8,
      popGrade9: r.popGrade9,
      popGrade10: r.popGrade10,
      popTotal: r.popTotal,
    },
  };
}

// Paliers de prix proposés au filtre -- volontairement restreint à
// loose/PSA8/9/10 (demande utilisateur), pas les 6 grades de
// price_snapshots.grade (PSA7/9.5 exclus, pas demandés).
export type PopulationPriceGrade = "ungraded" | "psa8" | "psa9" | "psa10";

// Colonne `grading_roi_inputs` correspondante -- un seul point de vérité
// pour la correspondance grade -> colonne, réutilisé par le fragment SQL
// ci-dessous ET par la page (validation du paramètre d'URL).
export const POPULATION_PRICE_GRADES: readonly PopulationPriceGrade[] = ["ungraded", "psa8", "psa9", "psa10"];

function priceFilterFragment(priceGrade: PopulationPriceGrade, minPrice?: number) {
  if (!minPrice) return sql``;
  switch (priceGrade) {
    case "psa8":
      return sql`AND lp.psa8_price >= ${minPrice}`;
    case "psa9":
      return sql`AND lp.psa9_price >= ${minPrice}`;
    case "psa10":
      return sql`AND lp.psa10_price >= ${minPrice}`;
    case "ungraded":
    default:
      return sql`AND lp.ungraded_price >= ${minPrice}`;
  }
}

async function fetchCandidates({
  tcg,
  priceGrade = "ungraded",
  minPrice,
  hardCap = 20000,
}: {
  tcg?: Tcg;
  priceGrade?: PopulationPriceGrade;
  minPrice?: number;
  hardCap?: number;
}): Promise<PopulationRow[]> {
  const rows = await sql<RawRow[]>`
    WITH latest_pop AS (
      SELECT DISTINCT ON (item_id) *
      FROM population_snapshots
      ORDER BY item_id, captured_at DESC
    ), latest_price AS (
      SELECT DISTINCT ON (item_id) item_id, ungraded_price, psa8_price, psa9_price, psa10_price
      FROM grading_roi_inputs
      ORDER BY item_id, captured_at DESC
    )
    SELECT
      i.id::int4                AS "itemId",
      i.name,
      i.image_url               AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code                AS "setCode",
      i.code,
      i.rarity,
      lp.ungraded_price::float8 AS "ungradedPrice",
      lp.psa8_price::float8     AS "psa8Price",
      lp.psa9_price::float8     AS "psa9Price",
      lp.psa10_price::float8    AS "psa10Price",
      l.captured_at::text       AS "capturedAt",
      l.pop_grade6::int4        AS "popGrade6",
      l.pop_grade7::int4        AS "popGrade7",
      l.pop_grade8::int4        AS "popGrade8",
      l.pop_grade9::int4        AS "popGrade9",
      l.pop_grade10::int4       AS "popGrade10",
      l.pop_total::int4         AS "popTotal"
    FROM latest_pop l
    JOIN items i ON i.id = l.item_id
    LEFT JOIN latest_price lp ON lp.item_id = l.item_id
    WHERE 1=1
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      ${priceFilterFragment(priceGrade, minPrice)}
    ORDER BY i.id
    LIMIT ${hardCap}
  `;

  return rows.map(toRow);
}

export type PopulationSort =
  | "psa10_asc"
  | "psa10_desc"
  | "total_asc"
  | "total_desc"
  | "language_asc"
  | "language_desc";

function sortRows(rows: PopulationRow[], sort?: PopulationSort): PopulationRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "psa10_desc":
      return sorted.sort((a, b) => b.population.popGrade10 - a.population.popGrade10);
    case "total_asc":
      return sorted.sort((a, b) => a.population.popTotal - b.population.popTotal);
    case "total_desc":
      return sorted.sort((a, b) => b.population.popTotal - a.population.popTotal);
    case "language_asc":
      return sorted.sort((a, b) => a.language.localeCompare(b.language) || a.population.popGrade10 - b.population.popGrade10);
    case "language_desc":
      return sorted.sort((a, b) => b.language.localeCompare(a.language) || a.population.popGrade10 - b.population.popGrade10);
    case "psa10_asc":
    default:
      // Défaut : le plus rare en PSA 10 en premier (y compris 0 -- une carte
      // jamais vue en Gem Mint est un signal de rareté à part entière, pas
      // un manque de donnée -- popTotal > 0 garantit déjà qu'elle a été
      // gradée à un autre palier).
      return sorted.sort((a, b) => a.population.popGrade10 - b.population.popGrade10);
  }
}

export interface PopulationRankingParams {
  tcg?: Tcg;
  sort?: PopulationSort;
  priceGrade?: PopulationPriceGrade;
  minPrice?: number;
  limit?: number;
  page?: number;
}

export interface PopulationRankingResult {
  rows: PopulationRow[];
  totalCount: number;
}

export async function getPopulationRanking({
  tcg,
  sort = "psa10_asc",
  priceGrade = "ungraded",
  minPrice,
  limit = 50,
  page = 1,
}: PopulationRankingParams): Promise<PopulationRankingResult> {
  const candidates = await fetchCandidates({ tcg, priceGrade, minPrice });
  const sorted = sortRows(candidates, sort);
  const offset = (Math.max(1, page) - 1) * limit;
  return { rows: sorted.slice(offset, offset + limit), totalCount: sorted.length };
}
