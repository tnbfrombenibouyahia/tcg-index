import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
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
import { GRADE_LABELS, TCGS } from "@/lib/constants";

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Population PSA/CGC réelle (comptage par grade, PAS un prix) -- demande
// utilisateur 2026-08-10, cf. [[project_population_analysis]]. Même squelette
// que /grading-roi : filtre TCG + callout méthodologie + tableau trié. Filtre
// prix AJOUTÉ le même jour (2ème demande, un simple seuil mini d'abord, puis
// converti en tranches fixes -- 3ème demande, "10-50, 50-100... 10k+", cf.
// POPULATION_PRICE_RANGES). Filtre POPULATION (4ème demande, même jour --
// "pop 50, pop 100... plus de pop 2000", cf. POPULATION_COUNT_RANGES) porte
// sur `pop_total` (pas de grade précisé par l'utilisateur, contrairement au
// filtre de prix). Contrairement à /grading-roi (toujours gaté par un prix
// mini ungraded), les deux filtres ici restent du contexte optionnel PAR
// DÉFAUT (aucune tranche active tant que l'utilisateur n'en choisit pas une)
// puisque la page existe pour la population, pas pour la valeur (cf.
// getPopulationRanking). Chaque ligne ouvre le détail en modale
// (PopulationDetailModal), même convention que les autres pages d'analyse
// (cf. "Analyse en popup au clic").
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORTS = new Set<string>([
  "psa10_asc", "psa10_desc",
  "total_asc", "total_desc",
  "language_asc", "language_desc",
]);

// Compacte 1000+ en "1k"/"2.5k" (pas de décimale superflue sur les ronds) --
// même esprit que formatUsdCompact (lib/format.ts) mais sans le symbole $
// dupliqué à chaque borne d'une tranche ("$1k–2.5k", pas "$1k–$2.5k").
function formatRangeBound(n: number): string {
  if (n < 1000) return String(n);
  const thousands = n / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

function priceRangeLabel(range: PopulationPriceRange): string {
  const min = formatRangeBound(range.min);
  return range.max == null ? `$${min}+` : `$${min}–${formatRangeBound(range.max)}`;
}

function popRangeLabel(range: PopulationCountRange): string {
  const min = formatRangeBound(range.min);
  return range.max == null ? `${min}+` : `${min}–${formatRangeBound(range.max)}`;
}

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

  const { rows, totalCount } = await getPopulationRanking({ tcg, limit: PAGE_SIZE, page, sort, priceGrade, priceRange, popRange });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("populationAnalysis");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <SourceBadges sources={["pricecharting"]} />

      <div className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground" style={{ background: "var(--border-softer)" }}>
        <p>
          <strong className="text-foreground">{t("methodologyLabel")}</strong> {t("methodology")}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <FilterPill active={!tcg} href={buildHref(searchParamsForLinks, { tcg: undefined })}>
          {t("filterAll")}
        </FilterPill>
        {TCGS.map((g) => (
          <FilterPill key={g.value} active={tcg === g.value} href={buildHref(searchParamsForLinks, { tcg: g.value })}>
            {g.label}
          </FilterPill>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{t("filterPriceGrade")}</span>
          {POPULATION_PRICE_GRADES.map((g) => (
            <FilterPill key={g} active={priceGrade === g} href={buildHref(searchParamsForLinks, { priceGrade: g })}>
              {GRADE_LABELS[g]}
            </FilterPill>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "var(--border)", flexShrink: 0 }} />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{t("filterMinPrice")}</span>
          <FilterPill active={!priceRange} href={buildHref(searchParamsForLinks, { priceMin: undefined })}>
            {t("filterPriceAll")}
          </FilterPill>
          {POPULATION_PRICE_RANGES.map((r) => (
            <FilterPill key={r.min} active={priceRange?.min === r.min} href={buildHref(searchParamsForLinks, { priceMin: String(r.min) })}>
              {priceRangeLabel(r)}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">{t("filterPopRange")}</span>
        <FilterPill active={!popRange} href={buildHref(searchParamsForLinks, { popMin: undefined })}>
          {t("filterPriceAll")}
        </FilterPill>
        {POPULATION_COUNT_RANGES.map((r) => (
          <FilterPill key={r.min} active={popRange?.min === r.min} href={buildHref(searchParamsForLinks, { popMin: String(r.min) })}>
            {popRangeLabel(r)}
          </FilterPill>
        ))}
      </div>

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
  );
}

function buildHref(base: URLSearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/population-analysis${qs ? `?${qs}` : ""}`;
}

function FilterPill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
