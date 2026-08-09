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

// ─────────────────────────────────────────────────────────────────────────────
// Section debug -- demande utilisateur 2026-08-09 ("je veux que ça me serve à
// debug") : les erreurs de sync_runs existaient déjà dans RunsTimeline mais
// noyées dans l'historique complet. Ici c'est le PREMIER bloc de la page si
// des erreurs récentes existent (cf. LiveDashboard), teinte rouge assumée --
// à l'inverse, liste vide = état positif clairement annoncé plutôt qu'un
// bloc juste absent (l'utilisateur doit pouvoir confirmer "rien à débugger"
// aussi vite qu'un vrai problème). `detail` affiché intégralement et en
// police mono (c'est souvent un message d'erreur SQL/HTTP brut, cf. exemples
// réels : `column "source" does not exist...`, "Request limit reached...").
// ─────────────────────────────────────────────────────────────────────────────

export function ErrorsPanel({ errors }: { errors: SyncRun[] }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const locale = useLocale();

  if (errors.length === 0) {
    return (
      <div
        className="card-glass"
        style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "10px" }}
      >
        <StatusDot color="var(--positive)" size={9} />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>{t("noErrorsTitle")}</span>
        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>{t("noErrorsDescription")}</span>
      </div>
    );
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <StatusDot color="var(--negative)" size={9} />
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em", margin: 0 }}>
          {t("errorsTitle")}
        </h2>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--negative)",
            background: "color-mix(in srgb, var(--negative) 14%, transparent)",
            borderRadius: "999px",
            padding: "2px 9px",
          }}
        >
          {errors.length}
        </span>
      </div>
      <div
        className="card-glass"
        style={{ padding: "4px 20px", border: "1px solid color-mix(in srgb, var(--negative) 35%, var(--border-soft))" }}
      >
        {errors.map((run, i) => (
          <div
            key={run.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "14px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--foreground)" }}>{tSteps(run.step)}</span>
              {run.tcg ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--foreground-muted)" }}>
                  <TcgIcon tcg={run.tcg} />
                  {TCG_LABEL[run.tcg]}
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>{t("bothTcgs")}</span>
              )}
              {run.tier ? (
                <span style={{ fontSize: "11.5px", color: "var(--foreground-subtle)" }}>
                  {t.has(`tiers.${run.tier}`) ? t(`tiers.${run.tier}`) : run.tier}
                </span>
              ) : null}
              <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--foreground-subtle)" }}>
                {formatRelativeTime(run.startedAt, locale)}
              </span>
            </div>
            {run.detail ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "11.5px",
                  lineHeight: 1.5,
                  color: "var(--negative)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "color-mix(in srgb, var(--negative) 7%, transparent)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                {run.detail}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
