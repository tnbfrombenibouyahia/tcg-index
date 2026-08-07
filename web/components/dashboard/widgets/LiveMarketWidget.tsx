"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { IndexSummary } from "@/lib/types";
import type { DivergenceRow } from "@/lib/types";
import { formatIndexValue, formatPct } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Widget Live Market -- valeur + delta veille de l'indice global de l'univers
// actif (PKM_GLOBAL / OP_GLOBAL, cf. lib/queries/indices.ts), sparkline SVG
// sur une fenêtre choisie (7D/1M/3M/1Y -- pas de "1D" : la donnée est
// quotidienne, cf. cron journalier, un bouton intraday mentirait), et
// "top movers" = plus fortes hausses de prix sur 7 jours (lib/queries/
// divergence.ts, réutilisé plutôt que dupliqué).
//
// Vue agrandie : `expandedContent` est un sous-arbre déjà rendu côté serveur
// (HeadlineSection + SubIndexGrid + DailyExchangeSection filtrés sur
// l'univers actif, cf. app/page.tsx) -- composition Server->Client standard
// Next.js plutôt que ré-importer ces Server Components ici.
// ─────────────────────────────────────────────────────────────────────────────

const TIMEFRAMES: { key: string; days: number }[] = [
  { key: "7D", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "1Y", days: 365 },
];

export function LiveMarketWidget({
  index,
  movers,
  expanded,
  expandedContent,
}: {
  index: IndexSummary | null;
  movers: DivergenceRow[];
  expanded: boolean;
  expandedContent: ReactNode;
}) {
  const t = useTranslations("dashboard.live");
  const [timeframe, setTimeframe] = useState("1M");

  const { points, fillPoints } = useMemo(() => {
    if (!index) return { points: "", fillPoints: "" };
    const days = TIMEFRAMES.find((tf) => tf.key === timeframe)?.days ?? 30;
    const slice = index.history.slice(-days);
    if (slice.length < 2) return { points: "", fillPoints: "" };
    const values = slice.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = 400 / (slice.length - 1);
    const coords = slice.map((p, i) => {
      const norm = (p.value - min) / range; // 0..1
      const y = 130 - norm * 120; // marge haut/bas
      return `${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      points: coords.join(" "),
      fillPoints: `0,140 ${coords.join(" ")} 400,140`,
    };
  }, [index, timeframe]);

  if (expanded) return <>{expandedContent}</>;

  return (
    <div style={{ display: "flex", gap: "24px", flex: 1 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span
            style={{
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: "26px",
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            {index ? formatIndexValue(index.latest?.value ?? 0) : "—"}
          </span>
          {index?.changePct != null && (
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: "13px",
                color: index.changePct >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {formatPct(index.changePct)}
            </span>
          )}
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                type="button"
                onClick={() => setTimeframe(tf.key)}
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "1px solid var(--border)",
                  background: timeframe === tf.key ? "var(--accent)" : "transparent",
                  color: timeframe === tf.key ? "#fff" : "var(--foreground-muted)",
                  cursor: "pointer",
                }}
              >
                {tf.key}
              </button>
            ))}
          </div>
        </div>
        {points ? (
          <svg
            viewBox="0 0 400 140"
            preserveAspectRatio="none"
            style={{ width: "100%", height: "140px", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 70%, transparent))" }}
          >
            <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
            <polygon points={fillPoints} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
          </svg>
        ) : (
          <p style={{ fontSize: "12px", color: "var(--foreground-subtle)" }}>{t("noHistory")}</p>
        )}
      </div>
      <div style={{ width: "180px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--foreground-muted)", letterSpacing: "0.5px" }}>
          {t("topMovers")}
        </span>
        {movers.length === 0 && (
          <p style={{ fontSize: "12px", color: "var(--foreground-subtle)" }}>{t("noMovers")}</p>
        )}
        {movers.map((m) => (
          <div key={m.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "var(--foreground)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {m.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: "12px",
                flexShrink: 0,
                color: m.priceChangePct >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {formatPct(m.priceChangePct)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
