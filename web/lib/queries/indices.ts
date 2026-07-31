import sql from "@/lib/db";
import { INDEX_CODES, INDEX_DEFINITIONS } from "@/lib/constants";
import type { IndexPoint, IndexSummary, IndicesResponse, VolumePoint } from "@/lib/types";

// Toutes les dates sont castées ::text en SQL plutôt que laissées en DATE --
// postgres.js convertirait sinon en objet JS Date, ambigu sur le fuseau pour
// une colonne DATE (sans heure). ::text donne un 'YYYY-MM-DD' sans ambiguïté.
// Pareil pour NUMERIC -> ::float8 : évite un parseFloat manuel côté JS.

interface IndexValueRow {
  indexCode: string;
  capturedAt: string;
  value: number;
  constituents: number;
}

interface VolumeRow {
  indexCode: string;
  capturedAt: string;
  salesCount: number;
  salesValue: number;
}

function toPoint(row: IndexValueRow): IndexPoint {
  return { capturedAt: row.capturedAt, value: row.value, constituents: row.constituents };
}

function toVolumePoint(row: VolumeRow): VolumePoint {
  return { capturedAt: row.capturedAt, salesCount: row.salesCount, salesValue: row.salesValue };
}

export async function getAllIndices(days = 180): Promise<IndicesResponse> {
  const [rankedRows, historyRows, volumeRows] = await Promise.all([
    sql<(IndexValueRow & { rn: number })[]>`
      WITH ranked AS (
        SELECT
          index_code AS "indexCode",
          captured_at::text AS "capturedAt",
          value::float8 AS value,
          constituents,
          ROW_NUMBER() OVER (PARTITION BY index_code ORDER BY captured_at DESC) AS rn
        FROM index_values
        WHERE index_code = ANY(${INDEX_CODES})
      )
      SELECT * FROM ranked WHERE rn <= 2 ORDER BY "indexCode", "capturedAt" DESC
    `,
    sql<IndexValueRow[]>`
      SELECT
        index_code AS "indexCode",
        captured_at::text AS "capturedAt",
        value::float8 AS value,
        constituents
      FROM index_values
      WHERE index_code = ANY(${INDEX_CODES}) AND captured_at >= CURRENT_DATE - ${days}::int
      ORDER BY index_code, captured_at ASC
    `,
    sql<VolumeRow[]>`
      SELECT
        index_code AS "indexCode",
        captured_at::text AS "capturedAt",
        sales_count AS "salesCount",
        sales_value::float8 AS "salesValue"
      FROM index_volume
      WHERE index_code = ANY(${INDEX_CODES}) AND captured_at >= CURRENT_DATE - ${days}::int
      ORDER BY index_code, captured_at ASC
    `,
  ]);

  let asOf: string | null = null;

  const indices: IndexSummary[] = INDEX_DEFINITIONS.map((def) => {
    const ranked = rankedRows.filter((r) => r.indexCode === def.code);
    const latest = ranked[0] ? toPoint(ranked[0]) : null;
    const previous = ranked[1] ? toPoint(ranked[1]) : null;
    const changePct =
      latest && previous && previous.value !== 0
        ? ((latest.value - previous.value) / previous.value) * 100
        : null;

    if (latest && (!asOf || latest.capturedAt > asOf)) {
      asOf = latest.capturedAt;
    }

    return {
      code: def.code,
      tcg: def.tcg,
      kind: def.kind,
      label: def.label,
      latest,
      previous,
      changePct,
      history: historyRows.filter((r) => r.indexCode === def.code).map(toPoint),
      volume: volumeRows.filter((r) => r.indexCode === def.code).map(toVolumePoint),
    };
  });

  return { asOf, indices };
}
