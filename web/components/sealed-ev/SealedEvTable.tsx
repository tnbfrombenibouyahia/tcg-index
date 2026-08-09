import { getTranslations } from "next-intl/server";
import type { SealedEvMode, SealedEvRow } from "@/lib/types";
import { SortHeader } from "@/components/ui/SortHeader";
import { SealedEvTableBody } from "./SealedEvTableBody";

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
        <SealedEvTableBody rows={rows} mode={mode} />
      </table>
    </div>
  );
}
