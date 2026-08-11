"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PopulationCalc } from "@/lib/types";
import { formatUsd } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Graphe population par grade (6 à 10), remplace l'ancien mini-diagramme CSS
// dans PopulationDetailModal -- demande utilisateur 2026-08-11 ("analyse
// précise" au clic sur une carte). Une seule série (population), donc pas de
// légende requise (cf. skill dataviz) ; le prix au grade survolé s'affiche
// dans l'infobulle plutôt que comme un second axe -- jamais de graphe à deux
// échelles y (cf. skill, "the #1 chart mistake").
// ─────────────────────────────────────────────────────────────────────────────

const W = 460;
const H = 150;
const PAD_X = 8;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const BAR_GAP = 8;
const BAR_RADIUS = 4;

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

export function PopulationGradeChart({
  population,
  prices,
}: {
  population: PopulationCalc;
  prices: { psa8: number | null; psa9: number | null; psa10: number | null };
}) {
  const t = useTranslations("populationAnalysis.modal");
  const [hover, setHover] = useState<number | null>(null);

  const grades: { label: string; value: number; price: number | null }[] = [
    { label: "PSA 6", value: population.popGrade6, price: null },
    { label: "PSA 7", value: population.popGrade7, price: null },
    { label: "PSA 8", value: population.popGrade8, price: prices.psa8 },
    { label: "PSA 9", value: population.popGrade9, price: prices.psa9 },
    { label: "PSA 10", value: population.popGrade10, price: prices.psa10 },
  ];
  const maxValue = Math.max(1, ...grades.map((g) => g.value));

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const slot = plotW / grades.length;
  const barWidth = Math.max(1, slot - BAR_GAP);

  const bars = grades.map((g, i) => {
    const yTop = baseline - (g.value / maxValue) * plotH;
    return { x: PAD_X + slot * i + (slot - barWidth) / 2, width: barWidth, yTop, yBottom: baseline, grade: g };
  });

  const hoverBar = hover != null ? bars[hover] : null;

  return (
    <div className="relative" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-label={t("breakdownTitle")}>
        {bars.map((b, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={PAD_X + slot * i} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
            <path
              d={roundedTopBarPath(b.x, b.width, b.yTop, b.yBottom)}
              fill="var(--heat-400)"
              fillOpacity={hover === null || hover === i ? 1 : 0.45}
            />
            <text
              x={b.x + b.width / 2}
              y={b.yTop - 6}
              textAnchor="middle"
              fontSize="11"
              fontWeight={700}
              fill="var(--foreground)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {b.grade.value.toLocaleString()}
            </text>
            <text x={b.x + b.width / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--foreground-subtle)">
              {b.grade.label}
            </text>
          </g>
        ))}
      </svg>

      {hoverBar && (
        <div
          className="pointer-events-none absolute flex flex-col items-center"
          style={{
            left: `${((hoverBar.x + hoverBar.width / 2) / W) * 100}%`,
            top: `${Math.max(0, (hoverBar.yTop / H) * 100 - 4)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
            style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-text)", whiteSpace: "nowrap" }}
          >
            <div style={{ fontSize: "11px", fontWeight: 600 }}>
              {hoverBar.grade.label} · {t("popUnit", { count: hoverBar.grade.value })}
            </div>
            {hoverBar.grade.price != null && (
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.85 }}>{formatUsd(hoverBar.grade.price)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
