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
// Navigation "poupée russe" (demande utilisateur 2026-09-10 : "vraiment
// comme PokéCardex", remplace la bascule Grille de cartes/Par set du
// premier jet, cf. CatalogueScreen.tsx pour le détail des 3 niveaux) :
//   - `era` (choisi au niveau 1) + `set` (choisi au niveau 2) pilotent le
//     niveau affiché, calculé ICI (seul endroit qui charge les données et
//     sait donc si `era` correspond à un groupe réellement existant --
//     sinon repli silencieux au niveau 1, ex. lien obsolète ou `era` mal
//     orthographié dans l'URL).
//   - Une seule requête de données par chargement, jamais
//     getSetsByGeneration ET browseCatalogue en même temps (niveaux 1/2 vs
//     niveau 3) -- même raisonnement déjà documenté ici avant ce commit.
//   - Langue : plus de "Toutes les langues" (demande utilisateur -- comme
//     PokéCardex, EN ou JP jamais mélangés). Résolue ICI avec repli sur EN
//     (ou la première langue dispo si EN n'existe pas en base) avant
//     d'interroger generations/sets/cartes, qui ne savent plus gérer
//     "langue absente".
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
  const era = get("era") || undefined;
  const setCode = get("set") || undefined;
  const pageRaw = Number(get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // Options de filtres d'abord (indépendantes de la langue résolue) --
  // nécessaires pour valider/résoudre `language` avant de lancer la requête
  // de niveau 1/2/3 ci-dessous.
  const [filterOptions, syncLabel] = await Promise.all([getCatalogueFilterOptions(), buildSyncLabel()]);
  const { rarities, languages } = filterOptions;
  const language = languageRaw && languages.includes(languageRaw) ? languageRaw : languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : (languages[0] ?? DEFAULT_LANGUAGE);

  // Niveau 3 seulement si `set` est posé -- niveaux 1/2 partagent la même
  // requête (getSetsByGeneration), `era` ne fait que choisir QUEL groupe du
  // résultat est affiché (SetBrowser) plutôt que la liste des groupes
  // (GenerationBrowser).
  const wantsCards = Boolean(setCode);
  const [browseResult, setGroups] = await Promise.all([
    wantsCards ? browseCatalogue({ tcg, language, rarity, priceState, setCode, page, pageSize: PAGE_SIZE }) : Promise.resolve({ rows: [], totalCount: 0 }),
    wantsCards ? Promise.resolve([]) : getSetsByGeneration({ tcg, language }),
  ]);
  const { rows, totalCount } = browseResult;

  const activeGroup = era ? (setGroups.find((g) => g.label === era) ?? null) : null;
  const stage: "generations" | "sets" | "cards" = wantsCards ? "cards" : activeGroup ? "sets" : "generations";

  const stageCount = stage === "cards" ? totalCount : stage === "sets" ? (activeGroup?.sets.length ?? 0) : setGroups.length;
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
      activeGroup={activeGroup}
      tcg={tcg}
      language={language}
      rarity={rarity}
      priceState={priceState}
      era={stage === "generations" ? undefined : era}
      setCode={setCode}
      languages={languages}
      rarities={rarities}
      searchParams={searchParamsForLinks}
    />
  );
}
