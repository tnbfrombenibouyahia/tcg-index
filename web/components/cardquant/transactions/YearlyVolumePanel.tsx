import type { YearlyVolume } from "@/lib/queries/transactionsOverview";

const TCG_COLOR: Record<string, string> = { pokemon: "var(--text-strong)", "one-piece": "var(--up-400)" };

// "Ventes par année de sortie" de l'écran Transactions CardQuant (cf.
// mémoire projet "cardquant-rebrand") -- lib/queries/transactionsOverview.ts
// ::getSalesByReleaseYear, réel, toute la profondeur d'historique
// disponible (année de sortie du set vendu, pas année de la vente elle-même).
export function YearlyVolumePanel({ rows }: { rows: YearlyVolume[] }) {
  const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section style={{ gridColumn: "span 2", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 110 }}>Ventes par année de sortie du set</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: TCG_COLOR.pokemon }} />PKM
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: TCG_COLOR["one-piece"] }} />OP
        </span>
      </div>
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6 }}>
        {years.map((year) => {
          const pkm = rows.find((r) => r.year === year && r.tcg === "pokemon");
          const op = rows.find((r) => r.year === year && r.tcg === "one-piece");
          const total = (pkm?.count ?? 0) + (op?.count ?? 0);
          return (
            <div key={year} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) 48px", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-strong)" }}>{year}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ height: 6, borderRadius: 2, background: TCG_COLOR.pokemon, width: `${((pkm?.count ?? 0) / max) * 100}%` }} />
                <span style={{ height: 6, borderRadius: 2, background: TCG_COLOR["one-piece"], width: `${((op?.count ?? 0) / max) * 100}%` }} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>{total}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
