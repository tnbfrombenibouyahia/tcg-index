import type { GradingRoiCandidate, GradingRoiResult } from "@/lib/gradingRoi";
import { Badge } from "../core/Badge";

// "Faut-il grader cette copie ?" de la Fiche carte CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- réutilise TEL QUEL le calculateur existant
// (lib/gradingRoi.ts, déjà validé sur /grading-roi), hypothèses par défaut
// (DEFAULT_GRADING_ROI_ASSUMPTIONS). La répartition par note et le detail
// de contribution viennent de `result.breakdown` -- pas les mêmes lignes que
// le mockup d'origine (qui montrait une liste de coûts inventée), mais des
// chiffres réels : probabilité par note (dérivée du mix de ventes gradées
// réel de la carte, cf. resolveGradeDistribution) et sa contribution à la
// valeur espérée.
const GRADE_COLOR: Record<string, string> = {
  psa10: "var(--green-400)",
  "psa9.5": "var(--up-600)",
  psa9: "var(--ink-700)",
  psa8: "var(--grey-400)",
  psa7: "var(--grey-300)",
  lowGrade: "var(--down-500)",
};

const GRADE_LABEL: Record<string, string> = {
  psa10: "PSA 10",
  "psa9.5": "PSA 9.5",
  psa9: "PSA 9",
  psa8: "PSA 8",
  psa7: "PSA 7",
  lowGrade: "Sous PSA 7",
};

export function GradingEvPanel({ candidate, result }: { candidate: GradingRoiCandidate; result: GradingRoiResult }) {
  const favorable = result.roiPct > 0;
  const gemEntry = result.breakdown.find((b) => b.key === "psa10");
  const gemPct = gemEntry ? gemEntry.probability * 100 : 0;

  return (
    <section style={{ flex: "2 1 300px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Faut-il grader cette copie ?</span>
        <Badge tone={favorable ? "accent" : "down"}>{favorable ? "Favorable" : "Défavorable"}</Badge>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 26, rowGap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(20px, 3.4vh, 32px)", fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.1 }}>
            ${result.expectedValueNet.toFixed(2)}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>valeur espérée · pondérée POP</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 3 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, color: result.netProfit >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
            {result.netProfit >= 0 ? "+" : ""}${result.netProfit.toFixed(2)}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>net par carte</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 3 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, color: "var(--up-600)" }}>{result.roiPct.toFixed(1)} %</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>ROI gradation</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--grey-100)" }}>
          {result.breakdown.map((b) => (
            <span key={b.key} style={{ width: `${b.probability * 100}%`, background: GRADE_COLOR[b.key] ?? "var(--grey-300)" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Taux de gem (PSA 10) {gemPct.toFixed(1)} %</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)" }}>
            {gemPct > 0 ? `1 sur ${Math.round(100 / gemPct)}` : "—"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {result.breakdown.map((b) => (
          <div key={b.key} style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--border-hairline)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: GRADE_COLOR[b.key] ?? "var(--grey-300)", flex: "none" }} />
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-strong)" }}>{GRADE_LABEL[b.key] ?? b.key}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>${b.price.toFixed(0)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-strong)", minWidth: 52, textAlign: "right" }}>{(b.probability * 100).toFixed(1)}%</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>Brut + gradation ({result.serviceTierId}) + frais annexes</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)" }}>${result.totalCost.toFixed(2)}</span>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)" }}>
        Espérance = Σ (probabilité × dernier prix connu), moins {candidate.ungradedPrice.toFixed(2)}$ d&apos;achat, gradation et envoi. Probabilités dérivées du mix de ventes gradées réel de la carte
        {candidate.distributionSourceLevel !== "card" ? " (repli set/tcg, échantillon carte insuffisant)" : ""}. Indicatif, pas un conseil d&apos;investissement.
      </p>
    </section>
  );
}
