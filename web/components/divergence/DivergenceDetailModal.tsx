"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DivergenceRow, DailyTimelinePoint } from "@/lib/types";
import { DIVERGENCE_WINDOWS, type DivergenceWindowDays } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { StatDelta } from "@/components/ui/StatDelta";
import { DivergenceBadge } from "./DivergenceBadge";
import { PriceVolumeChart } from "./PriceVolumeChart";

// Modale de détail Divergence -- même langage visuel que CardDetailModal
// (Undervalued) : fond translucide + panneau en verre. Contrairement à
// Undervalued, le sélecteur ici change la FENÊTRE d'agrégation (7-180j),
// pas un grade -- la donnée réaffichée est la série quotidienne prix+volume
// de la carte cliquée (demande utilisateur), pas la liste des ventes brutes.
export function DivergenceDetailModal({
  row,
  initialWindowDays,
  onClose,
}: {
  row: DivergenceRow;
  initialWindowDays: DivergenceWindowDays;
  onClose: () => void;
}) {
  const t = useTranslations("divergence.modal");
  const tWindows = useTranslations("divergence.windows");
  const [windowDays, setWindowDays] = useState<DivergenceWindowDays>(initialWindowDays);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl"
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

          <div className="flex flex-col gap-5 sm:flex-row">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
              <img
                src={row.imageUrl}
                alt={row.name}
                className="h-40 w-[7.5rem] flex-shrink-0 self-center rounded-xl object-contain bg-white shadow-sm sm:self-start"
                style={{ aspectRatio: "3/4" }}
              />
            ) : (
              <div className="h-40 w-[7.5rem] flex-shrink-0 self-center rounded-xl bg-muted sm:self-start" />
            )}

            <div className="min-w-0 flex-1 pr-8">
              <div className="flex items-center gap-2">
                <LanguageFlag language={row.language} />
                <h2 className="truncate text-lg font-bold tracking-tight">{row.name}</h2>
              </div>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{row.tcg}</p>
              <p className="text-xs text-muted-foreground">{row.setCode}</p>
              {row.rarity && (
                <span className="mt-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {row.rarity}
                </span>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("volumeLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {row.volumePrevious} → {row.volumeCurrent}
                  </p>
                  <StatDelta changePct={row.volumeChangePct} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("priceLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatUsd(row.pricePrevious)} → {formatUsd(row.priceCurrent)}
                  </p>
                  <StatDelta changePct={row.priceChangePct} />
                </div>
              </div>

              <div className="mt-3">
                <DivergenceBadge row={row} />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("chartTitle")}</h3>
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
