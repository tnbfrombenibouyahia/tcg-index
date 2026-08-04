import sql from "@/lib/db";
import type { DivergenceRow } from "@/lib/types";
import { DIVERGENCE_WINDOWS, type DivergenceWindowDays, type Grade, type Tcg } from "@/lib/constants";

// Ré-exportées pour les Server Components qui les récupèrent déjà via ce
// module (app/divergence/page.tsx, DivergenceTable.tsx) -- sans risque
// puisqu'ils ne sont jamais bundlés côté navigateur. Les Client Components
// (DivergenceDetailModal, PriceVolumeChart, DivergenceTableBody) doivent
// importer directement depuis "@/lib/constants" à la place.
export { DIVERGENCE_WINDOWS };
export type { DivergenceWindowDays };

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
//
// Toujours filtré sur UN SEUL grade à la fois (bug corrigé après retour
// utilisateur) : sans ce filtre, une seule vente PSA10 à $500 se mélangeait
// dans la moyenne avec des ungraded à $0.05-0.18, produisant des deltas de
// prix à +220 000% -- des grades différents ne sont pas le même marché, les
// mélanger n'a pas de sens. `grade` est donc un paramètre (sélecteur
// ungraded/psa7/psa8/psa9, demande utilisateur) plutôt qu'une constante,
// mais la requête ne compare jamais deux grades entre eux.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SALES_PER_WINDOW = 3;

// Filtre par tag (demande utilisateur) : "aligned" regroupe alignedUp +
// alignedDown (cf. divergenceTag.ts côté client) -- les deux sont "confirmés"
// au même titre, la distinction up/down n'a de sens que pour l'affichage du
// badge, pas pour filtrer.
export type DivergenceTagFilter = "accumulation" | "distribution" | "aligned";

function tagFragment(tagFilter?: DivergenceTagFilter) {
  if (tagFilter === "accumulation") return sql`AND j.price_change_pct < 0 AND j.volume_change_pct >= 0`;
  if (tagFilter === "distribution") return sql`AND j.price_change_pct >= 0 AND j.volume_change_pct < 0`;
  if (tagFilter === "aligned") return sql`AND (j.price_change_pct >= 0) = (j.volume_change_pct >= 0)`;
  return sql``;
}

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
  itemId?: number;
  windowDays?: DivergenceWindowDays;
  minPrice?: number;
  tagFilter?: DivergenceTagFilter;
  grade?: Grade;
  limit?: number;
  sort?: DivergenceSort;
}

// `itemId` restreint le calcul à une seule carte (fiche carte /catalog/[id],
// cf. app/api/item-divergence) -- même requête que la page Divergence, pas
// de duplication. MIN_SALES_PER_WINDOW s'applique quand même : une carte
// avec trop peu de ventes sur l'une des deux fenêtres ne renvoie aucune
// ligne plutôt qu'un delta non fiable, cohérent avec la page liste.
export async function getDivergence({
  tcg,
  itemId,
  windowDays = 30,
  minPrice = 0,
  tagFilter,
  grade = "ungraded",
  limit = 100,
  sort,
}: DivergenceParams): Promise<DivergenceRow[]> {
  const order = orderFragment(sort);
  const tagClause = tagFragment(tagFilter);
  const itemClause = itemId ? sql`AND item_id = ${itemId}` : sql``;

  const rows = await sql<DivergenceQueryRow[]>`
    WITH cur AS (
      SELECT item_id, COUNT(*)::int AS vol, AVG(price)::float8 AS avg_price
      FROM sales
      WHERE grade = ${grade}
        AND sale_date >= CURRENT_DATE - make_interval(days => ${windowDays})
        AND sale_date < CURRENT_DATE
        ${itemClause}
      GROUP BY item_id
      HAVING COUNT(*) >= ${MIN_SALES_PER_WINDOW}
    ),
    prev AS (
      SELECT item_id, COUNT(*)::int AS vol, AVG(price)::float8 AS avg_price
      FROM sales
      WHERE grade = ${grade}
        AND sale_date >= CURRENT_DATE - make_interval(days => ${windowDays * 2})
        AND sale_date < CURRENT_DATE - make_interval(days => ${windowDays})
        ${itemClause}
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
    WHERE j.price_current >= ${minPrice}
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      ${tagClause}
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
