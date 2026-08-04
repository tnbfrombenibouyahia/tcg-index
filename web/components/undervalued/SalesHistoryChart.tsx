"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SaleRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { GRADES, GRADE_LABELS, type Grade, type Tcg } from "@/lib/constants";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// ─────────────────────────────────────────────────────────────────────────────
// Historique de ventes, en barres -- une barre = une vente (demande
// utilisateur). Chaque vente est un évènement ponctuel, pas un indice
// continu : espacer les barres selon le calendrier réel exagérerait les longs
// silences entre deux ventes (courant sur des cartes peu liquides), donc les
// barres sont réparties uniformément et triées par date plutôt que
// positionnées proportionnellement au temps. Un sélecteur de grade (loose ou
// PSA 7-10) filtre à UNE série à la fois.
//
// Ligne de comparaison (demande utilisateur) : prix de la même carte dans
// l'autre langue, en fond. Alignée sur les MÊMES positions x que les barres
// (une valeur par barre, snapshot le plus proche dans le temps de la vente
// correspondante) plutôt que sur une échelle de dates réelle -- sinon les
// deux séries auraient des échelles x incompatibles. Silencieuse si aucune
// correspondance fiable n'existe (cf. lib/queries/compareLanguage.ts) :
// 2 séries affichées => légende (cf. dataviz skill) ; 1 seule => pas de
// légende.
// ─────────────────────────────────────────────────────────────────────────────

const BAR_COLOR = "#2a78d6"; // slot catégoriel 1 (validé dataviz skill)
const COMPARE_COLOR = "#eb6834"; // slot catégoriel 2 (validé dataviz skill, paire avec BAR_COLOR)

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

interface ComparePoint {
  capturedAt: string;
  price: number;
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

// Snapshot du prix "autre langue" le plus proche dans le temps d'une date de
// vente donnée -- toujours une valeur tant qu'il existe au moins un snapshot,
// même s'il est un peu éloigné (repère de contexte, pas une comparaison au
// jour près).
function nearestPrice(points: ComparePoint[], targetDate: string): number | null {
  if (points.length === 0) return null;
  const targetTime = new Date(`${targetDate}T00:00:00Z`).getTime();
  let best = points[0];
  let bestDiff = Math.abs(new Date(`${points[0].capturedAt}T00:00:00Z`).getTime() - targetTime);
  for (const p of points) {
    const diff = Math.abs(new Date(`${p.capturedAt}T00:00:00Z`).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best.price;
}

export function SalesHistoryChart({
  sales,
  tcg,
  name,
  rarity,
  language,
}: {
  sales: SaleRow[];
  tcg: Tcg;
  name: string;
  rarity: string | null;
  language: string;
}) {
  const t = useTranslations("undervalued.modal");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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

  const [compare, setCompare] = useState<{ language: string; points: ComparePoint[] } | null>(null);

  useEffect(() => {
    // `rarity` est fixe pour la durée de vie du composant (prop, pas d'état
    // dérivé) -- si absent, `compare` reste à son état initial `null`, pas
    // besoin de le réinitialiser explicitement ici (setState synchrone dans
    // un effet, cf. react-hooks/set-state-in-effect).
    if (!rarity || !activeGrade) return;
    let cancelled = false;
    const params = new URLSearchParams({ tcg, name, rarity, language, grade: activeGrade });
    fetch(`/api/compare-language?${params}`)
      .then((res) => (res.ok ? res.json() : { matched: false, points: [] }))
      .then((data) => {
        if (cancelled) return;
        setCompare(data.matched && data.points.length > 0 ? { language: data.language, points: data.points } : null);
      })
      .catch(() => {
        if (!cancelled) setCompare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tcg, name, rarity, language, activeGrade]);

  // Tous les hooks avant tout retour anticipé (cf. rules-of-hooks) -- les
  // calculs restent sûrs sur un tableau vide, le rendu "pas de données"
  // arrive dans le JSX plus bas.
  const prices = filtered.map((s) => s.price);
  const comparePrices = compare?.points.map((p) => p.price) ?? [];
  const minPrice = 0; // toujours ancrer à 0 -- évite de sur-dramatiser l'écart visuel
  const allPrices = [...prices, ...comparePrices];
  const maxPrice = (allPrices.length ? Math.max(...allPrices) : 0) * 1.08 || 1;
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

  // Alignée sur les mêmes positions x que les barres (cf. commentaire d'en-tête).
  const compareByBarIndex: (number | null)[] = compare
    ? bars.map((b) => nearestPrice(compare.points, b.sale.saleDate))
    : bars.map(() => null);

  const comparePoints = bars
    .map((b, i) => {
      const price = compareByBarIndex[i];
      return price != null ? { x: b.x + b.width / 2, y: toY(price) } : null;
    })
    .filter((p): p is { x: number; y: number } => p !== null);

  const comparePath = comparePoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

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
      setHoverIndex(idx >= 0 && idx < n ? idx : null);
    },
    [n, slot]
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

  const hoverBar = hoverIndex != null ? bars[hoverIndex] : null;
  const hoverComparePrice = hoverIndex != null ? compareByBarIndex[hoverIndex] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

        {/* Légende -- seulement quand une ligne de comparaison existe (2 séries) */}
        {compare && comparePoints.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: BAR_COLOR }} />
              <LanguageFlag language={language} size={12} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COMPARE_COLOR }} />
              <LanguageFlag language={compare.language} size={12} />
            </span>
          </div>
        )}
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

            {/* Ligne de comparaison en fond -- rendue avant les barres pour
                rester "derrière" (demande utilisateur) */}
            {comparePath && (
              <path
                d={comparePath}
                fill="none"
                stroke={COMPARE_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.85"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {comparePoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={COMPARE_COLOR} fillOpacity={0.85} />
            ))}

            {bars.map((b, i) => (
              <path
                key={i}
                d={roundedTopBarPath(b.x, b.width, b.yTop, b.yBottom)}
                fill={BAR_COLOR}
                fillOpacity={hoverIndex != null && hoverIndex !== i ? 0.4 : 1}
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
              <div style={{ fontSize: "11px", fontWeight: 600 }}>{formatUsd(hoverBar.sale.price)}</div>
              <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.75 }}>
                {new Date(`${hoverBar.sale.saleDate}T00:00:00Z`).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}{" "}
                · {hoverBar.sale.marketplace}
              </div>
              {compare && hoverComparePrice != null && (
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: COMPARE_COLOR,
                    marginTop: "2px",
                    borderTop: "1px solid var(--tooltip-divider)",
                    paddingTop: "2px",
                  }}
                >
                  {compare.language} · {formatUsd(hoverComparePrice)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
