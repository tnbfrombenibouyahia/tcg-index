"use client";

import { useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

// Cadence réelle des deux workflows GitHub Actions (cf. .github/workflows/) --
// statique, pas interrogé : c'est la programmation elle-même, pas une donnée.
// Les libellés viennent de messages/*.json (namespace live.schedule), les
// horaires cron restent en dur ici (locale-invariants, ce sont des heures UTC).
const SCHEDULE_KEYS = ["itemsPrices", "hot", "recent", "established", "vintage"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Ex-FreshnessSection : jusqu'au 2026-08-11 ce bloc de badges de cadence
// vivait fusionné avec FreshnessGrid (demande utilisateur 2026-08-09, "un
// seul endroit pour la question 'quand'"). Séparé de nouveau en repensant la
// mise en page plein-écran de /live (demande utilisateur : "tout tienne sans
// scroller") : les 5 badges, en pleine largeur de page, tiennent sur 1-2
// lignes -- repliés dans la colonne étroite (0.8fr) aux côtés de
// FreshnessGrid comme avant, ils débordaient sur 4-5 lignes et écrasaient
// les cartes de fraîcheur en dessous. Passe donc en barre plein-écran
// au-dessus de la grille fraîcheur/historique (cf. LiveDashboard.tsx),
// FreshnessGrid gardant son propre composant à part (déjà le cas).
// ─────────────────────────────────────────────────────────────────────────────

export function ScheduleBar() {
  const t = useTranslations("live");
  const tSchedule = useTranslations("live.schedule");

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <h2
        className="text-xs font-semibold uppercase"
        style={{
          color: "var(--foreground-muted)",
          letterSpacing: "0.10em",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginRight: "2px",
        }}
      >
        {t("scheduleTitle")}
        <InfoTooltip text={t("scheduleIntro")} />
      </h2>
      {SCHEDULE_KEYS.map((key) => (
        <span
          key={key}
          className="tile-glass"
          style={{
            padding: "5px 11px",
            fontSize: "11px",
            color: "var(--foreground-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{tSchedule(`${key}.label`)}</span>
          <span>·</span>
          <span>{tSchedule(`${key}.cron`)}</span>
        </span>
      ))}
    </div>
  );
}
