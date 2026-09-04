import sql from "@/lib/db";
import type { MonthlySalesPoint, PopulationBySetRow, SetHeatmapRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Agrégats spécifiques au Dashboard CardQuant (redesign Slabline, cf. mémoire
// projet "cardquant-rebrand") : heatmap par set, tendance de ventes 12 mois,
// population PSA par set. Trois requêtes qui n'existaient dans aucun module
// existant (divergence.ts/gradingRoi.ts/populationAnalysis.ts raisonnent par
// carte, pas par set) -- regroupées ici plutôt que dans un fichier par
// concern comme le reste de lib/queries, le concern commun étant "alimente
// le dashboard", pas un domaine d'analyse à part entière.
//
// Toutes filtrent grade = 'ungraded' pour deux raisons : (1) cohérence avec
// divergence.ts/gradingRoi.ts (mélanger les grades fausse les moyennes de
// prix, cf. leur commentaire), (2) idx_sales_grade_date (grade, sale_date)
// couvre le WHERE sans scanner les 1M+ lignes de `sales` (cf. db/schema.sql).
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SALES_PER_WINDOW = 3;

export interface SetHeatmapParams {
  tcg?: Tcg;
  windowDays?: number;
  limit?: number;
}

interface SetHeatmapQueryRow {
  tcg: string;
  setCode: string;
  salesCount: number;
  salesValue: number;
  priceChangePct: number;
}

// Même principe fenêtre-courante/fenêtre-précédente que
// lib/queries/divergence.ts, mais agrégé par (tcg, set_code) plutôt que par
// item_id -- une "carte" du dashboard est un set, pas un item.
export async function getSetHeatmap({ tcg, windowDays = 30, limit = 40 }: SetHeatmapParams): Promise<SetHeatmapRow[]> {
  const rows = await sql<SetHeatmapQueryRow[]>`
    WITH cur AS (
      SELECT i.tcg, i.set_code, COUNT(*)::int4 AS vol, AVG(s.price)::float8 AS avg_price, SUM(s.price)::float8 AS total_value
      FROM sales s
      JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded'
        AND s.sale_date >= CURRENT_DATE - (${windowDays} || ' days')::interval
        AND s.sale_date < CURRENT_DATE
        AND i.set_code IS NOT NULL
        ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      GROUP BY i.tcg, i.set_code
      HAVING COUNT(*) >= ${MIN_SALES_PER_WINDOW}
    ),
    prev AS (
      SELECT i.tcg, i.set_code, COUNT(*)::int4 AS vol, AVG(s.price)::float8 AS avg_price
      FROM sales s
      JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded'
        AND s.sale_date >= CURRENT_DATE - (${windowDays * 2} || ' days')::interval
        AND s.sale_date < CURRENT_DATE - (${windowDays} || ' days')::interval
        AND i.set_code IS NOT NULL
        ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      GROUP BY i.tcg, i.set_code
      HAVING COUNT(*) >= ${MIN_SALES_PER_WINDOW}
    )
    SELECT
      cur.tcg,
      cur.set_code                                            AS "setCode",
      cur.vol                                                 AS "salesCount",
      cur.total_value                                         AS "salesValue",
      (cur.avg_price - prev.avg_price) / prev.avg_price * 100 AS "priceChangePct"
    FROM cur JOIN prev USING (tcg, set_code)
    ORDER BY cur.vol DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    tcg: r.tcg as Tcg,
    setCode: r.setCode,
    salesCount: r.salesCount,
    salesValue: r.salesValue,
    priceChangePct: r.priceChangePct,
  }));
}

export interface MonthlySalesParams {
  months?: number;
}

interface MonthlySalesQueryRow {
  tcg: string;
  month: string;
  salesCount: number;
}

// "Ventes eBay · 12 mois" du dashboard -- marketplace = 'ebay' explicitement
// (sales.marketplace vaut aussi 'tcgplayer', cf. db/schema.sql) : le libellé
// promet spécifiquement eBay, pas toutes sources confondues.
export async function getMonthlyEbaySales({ months = 12 }: MonthlySalesParams = {}): Promise<MonthlySalesPoint[]> {
  const rows = await sql<MonthlySalesQueryRow[]>`
    SELECT
      i.tcg,
      to_char(date_trunc('month', s.sale_date), 'YYYY-MM') AS month,
      COUNT(*)::int4                                       AS "salesCount"
    FROM sales s
    JOIN items i ON i.id = s.item_id
    WHERE s.marketplace = 'ebay'
      AND s.grade = 'ungraded'
      AND s.sale_date >= date_trunc('month', CURRENT_DATE) - (${months - 1} || ' months')::interval
    GROUP BY i.tcg, month
    ORDER BY month ASC
  `;

  return rows.map((r) => ({ tcg: r.tcg as Tcg, month: r.month, salesCount: r.salesCount }));
}

export interface PopulationBySetParams {
  limit?: number;
}

interface PopulationBySetQueryRow {
  tcg: string;
  setCode: string;
  popTotal: number;
  gemRatePct: number | null;
}

// "Population PSA · top 5 sets" du dashboard -- dernier instantané par item
// (DISTINCT ON, même pattern que lib/queries/populationAnalysis.ts) agrégé
// par (tcg, set_code). gem_rate = pop_grade10 / pop_total, pondéré par set
// (pas la moyenne des gem rates par carte, qui écraserait les cartes à
// faible population).
export async function getPopulationBySet({ limit = 5 }: PopulationBySetParams = {}): Promise<PopulationBySetRow[]> {
  const rows = await sql<PopulationBySetQueryRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (item_id) item_id, pop_grade10, pop_total
      FROM population_snapshots
      ORDER BY item_id, captured_at DESC
    )
    SELECT
      i.tcg,
      i.set_code                                                    AS "setCode",
      SUM(l.pop_total)::int4                                        AS "popTotal",
      (SUM(l.pop_grade10)::float8 / NULLIF(SUM(l.pop_total), 0)::float8 * 100) AS "gemRatePct"
    FROM latest l
    JOIN items i ON i.id = l.item_id
    WHERE i.set_code IS NOT NULL
    GROUP BY i.tcg, i.set_code
    ORDER BY "popTotal" DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    tcg: r.tcg as Tcg,
    setCode: r.setCode,
    popTotal: r.popTotal,
    gemRatePct: r.gemRatePct ?? 0,
  }));
}
