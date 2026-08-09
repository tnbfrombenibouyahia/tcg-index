import sql from "@/lib/db";
import { TCGS } from "@/lib/constants";
import type { FreshnessCell, SyncRun, SyncStatusResponse } from "@/lib/types";

// Toutes les dates ::text (cf. lib/queries/indices.ts) -- évite l'ambiguïté
// de fuseau d'un objet JS Date sur une colonne DATE/TIMESTAMPTZ.

interface SyncRunRow {
  id: number;
  runType: string;
  tier: string | null;
  step: string;
  tcg: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsWritten: number | null;
  detail: string | null;
}

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    runType: row.runType as SyncRun["runType"],
    tier: row.tier,
    step: row.step as SyncRun["step"],
    tcg: row.tcg as SyncRun["tcg"],
    status: row.status as SyncRun["status"],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    rowsWritten: row.rowsWritten,
    detail: row.detail,
  };
}

// Fragment nestable (pas `sql.unsafe`, cf. pattern whereFragment/orderFragment
// dans queries/sales.ts) : la même liste de colonnes pour les deux requêtes
// ci-dessous, texte statique donc aucun risque d'injection.
function syncRunColumns() {
  return sql`
    id, run_type AS "runType", tier, step, tcg, status,
    started_at::text AS "startedAt", finished_at::text AS "finishedAt",
    rows_written AS "rowsWritten", detail
  `;
}

export async function getRunningSyncs(): Promise<SyncRun[]> {
  const rows = await sql<SyncRunRow[]>`
    SELECT ${syncRunColumns()}
    FROM sync_runs
    WHERE status = 'running'
    ORDER BY started_at ASC
  `;
  return rows.map(toSyncRun);
}

export async function getRecentRuns(limit = 100): Promise<SyncRun[]> {
  const rows = await sql<SyncRunRow[]>`
    SELECT ${syncRunColumns()}
    FROM sync_runs
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toSyncRun);
}

// Requête séparée plutôt qu'un simple .filter() côté client sur recentRuns :
// les erreurs sont rares (13/97 runs au moment d'écrire ceci) et doivent
// rester visibles même une fois que `recentRuns` aura tourné au-delà de la
// dernière erreur -- page /live, section debug dédiée.
export async function getRecentErrors(limit = 50): Promise<SyncRun[]> {
  const rows = await sql<SyncRunRow[]>`
    SELECT ${syncRunColumns()}
    FROM sync_runs
    WHERE status = 'error'
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toSyncRun);
}

interface ItemsFreshnessRow {
  tcg: string;
  lastFinishedAt: string | null;
}

interface PriceFreshnessRow {
  tcg: string;
  category: string;
  lastCapturedAt: string | null;
  constituents: number;
}

interface GradingFreshnessRow {
  tcg: string;
  lastCapturedAt: string | null;
  constituents: number;
}

// Le référentiel (`items`) n'a pas de colonne `updated_at` -- sa fraîcheur ne
// peut venir que du journal `sync_runs` (dernier run 'items' réussi par tcg).
// Le prix et la gradation, eux, ont une source de vérité indépendante du
// journal : `price_snapshots.captured_at` (append-only), donc leur fraîcheur
// reste correcte même avant que `sync_runs` n'ait accumulé de l'historique.
export async function getFreshnessGrid(): Promise<FreshnessCell[]> {
  const [itemsRows, priceRows, gradingRows] = await Promise.all([
    sql<ItemsFreshnessRow[]>`
      SELECT tcg, MAX(finished_at)::text AS "lastFinishedAt"
      FROM sync_runs
      WHERE step = 'items' AND status = 'success' AND tcg IS NOT NULL
      GROUP BY tcg
    `,
    sql<PriceFreshnessRow[]>`
      SELECT
        i.tcg,
        i.category,
        MAX(ps.captured_at)::text AS "lastCapturedAt",
        COUNT(DISTINCT ps.item_id)::int4 AS constituents
      FROM price_snapshots ps
      JOIN items i ON i.id = ps.item_id
      WHERE ps.grade = 'ungraded' AND ps.source = 'pricecharting'
      GROUP BY i.tcg, i.category
    `,
    sql<GradingFreshnessRow[]>`
      SELECT
        i.tcg,
        MAX(ps.captured_at)::text AS "lastCapturedAt",
        COUNT(DISTINCT ps.item_id)::int4 AS constituents
      FROM price_snapshots ps
      JOIN items i ON i.id = ps.item_id
      WHERE ps.grade != 'ungraded' AND ps.source = 'pricecharting'
      GROUP BY i.tcg
    `,
  ]);

  const cells: FreshnessCell[] = [];

  for (const { value: tcg } of TCGS) {
    const itemsRow = itemsRows.find((r) => r.tcg === tcg);
    cells.push({
      tcg,
      segment: "items",
      lastUpdated: itemsRow?.lastFinishedAt ?? null,
      constituents: null,
    });

    const sealedRow = priceRows.find((r) => r.tcg === tcg && r.category === "sealed");
    cells.push({
      tcg,
      segment: "sealed",
      lastUpdated: sealedRow?.lastCapturedAt ?? null,
      constituents: sealedRow?.constituents ?? null,
    });

    const singleRow = priceRows.find((r) => r.tcg === tcg && r.category === "single");
    cells.push({
      tcg,
      segment: "single",
      lastUpdated: singleRow?.lastCapturedAt ?? null,
      constituents: singleRow?.constituents ?? null,
    });

    const gradingRow = gradingRows.find((r) => r.tcg === tcg);
    cells.push({
      tcg,
      segment: "grading",
      lastUpdated: gradingRow?.lastCapturedAt ?? null,
      constituents: gradingRow?.constituents ?? null,
    });
  }

  return cells;
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  const [runningNow, recentRuns, recentErrors, freshness] = await Promise.all([
    getRunningSyncs(),
    getRecentRuns(),
    getRecentErrors(),
    getFreshnessGrid(),
  ]);
  return { runningNow, recentRuns, recentErrors, freshness, fetchedAt: new Date().toISOString() };
}
