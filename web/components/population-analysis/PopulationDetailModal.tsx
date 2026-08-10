"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PopulationRow, SaleRow } from "@/lib/types";
import { formatDate, formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SalesHistoryChart } from "@/components/undervalued/SalesHistoryChart";

// ─────────────────────────────────────────────────────────────────────────────
// Modale de détail carte -- ouverte au clic sur une ligne du tableau
// Population Analysis (cf. PopulationAnalysisTableBody), même langage visuel
// que CardDetailModal (Undervalued) : image en grand à gauche, infos +
// détail population à droite, historique de ventes en pleine largeur en
// dessous.
// ─────────────────────────────────────────────────────────────────────────────

export function PopulationDetailModal({ row, onClose }: { row: PopulationRow; onClose: () => void }) {
  const t = useTranslations("populationAnalysis.modal");
  const [sales, setSales] = useState<SaleRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sales?item_id=${row.itemId}&pageSize=100&sort=date_asc`)
      .then((res) => (res.ok ? res.json() : { sales: [] }))
      .then((data) => {
        if (!cancelled) setSales(data.sales ?? []);
      })
      .catch(() => {
        if (!cancelled) setSales([]);
      });
    return () => {
      cancelled = true;
    };
  }, [row.itemId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const breakdown: { label: string; value: number }[] = [
    { label: "PSA 6", value: row.population.popGrade6 },
    { label: "PSA 7", value: row.population.popGrade7 },
    { label: "PSA 8", value: row.population.popGrade8 },
    { label: "PSA 9", value: row.population.popGrade9 },
    { label: "PSA 10", value: row.population.popGrade10 },
  ];
  const maxCount = Math.max(1, ...breakdown.map((b) => b.value));

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
                className="h-64 w-48 flex-shrink-0 self-center rounded-xl object-contain shadow-sm sm:self-start"
                style={{ aspectRatio: "3/4", background: "var(--surface-alt)" }}
              />
            ) : (
              <div className="h-64 w-48 flex-shrink-0 self-center rounded-xl bg-muted sm:self-start" />
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
              <p className="mt-2 text-xs text-muted-foreground">{t("asOf", { date: formatDate(row.population.capturedAt) })}</p>

              {/* Price context (optional -- population and price are independent pipelines) */}
              {(row.ungradedPrice != null || row.psa8Price != null || row.psa9Price != null || row.psa10Price != null) && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {row.ungradedPrice != null && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">{t("ungradedPriceLabel")}</p>
                      <p className="text-sm font-semibold tabular-nums">{formatUsd(row.ungradedPrice)}</p>
                    </div>
                  )}
                  {row.psa8Price != null && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">PSA 8</p>
                      <p className="text-sm font-semibold tabular-nums">{formatUsd(row.psa8Price)}</p>
                    </div>
                  )}
                  {row.psa9Price != null && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">PSA 9</p>
                      <p className="text-sm font-semibold tabular-nums">{formatUsd(row.psa9Price)}</p>
                    </div>
                  )}
                  {row.psa10Price != null && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">{t("psa10PriceLabel")}</p>
                      <p className="text-sm font-semibold tabular-nums">{formatUsd(row.psa10Price)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Population breakdown */}
              <h3 className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("breakdownTitle")}
              </h3>
              <div className="flex items-end gap-3">
                {breakdown.map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-xs font-semibold tabular-nums">{b.value.toLocaleString()}</span>
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${Math.max(4, (b.value / maxCount) * 64)}px`,
                        background: "var(--accent)",
                        opacity: 0.75,
                      }}
                    />
                    <span className="text-[11px] text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">{t("totalLabel")}</span>
                <span className="text-base font-bold tabular-nums">{row.population.popTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sales chart -- pleine largeur */}
        <div className="p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("salesHistoryTitle")}
          </h3>
          {sales === null ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : sales.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noSales")}</p>
          ) : (
            <SalesHistoryChart sales={sales} tcg={row.tcg} name={row.name} rarity={row.rarity} language={row.language} />
          )}
        </div>
      </div>
    </div>
  );
}
