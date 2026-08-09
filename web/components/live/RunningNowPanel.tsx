"use client";

import { useLocale, useTranslations } from "next-intl";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { TCGS, type Tcg } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/format";
import type { SyncRun } from "@/lib/types";
import { StatusDot } from "./StatusDot";

const TCG_LABEL: Record<Tcg, string> = Object.fromEntries(TCGS.map((t) => [t.value, t.label])) as Record<
  Tcg,
  string
>;

// Recentré sur le seul cas "quelque chose tourne là" -- demande utilisateur
// 2026-08-09 (réorganisation de page) : l'état "rien en cours" affichait un
// bloc entier rien que pour les badges de planning (SCHEDULE_KEYS), qui
// vivent maintenant dans FreshnessSection aux côtés de la fraîcheur (même
// logique : "quand" plutôt qu'éclaté en deux endroits). `null` quand rien ne
// tourne -- le cas courant -- au lieu d'un panneau vide à combler.
export function RunningNowPanel({ runs: running }: { runs: SyncRun[] }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const locale = useLocale();

  if (running.length === 0) return null;

  return (
    <div className="card-glass" style={{ padding: "24px 24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <StatusDot color="var(--foreground)" pulsing size={9} />
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em", margin: 0 }}>
          {t("runningTitle")}
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
        {running.map((run) => (
          <div
            key={run.id}
            className="tile-glass"
            style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <StatusDot color="var(--foreground)" pulsing size={7} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>
                {tSteps(run.step)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--foreground-muted)", fontSize: "12px" }}>
              {run.tcg ? (
                <>
                  <TcgIcon tcg={run.tcg} />
                  <span>{TCG_LABEL[run.tcg]}</span>
                </>
              ) : (
                <span>{t("bothTcgs")}</span>
              )}
              {run.tier ? <span>· {t.has(`tiers.${run.tier}`) ? t(`tiers.${run.tier}`) : run.tier}</span> : null}
            </div>
            <span style={{ fontSize: "11px", color: "var(--foreground-subtle)" }}>
              {t("startedAt", { time: formatRelativeTime(run.startedAt, locale) })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
