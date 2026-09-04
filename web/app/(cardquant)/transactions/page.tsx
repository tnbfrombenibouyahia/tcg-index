import { TransactionsScreen } from "@/components/cardquant/transactions/TransactionsScreen";
import { getSales } from "@/lib/queries/sales";
import { getSalesKpis, getSalesBreakdown, getTopSetsBySales, getSalesByReleaseYear, getHourlyVolume } from "@/lib/queries/transactionsOverview";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Transactions "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/transactions/page.tsx (ancien
// design, supprimée -- components/transactions/* laissés orphelins). "Dernières
// ventes" réutilise lib/queries/sales.ts::getSales tel quel ; tout le reste
// (KPI, répartitions, top sets, années, volume horaire) vient des nouvelles
// agrégations de lib/queries/transactionsOverview.ts.
// ─────────────────────────────────────────────────────────────────────────────

export default async function CardQuantTransactionsPage() {
  const [salesResult, kpis, breakdown, topSets, yearly, hourly, syncLabel] = await Promise.all([
    getSales({ sort: "date_desc", pageSize: 40 }),
    getSalesKpis(),
    getSalesBreakdown(30),
    getTopSetsBySales({ windowDays: 30, limit: 10 }),
    getSalesByReleaseYear(),
    getHourlyVolume(24),
    buildSyncLabel(),
  ]);

  return (
    <TransactionsScreen
      syncLabel={syncLabel}
      kpis={kpis}
      latestSales={salesResult.sales}
      byTcg={breakdown.byTcg}
      byLanguage={breakdown.byLanguage}
      topSets={topSets}
      yearly={yearly}
      hourly={hourly}
    />
  );
}
