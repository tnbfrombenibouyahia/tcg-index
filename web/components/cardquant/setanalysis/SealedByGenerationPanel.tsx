import type { SealedByGeneration } from "@/lib/queries/setAnalysis";

// "Prix moyen du scellé par génération" de l'écran Analyse set CardQuant
// (cf. mémoire projet "cardquant-rebrand") -- lib/queries/setAnalysis.ts
// ::getSealedPriceByGeneration, réel, filtré au tcg du set affiché.
export function SealedByGenerationPanel({ rows, currentYear }: { rows: SealedByGeneration[]; currentYear: number | null }) {
  const max = Math.max(1, ...rows.map((r) => r.avgSealedPrice));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 120 }}>Prix moyen du scellé par génération</span>
      </div>
      {rows.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas de données de prix scellé pour ce jeu.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 auto" }}>
          {rows.map((g) => {
            const isCurrent = g.releaseYear === currentYear;
            return (
              <div key={g.releaseYear} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(30px, 1fr) 60px 48px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: isCurrent ? "var(--text-strong)" : "var(--text-body)", fontWeight: isCurrent ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.releaseYear}</span>
                <span style={{ display: "block", height: 7, borderRadius: 2, background: "var(--grey-200)", minWidth: 0 }}>
                  <span style={{ display: "block", height: 7, borderRadius: 2, background: isCurrent ? "var(--green-400)" : "var(--grey-400)", opacity: isCurrent ? 1 : 0.7, width: `${(g.avgSealedPrice / max) * 100}%` }} />
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right" }}>${Math.round(g.avgSealedPrice)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textAlign: "right", color: g.changePct == null ? "var(--text-muted)" : g.changePct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
                  {g.changePct != null ? `${g.changePct >= 0 ? "+" : ""}${g.changePct.toFixed(0)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
