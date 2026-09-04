import { PopulationScreen } from "@/components/cardquant/population/PopulationScreen";
import { getPopulationRanking, getPopulationGrowth, type PopulationSort } from "@/lib/queries/populationAnalysis";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Population PSA "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/population-analysis/page.tsx
// (ancien design, supprimée -- components/population-analysis/* laissés
// orphelins). Réutilise lib/queries/populationAnalysis.ts::getPopulationRanking
// tel quel (mêmes noms de search params : tcg/sort/q), SAUF les filtres
// priceGrade/priceRange/popRange (panneau de filtres avancés de l'ancien
// design, pas repris ici -- le mockup CardQuant n'a que jeu/langue/prix max,
// et le prix max en slider continu ne correspond à aucun des paliers fixes
// existants, cf. commentaire de PopulationRankTable.tsx). `lang` est neuf,
// filtré en JS sur les lignes déjà chargées (pas un paramètre de
// getPopulationRanking).
//
// `limit: 300` plutôt que la pagination de 50 de l'ancien design : les
// panneaux de droite (distribution, gem rate, population par set) sont
// calculés sur les MÊMES lignes que le tableau -- une page de 50 les
// rendrait peu représentatifs. Pas de vraie pagination pour cette passe.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORTS = new Set<string>(["psa10_asc", "psa10_desc", "total_asc", "total_desc"]);

export default async function CardQuantPopulationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const get = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const tcgRaw = get("tcg");
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;
  const lang = get("lang") || undefined;
  const sortRaw = get("sort");
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as PopulationSort | undefined;
  const search = get("q")?.trim() || undefined;

  const [ranking, growth, syncLabel] = await Promise.all([
    getPopulationRanking({ tcg, sort, search, limit: 300 }),
    getPopulationGrowth(tcg),
    buildSyncLabel(),
  ]);

  const rows = lang ? ranking.rows.filter((r) => r.language === lang) : ranking.rows;

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])),
  );

  return (
    <PopulationScreen
      syncLabel={syncLabel}
      rows={rows}
      totalCount={lang ? rows.length : ranking.totalCount}
      tcg={tcg}
      lang={lang}
      sort={sort}
      growth={growth}
      searchParams={searchParamsForLinks}
    />
  );
}
