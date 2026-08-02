import { getTranslations } from "next-intl/server";
import type { DivergenceRow } from "@/lib/types";
import type { DivergenceWindowDays } from "@/lib/queries/divergence";
import { SortHeader } from "@/components/ui/SortHeader";
import { DivergenceTableBody } from "./DivergenceTableBody";

export async function DivergenceTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
  windowDays,
}: {
  rows: DivergenceRow[];
  sort?: string;
  searchParams?: URLSearchParams;
  windowDays: DivergenceWindowDays;
}) {
  const t = await getTranslations("divergence.table");

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
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("volume")}
                ascValue="volume_delta_asc"
                descValue="volume_delta_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("price")}
                ascValue="price_delta_asc"
                descValue="price_delta_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("divergence")}
                ascValue="divergence_asc"
                descValue="divergence_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
          </tr>
        </thead>
        <DivergenceTableBody rows={rows} windowDays={windowDays} />
      </table>
    </div>
  );
}
