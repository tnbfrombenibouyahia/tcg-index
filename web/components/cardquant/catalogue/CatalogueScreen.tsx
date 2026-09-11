import type { CatalogueBrowseRow, PriceState } from "@/lib/queries/catalogueBrowse";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";
import type { Tcg } from "@/lib/constants";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { CatalogueFilters } from "./CatalogueFilters";
import { CatalogueBreadcrumb } from "./CatalogueBreadcrumb";
import { CatalogueGrid } from "./CatalogueGrid";
import { CataloguePager } from "./CataloguePager";
import { SetBrowser } from "./SetBrowser";

// Écran Catalogue du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que le Dashboard.
//
// Navigation "poupée russe" (demande utilisateur 2026-09-10, 3e itération :
// "les sets de toutes les générations directement, juste des dividers
// entre chaque génération, comme PokéCardex") -- 2 niveaux emboîtés, un
// seul affiché à la fois, jamais de grille globale non filtrée :
//   1. "sets"  -- SetBrowser, TOUS les sets, regroupés par génération avec
//                 un simple divider entre chaque groupe (plus de niveau
//                 "Générations" cliquable à part, cf. SetBrowser.tsx)
//   2. "cards" -- CatalogueGrid, les cartes du set choisi (`set`)
// `stage` est calculé par page.tsx et ne charge QUE les données du niveau
// actif (jamais getSetsByGeneration ET browseCatalogue en même temps).
export interface CatalogueScreenProps {
  syncLabel: string | null;
  stage: "sets" | "cards";
  rows: CatalogueBrowseRow[];
  totalCount: number;
  page: number;
  totalPages: number;
  setGroups: SetGenerationGroup[];
  tcg?: Tcg;
  language: string;
  rarity?: string;
  priceState: PriceState;
  setCode?: string;
  languages: string[];
  rarities: string[];
  searchParams: URLSearchParams;
}

export function CatalogueScreen({
  syncLabel,
  stage,
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
  const resultsLabel = stage === "cards" ? "résultats" : "sets";
  const activeSetName = stage === "cards" ? (rows[0]?.setName ?? setCode) : undefined;

  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <CatalogueBreadcrumb setLabel={activeSetName} searchParams={searchParams} />
        <CatalogueFilters stage={stage} tcg={tcg} language={language} rarity={rarity} priceState={priceState} setCode={setCode} languages={languages} rarities={rarities} totalCount={totalCount} resultsLabel={resultsLabel} />
        {stage === "sets" ? (
          <SetBrowser groups={setGroups} searchParams={searchParams} />
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
