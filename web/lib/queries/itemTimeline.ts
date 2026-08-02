import sql from "@/lib/db";
import type { DailyTimelinePoint } from "@/lib/types";

// Série quotidienne complète (jours sans vente inclus, à 0) pour le graphique
// prix+volume de la modale de détail Divergence -- generate_series calendrier
// LEFT JOIN les ventes agrégées par jour, plutôt que de ne renvoyer que les
// jours ayant une vente (sinon les barres de volume ne montreraient jamais un
// vrai "creux"). Scope ungraded uniquement, comme lib/queries/divergence.ts
// (même raison : mélanger les grades produit des moyennes sans queue ni tête).
//
// `DailyTimelinePoint` vit dans lib/types.ts (pas ici) : PriceVolumeChart
// (Client Component) doit pouvoir importer le type sans tirer `sql` (postgres
// -> fs) dans le bundle navigateur -- même piège que DIVERGENCE_WINDOWS
// (cf. lib/constants.ts).
export async function getItemDailyTimeline(itemId: number, windowDays: number): Promise<DailyTimelinePoint[]> {
  const rows = await sql<DailyTimelinePoint[]>`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - make_interval(days => ${windowDays - 1}),
        CURRENT_DATE,
        interval '1 day'
      )::date AS d
    ),
    daily AS (
      SELECT sale_date AS d, COUNT(*)::int AS cnt, AVG(price)::float8 AS avg_price
      FROM sales
      WHERE item_id = ${itemId}
        AND grade = 'ungraded'
        AND sale_date >= CURRENT_DATE - make_interval(days => ${windowDays - 1})
        AND sale_date <= CURRENT_DATE
      GROUP BY sale_date
    )
    SELECT
      days.d::text                    AS date,
      COALESCE(daily.cnt, 0)::int      AS count,
      daily.avg_price                  AS "avgPrice"
    FROM days
    LEFT JOIN daily ON daily.d = days.d
    ORDER BY days.d
  `;

  return rows;
}
