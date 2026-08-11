import { getTranslations } from "next-intl/server";
import type { PopulationRow } from "@/lib/types";
import { GRADE_LABELS } from "@/lib/constants";
import { SortHeader } from "@/components/ui/SortHeader";
import { PopulationAnalysisTableBody } from "./PopulationAnalysisTableBody";

export async function PopulationAnalysisTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: PopulationRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("populationAnalysis.table");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">{t("card")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("language")}
                ascValue="language_asc"
                descValue="language_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/population-analysis"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            {/* Raw (ungraded) + PSA10 toujours affichés (demande utilisateur
                2026-08-11) -- remplace l'ancienne colonne unique dont le prix
                dépendait du filtre "Grade de prix" sélectionné à gauche : plus
                simple à lire, ce sont les deux prix qui comptent pour la
                décision de gradation (racheter en loose vs. valeur au top grade). */}
            <th className="px-4 py-3 text-right">{GRADE_LABELS.ungraded}</th>
            <th className="px-4 py-3 text-right">{GRADE_LABELS.psa10}</th>
            <th className="px-4 py-3 text-right">{t("grade6")}</th>
            <th className="px-4 py-3 text-right">{t("grade7")}</th>
            <th className="px-4 py-3 text-right">{t("grade8")}</th>
            <th className="px-4 py-3 text-right">{t("grade9")}</th>
            <th className="px-4 py-3 text-right">
              <SortHeader
                label={t("grade10")}
                ascValue="psa10_asc"
                descValue="psa10_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/population-analysis"
              />
            </th>
            <th className="px-4 py-3 text-right">
              <SortHeader
                label={t("total")}
                ascValue="total_asc"
                descValue="total_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/population-analysis"
              />
            </th>
          </tr>
        </thead>
        <PopulationAnalysisTableBody rows={rows} />
      </table>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span
          className="inline-block h-2.5 w-8 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--heat-600), var(--surface-alt))" }}
        />
        <span>{t("heatmapLegend")}</span>
      </div>
    </div>
  );
}
