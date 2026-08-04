"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { IndexPoint } from "@/lib/types";
import { TIME_RANGES, type TimeRange, filterByRange } from "@/lib/chartRanges";

// ─────────────────────────────────────────────────────────────────────────────
// Pure-SVG line chart — "Quiet Luxury / White Mode"
// No filled area. No volume. No TradingView library. Just a clean line.
// ─────────────────────────────────────────────────────────────────────────────

interface IndexChartProps {
  history: IndexPoint[];
  volume?: unknown[]; // kept for backward-compat, ignored
  mode?: "full" | "sparkline";
  positive: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Nombre de décimales nécessaire pour que des ticks espacés de `step` ne
// s'arrondissent jamais à la même valeur affichée (ex: 99/99/98 sur une
// plage étroite avec 0 décimale).
function tickDecimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

function buildPath(
  points: IndexPoint[],
  viewW: number,
  viewH: number,
  padX = 4,
  padY = 8
): string {
  if (points.length < 2) return "";

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const toX = (i: number) =>
    padX + ((i / (points.length - 1)) * (viewW - padX * 2));
  const toY = (v: number) =>
    padY + ((1 - (v - min) / range) * (viewH - padY * 2));

  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(" ");
}

// ── Sparkline (no interaction, no controls) ───────────────────────────────────
function Sparkline({ history }: { history: IndexPoint[] }) {
  const W = 200;
  const H = 48;
  const path = buildPath(history, W, H, 2, 4);

  if (!path) return <div className="h-full w-full" />;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Full chart ────────────────────────────────────────────────────────────────
function FullChart({ history }: { history: IndexPoint[] }) {
  const [activeRange, setActiveRange] = useState<TimeRange>("1M");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; date: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const t = useTranslations("home");
  const locale = useLocale();

  const W = 800;
  const H = 220;
  const PAD_X = 6;
  const PAD_Y = 12;

  const filtered = filterByRange(history, activeRange);
  const path = buildPath(filtered, W, H, PAD_X, PAD_Y);

  const values = filtered.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const vRange = max - min || 1;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // < 2 (pas seulement === 0) : avec un seul point, `filtered.length - 1`
      // vaut 0 et la division plus bas (`clamped / (filtered.length - 1)`)
      // produit NaN -- buildPath() applique déjà ce même seuil (pas de ligne
      // tracée en dessous de 2 points), donc pas de crosshair/tooltip
      // cohérent à afficher non plus. Invisible avec l'historique d'indice
      // (toujours des dizaines de points) mais atteint en réutilisant ce
      // graphique pour l'historique de prix d'un item (fiche /catalog/[id])
      // qui peut n'avoir qu'un seul price_snapshot.
      if (!svgRef.current || filtered.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;

      const idx = Math.round(((relX - PAD_X) / (W - PAD_X * 2)) * (filtered.length - 1));
      const clamped = Math.max(0, Math.min(filtered.length - 1, idx));
      const point = filtered[clamped];
      if (!point) return;

      const px = PAD_X + (clamped / (filtered.length - 1)) * (W - PAD_X * 2);
      const py = PAD_Y + (1 - (point.value - min) / vRange) * (H - PAD_Y * 2);

      setTooltip({
        x: px,
        y: py,
        value: point.value,
        date: new Date(point.capturedAt).toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      });
    },
    [filtered, min, vRange, locale]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Horizontal grid lines (3 lines)
  const gridLines = [0.25, 0.5, 0.75].map((t) => ({
    y: PAD_Y + t * (H - PAD_Y * 2),
    value: max - t * vRange,
  }));
  const gridDecimals = tickDecimals(vRange * 0.25);

  return (
    <div className="flex flex-col gap-0">
      {/* SVG Chart */}
      <div className="relative" style={{ height: 220 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label={t("indexChartLabel")}
        >
          {/* Subtle grid */}
          {gridLines.map((gl, i) => (
            <line
              key={i}
              x1={PAD_X}
              y1={gl.y}
              x2={W - PAD_X}
              y2={gl.y}
              stroke="var(--chart-grid)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          ))}

          {/* Main line */}
          {path && (
            <path
              d={path}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Crosshair */}
          {tooltip && (
            <>
              <line
                x1={tooltip.x}
                y1={PAD_Y}
                x2={tooltip.x}
                y2={H - PAD_Y}
                stroke="var(--chart-axis)"
                strokeWidth="0.8"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={tooltip.x}
                cy={tooltip.y}
                r="4"
                fill="var(--chart-line)"
                stroke="var(--surface-solid)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Tooltip bubble */}
        {tooltip && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{
              left: `${(tooltip.x / W) * 100}%`,
              top: "8px",
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-md"
              style={{
                background: "var(--tooltip-bg)",
                color: "var(--tooltip-text)",
                whiteSpace: "nowrap",
                fontSize: "11px",
              }}
            >
              {tooltip.value.toFixed(2)} · {tooltip.date}
            </div>
          </div>
        )}

        {/* Y-axis labels */}
        {gridLines.map((gl, i) => (
          <div
            key={i}
            className="pointer-events-none absolute right-0"
            style={{
              top: `${(gl.y / H) * 100}%`,
              transform: "translateY(-50%)",
              fontSize: "10px",
              color: "var(--chart-axis)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {gl.value.toFixed(gridDecimals)}
          </div>
        ))}
      </div>

      {/* Time range selectors */}
      <div
        className="flex items-center gap-0.5 pt-4"
        style={{ borderTop: "1px solid var(--chart-grid)" }}
      >
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            id={`range-${r.toLowerCase()}`}
            onClick={() => setActiveRange(r)}
            className="rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150"
            style={
              r === activeRange
                ? {
                    background: "var(--ink)",
                    color: "var(--ink-text)",
                  }
                : {
                    background: "transparent",
                    color: "var(--foreground-muted)",
                  }
            }
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
export function IndexChart({ history, mode = "full" }: IndexChartProps) {
  const t = useTranslations("home");

  if (history.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--foreground-subtle)" }}
      >
        {t("noDataYet")}
      </div>
    );
  }

  if (mode === "sparkline") {
    return (
      <div className="h-full w-full">
        <Sparkline history={history} />
      </div>
    );
  }

  return <FullChart history={history} />;
}
