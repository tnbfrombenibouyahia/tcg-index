"use client";

import { useState } from "react";
import type { BreakdownSlice } from "@/lib/queries/transactionsOverview";

const TCG_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };
const TCG_COLOR: Record<string, string> = { pokemon: "var(--green-400)", "one-piece": "var(--ink-000)" };
const PALETTE = ["var(--ink-000)", "var(--green-400)", "var(--grey-400)", "var(--info-400)"];

type Metric = "count" | "value";

function Donut({ title, slices, metric, colorFor }: { title: string; slices: BreakdownSlice[]; metric: Metric; colorFor: (key: string, i: number) => string }) {
  const total = slices.reduce((sum, s) => sum + (metric === "count" ? s.count : s.value), 0);
  const sorted = [...slices].sort((a, b) => (metric === "count" ? b.count - a.count : b.value - a.value));
  let acc = 0;
  const stops = sorted.map((s, i) => {
    const v = metric === "count" ? s.count : s.value;
    const from = total > 0 ? (acc / total) * 100 : 0;
    acc += v;
    const to = total > 0 ? (acc / total) * 100 : 0;
    return { color: colorFor(s.key, i), from, to };
  });
  const gradient = total > 0 ? `conic-gradient(${stops.map((s) => `${s.color} ${s.from}% ${s.to}%`).join(", ")})` : "var(--grey-100)";
  const lead = sorted[0];
  const leadPct = lead && total > 0 ? Math.round(((metric === "count" ? lead.count : lead.value) / total) * 100) : 0;

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 0, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 0 }}>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {metric === "count" ? `${total.toLocaleString("fr-FR")} ventes` : `$${Math.round(total).toLocaleString("fr-FR")}`}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 104, height: 104, flex: "none", borderRadius: 999, background: gradient }}>
          <div style={{ position: "absolute", inset: 23, borderRadius: 999, background: "var(--white)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--text-strong)" }}>{leadPct}%</span>
            <span style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>{lead?.key ?? "—"}</span>
          </div>
        </div>
        <div style={{ flex: "1 1 130px", minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          {sorted.map((s, i) => {
            const v = metric === "count" ? s.count : s.value;
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <div key={s.key} style={{ display: "grid", gridTemplateColumns: "9px minmax(0, 1fr) auto auto", gap: 8, alignItems: "baseline" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: colorFor(s.key, i) }} />
                <span style={{ fontSize: 12, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{TCG_LABEL[s.key] ?? s.key}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{metric === "count" ? s.count : `$${Math.round(s.value)}`}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// "Analyse en Volume/Valeur" + 2 donuts de l'écran Transactions CardQuant
// (cf. mémoire projet "cardquant-rebrand") -- répartition par jeu et par
// langue sur 30j, réel (lib/queries/transactionsOverview.ts::getSalesBreakdown).
export function BreakdownDonuts({ byTcg, byLanguage }: { byTcg: BreakdownSlice[]; byLanguage: BreakdownSlice[] }) {
  const [metric, setMetric] = useState<Metric>("count");

  return (
    <>
      <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Analyse en</span>
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
          {(["count", "value"] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              style={{
                appearance: "none", border: 0, font: "inherit", display: "flex", alignItems: "baseline", gap: 8, padding: "6px 16px",
                borderRadius: 999, background: metric === m ? "var(--ink-000)" : "transparent", color: metric === m ? "var(--white)" : "var(--text-body)",
                fontSize: 11.5, whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {m === "count" ? "Volume" : "Valeur"}
            </button>
          ))}
        </div>
      </div>
      <Donut title="Répartition par jeu · 30j" slices={byTcg} metric={metric} colorFor={(k) => TCG_COLOR[k] ?? "var(--grey-300)"} />
      <Donut title="Répartition par langue · 30j" slices={byLanguage} metric={metric} colorFor={(_k, i) => PALETTE[i % PALETTE.length]} />
    </>
  );
}
