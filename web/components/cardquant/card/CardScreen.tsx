import type { ItemDetail } from "@/lib/types";
import type { GradingRoiCandidate, GradingRoiResult } from "@/lib/gradingRoi";
import type { LanguageCompareResult } from "@/lib/queries/compareLanguage";
import type { MonthlySalesCount } from "@/lib/queries/itemDetail";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { CardHeaderPanel } from "./CardHeaderPanel";
import { PriceHistoryPanel, type PriceSeries } from "./PriceHistoryPanel";
import { PopulationValuePanel } from "./PopulationValuePanel";
import { GradingEvPanel } from "./GradingEvPanel";
import { LiquidityPanel } from "./LiquidityPanel";
import { LanguageArbitragePanel } from "./LanguageArbitragePanel";

// Écran "Fiche carte" du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que les autres
// écrans migrés. Pas d'entrée de nav dédiée (une fiche carte n'a pas de
// route fixe -- la pilule "Fiche carte" du header reste désactivée, cf.
// TopNav.tsx) ; accessible depuis Catalogue ou par lien direct /catalog/[id].
export interface CardScreenProps {
  syncLabel: string | null;
  item: ItemDetail;
  ungradedPrice: number | null;
  ungradedDeltaPct: number | null;
  bestGradedPrice: number | null;
  bestGradedTier: string | null;
  bestGradedDeltaPct: number | null;
  priceSeries: PriceSeries[];
  monthlySales: MonthlySalesCount[];
  languageComparison: LanguageCompareResult;
  gradingRoi: { candidate: GradingRoiCandidate; result: GradingRoiResult } | null;
}

export function CardScreen({
  syncLabel,
  item,
  ungradedPrice,
  ungradedDeltaPct,
  bestGradedPrice,
  bestGradedTier,
  bestGradedDeltaPct,
  priceSeries,
  monthlySales,
  languageComparison,
  gradingRoi,
}: CardScreenProps) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <div style={{ flex: "1 1 auto", minHeight: 250, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
          <CardHeaderPanel
            item={item}
            ungradedPrice={ungradedPrice}
            ungradedDeltaPct={ungradedDeltaPct}
            bestGradedPrice={bestGradedPrice}
            bestGradedTier={bestGradedTier}
            bestGradedDeltaPct={bestGradedDeltaPct}
          />
          <PriceHistoryPanel series={priceSeries} />
        </div>

        <div style={{ flex: "1.2 1 auto", minHeight: 300, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
          <PopulationValuePanel population={item.population} latestPrices={item.latestPrices} ungradedPrice={ungradedPrice} />
          {gradingRoi ? (
            <GradingEvPanel candidate={gradingRoi.candidate} result={gradingRoi.result} />
          ) : (
            <section style={{ flex: "2 1 300px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>Pas assez de données (brut + au moins un prix gradé) pour calculer un ROI de gradation.</span>
            </section>
          )}
        </div>

        <div style={{ flex: "0.9 1 auto", minHeight: 250, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
          <LiquidityPanel monthlySales={monthlySales} liquidity={item.liquidity} />
          <LanguageArbitragePanel item={item} ownUngradedPrice={ungradedPrice} comparison={languageComparison} />
        </div>
      </main>
    </div>
  );
}
