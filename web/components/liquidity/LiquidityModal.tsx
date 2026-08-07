"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DailyTimelinePoint, LiquidityRow } from "@/lib/types";
import { DIVERGENCE_WINDOWS, type DivergenceWindowDays } from "@/lib/constants";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { PriceVolumeChart } from "@/components/divergence/PriceVolumeChart";
import { StockFlowBar } from "./StockFlowBar";

// ─────────────────────────────────────────────────────────────────────────────
// Modale ouverte au clic sur une ligne du classement /liquidity -- même
// chrome (verre, portal, Escape) et même taille d'image (256x192, cf.
// mémoire projet sur l'agrandissement des popups) que CardDetailModal/
// DivergenceDetailModal/GradingRoiModal.
//
// Graphique : réutilise PriceVolumeChart + /api/item-timeline tels quels
// (déjà utilisés par Divergence -- même endpoint générique itemId+fenêtre,
// aucune dépendance au reste de la feature Divergence). Ventes/jour +prix
// moyen, PAS un historique de `active_listings` (le stock n'a qu'UN seul
// instantané en base pour l'instant, cron hebdo lancé une fois -- une
// "tendance" sur un point unique n'aurait aucun sens, cf. mémoire projet
// "liquidity_sell_through" -- reviser une fois plusieurs semaines de cron
// accumulées si une vraie tendance de stock devient affichable.
// ─────────────────────────────────────────────────────────────────────────────

export function LiquidityModal({ row, onClose }: { row: LiquidityRow; onClose: () => void }) {
  const t = useTranslations("liquidity.modal");
  const tWindows = useTranslations("divergence.windows");

  const [windowDays, setWindowDays] = useState<DivergenceWindowDays>(30);
  const [points, setPoints] = useState<DailyTimelinePoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/item-timeline?item_id=${row.itemId}&window=${windowDays}`)
      .then((res) => (res.ok ? res.json() : { points: [] }))
      .then((data) => {
        if (!cancelled) setPoints(data.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [row.itemId, windowDays]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const stats: { label: string; value: string }[] = [
    { label: t("listingCount"), value: String(row.listingCount) },
    { label: t("sales30d"), value: String(row.salesCount30d) },
    { label: t("sales90d"), value: String(row.salesCount90d) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface, rgba(255,255,255,0.92))",
          backdropFilter: "var(--glass-blur, blur(20px) saturate(1.4))",
          boxShadow: "var(--shadow-lift, 0 16px 48px rgba(0,0,0,0.18))",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-border p-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="flex flex-col gap-5 pr-8 sm:flex-row">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting)
              <img
                src={row.imageUrl}
                alt={row.name}
                className="h-64 w-48 flex-shrink-0 self-center rounded-xl object-contain bg-white shadow-sm sm:self-start"
                style={{ aspectRatio: "3/4" }}
              />
            ) : (
              <div className="h-64 w-48 flex-shrink-0 self-center rounded-xl bg-muted sm:self-start" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <LanguageFlag language={row.language} />
                <h2 className="truncate text-lg font-bold tracking-tight">{row.name}</h2>
              </div>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{row.tcg}</p>
              <p className="text-xs text-muted-foreground">{row.setCode}</p>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>

              <StockFlowBar listingCount={row.listingCount} salesCount30d={row.salesCount30d} />
            </div>
          </div>
        </div>

        {/* Historique des ventes (quotidien, ventes+prix moyen indexés sur un
            axe commun) -- même graphique que Divergence, pas de stock car
            active_listings n'a qu'un instantané pour l'instant. */}
        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("chartTitle")}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {DIVERGENCE_WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowDays(w)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    w === windowDays
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tWindows(`d${w}`)}
                </button>
              ))}
            </div>
          </div>

          {points === null ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : (
            <PriceVolumeChart points={points} />
          )}
        </div>
      </div>
    </div>
  );
}
