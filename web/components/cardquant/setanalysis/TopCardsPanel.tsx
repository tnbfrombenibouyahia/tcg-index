"use client";

import { useMemo, useState } from "react";
import type { SetTopCardRow } from "@/lib/queries/setAnalysis";

type SortBy = "volume" | "price";

// "Cartes du set · classement" de l'écran Analyse set CardQuant (cf.
// mémoire projet "cardquant-rebrand") -- tri Volume/Prix géré côté client
// (les deux tris re-classent le même jeu de lignes déjà chargé, pas besoin
// d'un aller-retour serveur). Fenêtre fixe 30j (le bascule 30j/90j du
// mockup a été laissé de côté pour ce premier passage).
export function TopCardsPanel({ rows, totalCount }: { rows: SetTopCardRow[]; totalCount: number }) {
  const [sortBy, setSortBy] = useState<SortBy>("volume");

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortBy === "price") copy.sort((a, b) => (b.psa10Price ?? b.rawPrice ?? 0) - (a.psa10Price ?? a.rawPrice ?? 0));
    else copy.sort((a, b) => b.volume - a.volume);
    return copy;
  }, [rows, sortBy]);

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 110 }}>Cartes du set · classement</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{totalCount} cartes · 30j</span>
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
          {(["volume", "price"] as SortBy[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              style={{ appearance: "none", border: 0, font: "inherit", padding: "4px 11px", borderRadius: 999, background: sortBy === s ? "var(--ink-000)" : "transparent", color: sortBy === s ? "var(--white)" : "var(--text-body)", fontSize: 11, cursor: "pointer" }}
            >
              {s === "volume" ? "Ventes" : "PSA 10"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--white)", display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 56px 60px 60px 44px", gap: 6, alignItems: "center", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5, marginBottom: 2 }}>
          <span>#</span>
          <span>Carte</span>
          <span style={{ textAlign: "right" }}>Ventes</span>
          <span style={{ textAlign: "right" }}>PSA 10</span>
          <span style={{ textAlign: "right" }}>Brut</span>
          <span style={{ textAlign: "right" }}>Var.</span>
        </div>
        {sorted.map((c, i) => (
          <div key={c.itemId} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 56px 60px 60px 44px", gap: 6, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{i + 1}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-strong)", textAlign: "right" }}>{c.volume}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-strong)", textAlign: "right" }}>{c.psa10Price != null ? `$${c.psa10Price.toFixed(0)}` : "—"}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>{c.rawPrice != null ? `$${c.rawPrice.toFixed(2)}` : "—"}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textAlign: "right", color: c.psa10ChangePct == null ? "var(--text-muted)" : c.psa10ChangePct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
              {c.psa10ChangePct != null ? `${c.psa10ChangePct >= 0 ? "+" : ""}${c.psa10ChangePct.toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
