import type { PopulationRow } from "@/lib/types";
import { GaugeArc } from "../data/GaugeArc";

// "Taux de gem PSA" de l'écran Population PSA CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- popGrade10 / popTotal sur la sélection courante.
export function GemRateGaugePanel({ rows }: { rows: PopulationRow[] }) {
  const totalPop = rows.reduce((sum, r) => sum + r.population.popTotal, 0);
  const totalGem = rows.reduce((sum, r) => sum + r.population.popGrade10, 0);
  const gemPct = totalPop > 0 ? Math.round((totalGem / totalPop) * 1000) / 10 : 0;

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Taux de gem PSA</span>
      <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 160 }}>
        <GaugeArc value={gemPct} size={200} label="part de PSA 10 sur la population" />
      </div>
    </section>
  );
}
