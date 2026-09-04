import { Icon } from "../core/Icon";
import { LiquidityMeter } from "../market/LiquidityMeter";
import { BarSeries } from "../data/BarSeries";

// Section "Métriques calculées" de la landing CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- prolonge l'exemple illustratif du Hero (même carte
// Zoro alt art : écart +17%, ROI +48,3%), pas une nouvelle donnée live.
export function MetricsSection() {
  return (
    <section id="metriques" style={{ maxWidth: 1600, margin: "0 auto", padding: "72px 24px 0", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Métriques calculées</span>
          <h2 style={{ margin: 0, fontSize: 38, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)" }}>
            Les quatre chiffres qui décident d&apos;un achat.
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-body)", maxWidth: 340 }}>
          Calculées à chaque synchro, sur l&apos;historique complet des ventes et des populations gradées.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "stretch" }}>
        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="git-compare-arrows" size={13} color="var(--text-strong)" />
            <span style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Écart vs marché</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: 30, letterSpacing: "-0.01em", color: "var(--down-500)" }}>+17</span>
            <span style={{ fontSize: 13, color: "var(--down-500)", alignSelf: "flex-start", paddingTop: 4 }}>%</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--text-body)" }}>L&apos;écart entre le prix demandé et la référence agrégée, sur l&apos;annonce ouverte.</p>
        </section>

        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="target" size={13} color="var(--text-strong)" />
            <span style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>ROI gradation</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: 30, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>+48,3</span>
            <span style={{ fontSize: 13, color: "var(--text-body)", alignSelf: "flex-start", paddingTop: 4 }}>%</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--text-body)" }}>Gain attendu d&apos;un envoi PSA, frais et taux de gem inclus, par carte.</p>
        </section>

        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="activity" size={13} color="var(--text-strong)" />
            <span style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Liquidité 30j</span>
          </div>
          <LiquidityMeter label="" value={62} steps={14} />
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--text-body)" }}>Volume et sell-through : combien de temps pour revendre au prix affiché.</p>
        </section>

        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="layers" size={13} color="var(--text-strong)" />
            <span style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Divergence sources</span>
          </div>
          <BarSeries data={[12, 18, 15, 22, 31, 26, 34, 29, 41, 38, 33, 45, 40, 36]} height={46} axis={["Jan", "Août"]} />
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: "var(--text-body)" }}>Quand eBay et PriceCharting ne racontent pas la même histoire, il y a une marge.</p>
        </section>
      </div>
    </section>
  );
}
