import { getTranslations } from "next-intl/server";
import type { SaleRow } from "@/lib/types";
import { SortHeader } from "@/components/ui/SortHeader";
import { TransactionsTableBody } from "./TransactionsTableBody";

export async function TransactionsTable({
  sales,
  sort,
  searchParams,
}: {
  sales: SaleRow[];
  sort: string;
  searchParams: URLSearchParams;
}) {
  const t = await getTranslations("transactions.table");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">
              <SortHeader
                label={t("date")}
                ascValue="date_asc"
                descValue="date_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/transactions"
              />
            </th>
            <th className="px-4 py-3">{t("card")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("language")}
                ascValue="language_asc"
                descValue="language_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/transactions"
              />
            </th>
            <th className="px-4 py-3">{t("grade")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("rarity")}
                ascValue="rarity_asc"
                descValue="rarity_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/transactions"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("price")}
                ascValue="price_asc"
                descValue="price_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/transactions"
              />
            </th>
            <th className="px-4 py-3">{t("marketplace")}</th>
          </tr>
        </thead>
        <TransactionsTableBody sales={sales} />
      </table>
    </div>
  );
}
