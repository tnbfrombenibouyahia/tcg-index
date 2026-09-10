import { unstable_cache } from "next/cache";
import sql from "@/lib/db";
import type { Tcg } from "@/lib/constants";
import { SYNC_DATA_REVALIDATE_SECONDS, SYNC_DATA_TAG } from "@/lib/queryCache";

// ─────────────────────────────────────────────────────────────────────────────
// Parcours du catalogue complet (écran Catalogue du Terminal CardQuant, cf.
// mémoire projet "cardquant-rebrand") -- distinct de
// lib/queries/items.ts::searchItems, qui exige un texte de recherche et ne
// renvoie aucun prix (utilisé par l'ancienne recherche /catalog, laissée
// intacte). Ici : filtres (jeu, langue, rareté, état brut/gradé), pagination
// serveur (41k+ items, jamais tout charger), prix + écart par carte.
//
// Le prix + l'écart ne sont calculés QUE pour les items de la page courante
// (CTE `page` en premier, les CTE de prix la rejoignent) -- coût borné à
// pageSize items quelle que soit la taille du catalogue, jamais un scan de
// price_snapshots entier.
// ─────────────────────────────────────────────────────────────────────────────

export type PriceState = "any" | "raw" | "graded";

export interface CatalogueBrowseParams {
  tcg?: Tcg;
  language?: string;
  rarity?: string;
  priceState?: PriceState;
  // Filtre posé en cliquant une tuile de la vue "Par set" (cf.
  // components/cardquant/catalogue/SetBrowser.tsx) -- set_code exact, pas de
  // recherche floue ici (celle-ci existe deja cote lib/queries/setAnalysis.ts
  // ::searchSets pour l'ecran "Analyse set").
  setCode?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogueBrowseRow {
  itemId: number;
  name: string;
  tcg: Tcg;
  category: "sealed" | "single";
  language: string;
  setCode: string | null;
  code: string | null;
  imageUrl: string | null;
  rarity: string | null;
  interestTier: string | null;
  price: number | null;
  currency: string | null;
  priceChangePct: number | null;
  // Logo du set (table `sets`, cf. ingestion/sources/pokecardex_mapping.py) --
  // null si ce set n'est pas (encore) mappé côté PokéCardex, l'UI se rabat
  // alors sur `setCode` en texte (pas de couverture garantie à 100%).
  setLogoUrl: string | null;
  // Nom du set (même JOIN que setLogoUrl, colonne en plus -- utilisé par le
  // fil d'Ariane de la navigation "poupée russe", cf.
  // components/cardquant/catalogue/CatalogueBreadcrumb.tsx) : évite une
  // requête getSetsByGeneration séparée rien que pour l'intitulé du set
  // sélectionné (view "cards" et view "sets" ne se chargent jamais
  // ensemble, cf. page.tsx).
  setName: string | null;
}

interface BrowseRow {
  itemId: number;
  name: string;
  tcg: string;
  category: string;
  language: string;
  setCode: string | null;
  code: string | null;
  imageUrl: string | null;
  rarity: string | null;
  interestTier: string | null;
  price: number | null;
  currency: string | null;
  prevPrice: number | null;
  setLogoUrl: string | null;
  setName: string | null;
}

function priceStateFragment(priceState?: PriceState) {
  if (priceState === "raw") {
    return sql`AND EXISTS (SELECT 1 FROM price_snapshots ps WHERE ps.item_id = i.id AND ps.grade = 'ungraded')`;
  }
  if (priceState === "graded") {
    return sql`AND EXISTS (SELECT 1 FROM price_snapshots ps WHERE ps.item_id = i.id AND ps.grade != 'ungraded')`;
  }
  return sql``;
}

function filterFragment({ tcg, language, rarity, priceState, setCode }: CatalogueBrowseParams) {
  return sql`
    ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
    ${language ? sql`AND i.language = ${language}` : sql``}
    ${rarity ? sql`AND i.rarity = ${rarity}` : sql``}
    ${setCode ? sql`AND i.set_code = ${setCode}` : sql``}
    ${priceStateFragment(priceState)}
  `;
}

// Mise en cache (5 min, cf. lib/queryCache.ts) : appelée à chaque
// chargement de /catalog, en concurrence avec 4 autres requêtes
// (count, options de filtres x2, badge de synchro) sur le même pool à 3
// connexions -- même levier que le dashboard/transactions/undervalued.
async function browseCatalogueUncached(params: CatalogueBrowseParams): Promise<{ rows: CatalogueBrowseRow[]; totalCount: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 30));
  const offset = (page - 1) * pageSize;
  const filter = filterFragment(params);

  const [rows, countRows] = await Promise.all([
    sql<BrowseRow[]>`
      WITH page AS (
        SELECT i.id, i.name, i.tcg, i.category, i.language, i.set_code, i.code, i.image_url, i.rarity, i.interest_tier
        FROM items i
        WHERE 1 = 1 ${filter}
        ORDER BY i.name ASC, i.id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      ),
      latest_price AS (
        SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price, ps.currency
        FROM price_snapshots ps
        JOIN page p ON p.id = ps.item_id
        WHERE ps.grade = 'ungraded'
        ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
      ),
      prev_price AS (
        SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
        FROM price_snapshots ps
        JOIN page p ON p.id = ps.item_id
        WHERE ps.grade = 'ungraded' AND ps.captured_at <= CURRENT_DATE - 30
        ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
      )
      SELECT
        p.id::int4       AS "itemId",
        p.name, p.tcg, p.category, p.language,
        p.set_code       AS "setCode",
        p.code,
        p.image_url      AS "imageUrl",
        p.rarity,
        p.interest_tier  AS "interestTier",
        lp.price,
        lp.currency,
        pv.price         AS "prevPrice",
        s.logo_url       AS "setLogoUrl",
        s.name           AS "setName"
      FROM page p
      LEFT JOIN latest_price lp ON lp.item_id = p.id
      LEFT JOIN prev_price pv ON pv.item_id = p.id
      LEFT JOIN sets s ON s.tcg = p.tcg AND s.set_code = p.set_code
      ORDER BY p.name ASC, p.id ASC
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int4 AS count FROM items i WHERE 1 = 1 ${filter}
    `,
  ]);

  return {
    totalCount: countRows[0]?.count ?? 0,
    rows: rows.map((r) => ({
      itemId: r.itemId,
      name: r.name,
      tcg: r.tcg as Tcg,
      category: r.category as "sealed" | "single",
      language: r.language,
      setCode: r.setCode,
      code: r.code,
      imageUrl: r.imageUrl,
      rarity: r.rarity,
      interestTier: r.interestTier,
      price: r.price,
      currency: r.currency,
      priceChangePct: r.price != null && r.prevPrice != null && r.prevPrice !== 0 ? ((r.price - r.prevPrice) / r.prevPrice) * 100 : null,
      setLogoUrl: r.setLogoUrl,
      setName: r.setName,
    })),
  };
}

export const browseCatalogue = unstable_cache(browseCatalogueUncached, ["catalogue-browse"], {
  revalidate: SYNC_DATA_REVALIDATE_SECONDS,
  tags: [SYNC_DATA_TAG],
});

// Options des Select "Rareté" / "Langue" -- valeurs distinctes réellement
// présentes en base plutôt qu'une liste en dur (le vocabulaire de rareté
// diverge fortement entre Pokémon et One Piece, cf. lib/constants.ts::GRADES
// pour un exemple similaire de vocabulaire non partagé).
// Mise en cache (5 min, cf. lib/queryCache.ts) : zéro paramètre, appelée à
// chaque chargement de /catalog -- le meilleur candidat possible (le
// vocabulaire de rareté/langue ne bouge qu'au rythme de l'ingestion de
// nouveaux sets, jamais en cours de journée).
async function getCatalogueFilterOptionsUncached(): Promise<{ rarities: string[]; languages: string[] }> {
  const [rarityRows, languageRows] = await Promise.all([
    sql<{ rarity: string }[]>`SELECT DISTINCT rarity FROM items WHERE rarity IS NOT NULL ORDER BY rarity`,
    sql<{ language: string }[]>`SELECT DISTINCT language FROM items ORDER BY language`,
  ]);
  return {
    rarities: rarityRows.map((r) => r.rarity),
    languages: languageRows.map((r) => r.language),
  };
}

export const getCatalogueFilterOptions = unstable_cache(getCatalogueFilterOptionsUncached, ["catalogue-filter-options"], {
  revalidate: SYNC_DATA_REVALIDATE_SECONDS,
  tags: [SYNC_DATA_TAG],
});
