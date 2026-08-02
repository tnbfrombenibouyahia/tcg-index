"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUsd } from "@/lib/format";
import type { DailyTimelinePoint } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Prix moyen + volume quotidiens, en deux panneaux empilés partageant le même
// axe x (jours) -- JAMAIS un double axe y sur un même graphique (cf. dataviz
// skill, règle non négociable n°1), donc deux grandeurs différentes = deux
// panneaux, pas deux échelles sur un seul. Le volume est une grandeur, pas
// une identité catégorielle : gris neutre plutôt qu'une 2e teinte
// catégorielle, le bleu "prix" reste cohérent avec le reste de l'app.
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_COLOR = "#2a78d6";
const VOLUME_COLOR = "#B8B2AC";

const W = 700;
const PAD_X = 16;
const PRICE_H = 130;
const PRICE_PAD_TOP = 12;
const PANEL_GAP = 14;
const VOLUME_H = 54;
const TOTAL_H = PRICE_H + PANEL_GAP + VOLUME_H;
const BAR_RADIUS = 3;

function roundedTopBarPath(x: number, width: number, yTop: number, yBottom: number): string {
  const r = Math.min(BAR_RADIUS, width / 2, Math.max(0, yBottom - yTop));
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

export function PriceVolumeChart({ points }: { points: DailyTimelinePoint[] }) {
  const t = useTranslations("divergence.modal");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = points.length;
  const plotW = W - PAD_X * 2;
  const slot = n > 0 ? plotW / n : 0;
  const barWidth = Math.max(0.6, slot - (n > 60 ? 0.6 : 2));

  const prices = points.map((p) => p.avgPrice).filter((p): p is number => p != null);
  const maxPrice = (prices.length ? Math.max(...prices) : 0) * 1.08 || 1;
  const counts = points.map((p) => p.count);
  const maxVolume = (counts.length ? Math.max(...counts) : 0) * 1.15 || 1;

  const priceBaseline = PRICE_H;
  const volumeBaseline = TOTAL_H;

  const toYPrice = (price: number) => PRICE_PAD_TOP + (1 - price / maxPrice) * (PRICE_H - PRICE_PAD_TOP);
  const toYVolume = (count: number) => PRICE_H + PANEL_GAP + (1 - count / maxVolume) * VOLUME_H;

  const bars = useMemo(
    () =>
      points.map((p, i) => {
        const x = PAD_X + slot * i + (slot - barWidth) / 2;
        return {
          x,
          point: p,
          priceYTop: p.avgPrice != null ? toYPrice(p.avgPrice) : null,
          volumeYTop: toYVolume(p.count),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toYPrice/toYVolume dérivées de maxPrice/maxVolume, déjà dans les deps
    [points, slot, barWidth, maxPrice, maxVolume]
  );

  const priceGridLines = [0.5, 1].map((frac) => ({ y: toYPrice(maxPrice * frac), value: maxPrice * frac }));
  const volumeGridLine = { y: toYVolume(maxVolume / 1.15), value: Math.round(maxVolume / 1.15) };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || slot <= 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;
      const idx = Math.floor((relX - PAD_X) / slot);
      setHoverIndex(idx >= 0 && idx < n ? idx : null);
    },
    [n, slot]
  );

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs" style={{ height: TOTAL_H, color: "var(--foreground-subtle)" }}>
        {t("noData")}
      </div>
    );
  }

  const hoverBar = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: PRICE_COLOR }} />
        {t("priceLabel")}
        <span className="ml-3 inline-block h-2 w-2 rounded-full" style={{ background: VOLUME_COLOR }} />
        {t("volumeLabel")}
      </div>

      <div className="relative" style={{ height: TOTAL_H }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${TOTAL_H}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          aria-label={t("chartLabel")}
        >
          {/* Grille prix */}
          {priceGridLines.map((gl, i) => (
            <line
              key={`pg-${i}`}
              x1={PAD_X}
              y1={gl.y}
              x2={W - PAD_X}
              y2={gl.y}
              stroke="var(--chart-grid, #EDE7DC)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          ))}
          {priceGridLines.map((gl, i) => (
            <text
              key={`pgt-${i}`}
              x={W - PAD_X}
              y={gl.y - 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--foreground-subtle)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatUsd(gl.value)}
            </text>
          ))}

          {/* Barres de prix */}
          {bars.map(
            (b, i) =>
              b.priceYTop != null && (
                <path
                  key={`p-${i}`}
                  d={roundedTopBarPath(b.x, barWidth, b.priceYTop, priceBaseline)}
                  fill={PRICE_COLOR}
                  fillOpacity={hoverIndex != null && hoverIndex !== i ? 0.4 : 1}
                />
              )
          )}

          {/* Séparateur entre panneaux */}
          <line x1={PAD_X} y1={PRICE_H + PANEL_GAP / 2} x2={W - PAD_X} y2={PRICE_H + PANEL_GAP / 2} stroke="var(--border)" strokeWidth="1" />

          {/* Grille volume */}
          <line
            x1={PAD_X}
            y1={volumeGridLine.y}
            x2={W - PAD_X}
            y2={volumeGridLine.y}
            stroke="var(--chart-grid, #EDE7DC)"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
          <text
            x={W - PAD_X}
            y={volumeGridLine.y - 3}
            textAnchor="end"
            fontSize="9"
            fill="var(--foreground-subtle)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {volumeGridLine.value}
          </text>

          {/* Barres de volume */}
          {bars.map((b, i) => (
            <path
              key={`v-${i}`}
              d={roundedTopBarPath(b.x, barWidth, b.volumeYTop, volumeBaseline)}
              fill={VOLUME_COLOR}
              fillOpacity={hoverIndex != null && hoverIndex !== i ? 0.5 : 1}
            />
          ))}

          {/* Ligne verticale reliant les deux panneaux au survol */}
          {hoverBar && (
            <line
              x1={hoverBar.x + barWidth / 2}
              y1={0}
              x2={hoverBar.x + barWidth / 2}
              y2={TOTAL_H}
              stroke="var(--foreground-subtle)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {hoverBar && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{
              left: `${((hoverBar.x + barWidth / 2) / W) * 100}%`,
              top: 0,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
              style={{ background: "#000000", color: "#FFFFFF", whiteSpace: "nowrap" }}
            >
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {new Date(`${hoverBar.point.date}T00:00:00Z`).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                {hoverBar.point.avgPrice != null ? formatUsd(hoverBar.point.avgPrice) : "—"}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {t("salesCount", { count: hoverBar.point.count })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
