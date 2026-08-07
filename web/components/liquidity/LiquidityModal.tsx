"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { LiquidityRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// ─────────────────────────────────────────────────────────────────────────────
// Modale ouverte au clic sur une ligne du classement /liquidity -- même
// chrome (verre, portal, Escape) et même taille d'image (256x192, cf.
// mémoire projet sur l'agrandissement des popups) que CardDetailModal/
// DivergenceDetailModal/GradingRoiModal.
// ─────────────────────────────────────────────────────────────────────────────

export function LiquidityModal({ row, onClose }: { row: LiquidityRow; onClose: () => void }) {
  const t = useTranslations("liquidity.modal");

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
        <div className="relative p-5">
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

              {row.sellThroughRate30d != null && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{t("sellThrough")}</span>
                  <span className="text-base font-bold tabular-nums">
                    {(row.sellThroughRate30d * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
