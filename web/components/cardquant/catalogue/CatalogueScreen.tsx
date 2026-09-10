import type { CatalogueBrowseRow, PriceState } from "@/lib/queries/catalogueBrowse";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";
import type { Tcg } from "@/lib/constants";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { CatalogueFilters } from "./CatalogueFilters";
import { CatalogueBreadcrumb } from "./CatalogueBreadcrumb";
import { CatalogueGrid } from "./CatalogueGrid";
import { CataloguePager } from "./CataloguePager";
import { GenerationBrowser } from "./GenerationBrowser";
import { SetBrowser } from "./SetBrowser";

// Écran Catalogue du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que le Dashboard.
//
// Navigation "poupée russe" (demande utilisateur 2026-09-10 : "vraiment
// comme PokéCardex", remplace la bascule Grille de cartes/Par set du
// premier jet) -- trois niveaux emboîtés, un seul affiché à la fois, jamais
// de grille globale non filtrée :
//   1. "generations" -- GenerationBrowser, une tuile par génération
//   2. "sets"        -- SetBrowser, les sets de LA génération choisie (`era`)
//   3. "cards"        -- CatalogueGrid, les cartes du set choisi (`set`)
// `stage` est calculé par page.tsx (seul endroit qui sait si `era`
// correspond à un groupe réellement existant) et ne charge QUE les données
// du niveau actif (jamais getSetsByGeneration ET browseCatalogue en même
// temps, cf. page.tsx).
export interface CatalogueScreenProps {
  syncLabel: string | null;
  stage: "generations" | "sets" | "cards";
  rows: CatalogueBrowseRow[];
  totalCount: number;
  page: number;
  totalPages: number;
  setGroups: SetGenerationGroup[];
  activeGroup: SetGenerationGroup | null;
  tcg?: Tcg;
  language: string;
  rarity?: string;
  priceState: PriceState;
  era?: string;
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
  activeGroup,
  tcg,
  language,
  rarity,
  priceState,
  era,
  setCode,
  languages,
  rarities,
  searchParams,
}: CatalogueScreenProps) {
  const resultsLabel = stage === "cards" ? "résultats" : stage === "sets" ? "sets" : "générations";
  const activeSetName = stage === "cards" ? (rows[0]?.setName ?? setCode) : undefined;

  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <CatalogueBreadcrumb era={era} setLabel={activeSetName} searchParams={searchParams} />
        <CatalogueFilters stage={stage} tcg={tcg} language={language} rarity={rarity} priceState={priceState} setCode={setCode} languages={languages} rarities={rarities} totalCount={totalCount} resultsLabel={resultsLabel} />
        {stage === "generations" ? (
          <GenerationBrowser groups={setGroups} searchParams={searchParams} />
        ) : stage === "sets" ? (
          <SetBrowser group={activeGroup!} searchParams={searchParams} />
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
