import { WatchlistScreen } from "@/components/cardquant/watchlist/WatchlistScreen";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist "CardQuant" (cf. mémoire projet "cardquant-rebrand") -- backend
// déjà en prod (favoris ajoutés le 2026-08-29, cf. pricing_api/main.py::/favorites),
// seul le site en manquait (§10 handoff). Comme PnL, entièrement client
// (WatchlistApp) : web/ n'a que du SELECT sur Postgres, cette écran passe
// par pricing_api directement depuis le navigateur.
// ─────────────────────────────────────────────────────────────────────────────

// force-dynamic : cf. commentaire équivalent dans app/(cardquant)/pnl/page.tsx
// (timeout de build du 2026-09-09, requêtes exécutées pour de vrai contre
// Cloud SQL depuis une machine de build US vers europe-west3).
export const dynamic = "force-dynamic";

export default async function CardQuantWatchlistPage() {
  const syncLabel = await buildSyncLabel();
  return <WatchlistScreen syncLabel={syncLabel} />;
}
