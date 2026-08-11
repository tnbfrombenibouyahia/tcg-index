"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { TCGS } from "@/lib/constants";
import type { PopulationHeatmapCell, PopulationHeatmapGrade } from "@/lib/queries/populationAnalysis";

const GRADES: PopulationHeatmapGrade[] = [6, 7, 8, 9, 10];

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap grade × TCG (demande utilisateur 2026-08-11, "chart + heatmap" dans
// la colonne d'analyse) -- complète l'histogramme de PopulationSummary avec
// une question qu'il ne répond pas : "à grade égal, quel TCG a la population
// la plus élevée/basse ?". `cells` vient de getPopulationRanking (déjà en
// mémoire, cf. computeHeatmap côté requête), pas de fetch séparé.
//
// Intensité linéaire sur le MAX de l'ensemble des 10 cellules (pas un
// percentile comme le tableau -- ici on compare seulement 10 valeurs entre
// elles, pas des milliers, un ratio simple reste lisible). Légende explicite
// en pied de carte, jamais color-alone (cf. skill dataviz) -- la valeur
// chiffrée reste toujours affichée dans la cellule.
function cellBackground(value: number, max: number): string {
  if (max <= 0) return "var(--tint-neutral)";
  const pct = Math.max(Math.round((value / max) * 100), value > 0 ? 8 : 0);
  return `color-mix(in srgb, var(--heat-500) ${pct}%, transparent)`;
}

export function PopulationHeatmap({ cells }: { cells: PopulationHeatmapCell[] }) {
  const t = useTranslations("populationAnalysis");
  const maxValue = Math.max(1, ...cells.map((c) => c.medianPop));

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("heatmapTitle")}</h2>
        <InfoTooltip text={t("heatmapDescription")} />
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
              const value = cells.find((c) => c.tcg === g.value && c.grade === grade)?.medianPop ?? 0;
              return (
                <div
                  key={g.value}
                  className="rounded-md py-2 text-center text-xs font-semibold tabular-nums"
                  style={{ background: cellBackground(value, maxValue) }}
                >
                  {value.toLocaleString()}
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
        <span>{t("heatmapLegend")}</span>
      </div>
    </div>
  );
}
