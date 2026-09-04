import type { DivergenceRow, UndervaluedRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";
import type { GradingRoiRow } from "@/lib/gradingRoi";
import type { LanguageArbitrageRow } from "@/lib/queries/languageArbitrage";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { StructuralScorePanel } from "./StructuralScorePanel";
import { LanguageArbitragePanel } from "./LanguageArbitragePanel";
import { PriceVolumeDivergencePanel } from "./PriceVolumeDivergencePanel";
import { RoiOpportunityPanel } from "./RoiOpportunityPanel";

// Écran Sous-évalué du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- 4 signaux indépendants, chacun réutilisant un
// moteur déjà en prod ailleurs sur le site (undervalued_scores, divergence,
// grading ROI) sauf l'arbitrage inter-langues (nouvelle requête en lot, cf.
// lib/queries/languageArbitrage.ts). Même surcharge sombre + TopNav que les
// autres écrans migrés.
export function UndervaluedScreen({
  syncLabel,
  structuralByTcg,
  arbitrageRows,
  divergenceRows,
  roiRows,
}: {
  syncLabel: string | null;
  structuralByTcg: Record<Tcg, UndervaluedRow[]>;
  arbitrageRows: LanguageArbitrageRow[];
  divergenceRows: DivergenceRow[];
  roiRows: GradingRoiRow[];
}) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "10px 14px", display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Détection de sous-évaluation</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Quatre signaux indépendants : structurel, arbitrage, divergence, gradation.</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Pas un conseil d&apos;investissement</span>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridAutoRows: "minmax(300px, 1fr)", gap: 10, flex: "1 1 auto" }}>
          <StructuralScorePanel byTcg={structuralByTcg} />
          <LanguageArbitragePanel rows={arbitrageRows} />
          <PriceVolumeDivergencePanel rows={divergenceRows} />
          <RoiOpportunityPanel rows={roiRows} />
        </div>
      </main>
    </div>
  );
}
