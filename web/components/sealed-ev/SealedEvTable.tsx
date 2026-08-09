import { getTranslations } from "next-intl/server";
import { formatUsd } from "@/lib/format";
import type { SealedEvMode, SealedEvRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SortHeader } from "@/components/ui/SortHeader";
import { ReliabilityBars } from "./ReliabilityBars";

export async function SealedEvTable({
  rows,
  mode,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: SealedEvRow[];
  mode: SealedEvMode;
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("sealedEv.table");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">{t("boosterBox")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("language")}
                ascValue="language_asc"
                descValue="language_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/sealed-ev"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">{t("boxPrice")}</th>
            <th className="px-4 py-3">{mode === "top10" ? t("valueTop10") : t("valueTotal")}</th>
            <th className="px-4 py-3">{t("cards")}</th>
            <th className="px-4 py-3">{t("ratio")}</th>
            <th className="px-4 py-3">{t("reliability")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const value = mode === "top10" ? r.singlesTop10Value : r.singlesTotalValue;
            const ratio = mode === "top10" ? r.evRatioTop10 : r.evRatioTotal;
            return (
              <tr key={r.itemId} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes inconnus à l'avance, cf. plan §5
                      <img
                        src={r.imageUrl}
                        alt={r.name}
                        loading="lazy"
                        className="h-12 w-12 flex-shrink-0 rounded-md object-contain"
                        style={{ background: "var(--surface-alt)" }}
                      />
                    ) : (
                      <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
                    )}
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.setCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <LanguageFlag language={r.language} />
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatUsd(r.boxPrice)}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatUsd(value)}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.singlesCount}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{ratio.toFixed(1)}×</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ReliabilityBars score={r.boxReliabilityScore} salesUsed={r.boxSalesUsed} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
