"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format";
import type { DataCoverageRow, SyncStatusResponse } from "@/lib/types";
import { ErrorsPanel } from "./ErrorsPanel";
import { FreshnessGrid } from "./FreshnessGrid";
import { DataCoverageSection } from "./DataCoverageSection";
import { RunningNowPanel } from "./RunningNowPanel";
import { RunsTimeline } from "./RunsTimeline";
import { StatusDot } from "./StatusDot";

const POLL_INTERVAL_MS = 10_000;

// `coverage` est chargé une seule fois côté serveur (page.tsx) et jamais
// re-polled : c'est un agrégat sur ~74k items + ~130k price_snapshots
// (mesuré ~1.5s cumulé), pas une donnée qui bouge en 10s comme sync_runs --
// le repolling la rafraîchirait pour rien à chaque tick, sur toutes les
// tabs ouvertes.
export function LiveDashboard({ initialData, coverage }: { initialData: SyncStatusResponse; coverage: DataCoverageRow[] }) {
  const [data, setData] = useState(initialData);
  const [live, setLive] = useState(true);
  const mounted = useRef(true);
  const t = useTranslations("live");
  const locale = useLocale();

  useEffect(() => {
    mounted.current = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/sync-status", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next: SyncStatusResponse = await res.json();
        if (mounted.current) {
          setData(next);
          setLive(true);
        }
      } catch {
        if (mounted.current) setLive(false);
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <StatusDot color={live ? "var(--positive)" : "var(--foreground-subtle)"} pulsing={live} size={7} />
        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
          {live ? t("liveStatus") : t("disconnected")} · {t("refreshed", { time: formatRelativeTime(data.fetchedAt, locale) })}
        </span>
      </div>

      <ErrorsPanel errors={data.recentErrors} />
      <RunningNowPanel runs={data.runningNow} />
      <FreshnessGrid freshness={data.freshness} />
      <DataCoverageSection rows={coverage} />
      <RunsTimeline runs={data.recentRuns} />
    </div>
  );
}
