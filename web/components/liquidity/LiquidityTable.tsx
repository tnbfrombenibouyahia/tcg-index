import { getTranslations } from "next-intl/server";
import type { LiquidityRow } from "@/lib/types";
import { SortHeader } from "@/components/ui/SortHeader";
import { LiquidityTableBody } from "./LiquidityTableBody";

export async function LiquidityTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: LiquidityRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("liquidity.table");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">{t("card")}</th>
            <th className="px-4 py-3">{t("language")}</th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("listingCount")}
                ascValue="listing_asc"
                descValue="listing_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/liquidity"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("sales30d")}
                ascValue="sales_asc"
                descValue="sales_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/liquidity"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("sellThrough")}
                ascValue="sellthrough_asc"
                descValue="sellthrough_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/liquidity"
              />
            </th>
          </tr>
        </thead>
        <LiquidityTableBody rows={rows} />
      </table>
    </div>
  );
}
