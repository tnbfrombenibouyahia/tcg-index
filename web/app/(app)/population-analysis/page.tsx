import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { PopulationFilters } from "@/components/population-analysis/PopulationFilters";
import { PopulationSummary } from "@/components/population-analysis/PopulationSummary";
import { PopulationAnalysisTable } from "@/components/population-analysis/PopulationAnalysisTable";
import { SourceBadges } from "@/components/ui/SourceBadge";
import {
  getPopulationRanking,
  POPULATION_COUNT_RANGES,
  POPULATION_PRICE_GRADES,
  POPULATION_PRICE_RANGES,
  type PopulationCountRange,
  type PopulationPriceGrade,
  type PopulationPriceRange,
  type PopulationSort,
} from "@/lib/queries/populationAnalysis";
import type { Tcg } from "@/lib/constants";

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Population PSA/CGC réelle (comptage par grade, PAS un prix) -- demande
// utilisateur 2026-08-10, cf. [[project_population_analysis]]. Filtres prix/
// population ajoutés le même jour (tranches fixes, cf. PopulationFilters).
//
// Mise en page "analytique" (demande utilisateur 2026-08-11, "critères de
// sélection dans un endroit, listing dans un autre... heatmap ou graphe...
// analyse précise au clic") : colonne fixe à gauche (PopulationFilters) +
// contenu à droite (PopulationSummary -- chiffres-clés + histogramme de
// distribution -- puis le tableau, dont les colonnes PSA10/Total sont
// teintées en heatmap, cf. PopulationAnalysisTableBody). Chaque ligne ouvre
// le détail en modale (PopulationDetailModal, graphe population×prix par
// grade), même convention que les autres pages d'analyse ("Analyse en popup
// au clic").
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORTS = new Set<string>([
  "psa10_asc", "psa10_desc",
  "total_asc", "total_desc",
  "language_asc", "language_desc",
]);

export default async function PopulationAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const tcgRaw = Array.isArray(raw.tcg) ? raw.tcg[0] : raw.tcg;
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as PopulationSort | undefined;

  const priceGradeRaw = Array.isArray(raw.priceGrade) ? raw.priceGrade[0] : raw.priceGrade;
  const priceGrade: PopulationPriceGrade = (POPULATION_PRICE_GRADES as readonly string[]).includes(priceGradeRaw ?? "")
    ? (priceGradeRaw as PopulationPriceGrade)
    : "ungraded";

  const priceMinRaw = Number(Array.isArray(raw.priceMin) ? raw.priceMin[0] : raw.priceMin);
  const priceRange: PopulationPriceRange | undefined = POPULATION_PRICE_RANGES.find((r) => r.min === priceMinRaw);

  const popMinRaw = Number(Array.isArray(raw.popMin) ? raw.popMin[0] : raw.popMin);
  const popRange: PopulationCountRange | undefined = POPULATION_COUNT_RANGES.find((r) => r.min === popMinRaw);

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const { rows, totalCount, stats } = await getPopulationRanking({
    tcg, limit: PAGE_SIZE, page, sort, priceGrade, priceRange, popRange,
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("populationAnalysis");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
        </div>
        <SourceBadges sources={["pricecharting"]} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:self-start">
          <PopulationFilters tcg={tcg} priceGrade={priceGrade} priceRange={priceRange} popRange={popRange} searchParams={searchParamsForLinks} />
        </aside>

        <div className="min-w-0">
          <PopulationSummary totalCount={totalCount} stats={stats} />

          {rows.length === 0 ? (
            <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">{t("count", { count: totalCount.toLocaleString(locale) })}</p>
              <PopulationAnalysisTable rows={rows} sort={sort ?? ""} priceGrade={priceGrade} searchParams={searchParamsForLinks} />
              <div className="mt-4">
                <Pagination page={page} totalPages={totalPages} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
