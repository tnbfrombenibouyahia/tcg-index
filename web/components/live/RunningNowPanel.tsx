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

// Cadence réelle des deux workflows GitHub Actions (cf. .github/workflows/) --
// statique, pas interrogé : c'est la programmation elle-même, pas une donnée.
// Les libellés viennent de messages/*.json (namespace live.schedule), les
// horaires cron restent en dur ici (locale-invariants, ce sont des heures UTC).
const SCHEDULE_KEYS = ["itemsPrices", "hot", "recent", "established", "vintage"] as const;

export function RunningNowPanel({ runs: running }: { runs: SyncRun[] }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const tSchedule = useTranslations("live.schedule");
  const locale = useLocale();

  return (
    <div className="card-glass" style={{ padding: "24px 24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <StatusDot color={running.length > 0 ? "var(--foreground)" : "var(--foreground-subtle)"} pulsing={running.length > 0} size={9} />
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em", margin: 0 }}>
          {running.length > 0 ? t("runningTitle") : t("noRunningTitle")}
        </h2>
      </div>

      {running.length > 0 ? (
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
      ) : (
        <div>
          <p style={{ fontSize: "13px", color: "var(--foreground-muted)", margin: "0 0 14px" }}>
            {t("scheduleIntro")}
          </p>
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
      )}
    </div>
  );
}
