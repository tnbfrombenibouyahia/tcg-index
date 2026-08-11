"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatUsdCompact } from "@/lib/format";
import type { PopulationCorrelation as PopulationCorrelationStats } from "@/lib/queries/populationAnalysis";

// ─────────────────────────────────────────────────────────────────────────────
// Nuage de points population × prix PSA10, échelle log-log (demande
// utilisateur 2026-08-11, "une analyse de corrélation des prix et de la pop"
// dans la colonne d'analyse). Échelle log sur les deux axes -- population et
// prix suivent tous les deux une distribution à longue traîne, une échelle
// linéaire écraserait l'immense majorité des points dans le coin inférieur
// gauche. `r`/`sampleSize` viennent déjà calculés sur l'ensemble filtré
// complet (cf. computeCorrelation côté requête) ; `points` est un
// échantillon régulier (max ~400), pas le total -- suffisant pour montrer la
// forme du nuage sans (re)payer le rendu de milliers de cercles SVG.
const W = 460;
const H = 260;
const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;
const DOT_R = 3.5;
const HIT_R = 8;

// Arrondi à 2 décimales -- sans ça, `Math.log` peut différer d'un ulp entre
// le rendu serveur (Node) et l'hydratation client (Chromium), les deux
// produisant alors une string d'attribut SVG légèrement différente ("x=
// 196.34066197459117" vs "196.3406619745912") et un warning d'hydratation
// React à chaque point du nuage. 2 décimales est bien en dessous de ce que
// l'œil distingue sur un viewBox de 460×260, donc aucune perte visuelle.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function logScale(value: number, min: number, max: number, start: number, end: number): number {
  if (max <= min) return round2((start + end) / 2);
  const t = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return round2(start + t * (end - start));
}

// Seuils usuels pour qualifier |r| en mot -- cf. skill dataviz, le nombre
// reste toujours affiché à côté (jamais color/mot seul).
function strengthKey(absR: number): "veryStrong" | "strong" | "moderate" | "weak" | "veryWeak" {
  if (absR >= 0.7) return "veryStrong";
  if (absR >= 0.5) return "strong";
  if (absR >= 0.3) return "moderate";
  if (absR >= 0.1) return "weak";
  return "veryWeak";
}

export function PopulationCorrelation({ stats }: { stats: PopulationCorrelationStats }) {
  const t = useTranslations("populationAnalysis");
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const { r, sampleSize, points } = stats;

  if (points.length < 2 || r == null) {
    return (
      <div className="card-glass rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("correlationTitle")}</h2>
          <InfoTooltip text={t("correlationDescription")} />
        </div>
        <p className="text-xs text-muted-foreground">{t("correlationEmpty")}</p>
      </div>
    );
  }

  const pops = points.map((p) => p.pop);
  const prices = points.map((p) => p.price);
  const minPop = Math.min(...pops);
  const maxPop = Math.max(...pops);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const plotLeft = PAD_LEFT;
  const plotRight = W - PAD_RIGHT;
  const plotTop = PAD_TOP;
  const plotBottom = H - PAD_BOTTOM;

  const dots = points.map((p, i) => ({
    x: logScale(p.pop, minPop, maxPop, plotLeft, plotRight),
    y: logScale(p.price, minPrice, maxPrice, plotBottom, plotTop),
    point: p,
    i,
  }));

  const direction = r > 0.02 ? "positive" : r < -0.02 ? "negative" : "none";
  const strength = strengthKey(Math.abs(r));
  const hoverDot = hover != null ? dots[hover] : null;

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-1 flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("correlationTitle")}</h2>
        <InfoTooltip text={t("correlationDescription")} />
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums tracking-tight">r = {r.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">
          {t(`correlationDirection.${direction}`)} · {t(`correlationStrength.${strength}`)} ·{" "}
          {t("correlationSampleSize", { count: sampleSize.toLocaleString(locale) })}
        </span>
      </div>

      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-label={t("correlationTitle")}>
          {/* Axes, recessifs */}
          <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke="var(--border)" strokeWidth={1} />
          <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="var(--border)" strokeWidth={1} />

          {/* Repères min/max, échelle log -- pas de grille dense */}
          <text x={plotLeft} y={H - 6} fontSize="9.5" fill="var(--foreground-subtle)">
            {minPop.toLocaleString(locale)}
          </text>
          <text x={plotRight} y={H - 6} textAnchor="end" fontSize="9.5" fill="var(--foreground-subtle)">
            {maxPop.toLocaleString(locale)}
          </text>
          <text x={plotLeft - 6} y={plotBottom} textAnchor="end" fontSize="9.5" fill="var(--foreground-subtle)">
            {formatUsdCompact(minPrice)}
          </text>
          <text x={plotLeft - 6} y={plotTop + 8} textAnchor="end" fontSize="9.5" fill="var(--foreground-subtle)">
            {formatUsdCompact(maxPrice)}
          </text>

          {dots.map((d) => (
            <g key={d.i} onMouseEnter={() => setHover(d.i)} onMouseLeave={() => setHover(null)}>
              <circle cx={d.x} cy={d.y} r={HIT_R} fill="transparent" />
              <circle
                cx={d.x}
                cy={d.y}
                r={DOT_R}
                fill="var(--heat-400)"
                fillOpacity={hover === null ? 0.55 : hover === d.i ? 1 : 0.2}
              />
            </g>
          ))}
        </svg>

        {hoverDot && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{
              left: `${(hoverDot.x / W) * 100}%`,
              top: `${Math.max(0, (hoverDot.y / H) * 100 - 4)}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
              style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-text)", whiteSpace: "nowrap" }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                {t("correlationTooltipPop", { count: hoverDot.point.pop.toLocaleString(locale) })}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.85 }}>
                PSA 10 · {formatUsdCompact(hoverDot.point.price)}
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">{t("correlationAxes")}</p>
    </div>
  );
}
