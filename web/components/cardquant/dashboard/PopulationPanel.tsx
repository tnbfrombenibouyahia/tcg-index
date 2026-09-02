import type { PopulationBySetRow } from "@/lib/types";

// "Population PSA · top sets" du Dashboard CardQuant (cf. mémoire projet
// "cardquant-rebrand"). `rows` vient de
// lib/queries/dashboardOverview.ts::getPopulationBySet.
//
// Le prototype affichait un nom de set humain ("SWSH7 · Evolving Skies") --
// items.set_code n'a pas de nom lisible en base (cf. db/schema.sql), donc pas
// de deuxième ligne "nom" ici : afficher juste le code plutôt que de
// fabriquer un libellé. Idem pour le badge "YTD" du prototype (sous-entend
// une évolution depuis janvier) : population_snapshots n'expose qu'un
// instantané courant, pas un delta temporel -- retiré plutôt que laissé à
// tort sur un chiffre qui n'est pas une variation.
export function PopulationPanel({ rows }: { rows: PopulationBySetRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.popTotal));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 140, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Population PSA · top sets gradés
        </span>
      </div>

      {rows.length === 0 ? (
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Pas de données de population disponibles.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {rows.map((r) => (
            <div key={`${r.tcg}-${r.setCode}`} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", color: "var(--text-strong)" }}>{r.setCode}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
                  {r.popTotal.toLocaleString("fr-FR")}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--grey-200)", overflow: "hidden" }}>
                <div style={{ width: `${(r.popTotal / max) * 100}%`, height: "100%", borderRadius: 999, background: r.tcg === "pokemon" ? "var(--green-400)" : "var(--ink-000)" }} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                  {r.tcg === "pokemon" ? "POKÉMON" : "ONE PIECE"}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)" }}>gem rate {r.gemRatePct.toFixed(1).replace(".", ",")}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Nombre de cartes gradées PSA, dernier instantané connu par carte. POP indicative, agrégée de sources tierces.
      </span>
    </section>
  );
}
