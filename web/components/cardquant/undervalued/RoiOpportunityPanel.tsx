import Link from "next/link";
import type { GradingRoiRow } from "@/lib/gradingRoi";

// "ROI gradation · valeur non réalisée" de l'écran Sous-évalué CardQuant
// (cf. mémoire projet "cardquant-rebrand") -- réutilise
// lib/queries/gradingRoi.ts::getGradingRoiRanking (déjà en prod sur
// /grading-roi), trié par ROI décroissant, réel.
export function RoiOpportunityPanel({ rows }: { rows: GradingRoiRow[] }) {
  const maxNet = Math.max(1, ...rows.map((r) => r.defaultResult.netProfit));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>ROI gradation · valeur non réalisée</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>brut sous-payé face à l&apos;espérance gradée</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 54px 58px 58px minmax(30px, 0.5fr) 52px", gap: 8, alignItems: "center", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5 }}>
        <span>Carte</span>
        <span style={{ textAlign: "right" }}>Brut</span>
        <span style={{ textAlign: "right" }}>PSA 10</span>
        <span style={{ textAlign: "right" }}>Net</span>
        <span />
        <span style={{ textAlign: "right" }}>ROI</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Pas assez de candidats pour ce classement.</span>
        ) : (
          rows.map((r) => {
            const psa10Price = r.gradePrices.psa10;
            const gemPct = (r.gradeMix.psa10 ?? 0) * 100;
            return (
              <Link
                key={r.itemId}
                href={`/catalog/${r.itemId}`}
                style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 54px 58px 58px minmax(30px, 0.5fr) 52px", gap: 8, alignItems: "center", color: "inherit" }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.setCode ?? "—"} · gem {gemPct.toFixed(0)}% · EV ${r.defaultResult.expectedValueNet.toFixed(0)}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>${r.ungradedPrice.toFixed(2)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>{psa10Price != null ? `$${psa10Price.toFixed(0)}` : "—"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--up-400)", textAlign: "right", whiteSpace: "nowrap" }}>${r.defaultResult.netProfit.toFixed(0)}</span>
                <span style={{ display: "block", height: 7, borderRadius: 2, background: "var(--grey-200)", minWidth: 0 }}>
                  <span style={{ display: "block", height: 7, borderRadius: 2, background: "var(--up-400)", width: `${Math.max(0, (r.defaultResult.netProfit / maxNet) * 100)}%` }} />
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: r.defaultResult.roiPct >= 0 ? "var(--up-600)" : "var(--down-500)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.defaultResult.roiPct >= 0 ? "+" : ""}
                  {r.defaultResult.roiPct.toFixed(0)}%
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
