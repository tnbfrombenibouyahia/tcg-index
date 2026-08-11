"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatUsdCompact } from "@/lib/format";
import { TCGS } from "@/lib/constants";
import type { PopulationCapGrade, PopulationCapHeatmapCell } from "@/lib/queries/populationAnalysis";

const GRADES: PopulationCapGrade[] = [8, 9, 10];

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap de capitalisation par grade PSA (demande utilisateur 2026-08-11,
// "heat map de capitalisation par note psa" dans la colonne d'analyse) --
// chaque cellule = Σ population × prix à ce grade (cf. computeCapHeatmap),
// PAS un comptage comme l'ancien heatmap grade×TCG retiré la veille : deux
// cartes avec la même population peuvent représenter des montants $ très
// différents, c'est justement ce que cette vue fait ressortir. Limité à
// PSA8-10 -- aucun prix connu pour 6/7 (cf. commentaire de computeCapHeatmap).
export function PopulationCapHeatmap({ cells }: { cells: PopulationCapHeatmapCell[] }) {
  const t = useTranslations("populationAnalysis");
  const maxValue = Math.max(1, ...cells.map((c) => c.totalCap));

  function background(value: number): string {
    if (maxValue <= 0) return "var(--tint-neutral)";
    const pct = Math.max(Math.round((value / maxValue) * 100), value > 0 ? 8 : 0);
    return `color-mix(in srgb, var(--heat-500) ${pct}%, transparent)`;
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("capHeatmapTitle")}</h2>
        <InfoTooltip text={t("capHeatmapDescription")} />
      </div>

      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: `auto repeat(${TCGS.length}, 1fr)` }}>
        <div />
        {TCGS.map((g) => (
          <div key={g.value} className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </div>
        ))}
        {GRADES.map((grade) => (
          <Fragment key={grade}>
            <div className="pr-2 text-[11px] font-medium text-muted-foreground">PSA {grade}</div>
            {TCGS.map((g) => {
              const value = cells.find((c) => c.tcg === g.value && c.grade === grade)?.totalCap ?? 0;
              return (
                <div
                  key={g.value}
                  className="rounded-md py-2.5 text-center text-xs font-semibold tabular-nums"
                  style={{ background: background(value) }}
                >
                  {value > 0 ? formatUsdCompact(value) : "—"}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span
          className="inline-block h-2.5 w-8 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--surface-alt), var(--heat-600))" }}
        />
        <span>{t("capHeatmapLegend")}</span>
      </div>
    </div>
  );
}
