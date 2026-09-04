import Link from "next/link";
import type { LanguageArbitrageRow } from "@/lib/queries/languageArbitrage";

// "Arbitrage inter-langues" de l'écran Sous-évalué CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- lib/queries/languageArbitrage.ts, réel
// (nouvelle requête -- compareLanguage.ts ne résolvait qu'une carte à la
// fois, cf. son commentaire). Lien vers la fiche EN par défaut.
export function LanguageArbitragePanel({ rows }: { rows: LanguageArbitrageRow[] }) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Arbitrage inter-langues</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>même carte EN vs JP, écart affiché au-delà de 15%</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 58px 58px 52px 78px", gap: 8, alignItems: "center", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5 }}>
        <span>Carte</span>
        <span style={{ textAlign: "right" }}>EN</span>
        <span style={{ textAlign: "right" }}>JP</span>
        <span style={{ textAlign: "right" }}>Écart</span>
        <span style={{ textAlign: "right" }}>Sens</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Aucun écart EN/JP notable détecté en ce moment.</span>
        ) : (
          rows.map((r) => (
            <Link
              key={`${r.enItemId}-${r.jpItemId}`}
              href={`/catalog/${r.enItemId}`}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 58px 58px 52px 78px", gap: 8, alignItems: "center", color: "inherit" }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.enSetCode ?? "—"}</span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>${r.enPrice.toFixed(2)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>${r.jpPrice.toFixed(2)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: r.gapPct >= 0 ? "var(--down-500)" : "var(--up-600)", textAlign: "right", whiteSpace: "nowrap" }}>
                {r.gapPct >= 0 ? "+" : ""}
                {r.gapPct.toFixed(0)}%
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{r.gapPct >= 0 ? "JP plus cher" : "EN plus cher"}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
