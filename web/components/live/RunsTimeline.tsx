"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { TCGS, type Tcg } from "@/lib/constants";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import type { SyncRun, SyncRunStatus } from "@/lib/types";
import { StatusDot } from "./StatusDot";

const TCG_LABEL: Record<Tcg, string> = Object.fromEntries(TCGS.map((t) => [t.value, t.label])) as Record<
  Tcg,
  string
>;

type Filter = "all" | SyncRunStatus;
const FILTERS: Filter[] = ["all", "error", "success", "running"];

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

// Filtres client -- demande utilisateur "je veux que ça me serve à debug" :
// avec jusqu'à 100 runs affichés, pouvoir isoler juste les erreurs (déjà
// couvertes en tête de page par ErrorsPanel, mais utile ici pour les
// recroiser avec le contexte chronologique complet) ou juste les succès
// (vérifier qu'un step précis tourne bien) sans re-fetch.
export function RunsTimeline({ runs }: { runs: SyncRun[] }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => (filter === "all" ? runs : runs.filter((r) => r.status === filter)), [runs, filter]);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <h2
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", margin: 0 }}
        >
          {t("historyTitle")}
        </h2>
        <div style={{ display: "flex", gap: "6px" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                fontSize: "11.5px",
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                background: filter === f ? "var(--accent)" : "transparent",
                color: filter === f ? "#fff" : "var(--foreground-muted)",
                cursor: "pointer",
              }}
            >
              {t(`historyFilter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("emptyRunsTitle")} description={t("emptyRunsDescription")} />
      ) : (
        // Hauteur bornée + scroll interne -- demande utilisateur : la page ne
        // doit pas s'étirer indéfiniment avec le nombre de runs (jusqu'à 100
        // affichés), l'historique devient un panneau qu'on scrolle DANS
        // plutôt qu'une liste qui pousse le bas de page toujours plus loin.
        <div className="card-glass" style={{ padding: "6px 22px", maxHeight: "48vh", overflowY: "auto" }}>
          {filtered.map((run, i) => (
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
                  <p
                    style={{
                      fontSize: "12px",
                      color: run.status === "error" ? "var(--negative)" : "var(--foreground-muted)",
                      margin: "3px 0 0",
                      fontFamily: run.status === "error" ? "var(--font-ibm-plex-mono), monospace" : undefined,
                      whiteSpace: run.status === "error" ? "pre-wrap" : undefined,
                      wordBreak: run.status === "error" ? "break-word" : undefined,
                    }}
                  >
                    {run.detail}
                  </p>
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
