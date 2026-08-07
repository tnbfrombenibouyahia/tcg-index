"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { GradingRoiRow } from "@/lib/gradingRoi";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { GradingRoiCalculator } from "./GradingRoiCalculator";

// ─────────────────────────────────────────────────────────────────────────────
// Modale ouverte au clic sur une ligne du classement /grading-roi -- même
// chrome (verre, portal, Escape pour fermer) que CardDetailModal
// (components/undervalued), mais le corps est le calculateur interactif
// plutôt qu'un détail figé : ROI de gradation, ça n'a de sens qu'ajustable
// (palier de soumission, coûts, hypothèse de sous-note -- demande
// utilisateur). Lien vers /grading-roi/[id] pour la version pleine page
// (partageable par URL).
// ─────────────────────────────────────────────────────────────────────────────

export function GradingRoiModal({ row, onClose }: { row: GradingRoiRow; onClose: () => void }) {
  const t = useTranslations("gradingRoi.modal");

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

          <div className="flex flex-col gap-5 pr-8 sm:flex-row sm:items-start">
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
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LanguageFlag language={row.language} />
                <h2 className="truncate text-base font-bold tracking-tight">{row.name}</h2>
              </div>
              <p className="truncate text-xs text-muted-foreground">{row.setCode}</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <GradingRoiCalculator candidate={row} />
          <Link
            href={`/grading-roi/${row.itemId}`}
            className="mt-5 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            {t("openStandalone")} →
          </Link>
        </div>
      </div>
    </div>
  );
}
