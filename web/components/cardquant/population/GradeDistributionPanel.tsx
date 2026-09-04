import type { PopulationRow } from "@/lib/types";

const GRADES: { key: "popGrade10" | "popGrade9" | "popGrade8" | "popGrade7" | "popGrade6"; label: string; color: string }[] = [
  { key: "popGrade10", label: "PSA 10", color: "var(--green-400)" },
  { key: "popGrade9", label: "PSA 9", color: "var(--up-600)" },
  { key: "popGrade8", label: "PSA 8", color: "var(--text-strong)" },
  { key: "popGrade7", label: "PSA 7", color: "var(--grey-400)" },
  { key: "popGrade6", label: "≤ PSA 6", color: "var(--grey-300)" },
];

// "Distribution des notes" de l'écran Population PSA CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- agrégée sur la sélection courante (filtres
// tcg/langue/recherche appliqués), pas sur UNE carte/set en particulier
// comme le mockup ("Wings of the Captain EN") : plus utile pour explorer une
// sélection large, et n'exige pas de mécanique de "carte en focus" séparée.
export function GradeDistributionPanel({ rows }: { rows: PopulationRow[] }) {
  const totals = GRADES.map((g) => ({ ...g, count: rows.reduce((sum, r) => sum + r.population[g.key], 0) }));
  const grandTotal = totals.reduce((sum, g) => sum + g.count, 0);
  const max = Math.max(1, ...totals.map((g) => g.count));

  return (
    <section style={{ gridColumn: "span 2", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", minWidth: 130, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Distribution des notes · sélection actuelle</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>POP {grandTotal.toLocaleString("fr-FR")}</span>
      </div>
      {grandTotal === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas de population sur cette sélection.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {totals.map((g) => (
            <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 54, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)" }}>{g.label}</span>
              <span style={{ flex: 1, height: 10, borderRadius: 999, background: "var(--grey-200)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(g.count / max) * 100}%`, background: g.color }} />
              </span>
              <span style={{ width: 62, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-body)" }}>{g.count.toLocaleString("fr-FR")}</span>
              <span style={{ width: 52, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-muted)" }}>{((g.count / grandTotal) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
