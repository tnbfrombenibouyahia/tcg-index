import { formatUsd } from "@/lib/format";
import type { SealedEvMode, SealedEvRow } from "@/lib/types";
import { LanguageBadge } from "@/components/ui/LanguageBadge";
import { ReliabilityBars } from "./ReliabilityBars";

export function SealedEvTable({ rows, mode }: { rows: SealedEvRow[]; mode: SealedEvMode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Booster Box</th>
            <th className="px-4 py-3">TCG</th>
            <th className="px-4 py-3">Prix box</th>
            <th className="px-4 py-3">{mode === "top10" ? "Valeur top 10" : "Valeur totale"}</th>
            <th className="px-4 py-3">Cartes</th>
            <th className="px-4 py-3">Ratio</th>
            <th className="px-4 py-3">Fiabilité prix</th>
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
                        className="h-12 w-12 flex-shrink-0 rounded-md object-contain bg-white"
                      />
                    ) : (
                      <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
                    )}
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        {r.name}
                        <LanguageBadge language={r.language} />
                      </p>
                      <p className="text-xs text-muted-foreground">{r.setCode}</p>
                    </div>
                  </div>
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
