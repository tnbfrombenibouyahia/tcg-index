import type { CatalogueBrowseRow, PriceState } from "@/lib/queries/catalogueBrowse";
import type { Tcg } from "@/lib/constants";
import { darkOverrideStyle } from "../darkTokenOverride";
import { TopNav } from "../TopNav";
import { CatalogueFilters } from "./CatalogueFilters";
import { CatalogueGrid } from "./CatalogueGrid";
import { CataloguePager } from "./CataloguePager";

// Écran Catalogue du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Même surcharge sombre + TopNav que le Dashboard.
export interface CatalogueScreenProps {
  syncLabel: string | null;
  rows: CatalogueBrowseRow[];
  totalCount: number;
  page: number;
  totalPages: number;
  tcg?: Tcg;
  language?: string;
  rarity?: string;
  priceState: PriceState;
  languages: string[];
  rarities: string[];
  searchParams: URLSearchParams;
}

export function CatalogueScreen({
  syncLabel,
  rows,
  totalCount,
  page,
  totalPages,
  tcg,
  language,
  rarity,
  priceState,
  languages,
  rarities,
  searchParams,
}: CatalogueScreenProps) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <TopNav syncLabel={syncLabel} />
      <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: "calc(100vh - 102px)", boxSizing: "border-box" }}>
        <CatalogueFilters tcg={tcg} language={language} rarity={rarity} priceState={priceState} languages={languages} rarities={rarities} totalCount={totalCount} />
        <CatalogueGrid rows={rows} />
        <CataloguePager page={page} totalPages={totalPages} searchParams={searchParams} />
      </main>
    </div>
  );
}
