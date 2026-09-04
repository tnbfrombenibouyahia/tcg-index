import sql from "@/lib/db";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Écran "Analyse set" CardQuant (cf. mémoire projet "cardquant-rebrand").
//
// Limite structurelle importante, assumée partout dans ce fichier : items
// n'a ni "série" (ex. Sword & Shield) ni "génération" au sens collector --
// seul release_date existe (cf. db/schema.sql). "Génération" est donc
// redéfinie ici comme l'ANNÉE DE SORTIE du set (EXTRACT(YEAR FROM
// release_date)) -- un proxy réel mais plus grossier que le découpage par
// bloc que le mockup laissait entendre ("vs série"). Pas de comparaison "vs
// série" séparée : on ne peut pas fabriquer un rattachement set -> série
// qui n'existe dans aucune table.
// ─────────────────────────────────────────────────────────────────────────────

// Set par défaut de l'écran quand aucun `?set=` n'est fourni -- le set le
// plus échangé sur 30j, pour arriver sur un écran déjà rempli plutôt qu'un
// état vide "cherche un set" (l'utilisateur doit pouvoir en changer via la
// recherche, cf. SetSearchHeader.tsx).
export async function getMostActiveSetCode(): Promise<string | null> {
  const [row] = await sql<{ setCode: string }[]>`
    SELECT i.set_code AS "setCode"
    FROM sales s JOIN items i ON i.id = s.item_id
    WHERE s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - 30 AND i.set_code IS NOT NULL
    GROUP BY i.set_code
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `;
  return row?.setCode ?? null;
}

export interface SetSearchResult {
  setCode: string;
  tcg: Tcg;
  language: string;
  itemCount: number;
}

export async function searchSets(query: string, limit = 8): Promise<SetSearchResult[]> {
  const pattern = `%${query.trim()}%`;
  const rows = await sql<SetSearchResult[]>`
    SELECT set_code AS "setCode", tcg, language, COUNT(*)::int4 AS "itemCount"
    FROM items
    WHERE set_code IS NOT NULL AND set_code ILIKE ${pattern}
    GROUP BY set_code, tcg, language
    ORDER BY set_code ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, tcg: r.tcg as Tcg }));
}

export interface SetSummary {
  setCode: string;
  tcg: Tcg;
  language: string;
  itemCount: number;
  releaseYear: number | null;
  valueUsd: number; // somme des derniers prix bruts connus des cartes du set
  volume30d: number;
  avgRawPrice: number | null;
  avgPsa10Price: number | null;
  valueChangePct30d: number | null;
  generationAvgValue: number | null; // valeur moyenne des sets de même tcg + même année de sortie
  generationMedianValue: number | null;
  generationPeerCount: number;
}

// Un set n'existe que dans une seule langue à la fois (set_code n'est pas
// partagé EN/JP, cf. lib/queries/compareLanguage.ts) -- pas de sélecteur de
// langue sur cet écran, contrairement au mockup.
export async function getSetSummary(setCode: string): Promise<SetSummary | null> {
  const [meta] = await sql<{ tcg: string; language: string; itemCount: number; releaseYear: number | null }[]>`
    SELECT tcg, language, COUNT(*)::int4 AS "itemCount", MIN(EXTRACT(YEAR FROM release_date))::int4 AS "releaseYear"
    FROM items
    WHERE set_code = ${setCode}
    GROUP BY tcg, language
  `;
  if (!meta) return null;

  const [valueRow] = await sql<{ valueUsd: number; avgRawPrice: number | null; avgPsa10Price: number | null }[]>`
    WITH latest_raw AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN items i ON i.id = ps.item_id
      WHERE i.set_code = ${setCode} AND ps.grade = 'ungraded'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    ), latest_psa10 AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN items i ON i.id = ps.item_id
      WHERE i.set_code = ${setCode} AND ps.grade = 'psa10'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    )
    SELECT
      COALESCE((SELECT SUM(price) FROM latest_raw), 0)::float8 AS "valueUsd",
      (SELECT AVG(price) FROM latest_raw)::float8 AS "avgRawPrice",
      (SELECT AVG(price) FROM latest_psa10)::float8 AS "avgPsa10Price"
  `;

  const [volumeRow] = await sql<{ volume30d: number }[]>`
    SELECT COUNT(*)::int4 AS "volume30d"
    FROM sales s JOIN items i ON i.id = s.item_id
    WHERE i.set_code = ${setCode} AND s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - 30
  `;

  // Valeur du set il y a ~30j : même somme, mais au prix ungraded le plus
  // proche AVANT la coupure -- même principe que
  // lib/queries/catalogueBrowse.ts (cur/prev), à l'échelle du set entier.
  const [prevValueRow] = await sql<{ prevValueUsd: number }[]>`
    WITH prev_raw AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN items i ON i.id = ps.item_id
      WHERE i.set_code = ${setCode} AND ps.grade = 'ungraded' AND ps.captured_at <= CURRENT_DATE - 30
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    )
    SELECT COALESCE(SUM(price), 0)::float8 AS "prevValueUsd" FROM prev_raw
  `;

  let generationAvgValue: number | null = null;
  let generationMedianValue: number | null = null;
  let generationPeerCount = 0;
  if (meta.releaseYear != null) {
    const peerRows = await sql<{ setCode: string; value: number }[]>`
      WITH peer_sets AS (
        SELECT DISTINCT set_code
        FROM items
        WHERE tcg = ${meta.tcg} AND set_code != ${setCode} AND EXTRACT(YEAR FROM release_date)::int4 = ${meta.releaseYear}
      ),
      latest AS (
        SELECT DISTINCT ON (ps.item_id) ps.item_id, i.set_code, ps.price::float8 AS price
        FROM price_snapshots ps
        JOIN items i ON i.id = ps.item_id
        JOIN peer_sets p ON p.set_code = i.set_code
        WHERE ps.grade = 'ungraded'
        ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
      )
      SELECT set_code AS "setCode", SUM(price)::float8 AS value FROM latest GROUP BY set_code
    `;
    generationPeerCount = peerRows.length;
    if (peerRows.length > 0) {
      const values = peerRows.map((r) => r.value).sort((a, b) => a - b);
      generationAvgValue = values.reduce((a, b) => a + b, 0) / values.length;
      const mid = Math.floor(values.length / 2);
      generationMedianValue = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
    }
  }

  const valueUsd = valueRow?.valueUsd ?? 0;
  const prevValueUsd = prevValueRow?.prevValueUsd ?? 0;

  return {
    setCode,
    tcg: meta.tcg as Tcg,
    language: meta.language,
    itemCount: meta.itemCount,
    releaseYear: meta.releaseYear,
    valueUsd,
    volume30d: volumeRow?.volume30d ?? 0,
    avgRawPrice: valueRow?.avgRawPrice ?? null,
    avgPsa10Price: valueRow?.avgPsa10Price ?? null,
    valueChangePct30d: prevValueUsd > 0 ? ((valueUsd - prevValueUsd) / prevValueUsd) * 100 : null,
    generationAvgValue,
    generationMedianValue,
    generationPeerCount,
  };
}

export interface SetTopCardRow {
  itemId: number;
  name: string;
  volume: number;
  psa10Price: number | null;
  rawPrice: number | null;
  psa10ChangePct: number | null;
}

export async function getSetTopCards(setCode: string, { sortBy = "volume", windowDays = 30, limit = 20 }: { sortBy?: "volume" | "price"; windowDays?: number; limit?: number } = {}): Promise<SetTopCardRow[]> {
  const rows = await sql<{ itemId: number; name: string; volume: number; rawPrice: number | null; psa10Price: number | null; prevPsa10Price: number | null }[]>`
    WITH set_items AS (
      SELECT id, name FROM items WHERE set_code = ${setCode} AND category = 'single'
    ),
    vol AS (
      SELECT item_id, COUNT(*)::int4 AS volume
      FROM sales s JOIN set_items si ON si.id = s.item_id
      WHERE s.grade = 'ungraded' AND s.sale_date >= CURRENT_DATE - ${windowDays}
      GROUP BY item_id
    ),
    raw_price AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN set_items si ON si.id = ps.item_id
      WHERE ps.grade = 'ungraded'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    ),
    psa10_now AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN set_items si ON si.id = ps.item_id
      WHERE ps.grade = 'psa10'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    ),
    psa10_prev AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, ps.price::float8 AS price
      FROM price_snapshots ps JOIN set_items si ON si.id = ps.item_id
      WHERE ps.grade = 'psa10' AND ps.captured_at <= CURRENT_DATE - ${windowDays}
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    )
    SELECT
      si.id AS "itemId", si.name,
      COALESCE(vol.volume, 0) AS volume,
      raw_price.price AS "rawPrice",
      psa10_now.price AS "psa10Price",
      psa10_prev.price AS "prevPsa10Price"
    FROM set_items si
    LEFT JOIN vol ON vol.item_id = si.id
    LEFT JOIN raw_price ON raw_price.item_id = si.id
    LEFT JOIN psa10_now ON psa10_now.item_id = si.id
    LEFT JOIN psa10_prev ON psa10_prev.item_id = si.id
    WHERE raw_price.price IS NOT NULL OR psa10_now.price IS NOT NULL OR COALESCE(vol.volume, 0) > 0
    ORDER BY ${sortBy === "price" ? sql`COALESCE(psa10_now.price, raw_price.price, 0) DESC` : sql`COALESCE(vol.volume, 0) DESC`}
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    itemId: r.itemId,
    name: r.name,
    volume: r.volume,
    psa10Price: r.psa10Price,
    rawPrice: r.rawPrice,
    psa10ChangePct: r.psa10Price != null && r.prevPsa10Price != null && r.prevPsa10Price !== 0 ? ((r.psa10Price - r.prevPsa10Price) / r.prevPsa10Price) * 100 : null,
  }));
}

export interface SealedByGeneration {
  releaseYear: number;
  avgSealedPrice: number;
  changePct: number | null;
}

// "Prix moyen du scellé par génération" -- toutes les sorties confondues
// (les deux tcg), le composant sépare visuellement. Comparaison à la
// période équivalente 30j avant, même prix moyen recalculé -- proxy grossier
// mais réel (pas une tendance annuelle, juste "ce mois-ci vs le mois dernier"
// pour ce panier de sets anciens).
export async function getSealedPriceByGeneration(tcg: Tcg): Promise<SealedByGeneration[]> {
  const rows = await sql<{ releaseYear: number; avgSealedPrice: number; prevAvg: number | null }[]>`
    WITH sealed AS (
      SELECT id, EXTRACT(YEAR FROM release_date)::int4 AS release_year
      FROM items WHERE tcg = ${tcg} AND category = 'sealed' AND release_date IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, s.release_year, ps.price::float8 AS price
      FROM price_snapshots ps JOIN sealed s ON s.id = ps.item_id
      WHERE ps.grade = 'ungraded'
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    ),
    prev AS (
      SELECT DISTINCT ON (ps.item_id) ps.item_id, s.release_year, ps.price::float8 AS price
      FROM price_snapshots ps JOIN sealed s ON s.id = ps.item_id
      WHERE ps.grade = 'ungraded' AND ps.captured_at <= CURRENT_DATE - 30
      ORDER BY ps.item_id, ps.captured_at DESC, ps.created_at DESC
    )
    SELECT
      latest.release_year AS "releaseYear",
      AVG(latest.price)::float8 AS "avgSealedPrice",
      (SELECT AVG(price) FROM prev WHERE prev.release_year = latest.release_year)::float8 AS "prevAvg"
    FROM latest
    GROUP BY latest.release_year
    ORDER BY latest.release_year DESC
  `;
  return rows.map((r) => ({
    releaseYear: r.releaseYear,
    avgSealedPrice: r.avgSealedPrice,
    changePct: r.prevAvg != null && r.prevAvg !== 0 ? ((r.avgSealedPrice - r.prevAvg) / r.prevAvg) * 100 : null,
  }));
}
