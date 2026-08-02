import { getTranslations } from "next-intl/server";
import type { UndervaluedRow } from "@/lib/types";
import { SortHeader } from "@/components/ui/SortHeader";
import { UndervaluedTableBody } from "./UndervaluedTableBody";

// ─── Main table component ─────────────────────────────────────────────────────
export async function UndervaluedTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: UndervaluedRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("undervalued.table");

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
                basePath="/undervalued"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">{t("rarity")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("marketPrice")}
                ascValue="market_asc"
                descValue="market_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/undervalued"
              />
            </th>
            <th className="px-4 py-3">{t("pullCost")}</th>
            <th className="px-4 py-3">{t("pullRate")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("score")}
                ascValue="score_asc"
                descValue="score_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/undervalued"
              />
            </th>
          </tr>
        </thead>
        <UndervaluedTableBody rows={rows} />
      </table>
    </div>
  );
}
