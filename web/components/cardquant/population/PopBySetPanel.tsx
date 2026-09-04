import type { PopulationRow } from "@/lib/types";

// "Submissions par set" du mockup, renommée "Population par set" ici (cf.
// mémoire projet "cardquant-rebrand") -- "submission" impliquerait une date
// d'envoi en gradation, une donnée qu'aucune source suivie n'expose (PSA pop
// reports ne donnent qu'un total courant par note, jamais un historique de
// dates de soumission) : agrégée sur la sélection courante par set_code à la
// place, réel.
export function PopBySetPanel({ rows }: { rows: PopulationRow[] }) {
  const grouped = new Map<string, { popTotal: number; popGrade10: number }>();
  for (const r of rows) {
    if (!r.setCode) continue;
    const acc = grouped.get(r.setCode) ?? { popTotal: 0, popGrade10: 0 };
    acc.popTotal += r.population.popTotal;
    acc.popGrade10 += r.population.popGrade10;
    grouped.set(r.setCode, acc);
  }
  const sets = Array.from(grouped.entries())
    .map(([setCode, v]) => ({ setCode, ...v, gemPct: v.popTotal > 0 ? (v.popGrade10 / v.popTotal) * 100 : 0 }))
    .sort((a, b) => b.popTotal - a.popTotal)
    .slice(0, 8);
  const max = Math.max(1, ...sets.map((s) => s.popTotal));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Population par set</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>gem rate · sélection actuelle</span>
      </div>
      {sets.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas de set identifié sur cette sélection.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 7, flex: "1 1 auto", minHeight: 0 }}>
          {sets.map((s) => (
            <div key={s.setCode} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr) 52px 40px", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.setCode}</span>
              <span style={{ height: 8, borderRadius: 999, background: "var(--grey-200)", overflow: "hidden", minWidth: 0 }}>
                <span style={{ display: "block", height: "100%", width: `${(s.popTotal / max) * 100}%`, background: "var(--text-strong)" }} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>{s.popTotal.toLocaleString("fr-FR")}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--up-400)", textAlign: "right" }}>{s.gemPct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
