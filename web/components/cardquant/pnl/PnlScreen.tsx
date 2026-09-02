import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { PnlApp } from "./PnlApp";

// Écran PnL du Terminal CardQuant (cf. mémoire projet "cardquant-rebrand").
// Même surcharge sombre + TopNav que les autres écrans migrés ; le contenu
// lui-même (PnlApp) est entièrement client, cf. son commentaire.
export function PnlScreen({ syncLabel }: { syncLabel: string | null }) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <PnlApp />
      </main>
    </div>
  );
}
