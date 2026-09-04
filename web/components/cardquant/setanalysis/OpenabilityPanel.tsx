import type { SealedEvRow } from "@/lib/types";
import { Badge } from "../core/Badge";

// "Ouvrabilité du set" de l'écran Analyse set CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- réutilise TEL QUEL le calcul déjà en prod sur
// /sealed-ev (lib/queries/sealedEv.ts::getSealedEv, filtré par set_code) :
// aucun nouveau calcul, juste un réhabillage. `evRatioTotal` > 1 = la somme
// des singles vaut plus que la box scellée (favorable à l'ouverture).
export function OpenabilityPanel({ ev }: { ev: SealedEvRow | null }) {
  if (!ev) {
    return (
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>Pas de Booster Box suivi pour ce set (calcul EV réservé au scellé display box, cf. /sealed-ev).</span>
      </section>
    );
  }

  const favorable = ev.evRatioTotal > 1;
  const metrics = [
    { label: "Box scellée", sub: ev.boxPriceSource === "sales_median" ? "médiane des ventes" : "agrégat PriceCharting", value: `$${ev.boxPrice.toFixed(2)}`, ratio: 1 },
    { label: "Valeur des singles (total)", sub: `${ev.singlesCount} cartes suivies`, value: `$${ev.singlesTotalValue.toFixed(2)}`, ratio: ev.evRatioTotal },
    { label: "Valeur des singles (top 10)", sub: "les 10 cartes les plus chères", value: `$${ev.singlesTop10Value.toFixed(2)}`, ratio: ev.evRatioTop10 },
  ];
  const maxValue = Math.max(ev.boxPrice, ev.singlesTotalValue, ev.singlesTop10Value, 1);

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 0, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Ouvrabilité du set</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }} title="Ratio = valeur des singles / prix de la box scellée. > 1 : ouvrir rapporte plus que revendre scellé (avant frais/temps).">
            EV / box
          <span style={{ width: 12, height: 12, borderRadius: 999, border: "1px solid var(--border-hairline)", fontSize: 8, lineHeight: "10px", textAlign: "center" }}>i</span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: "1 1 auto" }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(30px, 0.5fr) 62px", gap: 10, alignItems: "center" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
              <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sub}</span>
            </span>
            <span style={{ display: "block", height: 7, borderRadius: 2, background: "var(--grey-200)", minWidth: 0 }}>
              <span style={{ display: "block", height: 7, borderRadius: 2, background: m.ratio >= 1 ? "var(--green-400)" : "var(--grey-400)", width: `${(parseFloat(m.value.slice(1)) / maxValue) * 100}%` }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)", textAlign: "right" }}>{m.value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface-sunken)", border: `1px solid ${favorable ? "rgba(118,251,145,.35)" : "var(--border-hairline)"}` }}>
        <Badge tone={favorable ? "accent" : "neutral"}>{favorable ? "Favorable" : "Défavorable"}</Badge>
        <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--text-muted)" }}>
          Ratio EV total {ev.evRatioTotal.toFixed(2)}× · top 10 {ev.evRatioTop10.toFixed(2)}× · box scellée {ev.boxSalesUsed} ventes utilisées.
        </span>
      </div>
    </section>
  );
}
