import sql from "@/lib/db";
import type { ItemDetail, ItemPriceEntry, SealedEvCalc, UndervaluedCalc } from "@/lib/types";
import type { Grade, Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Fiche carte / "analyse totale" (page /catalog/[id]) : une seule fonction qui
// rassemble tout ce qu'on sait sur un item -- prix courant par grade,
// éventuel score de sous-évaluation (singles) et éventuel ratio EV scellé
// (si l'item est le Booster Box suivi de son set). Undervalued/sealed_ev
// n'existent que pour un sous-ensemble d'items (cf. leurs tables respectives)
// -- toujours nullable côté appelant plutôt qu'une jointure qui forcerait un
// item sans calcul à disparaître du résultat.
// ─────────────────────────────────────────────────────────────────────────────

interface ItemRow {
  id: number;
  name: string;
  tcg: string;
  category: string;
  setCode: string | null;
  code: string | null;
  imageUrl: string | null;
  language: string;
  rarity: string | null;
  releaseDate: string | null;
}

export async function getItemById(itemId: number): Promise<ItemDetail | null> {
  const [itemRows, priceRows, undervaluedRows, sealedEvRows] = await Promise.all([
    sql<ItemRow[]>`
      SELECT
        id::int4 AS id, name, tcg, category,
        set_code AS "setCode", code, image_url AS "imageUrl", language, rarity,
        release_date::text AS "releaseDate"
      FROM items
      WHERE id = ${itemId}
      LIMIT 1
    `,
    // Un prix par grade -- le plus récent (captured_at, puis created_at pour
    // départager deux sources écrites le même jour, cf. UNIQUE(item_id,
    // captured_at, source, grade) dans le schéma : plusieurs lignes possibles
    // par grade/jour, une par source).
    sql<ItemPriceEntry[]>`
      SELECT DISTINCT ON (grade)
        grade, price::float8 AS price, currency, captured_at::text AS "capturedAt",
        volume, source
      FROM price_snapshots
      WHERE item_id = ${itemId}
      ORDER BY grade, captured_at DESC, created_at DESC
    `,
    sql<UndervaluedCalc[]>`
      SELECT
        captured_at::text AS "capturedAt",
        pack_price::float8 AS "packPrice",
        pull_rate::float8 AS "pullRate",
        pull_cost::float8 AS "pullCost",
        character_multiplier::float8 AS "characterMultiplier",
        theoretical_value::float8 AS "theoreticalValue",
        market_price::float8 AS "marketPrice",
        undervalued_score::float8 AS "undervaluedScore"
      FROM undervalued_scores
      WHERE item_id = ${itemId}
      ORDER BY captured_at DESC
      LIMIT 1
    `,
    sql<SealedEvCalc[]>`
      SELECT
        captured_at::text AS "capturedAt",
        box_price::float8 AS "boxPrice",
        box_price_source AS "boxPriceSource",
        box_sales_used::int4 AS "boxSalesUsed",
        box_reliability_score::float8 AS "boxReliabilityScore",
        singles_count::int4 AS "singlesCount",
        singles_total_value::float8 AS "singlesTotalValue",
        singles_top10_value::float8 AS "singlesTop10Value",
        ev_ratio_total::float8 AS "evRatioTotal",
        ev_ratio_top10::float8 AS "evRatioTop10"
      FROM sealed_ev
      WHERE item_id = ${itemId}
      ORDER BY captured_at DESC
      LIMIT 1
    `,
  ]);

  const item = itemRows[0];
  if (!item) return null;

  return {
    id: item.id,
    name: item.name,
    tcg: item.tcg as Tcg,
    category: item.category as ItemDetail["category"],
    setCode: item.setCode,
    code: item.code,
    imageUrl: item.imageUrl,
    language: item.language,
    rarity: item.rarity,
    releaseDate: item.releaseDate,
    latestPrices: priceRows.map((r) => ({ ...r, grade: r.grade as Grade })),
    undervalued: undervaluedRows[0] ?? null,
    sealedEv: sealedEvRows[0] ?? null,
  };
}

export interface PriceHistoryPoint {
  capturedAt: string;
  price: number;
}

// Historique complet (pas de fenêtre de jours) : à l'échelle d'un seul item,
// price_snapshots ne représente que quelques centaines de lignes par grade
// au pire -- pas besoin de paginer, le sélecteur de plage côté client
// (IndexChart, réutilisé tel quel) filtre déjà dans le navigateur.
// AVG(price) sur le jour : plusieurs sources (justtcg, pricecharting)
// peuvent écrire le même item/jour/grade -- moyenne plutôt qu'un choix
// arbitraire entre les deux.
export async function getItemPriceHistory(itemId: number, grade: Grade): Promise<PriceHistoryPoint[]> {
  const rows = await sql<PriceHistoryPoint[]>`
    SELECT captured_at::text AS "capturedAt", AVG(price)::float8 AS price
    FROM price_snapshots
    WHERE item_id = ${itemId} AND grade = ${grade}
    GROUP BY captured_at
    ORDER BY captured_at ASC
  `;
  return rows;
}
