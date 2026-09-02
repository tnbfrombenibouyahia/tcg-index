import type { SyncRun } from "@/lib/types";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { STEP_CADENCE, STEP_LABEL } from "./liveCopy";

const RUN_COLOR: Record<SyncRun["status"], string> = {
  success: "var(--up-600)",
  error: "var(--down-500)",
  running: "var(--warn-400)",
};

// "Pipelines de synchronisation" de l'écran Live CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- une carte par step, bande des 14 derniers
// runs (tous tiers/tcg confondus) colorée par statut, réel (recentRuns,
// jusqu'à 100 lignes -- cf. getRecentRuns).
export function PipelineCards({ runs, nowMs }: { runs: SyncRun[]; nowMs: number }) {
  const steps = Array.from(new Set(runs.map((r) => r.step)));
  const errorCount7d = runs.filter((r) => r.status === "error" && nowMs - new Date(r.startedAt).getTime() <= 7 * 86_400_000).length;

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, flex: "1 1 auto", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Pipelines de synchronisation</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {steps.length} pipelines · {errorCount7d} échec{errorCount7d !== 1 ? "s" : ""} 7j
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, flex: 1, alignContent: "stretch" }}>
        {steps.map((step) => {
          const stepRuns = runs.filter((r) => r.step === step).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-14);
          const latest = stepRuns[stepRuns.length - 1];
          return (
            <div key={step} style={{ border: "1px solid var(--border-hairline)", borderRadius: 10, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: latest ? RUN_COLOR[latest.status] : "var(--grey-300)" }} />
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-strong)" }}>{STEP_LABEL[step] ?? step}</span>
                {STEP_CADENCE[step] ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em", color: "var(--text-muted)" }}>{STEP_CADENCE[step]}</span> : null}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {stepRuns.map((r) => (
                  <span key={r.id} style={{ flex: 1, height: 16, borderRadius: 2, background: RUN_COLOR[r.status] }} />
                ))}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                <span style={{ flex: 1 }}>{latest ? formatRelativeTime(latest.startedAt, "fr") : "—"}</span>
                <span>{latest?.finishedAt ? formatDuration(latest.startedAt, latest.finishedAt) : latest ? "en cours" : ""}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
