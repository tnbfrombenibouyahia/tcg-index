import sql from "@/lib/db";
import type { DivergenceRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Divergence volume/prix (demande utilisateur) : compare deux fenêtres
// glissantes de même longueur (période courante vs période précédente) sur le
// nombre de ventes et le prix moyen d'une carte. Idée : un prix qui monte
// alors que le volume baisse (ou l'inverse) est moins "confirmé" qu'un
// mouvement où les deux vont dans le même sens.
//
// Comparaison jour par jour écartée volontairement : au niveau carte, `sales`
// est trop clairsemé (beaucoup de cartes ont 0 vente certains jours) pour
// qu'une courbe journalière veuille dire quelque chose -- deux fenêtres
// agrégées (7/15/30/90/180j) lissent ce bruit. MIN_SALES_PER_WINDOW écarte
// les cartes qui n'ont presque pas de ventes dans l'une des deux fenêtres
// (sinon une carte à 1 vente vs 2 ventes afficherait un delta de +100%
// dénué de sens) -- vérifié empiriquement : avec un seuil de 3, entre ~4100
// (fenêtre 7j) et ~9700 (30j/90j) cartes qualifient sur les deux fenêtres à
// la fois, largement assez pour peupler la page à toutes les granularités.
// ─────────────────────────────────────────────────────────────────────────────

export const DIVERGENCE_WINDOWS = [7, 15, 30, 90, 180] as const;
export type DivergenceWindowDays = (typeof DIVERGENCE_WINDOWS)[number];

const MIN_SALES_PER_WINDOW = 3;

export type DivergenceSort =
  | "divergence_desc"
  | "divergence_asc"
  | "price_delta_desc"
  | "price_delta_asc"
  | "volume_delta_desc"
  | "volume_delta_asc"
  | "language_asc"
  | "language_desc";

// Les colonnes/directions de tri ne peuvent pas être paramétrées via ${...}
// (cf. lib/queries/sales.ts) -- enum fermé plutôt qu'un nom de colonne libre.
// `j.` = alias de la CTE `joined` ci-dessous (même pattern que `l.` dans
// lib/queries/undervalued.ts) : les colonnes snake_case y restent adressables
// même si la SELECT finale les expose en camelCase.
function orderFragment(sort?: DivergenceSort) {
  if (sort === "divergence_desc") return sql`ORDER BY j.divergence_score DESC`;
  if (sort === "divergence_asc") return sql`ORDER BY j.divergence_score ASC`;
  if (sort === "price_delta_desc") return sql`ORDER BY j.price_change_pct DESC`;
  if (sort === "price_delta_asc") return sql`ORDER BY j.price_change_pct ASC`;
  if (sort === "volume_delta_desc") return sql`ORDER BY j.volume_change_pct DESC`;
  if (sort === "volume_delta_asc") return sql`ORDER BY j.volume_change_pct ASC`;
  if (sort === "language_asc") return sql`ORDER BY i.language ASC, ABS(j.divergence_score) DESC`;
  if (sort === "language_desc") return sql`ORDER BY i.language DESC, ABS(j.divergence_score) DESC`;
  // Défaut : les divergences les plus extrêmes en premier, positives ou
  // négatives confondues -- les deux sens sont également notables (rally
  // sans volume / vente confirmée par le volume).
  return sql`ORDER BY ABS(j.divergence_score) DESC`;
}

interface DivergenceQueryRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  rarity: string | null;
  volumeCurrent: number;
  volumePrevious: number;
  priceCurrent: number;
  pricePrevious: number;
  priceChangePct: number;
  volumeChangePct: number;
  divergenceScore: number;
}

export interface DivergenceParams {
  tcg?: Tcg;
  windowDays?: DivergenceWindowDays;
  limit?: number;
  sort?: DivergenceSort;
}

export async function getDivergence({
  tcg,
  windowDays = 30,
  limit = 100,
  sort,
}: DivergenceParams): Promise<DivergenceRow[]> {
  const order = orderFragment(sort);

  const rows = await sql<DivergenceQueryRow[]>`
    WITH cur AS (
      SELECT item_id, COUNT(*)::int AS vol, AVG(price)::float8 AS avg_price
      FROM sales
      WHERE sale_date >= CURRENT_DATE - make_interval(days => ${windowDays})
        AND sale_date < CURRENT_DATE
      GROUP BY item_id
      HAVING COUNT(*) >= ${MIN_SALES_PER_WINDOW}
    ),
    prev AS (
      SELECT item_id, COUNT(*)::int AS vol, AVG(price)::float8 AS avg_price
      FROM sales
      WHERE sale_date >= CURRENT_DATE - make_interval(days => ${windowDays * 2})
        AND sale_date < CURRENT_DATE - make_interval(days => ${windowDays})
      GROUP BY item_id
      HAVING COUNT(*) >= ${MIN_SALES_PER_WINDOW}
    ),
    joined AS (
      SELECT
        cur.item_id,
        cur.vol AS volume_current,
        prev.vol AS volume_previous,
        cur.avg_price AS price_current,
        prev.avg_price AS price_previous,
        (cur.avg_price - prev.avg_price) / prev.avg_price * 100 AS price_change_pct,
        (cur.vol - prev.vol)::float8 / prev.vol * 100 AS volume_change_pct,
        ((cur.avg_price - prev.avg_price) / prev.avg_price * 100)
          - ((cur.vol - prev.vol)::float8 / prev.vol * 100) AS divergence_score
      FROM cur
      JOIN prev USING (item_id)
    )
    SELECT
      j.item_id::int         AS "itemId",
      i.name,
      i.image_url            AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code              AS "setCode",
      i.rarity,
      j.volume_current        AS "volumeCurrent",
      j.volume_previous       AS "volumePrevious",
      j.price_current         AS "priceCurrent",
      j.price_previous        AS "pricePrevious",
      j.price_change_pct      AS "priceChangePct",
      j.volume_change_pct     AS "volumeChangePct",
      j.divergence_score      AS "divergenceScore"
    FROM joined j
    JOIN items i ON i.id = j.item_id
    WHERE 1=1
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
    ${order}
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    itemId: r.itemId,
    name: r.name,
    imageUrl: r.imageUrl,
    tcg: r.tcg as Tcg,
    language: r.language,
    setCode: r.setCode,
    rarity: r.rarity,
    volumeCurrent: r.volumeCurrent,
    volumePrevious: r.volumePrevious,
    priceCurrent: r.priceCurrent,
    pricePrevious: r.pricePrevious,
    priceChangePct: r.priceChangePct,
    volumeChangePct: r.volumeChangePct,
    divergenceScore: r.divergenceScore,
  }));
}
