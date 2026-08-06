import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { GRADES } from "@/lib/constants";
import { getSales, getSalesFilters, type SalesFilterParams } from "@/lib/queries/sales";

const SORTS = new Set([
  "date_desc",
  "date_asc",
  "price_desc",
  "price_asc",
  "language_asc",
  "language_desc",
  "rarity_asc",
  "rarity_desc",
]);

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const get = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const tcg = get("tcg");
  const setCode = get("set_code");
  const itemIdRaw = get("item_id");
  const itemId = itemIdRaw ? parseInt(itemIdRaw, 10) : undefined;
  const grade = get("grade");
  const rarity = get("rarity");
  const sortRaw = get("sort") ?? "date_desc";
  const sort = (SORTS.has(sortRaw) ? sortRaw : "date_desc") as SalesFilterParams["sort"];
  const page = get("page") ? parseInt(get("page")!, 10) : 1;

  const [salesResult, filtersResult] = await Promise.all([
    getSales({ tcg, setCode, itemId, grade, rarity, sort, page, pageSize: 50 }),
    tcg ? getSalesFilters(tcg) : Promise.resolve({ sets: [], grades: GRADES, rarities: [] }),
  ]);

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("transactions");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("count", { count: salesResult.totalCount.toLocaleString(locale) })}
        </p>
      </div>

      <div className="mb-6">
        <TransactionFilters sets={filtersResult.sets} grades={filtersResult.grades} rarities={filtersResult.rarities} />
      </div>

      {salesResult.sales.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <TransactionsTable sales={salesResult.sales} sort={sort ?? "date_desc"} searchParams={searchParamsForLinks} />
          <Pagination page={salesResult.page} totalPages={salesResult.totalPages} />
        </>
      )}
    </div>
  );
}
