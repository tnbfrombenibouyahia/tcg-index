"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GRADES, GRADE_LABELS, type Grade } from "@/lib/constants";
import type { IndexPoint } from "@/lib/types";
import { IndexChart } from "@/components/homepage/IndexChart";

// Historique de prix d'un item (fiche /catalog/[id]) : réutilise IndexChart
// tel quel (sélecteur de plage 1M/3M/6M/1Y/ALL, crosshair, tout inclus) --
// seul `constituents` (non utilisé par le rendu du graphique, cf.
// IndexChart.tsx) est renseigné à 0 pour satisfaire le type IndexPoint.
// Sélecteur de grade local (comme SalesHistoryChart) : une série à la fois,
// re-fetch à chaque changement plutôt que de tout charger d'un coup (un item
// gradé peut avoir jusqu'à 6 séries de prix distinctes).
export function PriceHistoryPanel({ itemId, availableGrades }: { itemId: number; availableGrades: Grade[] }) {
  const t = useTranslations("itemDetail");
  const orderedGrades = useMemo(() => GRADES.filter((g) => availableGrades.includes(g)), [availableGrades]);

  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const activeGrade = selectedGrade && orderedGrades.includes(selectedGrade) ? selectedGrade : orderedGrades[0];
  const [points, setPoints] = useState<IndexPoint[] | null>(null);

  // Pas de reset synchrone de `points` en tête d'effet (cf. DivergencePanel) --
  // au changement de grade, l'ancienne série reste affichée jusqu'à ce que
  // la nouvelle arrive.
  useEffect(() => {
    if (!activeGrade) return;
    let cancelled = false;
    fetch(`/api/item-price-history?item_id=${itemId}&grade=${activeGrade}`)
      .then((res) => (res.ok ? res.json() : { points: [] }))
      .then((data) => {
        if (cancelled) return;
        const pts: IndexPoint[] = (data.points ?? []).map((p: { capturedAt: string; price: number }) => ({
          capturedAt: p.capturedAt,
          value: p.price,
          constituents: 0,
        }));
        setPoints(pts);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, activeGrade]);

  if (!activeGrade) {
    return <p className="text-xs text-muted-foreground">{t("noPriceHistory")}</p>;
  }

  const positive = points && points.length >= 2 ? points[points.length - 1].value >= points[0].value : true;

  return (
    <div>
      {orderedGrades.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {orderedGrades.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGrade(g)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                g === activeGrade ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {GRADE_LABELS[g]}
            </button>
          ))}
        </div>
      )}

      {points === null ? (
        <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height: 220 }}>
          {t("loading")}
        </div>
      ) : (
        <IndexChart history={points} positive={positive} mode="full" />
      )}
    </div>
  );
}
