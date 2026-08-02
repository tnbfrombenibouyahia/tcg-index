"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SaleRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { GRADES, GRADE_LABELS, type Grade } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Historique de ventes, en ligne lissée (pas en nuage de points -- demande
// utilisateur, cohérent avec les graphiques "prix dans le temps" de
// PriceCharting dont vient la donnée). Un sélecteur de grade (loose ou PSA
// 7-10) filtre à UNE série à la fois plutôt que de les empiler toutes --
// mélanger loose/PSA7/PSA10 sur la même ligne produisait un tracé en dents
// de scie (des tranches de prix très différentes bout à bout), le sélecteur
// règle le bruit ET la lisibilité en même temps (demande utilisateur).
// Une seule série affichée = pas de légende nécessaire (cf. dataviz skill).
// ─────────────────────────────────────────────────────────────────────────────

const LINE_COLOR = "#2a78d6"; // slot catégoriel 1 (validé dataviz skill) -- une seule série à la fois désormais

const W = 700;
const H = 220;
const PAD_X = 16;
const PAD_Y = 16;
const PAD_BOTTOM = 28;

interface Point {
  x: number;
  y: number;
  sale: SaleRow;
}

// Catmull-Rom -> Bézier cubique (tension standard 1/6) : fait passer une
// courbe lisse par tous les points plutôt que des segments droits bout à
// bout. Simple à la main, pas besoin d'une lib de charting pour ça.
function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function SalesHistoryChart({ sales }: { sales: SaleRow[] }) {
  const t = useTranslations("undervalued.modal");
  const locale = useLocale();
  const [hover, setHover] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const availableGrades = useMemo(
    () => GRADES.filter((g) => sales.some((s) => s.grade === g)),
    [sales]
  );
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const activeGrade = selectedGrade && availableGrades.includes(selectedGrade) ? selectedGrade : availableGrades[0];

  const filtered = useMemo(
    () => sales.filter((s) => s.grade === activeGrade),
    [sales, activeGrade]
  );

  // Tous les hooks avant tout retour anticipé (cf. rules-of-hooks) -- les
  // calculs restent sûrs sur un tableau vide (dateRange/priceRange retombent
  // sur 1 via `|| 1`), le rendu "pas de données" arrive dans le JSX plus bas.
  const dates = filtered.map((s) => new Date(`${s.saleDate}T00:00:00Z`).getTime());
  const prices = filtered.map((s) => s.price);
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

  const points: Point[] = filtered
    .map((sale) => ({
      x: toX(new Date(`${sale.saleDate}T00:00:00Z`).getTime()),
      y: toY(sale.price),
      sale,
    }))
    .sort((a, b) => a.x - b.x);

  const path = smoothPath(points);

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
      for (const p of points) {
        const d = (p.x - relX) ** 2 + (p.y - relY) ** 2;
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      // 20px de tolérance (au carré) -- au-delà, on considère qu'on ne survole aucun point
      setHover(best < 400 ? nearest : null);
    },
    [points]
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
    <div className="flex flex-col gap-3">
      {/* Sélecteur de grade -- une série à la fois (demande utilisateur) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {availableGrades.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setSelectedGrade(g)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              g === activeGrade
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {GRADE_LABELS[g]}
          </button>
        ))}
      </div>

      <div className="relative" style={{ height: H }}>
        {points.length === 0 ? (
          <div
            className="flex h-full items-center justify-center text-xs"
            style={{ color: "var(--foreground-subtle)" }}
          >
            {t("noSales")}
          </div>
        ) : (
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

            {path && (
              <path
                d={path}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hover === p ? 5 : 3}
                fill={LINE_COLOR}
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
        )}

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
              <div style={{ fontSize: "11px", fontWeight: 600 }}>{formatUsd(hover.sale.price)}</div>
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
