import { getRecentRuns } from "@/lib/queries/syncStatus";

// Badge "Synchro OK · Xh" du header CardQuant (TopNav.tsx), affiché sur tous
// les écrans migrés (cf. mémoire projet "cardquant-rebrand") -- extrait ici
// pour ne pas dupliquer la même requête + calcul dans chaque page.tsx.
export async function buildSyncLabel(): Promise<string | null> {
  const runs = await getRecentRuns(20);
  const lastSuccess = runs.find((r) => r.status === "success" && r.finishedAt);
  if (!lastSuccess?.finishedAt) return null;
  const hours = Math.max(0, Math.round((Date.now() - new Date(lastSuccess.finishedAt).getTime()) / 3_600_000));
  return `Synchro OK · ${hours}h`;
}
