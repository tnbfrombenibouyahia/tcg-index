import sql from "@/lib/db";
import { TCGS } from "@/lib/constants";
import type { DailyHealthCell, DailyHealthStatus, FreshnessCell, SyncRun, SyncStatusResponse } from "@/lib/types";

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

// Fenêtre de 3h ajoutée le 2026-08-11 (même incident que le fix 48h de
// getRecentErrors juste en dessous) : 8 lignes 'running' orphelines (step
// `prices`, un crash/timeout du workflow avant l'écriture du statut final)
// sont restées affichées 16h à 2 jours, assez pour à elles seules écraser
// toute la mise en page de /live. Le step le plus long observé
// historiquement (grades_sales) plafonne à ~95 min (cf. requête faite en
// vérifiant ce fix) -- 3h laisse largement la marge pour `prices`, dont on
// n'a pas d'historique de durée réussie, sans jamais pouvoir masquer un run
// réellement en cours.
export async function getRunningSyncs(): Promise<SyncRun[]> {
  const rows = await sql<SyncRunRow[]>`
    SELECT ${syncRunColumns()}
    FROM sync_runs
    WHERE status = 'running' AND started_at > now() - interval '3 hours'
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
// les erreurs sont rares et doivent rester visibles même une fois que
// `recentRuns` aura tourné au-delà de la dernière erreur -- page /live,
// section debug dédiée.
//
// Fenêtre de 48h ajoutée le 2026-08-11 (demande utilisateur) : sans borne de
// temps, une rafale d'erreurs déjà résolue (ex. conflits d'écriture
// CockroachDB corrigés par le backoff de shared.db, ou quota API TCG déjà
// géré par le sync incrémental) reste affichée indéfiniment tant que
// personne ne purge `sync_runs` à la main -- ça a fini par polluer la page
// avec 30 lignes d'un incident vieux de plus d'un jour alors que tout
// tournait proprement depuis. 48h (pas 24h) pour survivre à un week-end/jour
// sans cron sans faire disparaître une vraie panne en cours de diagnostic.
export async function getRecentErrors(limit = 50): Promise<SyncRun[]> {
  const rows = await sql<SyncRunRow[]>`
    SELECT ${syncRunColumns()}
    FROM sync_runs
    WHERE status = 'error' AND started_at > now() - interval '48 hours'
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toSyncRun);
}

interface DailyHealthRow {
  day: string; // 'YYYY-MM-DD', déjà en UTC (cf. requête)
  hasError: boolean;
  hasSuccess: boolean;
}

// Calendrier façon GitHub (demande utilisateur 2026-08-11, "dans le creux
// qui reste" du nouveau layout plein-écran de /live) : un point par jour sur
// les `days` derniers jours. Le GROUP BY ne renvoie que les jours avec au
// moins une ligne sync_runs -- les trous (jour sans aucun run, cron manqué
// ou avant le début du suivi le 2026-08-09) sont comblés ici en JS plutôt
// qu'avec generate_series côté SQL, plus simple à lire pour une plage aussi
// courte (quelques dizaines/centaines de lignes au pire). Bucket en UTC
// explicite (`AT TIME ZONE 'UTC'`) -- cohérent avec les horaires de cron
// documentés en dur dans ScheduleBar, tous en UTC.
export async function getDailyHealth(days = 91): Promise<DailyHealthCell[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const rows = await sql<DailyHealthRow[]>`
    SELECT
      (started_at AT TIME ZONE 'UTC')::date::text AS day,
      bool_or(status = 'error') AS "hasError",
      bool_or(status = 'success') AS "hasSuccess"
    FROM sync_runs
    WHERE started_at >= ${since.toISOString()}
    GROUP BY day
  `;
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const cells: DailyHealthCell[] = [];
  for (let offset = 0; offset < days; offset++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    const row = byDay.get(iso);
    const status: DailyHealthStatus = !row ? "none" : row.hasError ? "error" : row.hasSuccess ? "ok" : "none";
    cells.push({ date: iso, status });
  }
  return cells; // ordre chronologique, du plus ancien (index 0) à aujourd'hui (dernier)
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
  const [runningNow, recentRuns, recentErrors, freshness, dailyHealth] = await Promise.all([
    getRunningSyncs(),
    getRecentRuns(),
    getRecentErrors(),
    getFreshnessGrid(),
    getDailyHealth(),
  ]);
  return { runningNow, recentRuns, recentErrors, freshness, dailyHealth, fetchedAt: new Date().toISOString() };
}
