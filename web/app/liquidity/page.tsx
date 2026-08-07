import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { LiquidityTable } from "@/components/liquidity/LiquidityTable";
import { getLiquidity, getLiquidityCount, type LiquiditySort } from "@/lib/queries/liquidity";

// ─────────────────────────────────────────────────────────────────────────────
// Classement /liquidity : taux d'écoulement (ventes récentes vs annonces
// eBay encore actives) pour les items scellés EN qui ont les deux signaux
// (cf. lib/queries/liquidity.ts, ~146 items aujourd'hui). Pas de filtre TCG
// (contrairement à /undervalued, /divergence) : la population est 100%
// Pokémon pour l'instant, cf. mémoire projet "liquidity_sell_through" et
// [[project_ebay_active_listings]] -- un filtre One Piece toujours vide
// serait trompeur plutôt qu'utile.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const VALID_SORTS = new Set<string>([
  "sellthrough_desc", "sellthrough_asc",
  "listing_desc", "listing_asc",
  "sales_desc", "sales_asc",
]);

export default async function LiquidityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as LiquiditySort | undefined;

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const [rows, totalCount] = await Promise.all([
    getLiquidity({ limit: PAGE_SIZE, page, sort }),
    getLiquidityCount({}),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("liquidity");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <div
        className="mb-6 rounded-xl border border-border p-4 text-sm text-muted-foreground"
        style={{ background: "var(--border-softer)" }}
      >
        <p>
          <strong className="text-foreground">{t("methodologyLabel")}</strong> {t("methodology")}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{t("count", { count: totalCount.toLocaleString(locale) })}</p>
          <LiquidityTable rows={rows} sort={sort ?? ""} searchParams={searchParamsForLinks} />
          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} />
          </div>
        </>
      )}
    </div>
  );
}
