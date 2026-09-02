import type { DataCoverageRow, SyncStatusResponse } from "@/lib/types";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { LiveBody } from "./LiveBody";

// Écran Live du Terminal CardQuant (cf. mémoire projet "cardquant-rebrand").
// Même surcharge sombre + TopNav que les autres écrans migrés.
export function LiveScreen({ syncLabel, initialData, coverage }: { syncLabel: string | null; initialData: SyncStatusResponse; coverage: DataCoverageRow[] }) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <LiveBody initialData={initialData} coverage={coverage} />
      </main>
    </div>
  );
}
