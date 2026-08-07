"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SaleRow, UndervaluedRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SalesHistoryChart } from "./SalesHistoryChart";

// ─────────────────────────────────────────────────────────────────────────────
// Modale de détail carte -- ouverte au clic sur une ligne du tableau
// Undervalued (cf. UndervaluedTableBody). Fond translucide + panneau en verre
// (même langage que .card-glass ailleurs dans l'app), pour ne pas quitter le
// contexte du tableau derrière. Layout demandé par l'utilisateur : image en
// grand à gauche, infos + détail du calcul à droite ; le graphique de ventes
// reste en pleine largeur en dessous (un split gauche/droite n'apporte rien
// à un graphique).
// ─────────────────────────────────────────────────────────────────────────────

export function CardDetailModal({ row, onClose }: { row: UndervaluedRow; onClose: () => void }) {
  const t = useTranslations("undervalued.modal");
  // `sales` repart à `null` (état initial) à chaque nouvelle carte car le
  // parent monte cette modale avec `key={row.itemId}` -- un remount complet,
  // pas juste un changement de props, donc pas besoin de la remettre à
  // `null` manuellement ici (ce qui aurait déclenché un set-state-in-effect).
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
    { label: t("packPrice"), value: row.packPrice != null ? formatUsd(row.packPrice) : "—" },
    { label: t("pullRateLabel"), value: row.pullRate != null ? `1/${Math.round(1 / row.pullRate)}` : "—" },
    { label: t("pullCost"), value: row.pullCost != null ? formatUsd(row.pullCost) : "—" },
    {
      label: t("characterMultiplier"),
      value: row.characterMultiplier != null ? `×${row.characterMultiplier.toFixed(2)}` : "—",
    },
    { label: t("theoreticalValue"), value: formatUsd(row.theoreticalValue) },
    { label: t("marketPrice"), value: formatUsd(row.marketPrice) },
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

          {/* Image (gauche) + infos & détail du calcul (droite) */}
          <div className="flex flex-col gap-5 sm:flex-row">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
              <img
                src={row.imageUrl}
                alt={row.name}
                className="h-64 w-48 flex-shrink-0 self-center rounded-xl object-contain bg-white shadow-sm sm:self-start"
                style={{ aspectRatio: "3/4" }}
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

              {/* Détail du calcul */}
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
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">{t("scoreLabel")}</span>
                <span className="text-base font-bold tabular-nums">{row.undervaluedScore.toFixed(1)}×</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sales chart -- pleine largeur, un split gauche/droite n'apporte rien ici */}
        <div className="p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("salesHistoryTitle")}
          </h3>
          {sales === null ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : (
            <SalesHistoryChart
              sales={sales}
              tcg={row.tcg}
              name={row.name}
              rarity={row.rarity}
              language={row.language}
            />
          )}
        </div>
      </div>
    </div>
  );
}
