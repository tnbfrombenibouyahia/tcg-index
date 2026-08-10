import { getTranslations } from "next-intl/server";
import type { PopulationRow } from "@/lib/types";
import { GRADE_LABELS } from "@/lib/constants";
import type { PopulationPriceGrade } from "@/lib/queries/populationAnalysis";
import { SortHeader } from "@/components/ui/SortHeader";
import { PopulationAnalysisTableBody } from "./PopulationAnalysisTableBody";

export async function PopulationAnalysisTable({
  rows,
  sort = "",
  priceGrade = "ungraded",
  searchParams = new URLSearchParams(),
}: {
  rows: PopulationRow[];
  sort?: string;
  priceGrade?: PopulationPriceGrade;
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
            <th className="px-4 py-3 text-right">{GRADE_LABELS[priceGrade]}</th>
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
        <PopulationAnalysisTableBody rows={rows} priceGrade={priceGrade} />
      </table>
    </div>
  );
}
