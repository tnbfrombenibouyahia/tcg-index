import type { SealedEvRow } from "@/lib/types";
import type { SealedByGeneration, SetSummary, SetTopCardRow } from "@/lib/queries/setAnalysis";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { SetSearchHeader } from "./SetSearchHeader";
import { TopCardsPanel } from "./TopCardsPanel";
import { GenerationComparisonPanel } from "./GenerationComparisonPanel";
import { SealedByGenerationPanel } from "./SealedByGenerationPanel";
import { OpenabilityPanel } from "./OpenabilityPanel";

// Écran Analyse set du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que les autres
// écrans migrés.
export function SetAnalysisScreen({
  syncLabel,
  summary,
  topCards,
  sealedByGeneration,
  sealedEv,
}: {
  syncLabel: string | null;
  summary: SetSummary;
  topCards: SetTopCardRow[];
  sealedByGeneration: SealedByGeneration[];
  sealedEv: SealedEvRow | null;
}) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <SetSearchHeader summary={summary} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 4fr)", gap: 16, alignItems: "stretch", flex: "1 1 auto" }}>
          <TopCardsPanel rows={topCards} totalCount={summary.itemCount} />
          <div style={{ display: "grid", gridTemplateRows: "minmax(180px, auto) minmax(200px, auto) minmax(300px, auto)", gap: 16, minWidth: 0 }}>
            <GenerationComparisonPanel summary={summary} />
            <SealedByGenerationPanel rows={sealedByGeneration} currentYear={summary.releaseYear} />
            <OpenabilityPanel ev={sealedEv} />
          </div>
        </div>
      </main>
    </div>
  );
}
