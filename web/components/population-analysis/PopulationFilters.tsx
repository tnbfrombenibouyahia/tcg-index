import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  POPULATION_COUNT_RANGES,
  POPULATION_PRICE_GRADES,
  POPULATION_PRICE_RANGES,
  type PopulationCountRange,
  type PopulationPriceGrade,
  type PopulationPriceRange,
} from "@/lib/queries/populationAnalysis";
import { priceRangeLabel, popRangeLabel } from "@/lib/populationRangeLabels";
import { GRADE_LABELS, TCGS, type Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Panneau de critères de sélection -- extrait de page.tsx (demande utilisateur
// 2026-08-11 : "les critères de sélection dans un endroit, le listing dans un
// autre") pour vivre dans une colonne fixe à gauche plutôt qu'empilé au-dessus
// du tableau comme les autres pages d'analyse du site. Reste un Server
// Component (juste des <Link>, pas d'état client) -- même mécanique de
// navigation par URL que le reste du site (chaque filtre est un lien, pas un
// state React), donc les filtres survivent au rafraîchissement/partage de lien.
// ─────────────────────────────────────────────────────────────────────────────

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
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export async function PopulationFilters({
  tcg,
  priceGrade,
  priceRange,
  popRange,
  searchParams,
}: {
  tcg?: Tcg;
  priceGrade: PopulationPriceGrade;
  priceRange?: PopulationPriceRange;
  popRange?: PopulationCountRange;
  searchParams: URLSearchParams;
}) {
  const t = await getTranslations("populationAnalysis");

  return (
    <div className="card-glass sticky top-6 flex flex-col gap-5 rounded-2xl p-5">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("filtersTitle")}</h2>
      </div>

      <FilterGroup label={t("filterTcg")}>
        <FilterPill active={!tcg} href={buildHref(searchParams, { tcg: undefined })}>
          {t("filterAll")}
        </FilterPill>
        {TCGS.map((g) => (
          <FilterPill key={g.value} active={tcg === g.value} href={buildHref(searchParams, { tcg: g.value })}>
            {g.label}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label={t("filterPriceGrade")}>
        {POPULATION_PRICE_GRADES.map((g) => (
          <FilterPill key={g} active={priceGrade === g} href={buildHref(searchParams, { priceGrade: g })}>
            {GRADE_LABELS[g]}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label={t("filterMinPrice")}>
        <FilterPill active={!priceRange} href={buildHref(searchParams, { priceMin: undefined })}>
          {t("filterPriceAll")}
        </FilterPill>
        {POPULATION_PRICE_RANGES.map((r) => (
          <FilterPill key={r.min} active={priceRange?.min === r.min} href={buildHref(searchParams, { priceMin: String(r.min) })}>
            {priceRangeLabel(r)}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label={t("filterPopRange")}>
        <FilterPill active={!popRange} href={buildHref(searchParams, { popMin: undefined })}>
          {t("filterPriceAll")}
        </FilterPill>
        {POPULATION_COUNT_RANGES.map((r) => (
          <FilterPill key={r.min} active={popRange?.min === r.min} href={buildHref(searchParams, { popMin: String(r.min) })}>
            {popRangeLabel(r)}
          </FilterPill>
        ))}
      </FilterGroup>

      <div className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">{t("methodologyLabel")}</strong> {t("methodology")}
      </div>
    </div>
  );
}
