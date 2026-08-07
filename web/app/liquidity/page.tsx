import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { LiquidityTable } from "@/components/liquidity/LiquidityTable";
import { getLiquidity, getLiquidityCount, type LiquiditySort } from "@/lib/queries/liquidity";
import type { Tcg } from "@/lib/constants";
import { TCGS } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Classement /liquidity : taux d'écoulement (ventes récentes vs annonces
// eBay encore actives) pour les items scellés EN qui ont les deux signaux
// (cf. lib/queries/liquidity.ts). Filtre TCG ajouté le 2026-08-07 quand
// eBay active listings s'est élargi à One Piece (probe validée, cf.
// mémoire projet "liquidity_sell_through") -- gardé optionnel (0 filtre =
// "Tous les TCG") plutôt que par défaut sur un TCG, même pattern que
// /undervalued et /divergence.
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

  const tcgRaw = Array.isArray(raw.tcg) ? raw.tcg[0] : raw.tcg;
  const tcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (VALID_SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as LiquiditySort | undefined;

  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const [rows, totalCount] = await Promise.all([
    getLiquidity({ tcg, limit: PAGE_SIZE, page, sort }),
    getLiquidityCount({ tcg }),
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

      {/* Filtre TCG */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        <FilterPill active={!tcg} href={buildHref(searchParamsForLinks, { tcg: undefined })}>
          {t("filterAll")}
        </FilterPill>
        {TCGS.map((g) => (
          <FilterPill key={g.value} active={tcg === g.value} href={buildHref(searchParamsForLinks, { tcg: g.value })}>
            {g.label}
          </FilterPill>
        ))}
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

// ── Helpers (mêmes que app/undervalued/page.tsx) ────────────────────────────

function buildHref(base: URLSearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/liquidity${qs ? `?${qs}` : ""}`;
}

function FilterPill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
