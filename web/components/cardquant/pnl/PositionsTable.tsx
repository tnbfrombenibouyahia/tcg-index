import type { PortfolioPosition } from "@/lib/portfolioApi";
import { Button } from "../core/Button";

const GRADE_LABEL: Record<string, string> = { ungraded: "Brut", psa7: "PSA 7", psa8: "PSA 8", psa9: "PSA 9", "psa9.5": "PSA 9.5", psa10: "PSA 10" };

function money(v: number, currency: string): string {
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${v.toFixed(2)}`;
}

// Table "Transactions" de l'écran PnL CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- réelle, positions de l'utilisateur via
// lib/portfolioApi.ts. Pas de sparkline (le mockup en montrait une par
// ligne) : demanderait un historique de prix par carte en plus du prix
// courant déjà chargé -- multiplierait les appels réseau pour un ornement,
// laissé de côté pour ce premier passage.
export function PositionsTable({
  positions,
  onOpenCard,
  onClose,
  onReopen,
  onDelete,
}: {
  positions: PortfolioPosition[];
  onOpenCard: (p: PortfolioPosition) => void;
  onClose: (p: PortfolioPosition) => void;
  onReopen: (p: PortfolioPosition) => void;
  onDelete: (p: PortfolioPosition) => void;
}) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", minWidth: 140, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Transactions</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>frais annexes non inclus</span>
      </div>
      {positions.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>Aucune transaction enregistrée. Ajoute ta première carte pour commencer.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 68px 68px minmax(0, 0.9fr) 92px 100px", gap: 8, alignItems: "center", padding: "0 2px 7px", borderBottom: "1px solid var(--border-hairline)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            <span>Carte</span>
            <span style={{ textAlign: "right" }}>Coût</span>
            <span style={{ textAlign: "right" }}>Actuel</span>
            <span style={{ textAlign: "right" }}>P/V</span>
            <span>Statut</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 420, overflowY: "auto" }}>
            {positions.map((p) => {
              const cost = p.buyPrice * p.quantity;
              const currentTotal = p.currentPrice != null ? p.currentPrice * p.quantity : null;
              const realized = p.status === "closed" ? (p.sellPrice! - p.buyPrice) * p.quantity : null;
              const unrealized = p.status === "open" && currentTotal != null ? currentTotal - cost : null;
              const pnl = realized ?? unrealized;
              const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
              const pnlColor = pnl == null ? "var(--text-muted)" : pnl >= 0 ? "var(--up-600)" : "var(--down-500)";

              return (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 68px 68px minmax(0, 0.9fr) 92px 100px", gap: 8, alignItems: "center", padding: "8px 2px", borderBottom: "1px solid var(--border-hairline)" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.quantity}× {GRADE_LABEL[p.grade] ?? p.grade} · {p.setCode ?? "—"} · {p.buyDate}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{money(cost, p.buyCurrency)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>
                    {currentTotal != null ? money(currentTotal, p.currentCurrency ?? p.buyCurrency) : "—"}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: pnlColor, whiteSpace: "nowrap" }}>{pnl != null ? `${pnl >= 0 ? "+" : ""}${money(pnl, p.buyCurrency)}` : "—"}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: pnlColor, whiteSpace: "nowrap" }}>{pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : ""}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: p.status === "open" ? "var(--up-600)" : "var(--text-muted)", flex: "none" }} />
                    {p.status === "open" ? "En cours" : "Clôturée"}
                  </span>
                  <span style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    {p.status === "open" ? (
                      <Button variant="ghost" size="sm" onClick={() => onClose(p)}>Vendre</Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => onReopen(p)}>Rouvrir</Button>
                    )}
                  </span>
                  <span style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 6, marginTop: -2 }}>
                    <button type="button" onClick={() => onOpenCard(p)} style={{ appearance: "none", border: "1px solid var(--border-hairline)", borderRadius: 999, background: "transparent", color: "var(--text-body)", fontSize: 10.5, padding: "3px 10px", cursor: "pointer" }}>
                      Carte P/V
                    </button>
                    <button type="button" onClick={() => onDelete(p)} style={{ appearance: "none", border: "1px solid var(--border-hairline)", borderRadius: 999, background: "transparent", color: "var(--down-500)", fontSize: 10.5, padding: "3px 10px", cursor: "pointer" }}>
                      Supprimer
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
