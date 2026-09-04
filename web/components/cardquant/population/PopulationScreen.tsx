import type { PopulationRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";
import type { PopulationGrowth, PopulationSort } from "@/lib/queries/populationAnalysis";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { PopulationSearchHeader } from "./PopulationSearchHeader";
import { PopulationRankTable } from "./PopulationRankTable";
import { GradeDistributionPanel } from "./GradeDistributionPanel";
import { GemRateGaugePanel } from "./GemRateGaugePanel";
import { PopGrowthPanel } from "./PopGrowthPanel";
import { PopBySetPanel } from "./PopBySetPanel";

// Écran Population PSA du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que les autres
// écrans migrés. Les panneaux de droite (distribution, gem rate, population
// par set) sont calculés sur `rows` -- la sélection déjà filtrée/chargée
// pour le tableau de gauche, pas une nouvelle requête par panneau.
export function PopulationScreen({
  syncLabel,
  rows,
  totalCount,
  tcg,
  lang,
  sort,
  growth,
  searchParams,
}: {
  syncLabel: string | null;
  rows: PopulationRow[];
  totalCount: number;
  tcg?: Tcg;
  lang?: string;
  sort?: PopulationSort;
  growth: PopulationGrowth;
  searchParams: URLSearchParams;
}) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <PopulationSearchHeader totalCount={totalCount} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(0, 1.7fr)", gap: 10, alignItems: "stretch", flex: "1 1 auto" }}>
          <PopulationRankTable rows={rows} totalCount={totalCount} tcg={tcg} lang={lang} sort={sort} searchParams={searchParams} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, flex: "0 0 auto" }}>
              <GradeDistributionPanel rows={rows} />
              <GemRateGaugePanel rows={rows} />
              <PopGrowthPanel growth={growth} />
            </div>
            <PopBySetPanel rows={rows} />
          </div>
        </div>
      </main>
    </div>
  );
}
