import { DashboardScreen } from "@/components/cardquant/dashboard/DashboardScreen";
import { getUniverse } from "@/lib/universe";
import { getAllIndices } from "@/lib/queries/indices";
import { getDivergence } from "@/lib/queries/divergence";
import { getGradingRoiRanking } from "@/lib/queries/gradingRoi";
import { getLiquidity } from "@/lib/queries/liquidity";
import { getSetHeatmap, getMonthlyEbaySales, getPopulationBySet } from "@/lib/queries/dashboardOverview";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard "CardQuant" (redesign Slabline, écran pilote de la migration --
// cf. mémoire projet "cardquant-rebrand"). Remplace app/(app)/dashboard --
// déplacé hors du groupe (app) pour ne plus hériter du GlobalDock de
// l'ancien design (cf. app/(cardquant)/layout.tsx).
//
// Toutes les tuiles sont branchées sur de vraies requêtes, sauf 3 limites
// assumées et documentées à leur endroit d'usage : (1) EUR/USD et FR/EN du
// header sont cosmétiques (TopNav.tsx), (2) la heatmap et le graphique de
// ventes montrent TOUJOURS les deux univers ensemble, indépendamment du
// cookie "universe" (cohérent avec le design d'origine, qui compare
// Pokémon/One Piece côte à côte sur ces deux panneaux précisément), (3) la
// tuile KPI "Ventes ... S-1" et le SegmentBar ROI, eux, respectent l'univers
// actif comme le reste du site.
// ─────────────────────────────────────────────────────────────────────────────

const DIVERGENCE_THRESHOLD_PCT = 8;

function computeWeeklySales(indices: Awaited<ReturnType<typeof getAllIndices>>["indices"], tcg: string) {
  const idx = indices.find((i) => i.tcg === tcg && i.kind === "global");
  if (!idx || idx.volume.length < 14) return { salesWeek: null, salesPrevWeek: null, salesDeltaPct: null };
  const sorted = [...idx.volume].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const last14 = sorted.slice(-14);
  const current = last14.slice(7).reduce((sum, p) => sum + p.salesCount, 0);
  const previous = last14.slice(0, 7).reduce((sum, p) => sum + p.salesCount, 0);
  const salesDeltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { salesWeek: current, salesPrevWeek: previous, salesDeltaPct };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default async function CardQuantDashboardPage() {
  const universe = await getUniverse();

  const [indicesResponse, divergenceRows, gradingRoi, liquidityRows, heatmapRows, salesTrendPoints, populationRows, syncLabel] =
    await Promise.all([
      getAllIndices(21),
      getDivergence({ windowDays: 30, minPrice: 5, limit: 60 }), // pas de `sort` : défaut = |divergence| décroissant, cf. son commentaire
      getGradingRoiRanking({ tcg: universe, sort: "roi_desc", limit: 30 }),
      getLiquidity({ limit: 100 }), // pas de filtre tcg : jauge "marché suivi" volontairement globale, cf. commentaire de tête
      getSetHeatmap({ windowDays: 30, limit: 30 }),
      getMonthlyEbaySales({ months: 12 }),
      getPopulationBySet({ limit: 5 }),
      buildSyncLabel(),
    ]);

  const { salesWeek, salesPrevWeek, salesDeltaPct } = computeWeeklySales(indicesResponse.indices, universe);

  const notableDivergences = divergenceRows.filter((r) => Math.abs(r.priceChangePct) >= DIVERGENCE_THRESHOLD_PCT);
  const divergenceDeclineCount = notableDivergences.filter((r) => r.priceChangePct < 0).length;

  const roiValues = gradingRoi.rows.map((r) => r.defaultResult.roiPct);
  const roiAvgPct = roiValues.length > 0 ? roiValues.reduce((a, b) => a + b, 0) / roiValues.length : null;

  const sellThroughValues = liquidityRows.map((r) => r.sellThroughRate30d).filter((v): v is number => v != null);
  const sellThroughMedianPct = median(sellThroughValues.map((v) => v * 100));

  return (
    <DashboardScreen
      syncLabel={syncLabel}
      kpi={{
        universeLabel: universe === "pokemon" ? "Pokémon" : "One Piece",
        salesWeek,
        salesPrevWeek,
        salesDeltaPct,
        divergenceCount: notableDivergences.length,
        divergenceDeclineCount,
        roiAvgPct,
        sellThroughMedianPct,
      }}
      heatmapRows={heatmapRows}
      salesTrendPoints={salesTrendPoints}
      opportunityRows={notableDivergences.slice(0, 8)}
      populationRows={populationRows}
    />
  );
}
