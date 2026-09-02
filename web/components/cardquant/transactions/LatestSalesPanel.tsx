import type { SaleRow } from "@/lib/types";
import { GRADE_LABELS } from "@/lib/constants";
import { DataTable, type DataTableColumn } from "../data/DataTable";

interface SaleCell {
  [key: string]: React.ReactNode;
  card: string;
  price: string;
  grade: string;
  marketplace: string;
  when: string;
}

const COLUMNS: DataTableColumn<SaleCell>[] = [
  { key: "card", label: "Carte" },
  { key: "grade", label: "Grade" },
  { key: "marketplace", label: "Marché" },
  { key: "price", label: "Prix", mono: true, align: "right", strong: true },
  { key: "when", label: "Quand", mono: true, align: "right" },
];

const MARKET_LABEL: Record<string, string> = { ebay: "eBay", tcgplayer: "TCGplayer" };

function formatWhen(saleDate: string): string {
  const d = new Date(saleDate);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days}j`;
}

// "Dernières ventes" de l'écran Transactions CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- lib/queries/sales.ts::getSales, réel, mêmes lignes
// que /transactions (ancien design). sale_date n'a pas d'heure (colonne
// DATE, cf. db/schema.sql) : "Quand" reste en jours, pas en heures/minutes
// comme une vraie tape temps réel l'afficherait.
export function LatestSalesPanel({ sales }: { sales: SaleRow[] }) {
  const cells: SaleCell[] = sales.map((s) => ({
    card: s.item.name,
    grade: GRADE_LABELS[s.grade] ?? s.grade,
    marketplace: MARKET_LABEL[s.marketplace] ?? s.marketplace,
    price: `$${s.price.toFixed(2)}`,
    when: formatWhen(s.saleDate),
  }));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 0 0", minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 120 }}>Dernières ventes</span>
      </div>
      {cells.length === 0 ? (
        <div style={{ padding: "0 14px 20px", fontSize: 12, color: "var(--text-muted)" }}>Aucune vente récente.</div>
      ) : (
        <div style={{ flex: "1 1 0", minHeight: 0, overflow: "auto" }}>
          <div style={{ minWidth: 460, width: "100%" }}>
            <DataTable columns={COLUMNS} rows={cells} dense />
          </div>
        </div>
      )}
    </section>
  );
}
