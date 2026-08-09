"use client";

import { useTranslations } from "next-intl";
import type { FreshnessCell } from "@/lib/types";
import { FreshnessGrid } from "./FreshnessGrid";

// Cadence réelle des deux workflows GitHub Actions (cf. .github/workflows/) --
// statique, pas interrogé : c'est la programmation elle-même, pas une donnée.
// Les libellés viennent de messages/*.json (namespace live.schedule), les
// horaires cron restent en dur ici (locale-invariants, ce sont des heures UTC).
const SCHEDULE_KEYS = ["itemsPrices", "hot", "recent", "established", "vintage"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Fraîcheur + planning réunis dans une seule section -- demande utilisateur
// 2026-08-09 (réorganisation de page) : "le dernier effectué sur telle
// catégorie pour telle TCG" (FreshnessGrid, déjà existant) ET "les différents
// schedule revus par heure et par jour" (badges de cadence cron, avant
// éclatés dans RunningNowPanel côté "rien en cours" -- déplacés ici, un seul
// endroit pour la question "quand"). FreshnessGrid garde son propre composant
// (déjà utilisé sans changement) plutôt que dupliqué ici.
// ─────────────────────────────────────────────────────────────────────────────

export function FreshnessSection({ freshness }: { freshness: FreshnessCell[] }) {
  const t = useTranslations("live");
  const tSchedule = useTranslations("live.schedule");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h2
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", marginBottom: "6px" }}
        >
          {t("scheduleTitle")}
        </h2>
        <p style={{ fontSize: "12px", color: "var(--foreground-muted)", margin: "0 0 10px" }}>{t("scheduleIntro")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {SCHEDULE_KEYS.map((key) => (
            <span
              key={key}
              className="tile-glass"
              style={{
                padding: "6px 12px",
                fontSize: "11.5px",
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
      </div>

      <FreshnessGrid freshness={freshness} />
    </section>
  );
}
