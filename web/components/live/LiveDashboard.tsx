"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format";
import type { DataCoverageRow, SyncStatusResponse } from "@/lib/types";
import { ErrorsPanel } from "./ErrorsPanel";
import { ScheduleBar } from "./ScheduleBar";
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <StatusDot color={live ? "var(--positive)" : "var(--foreground-subtle)"} pulsing={live} size={7} />
        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
          {live ? t("liveStatus") : t("disconnected")} · {t("refreshed", { time: formatRelativeTime(data.fetchedAt, locale) })}
        </span>
      </div>

      {/* Ordre demandé par l'utilisateur (2026-08-09) : couverture tout en
          haut, puis fraîcheur/planning, puis historique en bas -- erreurs et
          "en cours" gardés (debug prioritaire) mais compacts/conditionnels,
          ils disparaissent quand il n'y a rien à signaler.

          Forme repensée le 2026-08-11 (demande utilisateur : "tout tienne
          sans scroller vers le bas", form factor laissé libre) : fraîcheur
          et historique, auparavant empilés l'un sous l'autre, passent
          côte à côte dans une grille qui absorbe le reste de la hauteur
          d'écran (`flex: 1` sur cette grille, page.tsx borne déjà le
          conteneur parent à `100dvh - dock`). L'historique (le plus long
          des deux, jusqu'à 100 runs) garde son propre scroll interne (cf.
          RunsTimeline) plutôt que de pousser la page vers le bas -- 1.2fr
          contre 0.8fr pour la fraîcheur, dont les cartes ont besoin de
          moins de largeur. Coverage reste plein écran au-dessus : ses
          tableaux ont besoin de largeur (6 colonnes), pas de hauteur, donc
          rien à gagner à le rétrécir dans une colonne.

          ScheduleBar (ex-partie de FreshnessSection, cf. son commentaire)
          repasse plein-écran juste en dessous pour la même raison : repliés
          dans la colonne étroite 0.8fr, ses 5 badges de cadence débordaient
          sur 4-5 lignes et écrasaient FreshnessGrid en dessous. */}
      <div style={{ flexShrink: 0 }}>
        <DataCoverageSection rows={coverage} />
      </div>
      <div style={{ flexShrink: 0 }}>
        <ErrorsPanel errors={data.recentErrors} />
      </div>
      <RunningNowPanel runs={data.runningNow} />
      <div style={{ flexShrink: 0 }}>
        <ScheduleBar />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[0.8fr_1.2fr]" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ minHeight: 0, overflowY: "auto" }}>
          <FreshnessGrid freshness={data.freshness} />
        </div>
        <div style={{ minHeight: 0 }}>
          <RunsTimeline runs={data.recentRuns} />
        </div>
      </div>
    </div>
  );
}
