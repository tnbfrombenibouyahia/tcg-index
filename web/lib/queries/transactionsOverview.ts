import sql from "@/lib/db";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Agrégats dédiés à l'écran Transactions CardQuant (cf. mémoire projet
// "cardquant-rebrand") : lib/queries/sales.ts::getSales reste la source pour
// la table paginée/filtrée (Dernières ventes), mais rien n'y agrège par
// tcg/langue/set/année/heure -- regroupé ici comme
// lib/queries/dashboardOverview.ts pour le Dashboard.
//
// Toutes les requêtes filtrent grade = 'ungraded' (cohérence avec
// divergence.ts/gradingRoi.ts -- mélanger les grades fausse les agrégats de
// valeur, cf. leur commentaire) et s'appuient sur idx_sales_grade_date
// (grade, sale_date) pour éviter un scan des 1M+ lignes de `sales`.
//
// `CURRENT_DATE - ${windowDays}::int` -- le `::int` est obligatoire : postgres.js
// envoie un nombre JS interpolé avec un type de paramètre "unknown" (cf.
// node_modules/postgres/cjs/src/types.js, `number: { to: 0, ... }`), et
// l'opérateur `-` a plusieurs surcharges pour `date` (date, integer, interval)
// -- Postgres ne peut pas lever l'ambiguïté tout seul et rejette la requête
// ("operator does not exist: date >= integer"), plantage SYSTÉMATIQUE de
// /transactions (confirmé via les runtime errors Vercel du 2026-09-04, un
// reload ne change rien). divergence.ts/dashboardOverview.ts contournent
// pareil avec `(${windowDays} || ' days')::interval` -- les deux formes
// marchent, celle-ci change moins le type de retour (reste `date`, pas
// `timestamp`). Repéré aussi dans setAnalysis.ts::getSetTopCards, même bug,
// même fix.
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesKpis {
  count24h: number;
  value24h: number;
  avgPrice24h: number;
  maxPrice24h: number;
  count7d: number;
}

export async function getSalesKpis(): Promise<SalesKpis> {
  const [row] = await sql<SalesKpis[]>`
    SELECT
      COUNT(*) FILTER (WHERE sale_date >= CURRENT_DATE - 1)::int4                                AS "count24h",
      COALESCE(SUM(price) FILTER (WHERE sale_date >= CURRENT_DATE - 1), 0)::float8                AS "value24h",
      COALESCE(AVG(price) FILTER (WHERE sale_date >= CURRENT_DATE - 1), 0)::float8                AS "avgPrice24h",
      COALESCE(MAX(price) FILTER (WHERE sale_date >= CURRENT_DATE - 1), 0)::float8                AS "maxPrice24h",
      COUNT(*) FILTER (WHERE sale_date >= CURRENT_DATE - 7)::int4                                 AS "count7d"
    FROM sales
    WHERE grade = 'ungraded' AND sale_date >= CURRENT_DATE - 7
  `;
  return row ?? { count24h: 0, value24h: 0, avgPrice24h: 0, maxPrice24h: 0, count7d: 0 };
}

export interface BreakdownSlice {
  key: string;
  count: number;
  value: number;
}

// Répartition par tcg et par langue sur une fenêtre glissante -- alimente
// les deux donuts "Analyse en Volume/Valeur" (le composant choisit `count`
// ou `value` selon l'onglet actif, calculées ici en une seule requête).
export async function getSalesBreakdown(windowDays = 30): Promise<{ byTcg: BreakdownSlice[]; byLanguage: BreakdownSlice[] }> {
  const [tcgRows, langRows] = await Promise.all([
    sql<BreakdownSlice[]>`
      SELECT i.tcg AS key, COUNT(*)::int4 AS count, COALESCE(SUM(s.price), 0)::float8 AS value
      FROM sales s JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - ${windowDays}::int
      GROUP BY i.tcg
    `,
    sql<BreakdownSlice[]>`
      SELECT i.language AS key, COUNT(*)::int4 AS count, COALESCE(SUM(s.price), 0)::float8 AS value
      FROM sales s JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - ${windowDays}::int
      GROUP BY i.language
    `,
  ]);
  return { byTcg: tcgRows, byLanguage: langRows };
}

export interface TopSetRow {
  tcg: Tcg;
  setCode: string;
  releaseYear: number | null;
  count: number;
  value: number;
  changePct: number | null; // évolution du volume vs la fenêtre précédente de même longueur
}

export async function getTopSetsBySales({ windowDays = 30, limit = 10 }: { windowDays?: number; limit?: number } = {}): Promise<TopSetRow[]> {
  const rows = await sql<
    { tcg: string; setCode: string; releaseYear: number | null; count: number; value: number; prevCount: number }[]
  >`
    WITH cur AS (
      SELECT i.tcg, i.set_code, MIN(EXTRACT(YEAR FROM i.release_date))::int4 AS release_year,
        COUNT(*)::int4 AS count, COALESCE(SUM(s.price), 0)::float8 AS value
      FROM sales s JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - ${windowDays}::int AND i.set_code IS NOT NULL
      GROUP BY i.tcg, i.set_code
    ),
    prev AS (
      SELECT i.tcg, i.set_code, COUNT(*)::int4 AS count
      FROM sales s JOIN items i ON i.id = s.item_id
      WHERE s.grade = 'ungraded'
        AND s.sale_date >= CURRENT_DATE - ${windowDays * 2}::int AND s.sale_date < CURRENT_DATE - ${windowDays}::int
        AND i.set_code IS NOT NULL
      GROUP BY i.tcg, i.set_code
    )
    SELECT cur.tcg, cur.set_code AS "setCode", cur.release_year AS "releaseYear", cur.count, cur.value,
      COALESCE(prev.count, 0) AS "prevCount"
    FROM cur LEFT JOIN prev ON prev.tcg = cur.tcg AND prev.set_code = cur.set_code
    ORDER BY cur.count DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    tcg: r.tcg as Tcg,
    setCode: r.setCode,
    releaseYear: r.releaseYear,
    count: r.count,
    value: r.value,
    changePct: r.prevCount > 0 ? ((r.count - r.prevCount) / r.prevCount) * 100 : null,
  }));
}

export interface YearlyVolume {
  year: number;
  tcg: Tcg;
  count: number;
  value: number;
}

// Toute la profondeur d'historique disponible (pas de fenêtre de jours) --
// une carte par année de sortie de set, pas une tendance récente.
export async function getSalesByReleaseYear(): Promise<YearlyVolume[]> {
  const rows = await sql<{ year: number; tcg: string; count: number; value: number }[]>`
    SELECT EXTRACT(YEAR FROM i.release_date)::int4 AS year, i.tcg, COUNT(*)::int4 AS count, COALESCE(SUM(s.price), 0)::float8 AS value
    FROM sales s JOIN items i ON i.id = s.item_id
    WHERE s.grade = 'ungraded' AND i.release_date IS NOT NULL
    GROUP BY year, i.tcg
    ORDER BY year ASC
  `;
  return rows.map((r) => ({ year: r.year, tcg: r.tcg as Tcg, count: r.count, value: r.value }));
}

export interface HourlyVolume {
  hour: string; // "YYYY-MM-DDTHH"
  count: number;
  value: number;
}

export async function getHourlyVolume(hours = 24): Promise<HourlyVolume[]> {
  const rows = await sql<{ hour: string; count: number; value: number }[]>`
    SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24') AS hour,
      COUNT(*)::int4 AS count, COALESCE(SUM(price), 0)::float8 AS value
    FROM sales
    WHERE grade = 'ungraded' AND created_at >= now() - (${hours} || ' hours')::interval
    GROUP BY hour
    ORDER BY hour ASC
  `;
  return rows;
}
