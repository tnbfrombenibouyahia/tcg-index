import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { PopulationFilters } from "@/components/population-analysis/PopulationFilters";
import { PopulationSearchBar } from "@/components/population-analysis/PopulationSearchBar";
import { PopulationSummary } from "@/components/population-analysis/PopulationSummary";
import { PopulationHeatmap } from "@/components/population-analysis/PopulationHeatmap";
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
// Mise en page "analytique" (demande utilisateur 2026-08-10, "critères de
// sélection dans un endroit, listing dans un autre... heatmap ou graphe...
// analyse précise au clic") : colonne fixe à gauche (PopulationFilters) +
// listing au centre + tableau, dont les colonnes PSA10/Total sont teintées
// en heatmap (cf. PopulationAnalysisTableBody). Chaque ligne ouvre le détail
// en modale (PopulationDetailModal, graphe population×prix par grade), même
// convention que les autres pages d'analyse.
//
// Repensée en 3 colonnes le 2026-08-11 (nouvelle demande utilisateur) :
// "utilise plus la largeur de l'écran, pas tout au centre" -- le conteneur
// perd son `max-w-7xl mx-auto` (pleine largeur avec juste du padding, même
// philosophie que /live) -- et "au centre le listing, à droite l'analyse de
// population (chart + heatmap)" -- PopulationSummary (chiffres-clés +
// histogramme) et PopulationHeatmap (grade × TCG, nouveau) quittent le
// dessus du tableau pour une colonne dédiée à droite, sticky comme les
// filtres à gauche. Barre de recherche (PopulationSearchBar, filtre `?q=`
// par nom) ajoutée juste au-dessus du tableau, même demande. Texte de
// méthodologie retiré du panneau de filtres (même demande, "enlève le texte
// de source") -- il vivait dans PopulationFilters, cf. son historique.
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

  const searchRaw = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const search = searchRaw?.trim() || undefined;

  const { rows, totalCount, stats } = await getPopulationRanking({
    tcg, limit: PAGE_SIZE, page, sort, priceGrade, priceRange, popRange, search,
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("populationAnalysis");
  const locale = await getLocale();

  return (
    <div className="w-full px-6 py-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
        </div>
        <SourceBadges sources={["pricecharting"]} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="xl:self-start">
          <PopulationFilters tcg={tcg} priceGrade={priceGrade} priceRange={priceRange} popRange={popRange} searchParams={searchParamsForLinks} />
        </aside>

        <div className="min-w-0">
          <PopulationSearchBar />

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

        <aside className="flex flex-col gap-6 xl:self-start">
          <PopulationSummary totalCount={totalCount} stats={stats} />
          <PopulationHeatmap cells={stats.heatmap} />
        </aside>
      </div>
    </div>
  );
}
