import type { DataCoverageRow, FreshnessCell, SyncRun } from "@/lib/types";
import { getFreshnessTone } from "@/lib/live";

// Bandeau de statut de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- 4 KPI réels calculés à partir de
// lib/queries/syncStatus.ts::getSyncStatus + lib/queries/dataCoverage.ts::getDataCoverage
// (même deux requêtes que l'ancien /live, cf. components/live/LiveDashboard.tsx).
export function TopStatusBar({
  freshness,
  coverage,
  recentRuns,
  errorsCount,
  nowMs,
}: {
  freshness: FreshnessCell[];
  coverage: DataCoverageRow[];
  recentRuns: SyncRun[];
  errorsCount: number;
  nowMs: number;
}) {
  const freshCount = freshness.filter((c) => getFreshnessTone(c.lastUpdated) === "fresh").length;
  const allFresh = freshness.length > 0 && freshCount === freshness.length;
  const itemsTracked = coverage.reduce((sum, r) => sum + r.totalItems, 0);
  const runs24h = recentRuns.filter((r) => nowMs - new Date(r.startedAt).getTime() <= 24 * 3_600_000).length;

  const kpis = [
    { label: "Segments à jour", value: `${freshCount}/${freshness.length}`, unit: "" },
    { label: "Cartes cataloguées", value: itemsTracked.toLocaleString("fr-FR"), unit: "items" },
    { label: "Runs 24h", value: String(runs24h), unit: "" },
    { label: "Erreurs actives", value: String(errorsCount), unit: "" },
  ];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", alignItems: "center", gap: "16px 22px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "0 1 auto", minWidth: 240 }}>
        <span
          style={{
            width: 9, height: 9, borderRadius: 999, flex: "none",
            background: allFresh ? "var(--up-400)" : errorsCount > 0 ? "var(--down-500)" : "var(--warn-400)",
            boxShadow: allFresh ? "0 0 0 4px rgba(33, 201, 78, .18)" : errorsCount > 0 ? "0 0 0 4px rgba(248, 14, 53, .18)" : "0 0 0 4px rgba(238, 223, 16, .2)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>{allFresh ? "Données à jour" : "Attention requise"}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {freshCount} / {freshness.length} segments à jour{errorsCount > 0 ? ` · ${errorsCount} erreur${errorsCount > 1 ? "s" : ""}` : ""}
          </span>
        </div>
      </div>
      <div style={{ flex: "1 1 340px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: "14px 20px" }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{k.label}</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 400, lineHeight: 1, color: "var(--text-strong)" }}>{k.value}</span>
              {k.unit ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{k.unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
