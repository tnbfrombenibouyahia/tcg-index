import type { TopSetRow } from "@/lib/queries/transactionsOverview";

const TCG_COLOR: Record<string, string> = { pokemon: "var(--text-strong)", "one-piece": "var(--up-400)" };

// "Top 10 sets échangés" de l'écran Transactions CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- lib/queries/transactionsOverview.ts::getTopSetsBySales,
// réel, 30j vs 30j précédents pour l'évolution. Classé par volume (nombre de
// ventes) en dur, indépendamment du bascule Volume/Valeur des donuts
// (BreakdownDonuts.tsx) : reclasser ce top 10 par valeur exigerait une
// deuxième requête (le top 10 par valeur n'est pas forcément le même
// ensemble de sets) -- les deux colonnes valeur/volume restent visibles
// dans tous les cas, seul le classement ne suit pas le bascule.
export function TopSetsPanel({ rows }: { rows: TopSetRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section style={{ gridColumn: "span 2", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, minHeight: 0, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 110 }}>
          Top 10 sets échangés · volume
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: TCG_COLOR.pokemon }} />PKM
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: TCG_COLOR["one-piece"] }} />OP
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "20px minmax(90px, 1.4fr) 34px minmax(60px, 2fr) 44px 52px 48px", gap: "4px 10px", alignItems: "center", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5 }}>
        <span>#</span>
        <span>Set</span>
        <span>Année</span>
        <span />
        <span style={{ textAlign: "right" }}>Ventes</span>
        <span style={{ textAlign: "right" }}>Valeur</span>
        <span style={{ textAlign: "right" }}>30j</span>
      </div>
      {rows.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Pas assez de ventes récentes.</span>
      ) : (
        rows.map((s, i) => (
          <div key={`${s.tcg}-${s.setCode}`} style={{ display: "grid", gridTemplateColumns: "20px minmax(90px, 1.4fr) 34px minmax(60px, 2fr) 44px 52px 48px", gap: 10, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{i + 1}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.setCode}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{s.releaseYear ?? "—"}</span>
            <span style={{ display: "block", height: 7, borderRadius: 2, background: "var(--border-hairline)", minWidth: 0 }}>
              <span style={{ display: "block", height: 7, borderRadius: 2, background: TCG_COLOR[s.tcg] ?? "var(--grey-300)", width: `${(s.count / max) * 100}%` }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-strong)", textAlign: "right" }}>{s.count}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>${Math.round(s.value)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textAlign: "right", color: s.changePct == null ? "var(--text-muted)" : s.changePct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
              {s.changePct != null ? `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(0)}%` : "—"}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
