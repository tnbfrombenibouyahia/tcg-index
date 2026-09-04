import { Delta } from "../data/Delta";
import { SegmentBar } from "../data/SegmentBar";
import { GaugeArc } from "../data/GaugeArc";

// Les 4 tuiles KPI du haut du Dashboard CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Server Component pur -- aucune des 4 valeurs n'a
// besoin d'interactivité, tout est calculé côté page.tsx à partir de vraies
// requêtes (cf. son commentaire de tête pour le détail par tuile).
export interface KpiTilesProps {
  universeLabel: string;
  salesWeek: number | null;
  salesPrevWeek: number | null;
  salesDeltaPct: number | null;
  divergenceCount: number;
  divergenceDeclineCount: number;
  roiAvgPct: number | null;
  sellThroughMedianPct: number | null;
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;
}

function Metric({ value, unit }: { value: React.ReactNode; unit?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
      <span style={{ fontSize: "var(--type-metric-size)", letterSpacing: "-0.01em", color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {unit ? <span style={{ fontSize: 13, color: "var(--text-body)", alignSelf: "flex-start", paddingTop: 4 }}>{unit}</span> : null}
    </div>
  );
}

export function KpiTiles({
  universeLabel,
  salesWeek,
  salesPrevWeek,
  salesDeltaPct,
  divergenceCount,
  divergenceDeclineCount,
  roiAvgPct,
  sellThroughMedianPct,
}: KpiTilesProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
      <Tile>
        <Label>Ventes {universeLabel} · S-1</Label>
        <Metric value={salesWeek ?? "—"} unit="ventes" />
        {salesDeltaPct != null && salesPrevWeek != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Delta value={Math.round(salesDeltaPct * 10) / 10} size={12} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>vs S-2 · {salesPrevWeek}</span>
          </div>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Pas assez d&apos;historique pour comparer à S-2.</span>
        )}
      </Tile>

      <Tile>
        <Label>Écarts prix/volume actifs · 30j</Label>
        <Metric value={divergenceCount} unit="cartes" />
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>dont {divergenceDeclineCount} en repli</span>
      </Tile>

      <Tile>
        <Label>ROI gradation moyen</Label>
        {roiAvgPct != null ? (
          <>
            <Metric value={roiAvgPct.toFixed(1).replace(".", ",")} unit="%" />
            <SegmentBar segments={[{ value: Math.max(0, Math.min(100, roiAvgPct)), color: "var(--green-400)" }]} hatchFrom={null} height={8} />
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Pas assez de candidats gradation pour cet univers.</span>
        )}
      </Tile>

      <Tile>
        <Label>Sell-through 30j</Label>
        {sellThroughMedianPct != null ? (
          <GaugeArc value={Math.round(sellThroughMedianPct * 10) / 10} size={132} label="médiane du marché suivi" />
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Pas de données de liquidité disponibles.</span>
        )}
      </Tile>
    </div>
  );
}
