import Link from "next/link";
import { GRADE_LABELS, type Grade } from "@/lib/constants";
import { formatDate, formatUsd } from "@/lib/format";
import type { SaleRow } from "@/lib/types";

interface SortHeaderProps {
  label: string;
  ascValue: string;
  descValue: string;
  currentSort: string;
  searchParams: URLSearchParams;
}

function SortHeader({ label, ascValue, descValue, currentSort, searchParams }: SortHeaderProps) {
  const nextSort = currentSort === descValue ? ascValue : descValue;
  const params = new URLSearchParams(searchParams);
  params.set("sort", nextSort);
  const active = currentSort === ascValue || currentSort === descValue;

  return (
    <Link
      href={`/transactions?${params.toString()}`}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
    >
      {label}
      {active ? <span aria-hidden>{currentSort === descValue ? "▼" : "▲"}</span> : null}
    </Link>
  );
}

export function TransactionsTable({
  sales,
  sort,
  searchParams,
}: {
  sales: SaleRow[];
  sort: string;
  searchParams: URLSearchParams;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">
              <SortHeader
                label="Date"
                ascValue="date_asc"
                descValue="date_desc"
                currentSort={sort}
                searchParams={searchParams}
              />
            </th>
            <th className="px-4 py-3">Carte</th>
            <th className="px-4 py-3">Grade</th>
            <th className="px-4 py-3">
              <SortHeader
                label="Prix"
                ascValue="price_asc"
                descValue="price_desc"
                currentSort={sort}
                searchParams={searchParams}
              />
            </th>
            <th className="px-4 py-3">Marketplace</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(sale.saleDate)}</td>
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
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {GRADE_LABELS[sale.grade as Grade] ?? sale.grade}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{formatUsd(sale.price)}</td>
              <td className="whitespace-nowrap px-4 py-3 capitalize text-muted-foreground">{sale.marketplace}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
