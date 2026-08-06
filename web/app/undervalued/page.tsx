import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { UndervaluedTable } from "@/components/undervalued/UndervaluedTable";
import { getUndervalued, getUndervaluedCount, type UndervaluedSort } from "@/lib/queries/undervalued";
import type { Tcg } from "@/lib/constants";
import { TCGS } from "@/lib/constants";

const PAGE_SIZE = 50;

const VALID_SORTS = new Set<string>([
  "score_desc", "score_asc",
  "market_desc", "market_asc",
  "language_asc", "language_desc",
]);

const MIN_MARKET_PRICES = [1, 2, 5, 10, 25] as const;
type MinMarketPrice = (typeof MIN_MARKET_PRICES)[number];

export default async function UndervaluedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  // Parse + validate params
  const tcgRaw = Array.isArray(raw.tcg) ? raw.tcg[0] : raw.tcg;
  const tcg: Tcg | undefined =
    tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as
    | UndervaluedSort
    | undefined;

  const minRaw = Number(Array.isArray(raw.min) ? raw.min[0] : raw.min);
  const minMarketPrice: MinMarketPrice = (MIN_MARKET_PRICES as readonly number[]).includes(minRaw)
    ? (minRaw as MinMarketPrice)
    : 2;

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const [rows, totalCount] = await Promise.all([
    getUndervalued({ tcg, minMarketPrice, limit: PAGE_SIZE, page, sort }),
    getUndervaluedCount({ tcg, minMarketPrice }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Reconstruct search params for links
  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]
    )
  );

  const t = await getTranslations("undervalued");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
      </div>

      {/* Methodology callout */}
      <div
        className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground"
        style={{ background: "var(--border-softer)" }}
      >
        <p>
          <strong className="text-foreground">{t("methodologyLabel")}</strong>{" "}
          {t("methodology")}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* TCG filter */}
        <div className="flex items-center gap-1.5">
          <FilterPill
            active={!tcg}
            href={buildHref(searchParamsForLinks, { tcg: undefined })}
          >
            {t("filterAll")}
          </FilterPill>
          {TCGS.map((g) => (
            <FilterPill
              key={g.value}
              active={tcg === g.value}
              href={buildHref(searchParamsForLinks, { tcg: g.value })}
            >
              {g.label}
            </FilterPill>
          ))}
        </div>

        {/* Separator */}
        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            flexShrink: 0,
          }}
        />

        {/* Min market price filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">{t("filterMinPrice")}</span>
          {MIN_MARKET_PRICES.map((p) => (
            <FilterPill
              key={p}
              active={minMarketPrice === p}
              href={buildHref(searchParamsForLinks, { min: String(p) })}
            >
              ${p}+
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Table or empty */}
      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {t("count", { count: totalCount.toLocaleString(locale) })}
          </p>
          <UndervaluedTable
            rows={rows}
            sort={sort ?? ""}
            searchParams={searchParamsForLinks}
          />
          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildHref(
  base: URLSearchParams,
  overrides: Record<string, string | undefined>
): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  // Changer un filtre repart en page 1 -- sinon on peut atterrir sur une
  // page vide si le nouveau filtre a moins de résultats.
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/undervalued${qs ? `?${qs}` : ""}`;
}

function FilterPill({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
