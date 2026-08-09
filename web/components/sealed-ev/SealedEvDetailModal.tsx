"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SaleRow, SealedEvRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SalesHistoryChart } from "@/components/undervalued/SalesHistoryChart";
import { ReliabilityBars } from "./ReliabilityBars";

// ─────────────────────────────────────────────────────────────────────────────
// Modale de détail Booster Box -- ouverte au clic sur une ligne du tableau
// Sealed EV (cf. SealedEvTableBody). Même chrome verre que CardDetailModal
// (Undervalued) : image en grand + détail du calcul EV à droite, historique
// des ventes de la box elle-même en pleine largeur en dessous.
// ─────────────────────────────────────────────────────────────────────────────

export function SealedEvDetailModal({ row, onClose }: { row: SealedEvRow; onClose: () => void }) {
  const t = useTranslations("sealedEv.modal");
  const tTable = useTranslations("sealedEv.table");
  // `sales` repart à `null` à chaque nouvelle box car le parent monte cette
  // modale avec `key={row.itemId}` (remount complet), même pattern que
  // CardDetailModal.
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

  const stats: { label: string; value: string }[] = [
    { label: tTable("boxPrice"), value: formatUsd(row.boxPrice) },
    { label: tTable("valueTotal"), value: formatUsd(row.singlesTotalValue) },
    { label: tTable("valueTop10"), value: formatUsd(row.singlesTop10Value) },
    { label: tTable("cards"), value: String(row.singlesCount) },
  ];

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

              <h3 className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("analysisTitle")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{t("ratioTotal")}</span>
                  <span className="text-base font-bold tabular-nums">{row.evRatioTotal.toFixed(2)}×</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{t("ratioTop10")}</span>
                  <span className="text-base font-bold tabular-nums">{row.evRatioTop10.toFixed(2)}×</span>
                </div>
              </div>
              <div className="mt-3">
                <ReliabilityBars score={row.boxReliabilityScore} salesUsed={row.boxSalesUsed} />
              </div>
            </div>
          </div>
        </div>

        {/* Sales chart -- prix de vente de la box elle-même, pleine largeur */}
        <div className="p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("salesHistoryTitle")}
          </h3>
          {sales === null ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : sales.length === 0 ? (
            <EmptyState title={t("noSales")} />
          ) : (
            <SalesHistoryChart sales={sales} tcg={row.tcg} name={row.name} rarity={null} language={row.language} />
          )}
        </div>
      </div>
    </div>
  );
}
