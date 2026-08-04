import { getTranslations } from "next-intl/server";
import type { GradingRoiRow } from "@/lib/gradingRoi";
import { SortHeader } from "@/components/ui/SortHeader";
import { GradingRoiTableBody } from "./GradingRoiTableBody";

export async function GradingRoiTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: GradingRoiRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("gradingRoi.table");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[860px] text-sm">
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
                basePath="/grading-roi"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("ungraded")}
                ascValue="ungraded_asc"
                descValue="ungraded_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/grading-roi"
              />
            </th>
            <th className="px-4 py-3">{t("bestGraded")}</th>
            <th className="px-4 py-3">{t("sample")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("netProfit")}
                ascValue="profit_asc"
                descValue="profit_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/grading-roi"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("roi")}
                ascValue="roi_asc"
                descValue="roi_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/grading-roi"
              />
            </th>
          </tr>
        </thead>
        <GradingRoiTableBody rows={rows} />
      </table>
    </div>
  );
}
