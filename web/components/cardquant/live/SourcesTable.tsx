import type { SyncRun } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { STEP_LABEL } from "./liveCopy";

// "État des sources" de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- une ligne par step de pipeline (pas par source de
// données au sens marketing du terme : sync_runs ne trace que des étapes de
// pipeline, cf. db/schema.sql). "Fiabilité 7j" remplace la colonne
// "Couverture" du mockup, qui n'a pas d'équivalent direct par step : c'est
// un vrai taux de succès calculé sur `runs`, pas un chiffre de couverture
// catalogue (déjà montré à part, cf. CoverageList.tsx).
function ageColor(run: SyncRun | undefined): string {
  if (!run) return "var(--text-muted)";
  if (run.status === "error") return "var(--down-500)";
  if (run.status === "running") return "var(--up-600)";
  const hours = (Date.now() - new Date(run.finishedAt ?? run.startedAt).getTime()) / 3_600_000;
  return hours <= 48 ? "var(--up-600)" : hours <= 24 * 8 ? "var(--warn-600)" : "var(--down-500)";
}

export function SourcesTable({ runs }: { runs: SyncRun[] }) {
  const steps = Array.from(new Set(runs.map((r) => r.step)));
  const rows = steps
    .map((step) => {
      const stepRuns = runs.filter((r) => r.step === step).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const latest = stepRuns[0];
      const window7d = stepRuns.filter((r) => Date.now() - new Date(r.startedAt).getTime() <= 7 * 86_400_000 && r.status !== "running");
      const successRate = window7d.length > 0 ? (window7d.filter((r) => r.status === "success").length / window7d.length) * 100 : null;
      const rowsWritten7d = window7d.reduce((sum, r) => sum + (r.rowsWritten ?? 0), 0);
      return { step, latest, successRate, rowsWritten7d };
    })
    .sort((a, b) => (STEP_LABEL[a.step] ?? a.step).localeCompare(STEP_LABEL[b.step] ?? b.step));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px 6px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>État des pipelines</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1fr)", minWidth: 0, gap: 10, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", paddingBottom: 6, borderBottom: "1px solid var(--border-hairline)" }}>
        <span>Pipeline</span>
        <span>Dernier run</span>
        <span>Fiabilité 7j</span>
        <span style={{ textAlign: "right" }}>Lignes MAJ 7j</span>
      </div>
      {rows.map(({ step, latest, successRate, rowsWritten7d }) => (
        <div key={step} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1fr)", minWidth: 0, gap: 10, alignItems: "center", paddingBottom: 11, borderBottom: "1px solid var(--border-hairline)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: ageColor(latest), flex: "none" }} />
            <span style={{ fontSize: 12.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{STEP_LABEL[step] ?? step}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: ageColor(latest), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {latest ? formatRelativeTime(latest.startedAt, "fr") : "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{latest?.status === "running" ? "en cours" : latest?.status === "error" ? "échec" : "réussi"}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ flex: 1, height: 5, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${successRate ?? 0}%`, background: successRate == null ? "var(--grey-300)" : successRate >= 90 ? "var(--up-600)" : successRate >= 60 ? "var(--warn-600)" : "var(--down-500)" }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "right", flex: "none" }}>{successRate != null ? `${Math.round(successRate)}%` : "—"}</span>
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rowsWritten7d.toLocaleString("fr-FR")}
          </span>
        </div>
      ))}
      <p style={{ margin: "0 0 8px", fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>
        Prix indicatifs, agrégés de sources tierces. Un pipeline en retard n&apos;invalide pas les autres : les métriques dérivées signalent la source la plus ancienne utilisée.
      </p>
    </section>
  );
}
