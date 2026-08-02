"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SaleRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Historique de ventes loose vs gradées, en ligne (pas en nuage de points --
// demande utilisateur, cohérent avec les graphiques "prix dans le temps" de
// PriceCharting dont vient la donnée). Palette catégorielle validée (dataviz
// skill, slots 1/2 : bleu #2a78d6 / orange #eb6834, CVD-safe) plutôt que le
// noir/blanc habituel des autres graphiques de l'app : ici les deux séries
// sont une vraie distinction d'identité (loose vs gradée), pas une polarité
// haut/bas, donc le monochrome de IndexChart ne convient pas.
// ─────────────────────────────────────────────────────────────────────────────

const LOOSE_COLOR = "#2a78d6";
const GRADED_COLOR = "#eb6834";

const W = 700;
const H = 220;
const PAD_X = 16;
const PAD_Y = 16;
const PAD_BOTTOM = 28;

interface Point {
  x: number;
  y: number;
  sale: SaleRow;
  graded: boolean;
}

function buildPath(points: Point[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

export function SalesHistoryChart({ sales }: { sales: SaleRow[] }) {
  const t = useTranslations("undervalued.modal");
  const locale = useLocale();
  const [hover, setHover] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Tous les hooks avant tout retour anticipé (cf. rules-of-hooks) -- les
  // calculs restent sûrs sur un tableau vide (dateRange/priceRange retombent
  // sur 1 via `|| 1`), le rendu "pas de données" arrive dans le JSX plus bas.
  const dates = sales.map((s) => new Date(`${s.saleDate}T00:00:00Z`).getTime());
  const prices = sales.map((s) => s.price);
  const minDate = dates.length ? Math.min(...dates) : 0;
  const maxDate = dates.length ? Math.max(...dates) : 0;
  const dateRange = maxDate - minDate || 1;
  const minPrice = 0; // toujours ancrer à 0 -- évite de sur-dramatiser l'écart visuel
  const maxPrice = (prices.length ? Math.max(...prices) : 0) * 1.08 || 1;
  const priceRange = maxPrice - minPrice || 1;

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y - PAD_BOTTOM;

  const toX = (time: number) => PAD_X + ((time - minDate) / dateRange) * plotW;
  const toY = (price: number) => PAD_Y + (1 - (price - minPrice) / priceRange) * plotH;

  const allPoints: Point[] = sales.map((sale) => ({
    x: toX(new Date(`${sale.saleDate}T00:00:00Z`).getTime()),
    y: toY(sale.price),
    sale,
    graded: sale.grade !== "ungraded",
  }));

  // Une ligne par série, triée chronologiquement (indépendamment l'une de
  // l'autre -- les ventes loose et gradées n'arrivent pas forcément aux
  // mêmes dates).
  const loosePoints = allPoints.filter((p) => !p.graded).sort((a, b) => a.x - b.x);
  const gradedPoints = allPoints.filter((p) => p.graded).sort((a, b) => a.x - b.x);
  const loosePath = buildPath(loosePoints);
  const gradedPath = buildPath(gradedPoints);

  const gridLines = [0.25, 0.5, 0.75, 1].map((frac) => ({
    y: PAD_Y + (1 - frac) * plotH,
    value: maxPrice * frac,
  }));

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;
      const relY = ((e.clientY - rect.top) / rect.height) * H;

      let nearest: Point | null = null;
      let best = Infinity;
      for (const p of allPoints) {
        const d = (p.x - relX) ** 2 + (p.y - relY) ** 2;
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      // 20px de tolérance (au carré) -- au-delà, on considère qu'on ne survole aucun point
      setHover(best < 400 ? nearest : null);
    },
    [allPoints]
  );

  if (sales.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: H, color: "var(--foreground-subtle)" }}
      >
        {t("noSales")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Légende -- toujours présente dès 2 séries (cf. dataviz skill) */}
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--foreground-muted)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 12, height: 2, background: LOOSE_COLOR, display: "inline-block" }} />
          {t("looseSales")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 12, height: 2, background: GRADED_COLOR, display: "inline-block" }} />
          {t("gradedSales")}
        </span>
      </div>

      <div className="relative" style={{ height: H }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
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

          {loosePath && (
            <path
              d={loosePath}
              fill="none"
              stroke={LOOSE_COLOR}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {gradedPath && (
            <path
              d={gradedPath}
              fill="none"
              stroke={GRADED_COLOR}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {allPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hover === p ? 5 : 3}
              fill={p.graded ? GRADED_COLOR : LOOSE_COLOR}
              fillOpacity={hover && hover !== p ? 0.4 : 1}
              stroke="var(--surface-solid, #fff)"
              strokeWidth={hover === p ? 2 : 1}
            />
          ))}

          {gridLines.map((gl, i) => (
            <text
              key={i}
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
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute flex flex-col items-center"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: `${Math.max(0, (hover.y / H) * 100 - 14)}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="rounded-lg px-2.5 py-1.5 text-center shadow-md"
              style={{ background: "#000000", color: "#FFFFFF", whiteSpace: "nowrap" }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                {formatUsd(hover.sale.price)} · {hover.graded ? hover.sale.grade.toUpperCase() : t("looseSales")}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {new Date(`${hover.sale.saleDate}T00:00:00Z`).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}{" "}
                · {hover.sale.marketplace}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
