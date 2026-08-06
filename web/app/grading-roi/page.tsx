import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { GradingRoiTable } from "@/components/grading-roi/GradingRoiTable";
import { getGradingRoiRanking, type GradingRoiSort } from "@/lib/queries/gradingRoi";
import type { Tcg } from "@/lib/constants";
import { TCGS } from "@/lib/constants";

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Classement "meilleures opportunités" de gradation (demande utilisateur) --
// même squelette que /undervalued : filtres TCG + prix mini, callout
// méthodologie, tableau trié (ROI% décroissant par défaut). Chaque ligne
// ouvre le calculateur interactif en modale (GradingRoiModal) plutôt qu'un
// détail figé, puisque le ROI dépend d'hypothèses éditables (palier de
// soumission, risque de sous-note) -- le classement lui-même utilise les
// hypothèses PAR DÉFAUT (DEFAULT_GRADING_ROI_ASSUMPTIONS), ajustables une
// fois la carte ouverte.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORTS = new Set<string>([
  "roi_desc", "roi_asc",
  "profit_desc", "profit_asc",
  "ungraded_desc", "ungraded_asc",
  "language_asc", "language_desc",
]);

const MIN_UNGRADED_PRICES = [1, 2, 5, 10, 25] as const;
type MinUngradedPrice = (typeof MIN_UNGRADED_PRICES)[number];

export default async function GradingRoiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const tcgRaw = Array.isArray(raw.tcg) ? raw.tcg[0] : raw.tcg;
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as GradingRoiSort | undefined;

  const minRaw = Number(Array.isArray(raw.min) ? raw.min[0] : raw.min);
  const minUngradedPrice: MinUngradedPrice = (MIN_UNGRADED_PRICES as readonly number[]).includes(minRaw)
    ? (minRaw as MinUngradedPrice)
    : 2;

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const { rows, totalCount } = await getGradingRoiRanking({ tcg, minUngradedPrice, limit: PAGE_SIZE, page, sort });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("gradingRoi");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <div className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground" style={{ background: "var(--border-softer)" }}>
        <p>
          <strong className="text-foreground">{t("methodologyLabel")}</strong> {t("methodology")}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{t("filterMinPrice")}</span>
          {MIN_UNGRADED_PRICES.map((p) => (
            <FilterPill key={p} active={minUngradedPrice === p} href={buildHref(searchParamsForLinks, { min: String(p) })}>
              ${p}+
            </FilterPill>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{t("count", { count: totalCount.toLocaleString(locale) })}</p>
          <GradingRoiTable rows={rows} sort={sort ?? ""} searchParams={searchParamsForLinks} />
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
  // Changer un filtre repart en page 1 -- sinon on peut atterrir sur une
  // page vide si le nouveau filtre a moins de résultats.
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/grading-roi${qs ? `?${qs}` : ""}`;
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
