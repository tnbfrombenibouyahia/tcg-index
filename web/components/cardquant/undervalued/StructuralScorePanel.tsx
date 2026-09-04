"use client";

import { useState } from "react";
import Link from "next/link";
import type { UndervaluedRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

const TCG_LABEL: Record<Tcg, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };

// "Score structurel · singles" de l'écran Sous-évalué CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- lib/queries/undervalued.ts::getUndervalued,
// déjà en prod sur /undervalued, réel. Les deux jeux de lignes (Pokémon/One
// Piece) sont pré-chargés côté serveur ; le bascule ne fait que switcher
// entre deux tableaux déjà en mémoire, pas de requête client.
export function StructuralScorePanel({ byTcg }: { byTcg: Record<Tcg, UndervaluedRow[]> }) {
  const [tcg, setTcg] = useState<Tcg>("pokemon");
  const rows = byTcg[tcg] ?? [];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Score structurel · singles</span>
          <div style={{ flex: "none", display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
            {(["pokemon", "one-piece"] as Tcg[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTcg(t)}
                style={{ appearance: "none", border: 0, font: "inherit", padding: "4px 11px", borderRadius: 999, background: tcg === t ? "var(--ink-000)" : "transparent", color: tcg === t ? "var(--white)" : "var(--text-body)", fontSize: 10.5, whiteSpace: "nowrap", cursor: "pointer" }}
              >
                {TCG_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>coût du pull × multiplicateur, vs marché</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "18px 28px minmax(0, 1fr) 62px 56px", gap: 8, alignItems: "center", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5 }}>
        <span>#</span>
        <span />
        <span>Carte</span>
        <span style={{ textAlign: "right" }}>Marché</span>
        <span style={{ textAlign: "right" }}>Écart</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Pas de score disponible pour ce jeu.</span>
        ) : (
          rows.map((r, i) => {
            const gapPct = ((r.marketPrice - r.theoreticalValue) / r.theoreticalValue) * 100;
            return (
              <Link
                key={r.itemId}
                href={`/catalog/${r.itemId}`}
                style={{ display: "grid", gridTemplateColumns: "18px 28px minmax(0, 1fr) 62px 56px", gap: 8, alignItems: "center", borderRadius: 6, padding: "4px 4px", color: "inherit" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{i + 1}</span>
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" style={{ width: 26, height: 36, borderRadius: 4, objectFit: "cover", border: "1px solid var(--border-hairline)" }} />
                ) : (
                  <span style={{ display: "block", width: 26, height: 36, borderRadius: 4, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }} />
                )}
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.setCode ?? "—"} · {r.language} · théorique ${r.theoreticalValue.toFixed(2)}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>${r.marketPrice.toFixed(2)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: gapPct <= 0 ? "var(--up-600)" : "var(--down-500)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {gapPct >= 0 ? "+" : ""}
                  {gapPct.toFixed(0)}%
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
