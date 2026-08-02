"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format";
import type { SyncStatusResponse } from "@/lib/types";
import { FreshnessGrid } from "./FreshnessGrid";
import { RunningNowPanel } from "./RunningNowPanel";
import { RunsTimeline } from "./RunsTimeline";
import { StatusDot } from "./StatusDot";

const POLL_INTERVAL_MS = 10_000;

export function LiveDashboard({ initialData }: { initialData: SyncStatusResponse }) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <StatusDot color={live ? "var(--positive)" : "var(--foreground-subtle)"} pulsing={live} size={7} />
        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
          {live ? t("liveStatus") : t("disconnected")} · {t("refreshed", { time: formatRelativeTime(data.fetchedAt, locale) })}
        </span>
      </div>

      <RunningNowPanel runs={data.runningNow} />
      <FreshnessGrid freshness={data.freshness} />
      <RunsTimeline runs={data.recentRuns} />
    </div>
  );
}
