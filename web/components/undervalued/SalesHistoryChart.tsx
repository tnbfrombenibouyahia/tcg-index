"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SaleRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { GRADES, GRADE_LABELS, type Grade } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Historique de ventes, en barres -- une barre = une vente (demande
// utilisateur). Chaque vente est un évènement ponctuel, pas un indice
// continu : espacer les barres selon le calendrier réel exagérerait les longs
// silences entre deux ventes (courant sur des cartes peu liquides), donc les
// barres sont réparties uniformément et triées par date plutôt que
// positionnées proportionnellement au temps. Un sélecteur de grade (loose ou
// PSA 7-10) filtre à UNE série à la fois -- une seule série affichée = pas de
// légende nécessaire (cf. dataviz skill).
// ─────────────────────────────────────────────────────────────────────────────

const BAR_COLOR = "#2a78d6"; // slot catégoriel 1 (validé dataviz skill) -- une seule série à la fois

const W = 700;
const H = 220;
const PAD_X = 16;
const PAD_Y = 16;
const PAD_BOTTOM = 28;
const BAR_RADIUS = 4;
const BAR_GAP = 2;

interface Bar {
  x: number;
  width: number;
  yTop: number;
  yBottom: number;
  sale: SaleRow;
}

// Rectangle avec coins arrondis en haut seulement -- la base reste ancrée à
// la ligne zéro (cf. dataviz skill : "rounded data-ends anchored to the
// baseline").
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

export function SalesHistoryChart({ sales }: { sales: SaleRow[] }) {
  const t = useTranslations("undervalued.modal");
  const locale = useLocale();
  const [hover, setHover] = useState<Bar | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const availableGrades = useMemo(
    () => GRADES.filter((g) => sales.some((s) => s.grade === g)),
    [sales]
  );
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const activeGrade = selectedGrade && availableGrades.includes(selectedGrade) ? selectedGrade : availableGrades[0];

  const filtered = useMemo(
    () =>
      sales
        .filter((s) => s.grade === activeGrade)
        .slice()
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate)),
    [sales, activeGrade]
  );

  // Tous les hooks avant tout retour anticipé (cf. rules-of-hooks) -- les
  // calculs restent sûrs sur un tableau vide, le rendu "pas de données"
  // arrive dans le JSX plus bas.
  const prices = filtered.map((s) => s.price);
  const minPrice = 0; // toujours ancrer à 0 -- évite de sur-dramatiser l'écart visuel
  const maxPrice = (prices.length ? Math.max(...prices) : 0) * 1.08 || 1;
  const priceRange = maxPrice - minPrice || 1;

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y - PAD_BOTTOM;
  const baseline = PAD_Y + plotH;

  const toY = (price: number) => PAD_Y + (1 - (price - minPrice) / priceRange) * plotH;

  const n = filtered.length;
  const slot = n > 0 ? plotW / n : 0;
  const barWidth = Math.max(1, slot - BAR_GAP);

  const bars: Bar[] = filtered.map((sale, i) => ({
    x: PAD_X + slot * i + (slot - barWidth) / 2,
    width: barWidth,
    yTop: toY(sale.price),
    yBottom: baseline,
    sale,
  }));

  const gridLines = [0.25, 0.5, 0.75, 1].map((frac) => ({
    y: PAD_Y + (1 - frac) * plotH,
    value: maxPrice * frac,
  }));

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || slot <= 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * W;
      const idx = Math.floor((relX - PAD_X) / slot);
      setHover(idx >= 0 && idx < bars.length ? bars[idx] : null);
    },
    [bars, slot]
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
        {bars.length === 0 ? (
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

            {bars.map((b, i) => (
              <path
                key={i}
                d={roundedTopBarPath(b.x, b.width, b.yTop, b.yBottom)}
                fill={BAR_COLOR}
                fillOpacity={hover && hover !== b ? 0.4 : 1}
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
              left: `${((hover.x + hover.width / 2) / W) * 100}%`,
              top: `${Math.max(0, (hover.yTop / H) * 100 - 4)}%`,
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
