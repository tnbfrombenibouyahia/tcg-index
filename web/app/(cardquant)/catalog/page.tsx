import { CatalogueScreen } from "@/components/cardquant/catalogue/CatalogueScreen";
import { browseCatalogue, getCatalogueFilterOptions, type PriceState } from "@/lib/queries/catalogueBrowse";
import { getSetsByGeneration } from "@/lib/queries/setsBrowse";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/catalog/page.tsx (la recherche par
// nom/numéro, cf. components/catalog/CatalogSearch.tsx, reste utilisée par
// personne d'autre -- laissée orpheline plutôt que supprimée). `[id]` (fiche
// carte /catalog/[id]) reste dans le groupe (app), pas encore migré -- cf.
// commentaire de CatalogueGrid.tsx : cet écran ouvre la même
// ItemDetailModal existante plutôt qu'une nouvelle fiche carte.
//
// PAGE_SIZE 30 : proche de la grille "6 colonnes" du mockup sans être un
// multiple exact (41k+ items, pagination réelle nécessaire -- le mockup
// n'en montrait pas, cf. CataloguePager.tsx).
//
// Vue "Par set" (`?view=sets`, demande utilisateur 2026-09-10) : ne charge
// QUE getSetsByGeneration, jamais browseCatalogue en plus -- les deux vues
// ne sont jamais affichées en même temps (cf. CatalogueScreen.tsx), pas de
// raison de payer les deux requêtes à chaque chargement.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const VALID_STATES = new Set<PriceState>(["any", "raw", "graded"]);

export default async function CardQuantCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const get = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const tcgRaw = get("tcg");
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;
  const language = get("language") || undefined;
  const rarity = get("rarity") || undefined;
  const stateRaw = get("state");
  const priceState: PriceState = VALID_STATES.has(stateRaw as PriceState) ? (stateRaw as PriceState) : "any";
  const setCode = get("set") || undefined;
  const pageRaw = Number(get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const view: "grid" | "sets" = get("view") === "sets" ? "sets" : "grid";

  const [browseResult, filterOptions, syncLabel, setGroups] = await Promise.all([
    view === "grid" ? browseCatalogue({ tcg, language, rarity, priceState, setCode, page, pageSize: PAGE_SIZE }) : Promise.resolve({ rows: [], totalCount: 0 }),
    getCatalogueFilterOptions(),
    buildSyncLabel(),
    view === "sets" ? getSetsByGeneration({ tcg, language }) : Promise.resolve([]),
  ]);
  const { rows, totalCount } = browseResult;
  const { rarities, languages } = filterOptions;

  const setCount = setGroups.reduce((sum, g) => sum + g.sets.length, 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])),
  );

  return (
    <CatalogueScreen
      syncLabel={syncLabel}
      view={view}
      rows={rows}
      totalCount={view === "sets" ? setCount : totalCount}
      page={page}
      totalPages={totalPages}
      setGroups={setGroups}
      tcg={tcg}
      language={language}
      rarity={rarity}
      priceState={priceState}
      setCode={setCode}
      languages={languages}
      rarities={rarities}
      searchParams={searchParamsForLinks}
    />
  );
}
