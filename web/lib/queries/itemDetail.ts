import sql from "@/lib/db";
import type { ItemDetail, ItemPriceEntry, LiquidityCalc, PopulationCalc, SealedEvCalc, UndervaluedCalc } from "@/lib/types";
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
  interestTier: string | null;
  releaseDate: string | null;
}

interface LiquidityRow {
  capturedAt: string;
  listingCount: number;
  salesCount30d: number;
  salesCount90d: number;
}

export async function getItemById(itemId: number): Promise<ItemDetail | null> {
  const [itemRows, priceRows, undervaluedRows, sealedEvRows, liquidityRows, populationRows] = await Promise.all([
    sql<ItemRow[]>`
      SELECT
        id::int4 AS id, name, tcg, category,
        set_code AS "setCode", code, image_url AS "imageUrl", language, rarity,
        interest_tier AS "interestTier",
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
    // Dernier instantané `active_listings` (stock) + comptage `sales` sur
    // 30j/90j (flux) en un aller-retour -- `latest_listing` n'a une ligne
    // que si l'item a jamais été synchronisé côté eBay (scellé EN, cf.
    // ebay.py), donc pas de ligne du tout = pas de bloc Liquidité affiché
    // (géré ci-dessous, pas ici). `sales_counts` a toujours exactement une
    // ligne (agrégat avec FILTER), d'où le LEFT JOIN ON true plutôt qu'un
    // JOIN classique qui perdrait `latest_listing` si aucune vente récente.
    sql<LiquidityRow[]>`
      WITH latest_listing AS (
        SELECT captured_at, listing_count
        FROM active_listings
        WHERE item_id = ${itemId}
        ORDER BY captured_at DESC
        LIMIT 1
      ), sales_counts AS (
        SELECT
          count(*) FILTER (WHERE sale_date >= current_date - interval '30 days') AS sales_30d,
          count(*) FILTER (WHERE sale_date >= current_date - interval '90 days') AS sales_90d
        FROM sales
        WHERE item_id = ${itemId} AND sale_date >= current_date - interval '90 days'
      )
      SELECT
        latest_listing.captured_at::text AS "capturedAt",
        latest_listing.listing_count::int4 AS "listingCount",
        COALESCE(sales_counts.sales_30d, 0)::int4 AS "salesCount30d",
        COALESCE(sales_counts.sales_90d, 0)::int4 AS "salesCount90d"
      FROM latest_listing
      LEFT JOIN sales_counts ON true
    `,
    sql<PopulationCalc[]>`
      SELECT
        captured_at::text AS "capturedAt",
        pop_grade6::int4 AS "popGrade6",
        pop_grade7::int4 AS "popGrade7",
        pop_grade8::int4 AS "popGrade8",
        pop_grade9::int4 AS "popGrade9",
        pop_grade10::int4 AS "popGrade10",
        pop_total::int4 AS "popTotal"
      FROM population_snapshots
      WHERE item_id = ${itemId}
      ORDER BY captured_at DESC
      LIMIT 1
    `,
  ]);

  const item = itemRows[0];
  if (!item) return null;

  // Bloc affiché seulement quand les deux signaux existent pour cet item
  // (stock ET flux) -- sinon un ratio à 0% serait trompeur (pas "personne
  // n'achète", juste "pas encore mesuré"), cf. discussion feature liquidité.
  // listingCount > 0 exigé aussi : sinon un item jamais listé sur eBay dans
  // les catégories interrogées (ex. One Piece "DON!! Card") produit un faux
  // 100% d'écoulement plutôt qu'un vrai signal -- cf. lib/queries/liquidity.ts.
  // One Piece scellé restreint aux Booster Box (même filtre que
  // getLiquidity/getLiquidityCount, cf. leurs commentaires) -- une DON!!
  // Card ne doit pas afficher ce bloc sur sa propre fiche non plus.
  const isEligibleForLiquidity = item.tcg !== "one-piece" || item.name.includes("Booster Box");
  const liquidityRow = liquidityRows[0];
  const liquidity: LiquidityCalc | null =
    isEligibleForLiquidity && liquidityRow && liquidityRow.salesCount90d > 0 && liquidityRow.listingCount > 0
      ? {
          capturedAt: liquidityRow.capturedAt,
          listingCount: liquidityRow.listingCount,
          salesCount30d: liquidityRow.salesCount30d,
          salesCount90d: liquidityRow.salesCount90d,
          sellThroughRate30d:
            liquidityRow.salesCount30d + liquidityRow.listingCount > 0
              ? liquidityRow.salesCount30d / (liquidityRow.salesCount30d + liquidityRow.listingCount)
              : null,
        }
      : null;

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
    interestTier: item.interestTier,
    releaseDate: item.releaseDate,
    latestPrices: priceRows.map((r) => ({ ...r, grade: r.grade as Grade })),
    undervalued: undervaluedRows[0] ?? null,
    sealedEv: sealedEvRows[0] ?? null,
    liquidity,
    population: populationRows[0] ?? null,
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

export interface MonthlySalesCount {
  month: string; // "YYYY-MM"
  salesCount: number;
}

// Panneau "Liquidité et exécution" de la fiche carte CardQuant (cf. mémoire
// projet "cardquant-rebrand") : ventes conclues par mois, toutes sources et
// tous grades confondus -- contrairement à liquidity/sellThroughRate30d
// (LiquidityCalc, ci-dessus), qui n'existe que pour le scellé EN (cf.
// lib/queries/liquidity.ts), `sales` couvre aussi bien les singles -- ce
// graphique reste donc affichable même quand `item.liquidity` est null.
export async function getItemMonthlySales(itemId: number, months = 12): Promise<MonthlySalesCount[]> {
  const rows = await sql<MonthlySalesCount[]>`
    SELECT to_char(date_trunc('month', sale_date), 'YYYY-MM') AS month, COUNT(*)::int4 AS "salesCount"
    FROM sales
    WHERE item_id = ${itemId} AND sale_date >= date_trunc('month', CURRENT_DATE) - (${months - 1} || ' months')::interval
    GROUP BY month
    ORDER BY month ASC
  `;
  return rows;
}
