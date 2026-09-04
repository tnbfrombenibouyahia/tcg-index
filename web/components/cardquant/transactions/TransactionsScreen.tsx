import type { SaleRow } from "@/lib/types";
import type { BreakdownSlice, HourlyVolume, SalesKpis, TopSetRow, YearlyVolume } from "@/lib/queries/transactionsOverview";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { TxKpiBar } from "./TxKpiBar";
import { LatestSalesPanel } from "./LatestSalesPanel";
import { BreakdownDonuts } from "./BreakdownDonuts";
import { TopSetsPanel } from "./TopSetsPanel";
import { YearlyVolumePanel } from "./YearlyVolumePanel";
import { HourlyBarsPanel } from "./HourlyBarsPanel";

// Écran Transactions du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que les autres
// écrans migrés.
export interface TransactionsScreenProps {
  syncLabel: string | null;
  kpis: SalesKpis;
  latestSales: SaleRow[];
  byTcg: BreakdownSlice[];
  byLanguage: BreakdownSlice[];
  topSets: TopSetRow[];
  yearly: YearlyVolume[];
  hourly: HourlyVolume[];
}

export function TransactionsScreen({ syncLabel, kpis, latestSales, byTcg, byLanguage, topSets, yearly, hourly }: TransactionsScreenProps) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <TxKpiBar kpis={kpis} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr)", alignItems: "stretch", gap: 16 }}>
          <LatestSalesPanel sales={latestSales} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, minWidth: 0 }}>
            <BreakdownDonuts byTcg={byTcg} byLanguage={byLanguage} />
            <TopSetsPanel rows={topSets} />
            <YearlyVolumePanel rows={yearly} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16 }}>
          <HourlyBarsPanel hours={hourly} />
        </div>
      </main>
    </div>
  );
}
