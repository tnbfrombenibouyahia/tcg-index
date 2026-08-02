import { getTranslations } from "next-intl/server";
import { StatDelta } from "@/components/ui/StatDelta";
import { formatIndexValue } from "@/lib/format";
import type { IndexSummary } from "@/lib/types";
import { IndexChart } from "./IndexChart";

export async function SubIndexTile({ summary }: { summary: IndexSummary }) {
  const positive = (summary.changePct ?? 0) >= 0;
  const tIndices = await getTranslations("indices");

  return (
    <div className="tile-glass p-4">
      {/* Label */}
      <h3
        className="text-xs font-semibold uppercase"
        style={{
          color: "var(--foreground-muted)",
          letterSpacing: "0.10em",
        }}
      >
        {tIndices(summary.code)}
      </h3>

      {/* Valeur + delta */}
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--foreground)", letterSpacing: "-0.02em" }}
        >
          {summary.latest ? formatIndexValue(summary.latest.value) : "—"}
        </span>
        <StatDelta changePct={summary.changePct} />
      </div>

      {/* Sparkline */}
      <div className="mt-3 h-16">
        <IndexChart
          history={summary.history}
          mode="sparkline"
          positive={positive}
        />
      </div>
    </div>
  );
}
