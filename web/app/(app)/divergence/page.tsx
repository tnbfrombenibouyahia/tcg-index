import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { DivergenceTable } from "@/components/divergence/DivergenceTable";
import { SourceBadges } from "@/components/ui/SourceBadge";
import {
  getDivergence,
  getDivergenceCount,
  DIVERGENCE_WINDOWS,
  type DivergenceSort,
  type DivergenceTagFilter,
  type DivergenceWindowDays,
} from "@/lib/queries/divergence";
import type { Grade, Tcg } from "@/lib/constants";
import { GRADE_LABELS, TCGS } from "@/lib/constants";

const PAGE_SIZE = 50;

const VALID_SORTS = new Set<string>([
  "divergence_desc", "divergence_asc",
  "price_delta_desc", "price_delta_asc",
  "volume_delta_desc", "volume_delta_asc",
  "language_asc", "language_desc",
]);

// Cartes à quelques centimes (commons en vrac) : les % de variation y sont
// dominés par du bruit d'arrondi ($0.05 -> $0.20 = "+300%" sans rien vouloir
// dire) -- $5 est le plancher (demande utilisateur : aucune carte en dessous
// de $5 affichée, contrairement à Undervalued qui a un palier "Tous").
const MIN_PRICES = [5, 10, 20, 50, 100, 300] as const;
type MinPrice = (typeof MIN_PRICES)[number];
const DEFAULT_MIN_PRICE: MinPrice = 5;

const TAG_FILTERS = ["accumulation", "distribution", "aligned"] as const;

// Sous-ensemble de Grade (lib/constants.ts) : psa9.5 exclu ici (demande
// utilisateur -- ungraded/psa7/psa8/psa9/psa10 pour ce sélecteur).
const DIVERGENCE_GRADES = ["ungraded", "psa7", "psa8", "psa9", "psa10"] as const;

export default async function DivergencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const tcgRaw = Array.isArray(raw.tcg) ? raw.tcg[0] : raw.tcg;
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as DivergenceSort | undefined;

  const windowRaw = Number(Array.isArray(raw.window) ? raw.window[0] : raw.window);
  const windowDays: DivergenceWindowDays = (DIVERGENCE_WINDOWS as readonly number[]).includes(windowRaw)
    ? (windowRaw as DivergenceWindowDays)
    : 30;

  const minRaw = Number(Array.isArray(raw.min) ? raw.min[0] : raw.min);
  const minPrice: MinPrice = (MIN_PRICES as readonly number[]).includes(minRaw) ? (minRaw as MinPrice) : DEFAULT_MIN_PRICE;

  const tagRaw = Array.isArray(raw.tag) ? raw.tag[0] : raw.tag;
  const tagFilter = (TAG_FILTERS as readonly string[]).includes(tagRaw ?? "")
    ? (tagRaw as DivergenceTagFilter)
    : undefined;

  const gradeRaw = Array.isArray(raw.grade) ? raw.grade[0] : raw.grade;
  const grade: Grade = (DIVERGENCE_GRADES as readonly string[]).includes(gradeRaw ?? "")
    ? (gradeRaw as Grade)
    : "ungraded";

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const [rows, totalCount] = await Promise.all([
    getDivergence({ tcg, windowDays, minPrice, tagFilter, grade, limit: PAGE_SIZE, page, sort }),
    getDivergenceCount({ tcg, windowDays, minPrice, tagFilter, grade }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("divergence");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <SourceBadges sources={["pricecharting"]} />

      <div
        className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground"
        style={{ background: "var(--border-softer)" }}
      >
        <p>
          <strong className="text-foreground">{t("methodologyLabel")}</strong> {t("methodology")}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Fenêtre de temps */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">{t("filterWindow")}</span>
          {DIVERGENCE_WINDOWS.map((w) => (
            <FilterPill key={w} active={windowDays === w} href={buildHref(searchParamsForLinks, { window: String(w) })}>
              {t(`windows.d${w}`)}
            </FilterPill>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "var(--border)", flexShrink: 0 }} />

        {/* TCG */}
        <div className="flex items-center gap-1.5">
          <FilterPill active={!tcg} href={buildHref(searchParamsForLinks, { tcg: undefined })}>
            {t("filterAll")}
          </FilterPill>
          {TCGS.map((g) => (
            <FilterPill key={g.value} active={tcg === g.value} href={buildHref(searchParamsForLinks, { tcg: g.value })}>
              {g.label}
            </FilterPill>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "var(--border)", flexShrink: 0 }} />

        {/* Prix minimum -- écarte le bruit d'arrondi des commons à quelques centimes */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">{t("filterMinPrice")}</span>
          {MIN_PRICES.map((p) => (
            <FilterPill key={p} active={minPrice === p} href={buildHref(searchParamsForLinks, { min: String(p) })}>
              {`$${p}+`}
            </FilterPill>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "var(--border)", flexShrink: 0 }} />

        {/* Tag (accumulation / distribution / aligné) */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">{t("filterTag")}</span>
          <FilterPill active={!tagFilter} href={buildHref(searchParamsForLinks, { tag: undefined })}>
            {t("filterTagAll")}
          </FilterPill>
          {TAG_FILTERS.map((tag) => (
            <FilterPill key={tag} active={tagFilter === tag} href={buildHref(searchParamsForLinks, { tag })}>
              {t(`filterTagLabels.${tag}`)}
            </FilterPill>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "var(--border)", flexShrink: 0 }} />

        {/* Grade -- une seule série à la fois (cf. lib/queries/divergence.ts, ne mélange jamais deux grades) */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">{t("filterGrade")}</span>
          {DIVERGENCE_GRADES.map((g) => (
            <FilterPill key={g} active={grade === g} href={buildHref(searchParamsForLinks, { grade: g === "ungraded" ? undefined : g })}>
              {GRADE_LABELS[g]}
            </FilterPill>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{t("count", { count: totalCount.toLocaleString(locale) })}</p>
          <DivergenceTable rows={rows} sort={sort ?? ""} searchParams={searchParamsForLinks} windowDays={windowDays} />
          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildHref(base: URLSearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  // Changer un filtre repart en page 1 -- sinon on peut atterrir sur une
  // page vide si le nouveau filtre a moins de résultats.
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/divergence${qs ? `?${qs}` : ""}`;
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
