import type { PopulationGrowth } from "@/lib/queries/populationAnalysis";

// "Croissance de la POP" de l'écran Population PSA CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- lib/queries/populationAnalysis.ts
// ::getPopulationGrowth, réel mais simplifié : un seul avant/après (le plus
// ancien instantané connu vs le plus récent) plutôt que le graphique en
// barres mensuelles du mockup, qui demanderait un point par mois pour
// potentiellement des dizaines de milliers d'items -- trop coûteux pour ce
// que ça ajoute ici. `daysSpan` est montré explicitement : le suivi
// hebdomadaire de la population est récent, la fenêtre réelle peut être
// bien plus courte que "12 mois".
export function PopGrowthPanel({ growth }: { growth: PopulationGrowth }) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Croissance de la POP</span>
      {growth.changePct == null ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas assez d&apos;historique de suivi pour mesurer une croissance.</span>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 300, color: "var(--text-strong)" }}>
              {growth.changePct >= 0 ? "+" : ""}
              {growth.changePct.toFixed(1)}%
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: growth.current - growth.previous >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
              {growth.current - growth.previous >= 0 ? "+" : ""}
              {(growth.current - growth.previous).toLocaleString("fr-FR")} slabs
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: "var(--text-body)" }}>
            Sur {growth.daysSpan} jours de suivi ({growth.previous.toLocaleString("fr-FR")} → {growth.current.toLocaleString("fr-FR")} slabs). Une POP qui gonfle vite dilue la rareté du PSA 10.
          </p>
        </>
      )}
    </section>
  );
}
