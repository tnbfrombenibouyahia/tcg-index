import type { SyncRun } from "@/lib/types";
import { BarSeries } from "../data/BarSeries";

// "Lignes mises à jour · 12 dernières heures" de l'écran Live CardQuant (cf.
// mémoire projet "cardquant-rebrand") -- agrégat horaire de rowsWritten sur
// recentRuns (jusqu'à 100 lignes, cf. getRecentRuns). Réutilise BarSeries
// tel quel (déjà porté pour la landing).
export function RowsBarChart({ runs }: { runs: SyncRun[] }) {
  const now = new Date();
  const hours = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - (11 - i));
    return d;
  });

  const data = hours.map((h) => {
    const end = h.getTime() + 3_600_000;
    return runs
      .filter((r) => {
        const t = new Date(r.finishedAt ?? r.startedAt).getTime();
        return t >= h.getTime() && t < end;
      })
      .reduce((sum, r) => sum + (r.rowsWritten ?? 0), 0);
  });

  const axis = [hours[0].getHours() + "h", hours[hours.length - 1].getHours() + "h"];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Lignes mises à jour · 12 dernières heures</span>
      <BarSeries data={data} height={84} axis={axis} />
    </section>
  );
}
