"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { SyncRun, SyncStatusResponse } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { TCGS, type Tcg } from "@/lib/constants";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { PulseIcon } from "@/components/ui/icons";

// ─────────────────────────────────────────────────────────────────────────────
// Pastille "Live Market Data" -- demande utilisateur : une version compacte,
// TOUJOURS visible (pas seulement sur /live), ancrée tout à droite de la
// barre du bas plutôt qu'au centre comme WidgetDock, pour que l'utilisateur
// sache en un coup d'œil si la donnée est fraîche sans avoir à naviguer.
// Même langage visuel que WidgetDock (verre liquide, pilule qui se déplie au
// survol) pour rester cohérent -- juste ancrée à droite au lieu du centre, et
// jamais masquée sur /dashboard (contrairement à GlobalDock qui laisse la
// place à l'instance "agrandissante" de TerminalDashboard) : c'est un widget
// d'info, pas une navigation, les deux peuvent coexister partout.
//
// Réutilise le même /api/sync-status que LiveDashboard.tsx (même poll 10s,
// même détection "live"/"disconnected") -- pas une nouvelle source de
// vérité, juste une vue condensée de la même donnée (sync_runs + fraîcheur
// par segment). Replié : pastille + statut + relatif du dernier événement.
// Déplié (survol) : les ~4 derniers runs (type de donnée/TCG/résumé/heure),
// même contenu que RunsTimeline mais en une ligne par run -- lien "Tout
// voir" vers /live pour le détail complet (grille de fraîcheur, timeline
// entière).
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
const FEED_LIMIT = 4;

const TCG_LABEL: Record<Tcg, string> = Object.fromEntries(TCGS.map((t) => [t.value, t.label])) as Record<
  Tcg,
  string
>;

function RunRow({ run }: { run: SyncRun }) {
  const t = useTranslations("live");
  const tSteps = useTranslations("live.steps");
  const locale = useLocale();
  const dotColor =
    run.status === "running" ? "var(--accent)" : run.status === "success" ? "var(--positive)" : "var(--negative)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0" }}>
      <span
        className={run.status === "running" ? "pulse-dot" : undefined}
        style={{ width: 6, height: 6, borderRadius: "9999px", background: dotColor, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--foreground)" }}>
          {run.tcg && <TcgIcon tcg={run.tcg} />}
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tSteps(run.step)}</span>
        </div>
        {run.detail && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "11px",
              color: "var(--foreground-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {run.tcg ? TCG_LABEL[run.tcg] : t("bothTcgs")} · {run.detail}
          </p>
        )}
      </div>
      <span style={{ fontSize: "10.5px", color: "var(--foreground-subtle)", flexShrink: 0, whiteSpace: "nowrap" }}>
        {formatRelativeTime(run.startedAt, locale)}
      </span>
    </div>
  );
}

export function LiveDataDock() {
  const t = useTranslations("live");
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [live, setLive] = useState(true);
  const [hover, setHover] = useState(false);
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
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  const runningCount = data?.runningNow.length ?? 0;
  const latestRun = data?.recentRuns[0] ?? null;
  const feed = data?.recentRuns.slice(0, FEED_LIMIT) ?? [];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed",
        right: "24px",
        bottom: "26px",
        zIndex: 40,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
      }}
    >
      {hover && (
        <div
          className="card-glass"
          style={{
            width: "300px",
            maxWidth: "calc(100vw - 48px)",
            marginBottom: "10px",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--foreground-muted)", textTransform: "uppercase" }}>
              {t("breadcrumbCurrent")}
            </span>
            <button
              type="button"
              onClick={() => router.push("/live")}
              style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--accent)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
            >
              {t("seeAll")}
            </button>
          </div>
          {feed.length === 0 ? (
            <p style={{ fontSize: "11.5px", color: "var(--foreground-subtle)", padding: "8px 0" }}>{t("emptyRunsTitle")}</p>
          ) : (
            <div>
              {feed.map((run, i) => (
                <div key={run.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                  <RunRow run={run} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push("/live")}
        aria-label={t("breadcrumbCurrent")}
        title={t("breadcrumbCurrent")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: hover ? "10px" : "0px",
          padding: hover ? "10px 16px" : "10px",
          borderRadius: "24px",
          cursor: "pointer",
          border: "1px solid var(--glass-widget-border)",
          background: "var(--glass-widget-bg)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          boxShadow: "var(--glass-widget-shadow)",
          transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <span style={{ position: "relative", display: "flex", color: live ? "var(--positive)" : "var(--foreground-subtle)", flexShrink: 0 }}>
          <PulseIcon size={15} />
          {live && runningCount > 0 && (
            <span
              className="pulse-dot"
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                background: "var(--accent)",
              }}
            />
          )}
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            whiteSpace: "nowrap",
            opacity: hover ? 1 : 0,
            maxWidth: hover ? "220px" : "0px",
            overflow: "hidden",
            transition: "opacity 0.2s, max-width 0.3s",
          }}
        >
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--foreground)" }}>
            {runningCount > 0 ? t("runningTitle") : live ? t("liveStatus") : t("disconnected")}
          </span>
          <span style={{ fontSize: "10px", color: "var(--foreground-muted)" }}>
            {latestRun ? formatRelativeTime(latestRun.startedAt, locale) : "—"}
          </span>
        </span>
      </button>
    </div>
  );
}
