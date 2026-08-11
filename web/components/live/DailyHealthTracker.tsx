"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { DailyHealthCell, DailyHealthStatus } from "@/lib/types";

const STATUS_COLOR: Record<DailyHealthStatus, string> = {
  ok: "var(--positive)",
  error: "var(--negative)",
  none: "#d97706", // même ambre que DataCoverageSection (tier 30-69%), pas de token dédié
};

const DOT = 10;
const GAP = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Calendrier façon GitHub -- demande utilisateur 2026-08-11 ("dans le creux
// qui reste... un point chaque jour comme un tracker github"). Placé sous
// FreshnessGrid (cf. LiveDashboard.tsx) dans l'espace qui restait vide sur
// les écrans où cette colonne ne remplit pas toute la hauteur allouée.
//
// `cells` arrive déjà en ordre chronologique complet, un jour = une case,
// jours sans run inclus (cf. getDailyHealth) -- ce composant se contente de
// les répartir en colonnes de 7 (grid-auto-flow: column, même construction
// DOM que le calendrier GitHub), sans essayer d'aligner sur de vraies
// semaines calendaires : pour une fenêtre glissante de ~3 mois, l'alignement
// exact au lundi n'apporte rien et complique le remplissage des trous.
export function DailyHealthTracker({ cells }: { cells: DailyHealthCell[] }) {
  const t = useTranslations("live");
  const locale = useLocale();

  return (
    <div className="card-glass" style={{ padding: "12px 16px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <h2
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}
        >
          {t("dailyHealthTitle")}
          <InfoTooltip text={t("dailyHealthIntro")} />
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {(["ok", "error", "none"] as const).map((status) => (
            <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--foreground-subtle)" }}>
              <span style={{ width: DOT, height: DOT, borderRadius: "2px", background: STATUS_COLOR[status], flexShrink: 0 }} />
              {t(`dailyHealthLegend.${status}`)}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: `repeat(7, ${DOT}px)`, gap: `${GAP}px` }}>
        {cells.map((cell) => (
          <span
            key={cell.date}
            title={t(`dailyHealthTooltip.${cell.status}`, { date: formatDate(cell.date, locale) })}
            tabIndex={0}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: "2px",
              background: STATUS_COLOR[cell.status],
              opacity: cell.status === "none" ? 0.55 : 1,
              cursor: "default",
            }}
          />
        ))}
      </div>
    </div>
  );
}
