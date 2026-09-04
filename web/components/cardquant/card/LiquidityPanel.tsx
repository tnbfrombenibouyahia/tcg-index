import type { LiquidityCalc } from "@/lib/types";
import type { MonthlySalesCount } from "@/lib/queries/itemDetail";

// "Liquidité et exécution" de la Fiche carte CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Le graphique de ventes mensuelles est toujours
// affiché (sales existe pour tout item). Les 4 cellules KPI et le
// sell-through, eux, n'existent que quand item.liquidity est non-null --
// ce calcul est restreint au scellé EN (cf. lib/queries/liquidity.ts) : pour
// une carte simple, cette section est honnêtement absente plutôt qu'un faux
// 0%. "Profondeur d'offre" (par type d'annonce) du mockup omise : la donnée
// sous-jacente (active_listings par buying_option) n'est pas encore exposée
// par une requête -- à ajouter si ce panneau doit un jour la montrer.
export function LiquidityPanel({ monthlySales, liquidity }: { monthlySales: MonthlySalesCount[]; liquidity: LiquidityCalc | null }) {
  const months = buildLastNMonths(12);
  const counts = months.map((m) => monthlySales.find((s) => s.month === m)?.salesCount ?? 0);
  const max = Math.max(1, ...counts);
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" });

  return (
    <section style={{ flex: "3 1 360px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Liquidité et exécution</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>12 mois · toutes sources</span>
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 24, rowGap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ flex: 1, minHeight: 52, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {counts.map((c, i) => (
              <div key={i} style={{ flex: 1, height: `${(c / max) * 100}%`, minHeight: c > 0 ? 2 : 0, background: "var(--ink-000)", borderRadius: "2px 2px 0 0" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, borderTop: "1px solid var(--border-hairline)", paddingTop: 5 }}>
            {months.map((m) => (
              <span key={m} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
                {monthFmt.format(new Date(`${m}-01`))}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ventes conclues par mois, toutes notes confondues.</span>
        </div>

        {liquidity ? (
          <div style={{ flex: "2 1 260px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            {[
              { v: liquidity.salesCount30d, k: "Ventes 30j" },
              { v: liquidity.salesCount90d, k: "Ventes 90j" },
              { v: liquidity.listingCount, k: "Annonces actives" },
              { v: liquidity.sellThroughRate30d != null ? `${(liquidity.sellThroughRate30d * 100).toFixed(0)}%` : "—", k: "Sell-through 30j" },
            ].map((c) => (
              <div key={c.k} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(15px, 2.2vh, 19px)", color: "var(--text-strong)" }}>{c.v}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-strong)" }}>{c.k}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: "2 1 260px", minWidth: 0, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Stock d&apos;annonces actives non suivi pour cette carte (couverture eBay restreinte au scellé pour l&apos;instant).
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function buildLastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
