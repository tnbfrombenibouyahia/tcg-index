"use client";

import { useEffect, useRef, useState } from "react";
import type { DataCoverageRow, SyncStatusResponse } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { TopStatusBar } from "./TopStatusBar";
import { SourcesTable } from "./SourcesTable";
import { PipelineCards } from "./PipelineCards";
import { RowsBarChart } from "./RowsBarChart";
import { AttentionPanel } from "./AttentionPanel";
import { SyncLog } from "./SyncLog";
import { CoverageList } from "./CoverageList";

const POLL_INTERVAL_MS = 10_000;

// Corps de l'écran Live CardQuant (cf. mémoire projet "cardquant-rebrand")
// -- repolle /api/sync-status toutes les 10s, même route et même intervalle
// que l'ancien LiveDashboard.tsx (réutilisée telle quelle). `coverage` reste
// chargé une seule fois côté serveur (page.tsx), jamais re-pollé -- même
// raison que l'ancien composant (agrégat ~74k items, pas une donnée qui
// bouge en 10s).
export function LiveBody({ initialData, coverage }: { initialData: SyncStatusResponse; coverage: DataCoverageRow[] }) {
  const [data, setData] = useState(initialData);
  const [live, setLive] = useState(true);
  const mounted = useRef(true);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? "var(--up-600)" : "var(--text-muted)" }} />
        {live ? "En direct" : "Déconnecté"} · actualisé {formatRelativeTime(data.fetchedAt, "fr")}
      </div>

      <TopStatusBar freshness={data.freshness} coverage={coverage} recentRuns={data.recentRuns} errorsCount={data.recentErrors.length} nowMs={new Date(data.fetchedAt).getTime()} />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "6 1 540px", minWidth: 0 }}>
          <SourcesTable runs={data.recentRuns} />
          <PipelineCards runs={data.recentRuns} nowMs={new Date(data.fetchedAt).getTime()} />
          <RowsBarChart runs={data.recentRuns} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 290px", minWidth: 0 }}>
          <AttentionPanel errors={data.recentErrors} />
          <SyncLog runs={data.recentRuns} />
          <CoverageList rows={coverage} />
        </div>
      </div>
    </div>
  );
}
