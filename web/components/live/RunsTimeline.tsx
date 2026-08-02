"use client";

import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { TCGS, type Tcg } from "@/lib/constants";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import type { SyncRun } from "@/lib/types";
import { StatusDot } from "./StatusDot";

const TCG_LABEL: Record<Tcg, string> = Object.fromEntries(TCGS.map((t) => [t.value, t.label])) as Record<
  Tcg,
  string
>;

function StatusIcon({ status }: { status: SyncRun["status"] }) {
  if (status === "running") return <StatusDot color="var(--foreground)" pulsing size={8} />;
  if (status === "success") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function RunsTimeline({ runs }: { runs: SyncRun[] }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const locale = useLocale();

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", marginBottom: "12px" }}
      >
        {t("historyTitle")}
      </h2>

      {runs.length === 0 ? (
        <EmptyState title={t("emptyRunsTitle")} description={t("emptyRunsDescription")} />
      ) : (
        <div className="card-glass" style={{ padding: "6px 22px" }}>
          {runs.map((run, i) => (
            <div
              key={run.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ marginTop: "3px" }}>
                <StatusIcon status={run.status} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>
                    {tSteps(run.step)}
                  </span>
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
                </div>
                {run.detail ? (
                  <p style={{ fontSize: "12px", color: "var(--foreground-muted)", margin: "3px 0 0" }}>{run.detail}</p>
                ) : null}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, fontSize: "11.5px", color: "var(--foreground-subtle)" }}>
                <div>{formatRelativeTime(run.startedAt, locale)}</div>
                {run.finishedAt ? <div>{formatDuration(run.startedAt, run.finishedAt)}</div> : <div>{t("inProgress")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
