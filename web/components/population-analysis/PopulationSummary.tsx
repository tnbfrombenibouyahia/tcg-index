"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PopulationStats } from "@/lib/queries/populationAnalysis";
import { formatUsd } from "@/lib/format";
import { popRangeLabel } from "@/lib/populationRangeLabels";

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau analytique au-dessus du tableau (demande utilisateur 2026-08-11,
// "rendre cette page un peu plus analytique... heatmap ou graphe") : trois
// chiffres-clés sur l'ensemble FILTRÉ complet (pas juste la page affichée,
// cf. computeStats côté serveur) + un histogramme de distribution de la
// population -- la forme de la distribution (beaucoup de cartes très rares ?
// une poignée seulement ?) est justement ce qu'un tableau trié ligne par
// ligne ne montre jamais d'un coup d'œil.
// ─────────────────────────────────────────────────────────────────────────────

const W = 640;
const H = 140;
const PAD_X = 8;
const PAD_TOP = 20;
const PAD_BOTTOM = 24;
const BAR_GAP = 6;
const BAR_RADIUS = 3;

function roundedTopBarPath(x: number, width: number, yTop: number, yBottom: number): string {
  const r = Math.min(BAR_RADIUS, width / 2, yBottom - yTop);
  if (r <= 0) return `M${x},${yBottom} L${x},${yTop} L${x + width},${yTop} L${x + width},${yBottom} Z`;
  return [
    `M${x},${yBottom}`,
    `L${x},${yTop + r}`,
    `Q${x},${yTop} ${x + r},${yTop}`,
    `L${x + width - r},${yTop}`,
    `Q${x + width},${yTop} ${x + width},${yTop + r}`,
    `L${x + width},${yBottom}`,
    "Z",
  ].join(" ");
}

function HistogramChart({ stats }: { stats: PopulationStats }) {
  const t = useTranslations("populationAnalysis");
  const [hover, setHover] = useState<number | null>(null);
  const buckets = stats.histogram;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const slot = plotW / buckets.length;
  const barWidth = Math.max(1, slot - BAR_GAP);

  const bars = buckets.map((b, i) => {
    const heightRatio = b.count / maxCount;
    const yTop = baseline - heightRatio * plotH;
    return {
      x: PAD_X + slot * i + (slot - barWidth) / 2,
      width: barWidth,
      yTop,
      yBottom: baseline,
      bucket: b,
    };
  });

  if (buckets.every((b) => b.count === 0)) return null;

  return (
    <div className="relative" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-label={t("histogramTitle")}>
        {bars.map((b, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {/* Zone de survol plus large que la barre -- cible tactile (cf. skill dataviz) */}
            <rect x={PAD_X + slot * i} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
            <path
              d={roundedTopBarPath(b.x, b.width, b.yTop, b.yBottom)}
              fill="var(--heat-400)"
              fillOpacity={hover === null || hover === i ? 1 : 0.45}
            />
            <text
              x={b.x + b.width / 2}
              y={b.yTop - 5}
              textAnchor="middle"
              fontSize="10"
              fontWeight={600}
              fill="var(--foreground-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {b.bucket.count > 0 ? b.bucket.count.toLocaleString() : ""}
            </text>
            <text x={b.x + b.width / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--foreground-subtle)">
              {popRangeLabel(b.bucket.range)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PopulationSummary({ totalCount, stats }: { totalCount: number; stats: PopulationStats }) {
  const t = useTranslations("populationAnalysis");
  const locale = useLocale();

  const tiles: { label: string; value: string }[] = [
    { label: t("statCount"), value: totalCount.toLocaleString(locale) },
    { label: t("statMedianPop"), value: stats.medianPopTotal.toLocaleString(locale) },
    { label: t("statMedianPsa10"), value: stats.medianPsa10Price != null ? formatUsd(stats.medianPsa10Price) : "—" },
  ];

  return (
    <div className="card-glass mb-6 rounded-2xl p-5">
      <div className="mb-4 grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-[11px] text-muted-foreground">{tile.label}</p>
            <p className="text-lg font-bold tabular-nums tracking-tight">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("histogramTitle")}
      </p>
      <HistogramChart stats={stats} />
    </div>
  );
}
