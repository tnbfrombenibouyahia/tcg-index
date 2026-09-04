import type { SetSummary } from "@/lib/queries/setAnalysis";

// "Valeur du set vs génération" de l'écran Analyse set CardQuant (cf.
// mémoire projet "cardquant-rebrand") -- 3 barres comparables plutôt que le
// graphique en ligne du mockup ("vs série" sur plusieurs mois) : reconstruire
// une vraie série temporelle de la valeur de CHAQUE set d'une génération
// (potentiellement des dizaines) au jour le jour serait un calcul bien plus
// lourd pour un gain d'information marginal ici -- l'essentiel ("ce set
// est-il cher ou pas cher pour sa génération ?") tient dans une comparaison
// instantanée. "Génération" = sets sortis la même année (cf. commentaire de
// lib/queries/setAnalysis.ts -- items n'a pas de notion de "série").
export function GenerationComparisonPanel({ summary }: { summary: SetSummary }) {
  if (summary.releaseYear == null || summary.generationPeerCount === 0) {
    return (
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>Pas d&apos;autre set de {summary.releaseYear ?? "cette période"} pour comparer.</span>
      </section>
    );
  }

  const bars = [
    { label: "Ce set", value: summary.valueUsd, color: "var(--ink-000)" },
    { label: `Moyenne ${summary.releaseYear}`, value: summary.generationAvgValue ?? 0, color: "var(--up-400)" },
    { label: `Médiane ${summary.releaseYear}`, value: summary.generationMedianValue ?? 0, color: "var(--grey-400)" },
  ];
  const max = Math.max(1, ...bars.map((b) => b.value));
  const gapPct = summary.generationAvgValue && summary.generationAvgValue > 0 ? ((summary.valueUsd - summary.generationAvgValue) / summary.generationAvgValue) * 100 : null;

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 120 }}>Valeur du set vs génération {summary.releaseYear}</span>
        {gapPct != null ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: gapPct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
            {gapPct >= 0 ? "+" : ""}
            {gapPct.toFixed(0)}% vs moyenne
          </span>
        ) : null}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{summary.generationPeerCount} sets comparés</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-body)" }}>
              <span>{b.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>${Math.round(b.value).toLocaleString("fr-FR")}</span>
            </div>
            <div style={{ height: 10, borderRadius: 3, background: "var(--surface-sunken)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(b.value / max) * 100}%`, background: b.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "var(--text-muted)" }}>
        « Génération » = sets sortis la même année. Aucune notion de série (ex. Sword &amp; Shield) n&apos;existe dans les données suivies.
      </p>
    </section>
  );
}
