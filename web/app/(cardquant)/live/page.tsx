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
  // Chronométrage temporaire (2026-09-07) -- diagnostic de lenteur perçue en
  // nav réelle, cf. lib/db.ts::createClient(). À retirer une fois la vraie
  // source identifiée.
  const __tPage = Date.now();
  const [initialData, coverage, syncLabel] = await Promise.all([getSyncStatus(), getDataCoverage(), buildSyncLabel()]);
  console.log(`[cardquant-db-timing] live Promise.all (3 requêtes): ${Date.now() - __tPage}ms`);

  return <LiveScreen syncLabel={syncLabel} initialData={initialData} coverage={coverage} />;
}
