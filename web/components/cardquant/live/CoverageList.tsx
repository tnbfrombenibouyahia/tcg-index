import type { DataCoverageRow } from "@/lib/types";

const TCG_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };
const CATEGORY_LABEL: Record<string, string> = { sealed: "Scellé", single: "Cartes" };

// "Couverture du catalogue" de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- lib/queries/dataCoverage.ts::getDataCoverage,
// agrégé par (tcg, catégorie) toutes langues confondues pour tenir dans une
// liste compacte (le détail par langue reste sur /live, pas dupliqué ici).
// "Précision" = trackedWithPrice/trackedItems, même définition que
// DataCoverageSection (l'ancien composant) -- pas totalItems, pour ne pas
// noyer un vrai 91-100% de précision sous le choix de scope délibéré
// (cf. son commentaire).
export function CoverageList({ rows }: { rows: DataCoverageRow[] }) {
  const grouped = new Map<string, { tcg: string; category: string; cards: number; trackedItems: number; trackedWithPrice: number }>();
  for (const r of rows) {
    const key = `${r.tcg}-${r.category}`;
    const acc = grouped.get(key) ?? { tcg: r.tcg, category: r.category, cards: 0, trackedItems: 0, trackedWithPrice: 0 };
    acc.cards += r.totalItems;
    acc.trackedItems += r.trackedItems;
    acc.trackedWithPrice += r.trackedWithPrice;
    grouped.set(key, acc);
  }
  const items = Array.from(grouped.values()).sort((a, b) => a.tcg.localeCompare(b.tcg) || a.category.localeCompare(b.category));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: "1 1 auto" }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Couverture du catalogue</span>
      {items.map((c) => {
        const pct = c.trackedItems > 0 ? Math.round((c.trackedWithPrice / c.trackedItems) * 100) : 0;
        return (
          <div key={`${c.tcg}-${c.category}`} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-strong)" }}>
              {TCG_LABEL[c.tcg] ?? c.tcg} · {CATEGORY_LABEL[c.category] ?? c.category}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-muted)" }}>{c.cards.toLocaleString("fr-FR")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)", width: 44, textAlign: "right" }}>{pct}%</span>
          </div>
        );
      })}
    </section>
  );
}
