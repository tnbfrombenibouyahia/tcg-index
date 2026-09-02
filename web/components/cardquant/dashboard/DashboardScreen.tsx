import type { DivergenceRow, MonthlySalesPoint, PopulationBySetRow, SetHeatmapRow } from "@/lib/types";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { KpiTiles, type KpiTilesProps } from "./KpiTiles";
import { HeatmapPanel } from "./HeatmapPanel";
import { SalesTrendPanel } from "./SalesTrendPanel";
import { OpportunitiesPanel } from "./OpportunitiesPanel";
import { PopulationPanel } from "./PopulationPanel";

// Racine du Terminal CardQuant, écran Dashboard (cf. mémoire projet
// "cardquant-rebrand"). darkOverrideStyle() applique la même surcharge sombre
// que "CardQuant Terminal.dc.html" (handoff) -- posée en inline sur ce seul
// sous-arbre, sans toucher aux tokens clairs globaux (utilisés par le design
// system lui-même). Ne pas dupliquer ce bloc ici : voir darkTokenOverride.ts.
const DARK_OVERRIDE = darkOverrideStyle({ minHeight: "100vh" });

export interface DashboardScreenProps {
  syncLabel: string | null;
  kpi: KpiTilesProps;
  heatmapRows: SetHeatmapRow[];
  salesTrendPoints: MonthlySalesPoint[];
  opportunityRows: DivergenceRow[];
  populationRows: PopulationBySetRow[];
}

export function DashboardScreen({ syncLabel, kpi, heatmapRows, salesTrendPoints, opportunityRows, populationRows }: DashboardScreenProps) {
  return (
    <div style={DARK_OVERRIDE}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <KpiTiles {...kpi} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 10 }}>
          <HeatmapPanel rows={heatmapRows} />
          <SalesTrendPanel points={salesTrendPoints} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(300px, 26vw, 400px)", gap: 10, alignItems: "stretch" }}>
          <OpportunitiesPanel rows={opportunityRows} />
          <PopulationPanel rows={populationRows} />
        </div>
      </main>
    </div>
  );
}
