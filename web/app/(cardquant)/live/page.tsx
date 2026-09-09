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

// force-dynamic : cf. commentaire équivalent dans app/(cardquant)/pnl/page.tsx
// (timeout de build du 2026-09-09, requêtes exécutées pour de vrai contre
// Cloud SQL depuis une machine de build US vers europe-west3) -- doublement
// justifié ici, cette page doit de toute façon rester temps réel (cf.
// getSyncStatus() dans lib/queries/syncStatus.ts).
export const dynamic = "force-dynamic";

export default async function CardQuantLivePage() {
  // getSyncStatus() reste volontairement NON caché (cf. son commentaire dans
  // lib/queries/syncStatus.ts) : la page /live doit refléter un run en cours
  // en temps réel, contrairement au reste du site. getDataCoverage(), lui,
  // est un recap agrégé -- mis en cache 5 min comme les autres.
  const [initialData, coverage, syncLabel] = await Promise.all([getSyncStatus(), getDataCoverage(), buildSyncLabel()]);

  return <LiveScreen syncLabel={syncLabel} initialData={initialData} coverage={coverage} />;
}
