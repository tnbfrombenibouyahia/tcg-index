import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { WatchlistApp } from "./WatchlistApp";

// Écran Watchlist du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que les autres
// écrans migrés ; contenu entièrement client (WatchlistApp).
export function WatchlistScreen({ syncLabel }: { syncLabel: string | null }) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <WatchlistApp />
      </main>
    </div>
  );
}
