import { getLocale, getTranslations } from "next-intl/server";
import { GRADE_LABELS, type Grade } from "@/lib/constants";
import { formatDate, formatUsd } from "@/lib/format";
import type { SaleRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SortHeader } from "@/components/ui/SortHeader";
import { SourceBadge } from "@/components/ui/SourceBadge";

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
  const locale = await getLocale();

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
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(sale.saleDate, locale)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {sale.item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes inconnus à l'avance, cf. plan §5
                    <img
                      src={sale.item.imageUrl}
                      alt={sale.item.name}
                      loading="lazy"
                      className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div>
                    <p className="font-medium">{sale.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.item.setCode}
                      {sale.item.code ? ` · ${sale.item.code}` : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <LanguageFlag language={sale.item.language} />
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {GRADE_LABELS[sale.grade as Grade] ?? sale.grade}
                </span>
              </td>
              <td className="px-4 py-3">
                {sale.item.rarity ? (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {sale.item.rarity}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{formatUsd(sale.price)}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <SourceBadge source={sale.marketplace} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
