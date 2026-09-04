"use client";

import { useState } from "react";
import type { PortfolioPosition } from "@/lib/portfolioApi";
import { closePosition } from "@/lib/portfolioApi";
import { Button } from "../core/Button";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)",
  font: "inherit", fontSize: 13, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" };

// "Vendre" (clôturer une position) de l'écran PnL CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- PATCH réel vers pricing_api::/portfolio/{id}.
export function ClosePositionModal({ position, onClose, onClosed }: { position: PortfolioPosition; onClose: () => void; onClosed: () => void }) {
  const [sellPrice, setSellPrice] = useState("");
  const [sellCurrency, setSellCurrency] = useState(position.buyCurrency);
  const [sellDate, setSellDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const price = Number(sellPrice);
    if (!Number.isFinite(price) || price <= 0) return setError("Prix de vente invalide.");
    setSubmitting(true);
    setError(null);
    const res = await closePosition(position.id, { sellPrice: price, sellCurrency, sellDate });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.reason === "auth" ? "Session expirée, reconnecte-toi." : res.message ?? "Erreur réseau.");
      return;
    }
    onClosed();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91,
          width: "min(380px, 92vw)", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 14, boxShadow: "var(--shadow-pop)",
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>Vendre — {position.name}</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Prix de vente (par carte)</span>
            <input type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Devise</span>
            <select value={sellCurrency} onChange={(e) => setSellCurrency(e.target.value)} style={inputStyle}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={labelStyle}>Date de vente</span>
            <input type="date" value={sellDate} onChange={(e) => setSellDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {error ? <span style={{ fontSize: 12, color: "var(--down-500)" }}>{error}</span> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>{submitting ? "Enregistrement…" : "Confirmer la vente"}</Button>
        </div>
      </div>
    </>
  );
}
