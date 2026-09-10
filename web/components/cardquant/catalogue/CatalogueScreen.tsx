import type { CatalogueBrowseRow, PriceState } from "@/lib/queries/catalogueBrowse";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";
import type { Tcg } from "@/lib/constants";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { CatalogueFilters } from "./CatalogueFilters";
import { CatalogueViewToggle } from "./CatalogueViewToggle";
import { CatalogueGrid } from "./CatalogueGrid";
import { CataloguePager } from "./CataloguePager";
import { SetBrowser } from "./SetBrowser";

// Écran Catalogue du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que le Dashboard.
//
// Vue "Par set" (demande utilisateur 2026-09-10) : bascule cote client
// (CatalogueViewToggle, état `?view=sets` dans l'URL) entre la grille de
// cartes habituelle et SetBrowser.tsx -- page.tsx ne charge que les données
// de la vue active (jamais les deux Promise.all en même temps).
export interface CatalogueScreenProps {
  syncLabel: string | null;
  view: "grid" | "sets";
  rows: CatalogueBrowseRow[];
  totalCount: number;
  page: number;
  totalPages: number;
  setGroups: SetGenerationGroup[];
  tcg?: Tcg;
  language?: string;
  rarity?: string;
  priceState: PriceState;
  setCode?: string;
  languages: string[];
  rarities: string[];
  searchParams: URLSearchParams;
}

export function CatalogueScreen({
  syncLabel,
  view,
  rows,
  totalCount,
  page,
  totalPages,
  setGroups,
  tcg,
  language,
  rarity,
  priceState,
  setCode,
  languages,
  rarities,
  searchParams,
}: CatalogueScreenProps) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <CatalogueViewToggle view={view} />
        <CatalogueFilters view={view} tcg={tcg} language={language} rarity={rarity} priceState={priceState} setCode={setCode} languages={languages} rarities={rarities} totalCount={totalCount} resultsLabel={view === "sets" ? "sets" : "résultats"} />
        {view === "sets" ? (
          <SetBrowser groups={setGroups} />
        ) : (
          <>
            <CatalogueGrid rows={rows} />
            <CataloguePager page={page} totalPages={totalPages} searchParams={searchParams} />
          </>
        )}
      </main>
    </div>
  );
}
