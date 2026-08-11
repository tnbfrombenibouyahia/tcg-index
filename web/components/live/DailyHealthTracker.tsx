"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { DailyHealthCell, DailyHealthStatus } from "@/lib/types";

const STATUS_COLOR: Record<DailyHealthStatus, string> = {
  ok: "var(--positive)",
  error: "var(--negative)",
  none: "#d97706", // même ambre que DataCoverageSection (tier 30-69%), pas de token dédié
};

const LEGEND_DOT = 10;
const LABEL_COL_WIDTH = 16;
const GAP = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Calendrier façon GitHub -- demande utilisateur 2026-08-11 ("dans le creux
// qui reste... un point chaque jour comme un tracker github"). Placé sous
// FreshnessGrid (cf. LiveDashboard.tsx).
//
// Deux évolutions, même demande utilisateur (2026-08-11, message suivant) :
// 1. Libellés jour de semaine (colonne de gauche) + mois (ligne du haut),
//    localisés via Intl plutôt que codés en dur -- l'app est trilingue
//    (fr/en/es), un calendrier en anglais fixe aurait détonné à côté du
//    reste de la page traduite. `cells` arrive déjà aligné sur le lundi
//    (cf. getDailyHealth) donc la ligne 0 de la grille = toujours le même
//    jour de semaine, quel que soit le jour où la page est ouverte.
// 2. Grille en `1fr` (pas une taille de case fixe) : le conteneur prend
//    `flex: 1` et s'étire pour occuper exactement l'espace qui reste sous
//    FreshnessGrid, quelle que soit la hauteur d'écran -- avant, une case
//    de taille fixe soit débordait (scroll caché dans la colonne), soit
//    laissait un vide visible en dessous. Objectif "page propre" : la
//    colonne fraîcheur+calendrier (gauche) se termine maintenant à la même
//    hauteur que l'historique (droite), plus de vide entre les deux.
export function DailyHealthTracker({ cells }: { cells: DailyHealthCell[] }) {
  const t = useTranslations("live");
  const locale = useLocale();

  // Découpage en semaines de 7 (cells commence un lundi, cf. getDailyHealth)
  // -- la dernière semaine peut être incomplète (s'arrête à aujourd'hui).
  const weeks = useMemo(() => {
    const out: DailyHealthCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  // Libellés jour de semaine ("L M M J V S D" en fr, "M T W T F S S" en en...)
  // -- dérivés des 7 dates de la première semaine complète plutôt que codés
  // en dur, pour rester corrects dans les 3 langues sans dupliquer une table
  // de traduction que Intl fournit déjà.
  const dayLabels = useMemo(() => {
    const ref = weeks[0] ?? cells;
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, row) => (ref[row] ? fmt.format(new Date(`${ref[row].date}T00:00:00Z`)) : ""));
  }, [weeks, cells, locale]);

  // Libellé mois par colonne : affiché seulement quand le mois change par
  // rapport à la colonne précédente (basé sur le lundi de chaque semaine),
  // même logique que le calendrier GitHub -- pas un libellé répété sur
  // chaque colonne.
  const monthLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    let prevMonth = "";
    return weeks.map((week) => {
      const first = week[0]?.date;
      if (!first) return "";
      const month = first.slice(0, 7); // 'YYYY-MM'
      if (month === prevMonth) return "";
      prevMonth = month;
      return fmt.format(new Date(`${first}T00:00:00Z`));
    });
  }, [weeks, locale]);

  return (
    <div className="card-glass" style={{ padding: "12px 16px", flex: 1, minHeight: "110px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px", flexShrink: 0 }}>
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
              <span style={{ width: LEGEND_DOT, height: LEGEND_DOT, borderRadius: "2px", background: STATUS_COLOR[status], flexShrink: 0 }} />
              {t(`dailyHealthLegend.${status}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Ligne des mois -- alignée sur les mêmes colonnes que la grille en
          dessous via le même `1fr` par semaine. */}
      <div style={{ display: "flex", gap: `${GAP}px`, marginLeft: `${LABEL_COL_WIDTH + GAP}px`, marginBottom: "3px", flexShrink: 0 }}>
        {monthLabels.map((label, i) => (
          <span key={i} style={{ flex: 1, minWidth: 0, fontSize: "9.5px", color: "var(--foreground-subtle)", textTransform: "capitalize" }}>
            {label}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: `${GAP}px`, flex: 1, minHeight: 0 }}>
        {/* Libellés jour de semaine */}
        <div style={{ width: LABEL_COL_WIDTH, flexShrink: 0, display: "flex", flexDirection: "column", gap: `${GAP}px` }}>
          {dayLabels.map((label, row) => (
            <span
              key={row}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                fontSize: "9.5px",
                color: "var(--foreground-subtle)",
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grille des jours -- 1fr en largeur ET hauteur : occupe exactement
            l'espace disponible plutôt qu'une taille de case fixe. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridAutoFlow: "column",
            gridTemplateRows: "repeat(7, 1fr)",
            gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
            gap: `${GAP}px`,
          }}
        >
          {cells.map((cell) => (
            <span
              key={cell.date}
              title={t(`dailyHealthTooltip.${cell.status}`, { date: formatDate(cell.date, locale) })}
              tabIndex={0}
              style={{
                borderRadius: "2px",
                background: STATUS_COLOR[cell.status],
                opacity: cell.status === "none" ? 0.55 : 1,
                cursor: "default",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
