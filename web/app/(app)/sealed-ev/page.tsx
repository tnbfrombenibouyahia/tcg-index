import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { SealedEvTable } from "@/components/sealed-ev/SealedEvTable";
import { SourceBadges } from "@/components/ui/SourceBadge";
import { getSealedEv, type SealedEvSort } from "@/lib/queries/sealedEv";
import type { SealedEvMode } from "@/lib/types";

const SORTS = new Set(["language_asc", "language_desc"]);

export default async function SealedEvPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const modeRaw = Array.isArray(raw.mode) ? raw.mode[0] : raw.mode;
  const mode: SealedEvMode = modeRaw === "top10" ? "top10" : "total";
  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = (SORTS.has(sortRaw ?? "") ? sortRaw : undefined) as SealedEvSort | undefined;

  const rows = await getSealedEv({ mode, limit: 50, sort });

  const searchParamsForLinks = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );

  const t = await getTranslations("sealedEv");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <SourceBadges sources={["pricecharting"]} />

      <div className="mb-6 flex items-center gap-2">
        <ModeLink mode="total" active={mode === "total"} searchParams={searchParamsForLinks}>
          {t("modeTotal")}
        </ModeLink>
        <ModeLink mode="top10" active={mode === "top10"} searchParams={searchParamsForLinks}>
          {t("modeTop10")}
        </ModeLink>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <SealedEvTable rows={rows} mode={mode} sort={sort ?? ""} searchParams={searchParamsForLinks} />
      )}
    </div>
  );
}

function ModeLink({
  mode,
  active,
  searchParams,
  children,
}: {
  mode: SealedEvMode;
  active: boolean;
  searchParams: URLSearchParams;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams(searchParams);
  params.set("mode", mode);
  return (
    <Link
      href={`/sealed-ev?${params.toString()}`}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
