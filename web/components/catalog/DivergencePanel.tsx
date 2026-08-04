"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DailyTimelinePoint, DivergenceRow } from "@/lib/types";
import { DIVERGENCE_WINDOWS, type DivergenceWindowDays } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { StatDelta } from "@/components/ui/StatDelta";
import { DivergenceBadge } from "@/components/divergence/DivergenceBadge";
import { PriceVolumeChart } from "@/components/divergence/PriceVolumeChart";

// Signal volume/prix d'un item (fiche /catalog/[id]) : même contenu que le
// corps de DivergenceDetailModal (page Divergences), sans le chrome de
// modale -- fenêtre glissante (7-180j), graphique prix+volume quotidien
// (/api/item-timeline, déjà scopé ungraded) et le delta courant/précédent
// (/api/item-divergence, ajout de `itemId` à lib/queries/divergence.ts).
// `row` reste `undefined` tant que le premier fetch n'est pas revenu (pour
// ne pas afficher "pas assez de ventes" pendant le chargement), puis `null`
// si la carte n'a vraiment pas assez de ventes sur la fenêtre choisie.
export function DivergencePanel({ itemId }: { itemId: number }) {
  const t = useTranslations("itemDetail");
  const tModal = useTranslations("divergence.modal");
  const tWindows = useTranslations("divergence.windows");

  const [windowDays, setWindowDays] = useState<DivergenceWindowDays>(30);
  const [points, setPoints] = useState<DailyTimelinePoint[] | null>(null);
  const [row, setRow] = useState<DivergenceRow | null | undefined>(undefined);

  // Ne réinitialise pas `points`/`row` à null en tête d'effet (contrairement
  // à une première intuition) : ça déclencherait un setState synchrone dans
  // le corps de l'effet (react-hooks/set-state-in-effect). Même parti pris
  // que DivergenceDetailModal -- au changement de fenêtre, l'ancien
  // graphique reste affiché jusqu'à ce que le nouveau arrive, pas de flash
  // de chargement.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/item-timeline?item_id=${itemId}&window=${windowDays}`).then((res) =>
        res.ok ? res.json() : { points: [] }
      ),
      fetch(`/api/item-divergence?item_id=${itemId}&window=${windowDays}`).then((res) =>
        res.ok ? res.json() : { row: null }
      ),
    ])
      .then(([timeline, divergence]) => {
        if (cancelled) return;
        setPoints(timeline.points ?? []);
        setRow(divergence.row ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([]);
          setRow(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, windowDays]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {DIVERGENCE_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                w === windowDays ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tWindows(`d${w}`)}
            </button>
          ))}
        </div>
        {row && <DivergenceBadge row={row} />}
      </div>

      {row && (
        <div className="mb-4 grid max-w-xs grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{tModal("volumeLabel")}</p>
            <p className="text-sm font-semibold tabular-nums">
              {row.volumePrevious} → {row.volumeCurrent}
            </p>
            <StatDelta changePct={row.volumeChangePct} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{tModal("priceLabel")}</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatUsd(row.pricePrevious)} → {formatUsd(row.priceCurrent)}
            </p>
            <StatDelta changePct={row.priceChangePct} />
          </div>
        </div>
      )}

      {points === null ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">{tModal("loading")}</div>
      ) : (
        <PriceVolumeChart points={points} />
      )}

      {row === null && <p className="mt-2 text-xs text-muted-foreground">{t("divergenceEmpty")}</p>}
    </div>
  );
}
