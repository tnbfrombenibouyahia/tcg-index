import { UndervaluedScreen } from "@/components/cardquant/undervalued/UndervaluedScreen";
import { getUndervalued } from "@/lib/queries/undervalued";
import { getLanguageArbitrage } from "@/lib/queries/languageArbitrage";
import { getDivergence } from "@/lib/queries/divergence";
import { getGradingRoiRanking } from "@/lib/queries/gradingRoi";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Sous-évalué "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/undervalued/page.tsx (ancien
// design, supprimée -- components/undervalued/* laissés orphelins). 3 des 4
// panneaux réutilisent des moteurs déjà en prod ailleurs sur le site
// (undervalued_scores, divergence, grading ROI) ; seul l'arbitrage
// inter-langues est une requête neuve (lib/queries/languageArbitrage.ts).
// ─────────────────────────────────────────────────────────────────────────────

const MIN_MARKET_PRICE = 5; // même plancher que partout ailleurs, cf. lib/queries/undervalued.ts

export default async function CardQuantUndervaluedPage() {
  const [pokemonUnder, onePieceUnder, arbitrageRows, divergenceRows, gradingRoi, syncLabel] = await Promise.all([
    getUndervalued({ tcg: "pokemon", minMarketPrice: MIN_MARKET_PRICE, sort: "score_desc", limit: 15 }),
    getUndervalued({ tcg: "one-piece", minMarketPrice: MIN_MARKET_PRICE, sort: "score_desc", limit: 15 }),
    getLanguageArbitrage({ minGapPct: 15, limit: 12 }),
    getDivergence({ windowDays: 30, minPrice: MIN_MARKET_PRICE, limit: 12 }), // pas de `sort` : défaut = |divergence| décroissant
    getGradingRoiRanking({ sort: "profit_desc", minUngradedPrice: MIN_MARKET_PRICE, limit: 12 }),
    buildSyncLabel(),
  ]);

  return (
    <UndervaluedScreen
      syncLabel={syncLabel}
      structuralByTcg={{ pokemon: pokemonUnder, "one-piece": onePieceUnder }}
      arbitrageRows={arbitrageRows}
      divergenceRows={divergenceRows}
      roiRows={gradingRoi.rows}
    />
  );
}
