"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUsd } from "@/lib/format";
import type { DailyTimelinePoint } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Prix (barres) et volume (ligne) superposés sur UN seul graphique (demande
// utilisateur -- "c'est la meilleure manière de comparer deux variables").
// Un vrai double axe y (dollars à gauche, nb de ventes à droite) est
// justement l'anti-pattern classique : en choisissant librement les deux
// échelles on peut faire *paraître* deux séries corrélées alors que ça ne
// tient qu'à l'échelle -- règle non négociable n°1 du dataviz skill.
// Alternative prescrite par le skill pour comparer deux grandeurs
// différentes sur un seul graphique : les indexer sur une base commune. Ici,
// les deux séries sont normalisées en % de LEUR PROPRE maximum sur la
// période affichée et partagent donc un seul axe 0-100% -- la forme/
// co-évolution reste lisible sans qu'aucune échelle ne soit arbitraire.
// Les vraies valeurs ($ et nb de ventes) restent accessibles au survol.
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_COLOR = "#2a78d6"; // slot catégoriel 1 (validé dataviz skill)
const VOLUME_COLOR = "#eb6834"; // slot catégoriel 2 (validé dataviz skill, paire avec PRICE_COLOR)

const W = 700;
const H = 220;
const PAD_X = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;
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

function linePath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function PriceVolumeChart({ points }: { points: DailyTimelinePoint[] }) {
  const t = useTranslations("divergence.modal");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = points.length;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const slot = n > 0 ? plotW / n : 0;
  const barWidth = Math.max(0.6, slot - (n > 60 ? 0.6 : 2));

  const prices = points.map((p) => p.avgPrice).filter((p): p is number => p != null);
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const counts = points.map((p) => p.count);
  const maxVolume = counts.length ? Math.max(...counts) : 0;

  // Indexation : chaque série est normalisée sur SON PROPRE maximum (0-1),
  // toutes deux projetées sur le même axe -- pas de dollars ni de nombre de
  // ventes lisibles directement sur l'axe, seulement au survol (cf. en-tête).
  const toY = (frac: number) => PAD_TOP + (1 - frac) * plotH;

  const bars = useMemo(
    () =>
      points.map((p, i) => {
        const x = PAD_X + slot * i + (slot - barWidth) / 2;
        const priceFrac = p.avgPrice != null && maxPrice > 0 ? p.avgPrice / maxPrice : null;
        const volumeFrac = maxVolume > 0 ? p.count / maxVolume : 0;
        return {
          x,
          point: p,
          priceYTop: priceFrac != null ? toY(priceFrac) : null,
          lineX: x + barWidth / 2,
          lineY: toY(volumeFrac),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toY dérivée de plotH/PAD_TOP (constantes), pas besoin de la lister
    [points, slot, barWidth, maxPrice, maxVolume]
  );

  const linePts = bars.map((b) => ({ x: b.lineX, y: b.lineY }));
  const path = linePath(linePts);

  const gridLines = [0.25, 0.5, 0.75, 1].map((frac) => ({ y: toY(frac) }));

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
      <div className="flex items-center justify-center text-xs" style={{ height: H, color: "var(--foreground-subtle)" }}>
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
        <span className="ml-3 inline-block h-2 w-0.5 rounded-full" style={{ background: VOLUME_COLOR }} />
        {t("volumeLabel")}
        <span className="ml-1 text-[10px] italic opacity-70">{t("indexedNote")}</span>
      </div>

      <div className="relative" style={{ height: H }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          aria-label={t("chartLabel")}
        >
          {gridLines.map((gl, i) => (
            <line
              key={i}
              x1={PAD_X}
              y1={gl.y}
              x2={W - PAD_X}
              y2={gl.y}
              stroke="var(--chart-grid, #EDE7DC)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          ))}

          {/* Barres de prix, indexées sur leur propre maximum */}
          {bars.map(
            (b, i) =>
              b.priceYTop != null && (
                <path
                  key={`p-${i}`}
                  d={roundedTopBarPath(b.x, barWidth, b.priceYTop, baseline)}
                  fill={PRICE_COLOR}
                  fillOpacity={hoverIndex != null && hoverIndex !== i ? 0.4 : 1}
                />
              )
          )}

          {/* Ligne de volume, indexée sur son propre maximum, superposée */}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={VOLUME_COLOR}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {linePts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoverIndex === i ? 3.5 : 2}
              fill={VOLUME_COLOR}
              fillOpacity={hoverIndex != null && hoverIndex !== i ? 0.5 : 1}
            />
          ))}

          {hoverBar && (
            <line
              x1={hoverBar.lineX}
              y1={PAD_TOP}
              x2={hoverBar.lineX}
              y2={baseline}
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
              left: `${(hoverBar.lineX / W) * 100}%`,
              top: 0,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
              style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-text)", whiteSpace: "nowrap" }}
            >
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {new Date(`${hoverBar.point.date}T00:00:00Z`).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: PRICE_COLOR }}>
                {hoverBar.point.avgPrice != null ? formatUsd(hoverBar.point.avgPrice) : "—"}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, color: VOLUME_COLOR }}>
                {t("salesCount", { count: hoverBar.point.count })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
