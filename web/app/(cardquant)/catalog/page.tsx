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
// Navigation "poupée russe" (demande utilisateur 2026-09-10, 3e itération :
// "les sets de toutes les générations directement, juste des dividers
// entre chaque génération, comme PokéCardex" -- remplace le niveau
// "Générations" cliquable à part des deux commits précédents sur cette
// page, cf. CatalogueScreen.tsx pour le détail des 2 niveaux restants) :
//   - `set` (choisi dans SetBrowser.tsx) seul pilote le niveau affiché --
//     tant qu'il est absent, TOUS les sets sont listés (regroupés par
//     génération avec un simple divider visuel, pas un filtre serveur).
//   - Une seule requête de données par chargement, jamais
//     getSetsByGeneration ET browseCatalogue en même temps.
//   - Langue : plus de "Toutes les langues" (demande utilisateur -- comme
//     PokéCardex, EN ou JP jamais mélangés). Résolue ICI avec repli sur EN
//     (ou la première langue dispo si EN n'existe pas en base).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const VALID_STATES = new Set<PriceState>(["any", "raw", "graded"]);
const DEFAULT_LANGUAGE = "EN";

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
  const languageRaw = get("language") || undefined;
  const rarity = get("rarity") || undefined;
  const stateRaw = get("state");
  const priceState: PriceState = VALID_STATES.has(stateRaw as PriceState) ? (stateRaw as PriceState) : "any";
  const setCode = get("set") || undefined;
  const pageRaw = Number(get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // Options de filtres d'abord (indépendantes de la langue résolue) --
  // nécessaires pour valider/résoudre `language` avant de lancer la requête
  // de niveau 1/2 ci-dessous.
  const [filterOptions, syncLabel] = await Promise.all([getCatalogueFilterOptions(), buildSyncLabel()]);
  const { rarities, languages } = filterOptions;
  const language = languageRaw && languages.includes(languageRaw) ? languageRaw : languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : (languages[0] ?? DEFAULT_LANGUAGE);

  const stage: "sets" | "cards" = setCode ? "cards" : "sets";
  const [browseResult, setGroups] = await Promise.all([
    stage === "cards" ? browseCatalogue({ tcg, language, rarity, priceState, setCode, page, pageSize: PAGE_SIZE }) : Promise.resolve({ rows: [], totalCount: 0 }),
    stage === "cards" ? Promise.resolve([]) : getSetsByGeneration({ tcg, language }),
  ]);
  const { rows, totalCount } = browseResult;

  const setCount = setGroups.reduce((sum, g) => sum + g.sets.length, 0);
  const stageCount = stage === "cards" ? totalCount : setCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])),
  );

  return (
    <CatalogueScreen
      syncLabel={syncLabel}
      stage={stage}
      rows={rows}
      totalCount={stageCount}
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
