import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { DivergenceTable } from "@/components/divergence/DivergenceTable";
import { getDivergence, DIVERGENCE_WINDOWS, type DivergenceSort, type DivergenceWindowDays } from "@/lib/queries/divergence";
import type { Tcg } from "@/lib/constants";
import { TCGS } from "@/lib/constants";

const VALID_SORTS = new Set<string>([
  "divergence_desc", "divergence_asc",
  "price_delta_desc", "price_delta_asc",
  "volume_delta_desc", "volume_delta_asc",
  "language_asc", "language_desc",
]);

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

  // Plafonné à 60 (vs 150 pour Undervalued) -- les drapeaux pixel-art rendus
  // dans un Server Component pur coûtent nettement plus cher par ligne côté
  // poids de page que dans un tableau avec boundary client (cf. SealedEvTable,
  // même coût constaté) ; 60 reste cohérent avec l'esprit "divergences les
  // plus notables", pas une liste exhaustive.
  const rows = await getDivergence({ tcg, windowDays, limit: 60, sort });

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("divergence");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <div
        className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground"
        style={{ background: "rgba(26,26,26,0.03)" }}
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
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{t("count", { count: rows.length })}</p>
          <DivergenceTable rows={rows} sort={sort ?? ""} searchParams={searchParamsForLinks} />
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
