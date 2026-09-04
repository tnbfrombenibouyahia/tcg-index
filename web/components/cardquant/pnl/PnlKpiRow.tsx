import type { PortfolioPosition } from "@/lib/portfolioApi";

// 4 KPI de l'écran PnL CardQuant (cf. mémoire projet "cardquant-rebrand") --
// calculés sur les positions réelles de l'utilisateur, pas d'exemple.
export function PnlKpiRow({ positions }: { positions: PortfolioPosition[] }) {
  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");
  const realizedPnls = closed.map((p) => (p.sellPrice! - p.buyPrice) * p.quantity);
  const bestRealized = realizedPnls.length ? Math.max(...realizedPnls) : null;
  const worstRealized = realizedPnls.length ? Math.min(...realizedPnls) : null;

  const kpis = [
    { k: "Positions ouvertes", v: String(open.length), note: `${open.reduce((s, p) => s + p.quantity, 0)} cartes`, color: "var(--text-strong)" },
    { k: "Positions closes", v: String(closed.length), note: "ventes déclarées", color: "var(--text-strong)" },
    { k: "Meilleure vente", v: bestRealized != null ? `+€${bestRealized.toFixed(2)}` : "—", note: "P/V réalisé", color: bestRealized != null && bestRealized >= 0 ? "var(--up-600)" : "var(--text-muted)" },
    { k: "Pire vente", v: worstRealized != null ? `${worstRealized >= 0 ? "+" : ""}€${worstRealized.toFixed(2)}` : "—", note: "P/V réalisé", color: worstRealized != null && worstRealized < 0 ? "var(--down-500)" : "var(--text-muted)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      {kpis.map((k) => (
        <div key={k.k} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "10px 14px", borderRadius: 12, background: "var(--white)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", minWidth: 0 }}>
          <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.k}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 300, lineHeight: 1.1, color: k.color, whiteSpace: "nowrap" }}>{k.v}</span>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.note}</span>
        </div>
      ))}
    </div>
  );
}
