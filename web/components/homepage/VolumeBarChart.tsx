"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { VolumePoint } from "@/lib/types";
import { TIME_RANGES, type TimeRange, filterByRange } from "@/lib/chartRanges";
import { VOLUME_STABILIZATION_DAYS } from "@/lib/constants";
import { daysAgoIso, formatUsd, formatUsdCompact } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Volume bar chart — même langage visuel que IndexChart (SVG pur, monochrome,
// mêmes sélecteurs de plage temporelle). Une barre = $ échangés ce jour-là ;
// le nombre de ventes apparaît dans l'infobulle au survol.
//
// Les VOLUME_STABILIZATION_DAYS derniers jours sont grisés (cf.
// lib/constants.ts) : ces ventes sont encore en cours de recensement (scan
// par paliers tournants), pas définitives -- sans cette distinction, une
// chute purement due au décalage de scan se lit comme un vrai ralentissement
// du marché (constaté le 2026-08-03, cf. mémoire projet).
// ─────────────────────────────────────────────────────────────────────────────

const W = 800;
const H = 180;
const PAD_X = 6;
const PAD_Y = 10;
const PAD_BOTTOM = 4;

export function VolumeBarChart({ volume }: { volume: VolumePoint[] }) {
  const [activeRange, setActiveRange] = useState<TimeRange>("1M");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const t = useTranslations("home");
  const locale = useLocale();

  const filtered = filterByRange(volume, activeRange);
  const n = filtered.length;
  const max = Math.max(...filtered.map((p) => p.salesValue), 1);

  const stableCutoff = useMemo(() => daysAgoIso(VOLUME_STABILIZATION_DAYS), []);
  const isProvisional = useCallback((capturedAt: string) => capturedAt > stableCutoff, [stableCutoff]);
  const hasProvisional = filtered.some((p) => isProvisional(p.capturedAt));

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y - PAD_BOTTOM;
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.max(1, Math.min(14, slot * 0.62));

  const barX = (i: number) => PAD_X + i * slot + (slot - barW) / 2;
  const barY = (v: number) => PAD_Y + (1 - v / max) * plotH;
  const barH = (v: number) => (v / max) * plotH;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || n === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;
      const idx = Math.floor((relX - PAD_X) / slot);
      setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
    },
    [n, slot]
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  if (volume.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: H, color: "var(--foreground-subtle)" }}
      >
        {t("noDataYet")}
      </div>
    );
  }

  const hovered = hoverIdx !== null ? filtered[hoverIdx] : null;
  const gridLines = [1, 0.5].map((t) => ({
    y: PAD_Y + (1 - t) * plotH,
    value: max * t,
  }));

  return (
    <div className="flex flex-col gap-0">
      <div className="relative" style={{ height: H }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label={t("volumeChartLabel")}
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

          {/* Bars */}
          {filtered.map((p, i) => (
            <rect
              key={p.capturedAt}
              x={barX(i)}
              y={barY(p.salesValue)}
              width={barW}
              height={Math.max(0.5, barH(p.salesValue))}
              fill={hoverIdx === i ? "var(--ink)" : "var(--bar-muted)"}
              fillOpacity={hoverIdx !== i && isProvisional(p.capturedAt) ? 0.4 : 1}
              rx={barW > 2 ? 1 : 0}
            />
          ))}
        </svg>

        {/* Tooltip bubble */}
        {hovered && hoverIdx !== null && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{
              left: `${((barX(hoverIdx) + barW / 2) / W) * 100}%`,
              top: "4px",
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
              style={{
                background: "var(--tooltip-bg)",
                color: "var(--tooltip-text)",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                {t("volumeTooltip", { price: formatUsd(hovered.salesValue), count: hovered.salesCount })}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {new Date(hovered.capturedAt).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {isProvisional(hovered.capturedAt) ? ` · ${t("volumeProvisional")}` : ""}
              </div>
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
            {formatUsdCompact(gl.value)}
          </div>
        ))}
      </div>

      {/* Time range selectors */}
      <div className="flex items-center gap-0.5 pt-4" style={{ borderTop: "1px solid var(--chart-grid)" }}>
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setActiveRange(r)}
            className="rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150"
            style={
              r === activeRange
                ? { background: "var(--ink)", color: "var(--ink-text)" }
                : { background: "transparent", color: "var(--foreground-muted)" }
            }
          >
            {r}
          </button>
        ))}
      </div>

      {hasProvisional && (
        <div
          className="flex items-center gap-1.5 pt-2"
          style={{ fontSize: "10.5px", color: "var(--foreground-subtle)" }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              background: "var(--bar-muted)",
              opacity: 0.4,
            }}
          />
          {t("volumeProvisionalNote", { days: VOLUME_STABILIZATION_DAYS })}
        </div>
      )}
    </div>
  );
}
