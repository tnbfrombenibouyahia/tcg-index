import { LiveScreen } from "@/components/cardquant/live/LiveScreen";
import { getSyncStatus } from "@/lib/queries/syncStatus";
import { getDataCoverage } from "@/lib/queries/dataCoverage";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Live "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/live/page.tsx (ancien design,
// supprimée) -- réutilise les DEUX mêmes requêtes (getSyncStatus,
// getDataCoverage) et la même route de polling (/api/sync-status) que
// l'ancien LiveDashboard.tsx (composants components/live/* laissés
// orphelins plutôt que supprimés).
// ─────────────────────────────────────────────────────────────────────────────

export default async function CardQuantLivePage() {
  const [initialData, coverage, syncLabel] = await Promise.all([getSyncStatus(), getDataCoverage(), buildSyncLabel()]);

  return <LiveScreen syncLabel={syncLabel} initialData={initialData} coverage={coverage} />;
}
