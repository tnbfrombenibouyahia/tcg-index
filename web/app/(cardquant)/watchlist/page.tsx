import { WatchlistScreen } from "@/components/cardquant/watchlist/WatchlistScreen";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist "CardQuant" (cf. mémoire projet "cardquant-rebrand") -- backend
// déjà en prod (favoris ajoutés le 2026-08-29, cf. pricing_api/main.py::/favorites),
// seul le site en manquait (§10 handoff). Comme PnL, entièrement client
// (WatchlistApp) : web/ n'a que du SELECT sur Postgres, cette écran passe
// par pricing_api directement depuis le navigateur.
// ─────────────────────────────────────────────────────────────────────────────

export default async function CardQuantWatchlistPage() {
  const syncLabel = await buildSyncLabel();
  return <WatchlistScreen syncLabel={syncLabel} />;
}
