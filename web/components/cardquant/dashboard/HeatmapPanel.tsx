"use client";

import { useMemo, useState } from "react";
import type { SetHeatmapRow } from "@/lib/types";
import { treemapLayout } from "@/lib/cardquant/treemap";

// Heatmap par set (port du panneau "Heatmap par set" du Dashboard CardQuant,
// cf. mémoire projet "cardquant-rebrand"). `rows` vient de
// lib/queries/dashboardOverview.ts::getSetHeatmap, déjà triées par volume
// décroissant -- la taille des tuiles est un vrai treemap (cf.
// lib/cardquant/treemap.ts), pas des proportions inventées comme le
// prototype .dc.html.
//
// Le toggle "Valeur / Ventes" du prototype affichait "€"/"$" -- renommé en
// "Valeur" ici : sales.currency mélange EUR/USD selon la vente (cf.
// db/schema.sql) et aucune conversion réelle n'est branchée (cf. TopNav.tsx),
// donc sommer les prix et les étiqueter avec un seul symbole monétaire
// afficherait un chiffre trompeur. Le nombre de ventes, lui, ne pose pas ce
// problème.
const CANONICAL_W = 237; // aspect ~2.37 -- approx. la largeur/hauteur réelle du conteneur (clamp 300-460px de haut, pleine largeur de panneau)
const CANONICAL_H = 100;

function heatColor(pct: number): string {
  const clamped = Math.max(-15, Math.min(15, pct));
  const intensity = Math.round((Math.abs(clamped) / 15) * 70);
  const base = clamped >= 0 ? "var(--up-400)" : "var(--down-500)";
  return `color-mix(in srgb, ${base} ${intensity}%, var(--surface-sunken))`;
}

type TcgFilter = "both" | "pokemon" | "one-piece";
type Metric = "value" | "volume";

export function HeatmapPanel({ rows }: { rows: SetHeatmapRow[] }) {
  const [tcgFilter, setTcgFilter] = useState<TcgFilter>("both");
  const [metric, setMetric] = useState<Metric>("volume");

  const filtered = useMemo(() => {
    const base = tcgFilter === "both" ? rows : rows.filter((r) => r.tcg === tcgFilter);
    return [...base].sort((a, b) => b.salesCount - a.salesCount).slice(0, 24);
  }, [rows, tcgFilter]);

  const rects = useMemo(
    () => treemapLayout(filtered.map((r) => r.salesCount), { x: 0, y: 0, w: CANONICAL_W, h: CANONICAL_H }),
    [filtered],
  );

  const pillGroup = (options: { value: string; label: string }[], active: string, onPick: (v: never) => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 999, border: "1px solid var(--border-hairline)" }}>
      {options.map((o) => (
        <span
          key={o.value}
          onClick={() => onPick(o.value as never)}
          style={{
            display: "inline-grid", placeItems: "center", height: 22, padding: "0 9px", borderRadius: 999,
            fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer",
            background: active === o.value ? "var(--text-strong)" : "transparent",
            color: active === o.value ? "#000" : "var(--text-muted)",
          }}
        >
          {o.label}
        </span>
      ))}
    </div>
  );

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 130, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Heatmap par set
        </span>
        {pillGroup(
          [{ value: "both", label: "Les deux" }, { value: "pokemon", label: "Pokémon" }, { value: "one-piece", label: "One Piece" }],
          tcgFilter,
          setTcgFilter as (v: never) => void,
        )}
        {pillGroup(
          [{ value: "volume", label: "Ventes" }, { value: "value", label: "Valeur" }],
          metric,
          setMetric as (v: never) => void,
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Pas assez de ventes récentes pour construire une heatmap sur cette sélection.
        </div>
      ) : (
        <div style={{ position: "relative", width: "100%", height: "clamp(300px, 36vh, 460px)", background: "var(--surface-sunken)", borderRadius: 4, overflow: "hidden" }}>
          {filtered.map((r, i) => {
            const rect = rects[i];
            if (!rect) return null;
            const footer = metric === "volume" ? `${r.salesCount} ventes` : `${Math.round(r.salesValue).toLocaleString("fr-FR")}`;
            const showText = rect.w > 16 && rect.h > 12; // évite le texte tronqué illisible sur les toutes petites tuiles
            return (
              <div
                key={`${r.tcg}-${r.setCode}`}
                title={`${r.setCode} · ${r.salesCount} ventes · ${r.priceChangePct >= 0 ? "+" : ""}${r.priceChangePct.toFixed(1)}%`}
                style={{
                  position: "absolute",
                  left: `${(rect.x / CANONICAL_W) * 100}%`,
                  top: `${(rect.y / CANONICAL_H) * 100}%`,
                  width: `${(rect.w / CANONICAL_W) * 100}%`,
                  height: `${(rect.h / CANONICAL_H) * 100}%`,
                  padding: "5px 6px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 2,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  outline: "1px solid var(--surface-page)",
                  background: heatColor(r.priceChangePct),
                }}
              >
                {showText ? (
                  <>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {r.setCode}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, lineHeight: 1, color: r.priceChangePct >= 0 ? "var(--up-600)" : "var(--down-500)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {r.priceChangePct >= 0 ? "+" : ""}{r.priceChangePct.toFixed(1)}%
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{footer}</span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Variation de prix moyen, 30j vs 30j précédents. Écarts, pas des recommandations.</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)" }}>−15%</span>
          <span style={{ width: 76, height: 6, borderRadius: 999, background: "linear-gradient(90deg, rgba(248,14,53,.55) 0%, rgba(138,145,141,.25) 50%, rgba(78,232,115,.55) 100%)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)" }}>+15%</span>
        </span>
      </div>
    </section>
  );
}
