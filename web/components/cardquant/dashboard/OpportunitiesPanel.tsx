import type { DivergenceRow } from "@/lib/types";
import { DataTable, type DataTableColumn } from "../data/DataTable";

// "Opportunités du jour" du Dashboard CardQuant (cf. mémoire projet
// "cardquant-rebrand") : réutilise lib/queries/divergence.ts::getDivergence
// tel quel (aucune nouvelle requête -- l'écart prix/volume EST déjà la bonne
// notion ici), filtré aux écarts >= 8% comme l'annonce le sous-titre.
// Server Component pur -- tri statique par écart déjà fait côté page.tsx
// (sort: "divergence_desc"), pas de tri interactif dans ce premier passage
// (le prototype n'en avait pas non plus : `sort-key="ecart"` n'y est qu'un
// indicateur visuel, sans on-sort branché).

// Index signature requise pour satisfaire la contrainte générique de
// DataTable<T extends Record<string, ReactNode>> -- sans elle, TypeScript
// n'infère pas T = OpportunityCell (une interface sans index signature ne
// "structural-match" pas Record<string, ReactNode>, même si chaque champ pris
// individuellement y est assignable).
interface OpportunityCell {
  [key: string]: React.ReactNode;
  name: string;
  setCode: string;
  price: string;
  priceDelta: React.ReactNode;
  volumeDelta: React.ReactNode;
}

function formatDelta(value: number): React.ReactNode {
  const up = value >= 0;
  return (
    <span style={{ color: up ? "var(--up-600)" : "var(--down-500)" }}>
      {up ? "+" : ""}
      {value.toFixed(1).replace(".", ",")}%
    </span>
  );
}

const COLUMNS: DataTableColumn<OpportunityCell>[] = [
  { key: "name", label: "Carte" },
  { key: "setCode", label: "Set", mono: true },
  { key: "price", label: "Prix", mono: true, align: "right" },
  { key: "priceDelta", label: "Écart prix", mono: true, align: "right" },
  { key: "volumeDelta", label: "Écart volume", mono: true, align: "right" },
];

export function OpportunitiesPanel({ rows }: { rows: DivergenceRow[] }) {
  const cells: OpportunityCell[] = rows.map((r) => ({
    name: r.name,
    setCode: r.setCode ?? "—",
    price: r.priceCurrent.toFixed(2),
    priceDelta: formatDelta(r.priceChangePct),
    volumeDelta: formatDelta(r.volumeChangePct),
  }));

  return (
    <section style={{ flex: "0 0 auto", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 0 0", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Opportunités du jour
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Écart ≥ 8% · 30j vs 30j précédents</span>
      </div>
      {cells.length === 0 ? (
        <div style={{ padding: "20px 14px 24px", fontSize: 12, color: "var(--text-muted)" }}>Aucun écart notable détecté sur cette fenêtre.</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: 700 }}>
            <DataTable columns={COLUMNS} rows={cells} dense sortKey="priceDelta" />
          </div>
        </div>
      )}
    </section>
  );
}
