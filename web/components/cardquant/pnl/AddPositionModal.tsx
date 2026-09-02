"use client";

import { useEffect, useState } from "react";
import type { ItemSummary } from "@/lib/types";
import { GRADES, GRADE_LABELS } from "@/lib/constants";
import { addPosition } from "@/lib/portfolioApi";
import { Button } from "../core/Button";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)",
  font: "inherit", fontSize: 13, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" };

// "Ajouter une transaction" de l'écran PnL CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- POST réel vers pricing_api::/portfolio (cf.
// lib/portfolioApi.ts). Recherche de carte via /api/items/search (déjà
// existant, réutilisé tel quel). Champs natifs (select/date/number) plutôt
// que les composants décoratifs du design system : un vrai formulaire de
// saisie profite plus de la sémantique/clavier natifs que du style Slabline.
export function AddPositionModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [selected, setSelected] = useState<ItemSummary | null>(null);
  const [grade, setGrade] = useState<string>("ungraded");
  const [quantity, setQuantity] = useState(1);
  const [buyPrice, setBuyPrice] = useState("");
  const [buyCurrency, setBuyCurrency] = useState("EUR");
  const [buyDate, setBuyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2 || selected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/items/search?q=${encodeURIComponent(trimmed)}&limit=8`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data) => setResults(data.items ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, selected]);

  async function submit() {
    if (!selected) return setError("Choisis une carte dans les résultats de recherche.");
    const price = Number(buyPrice);
    if (!Number.isFinite(price) || price <= 0) return setError("Prix d'achat invalide.");
    setSubmitting(true);
    setError(null);
    const res = await addPosition({ itemId: selected.id, grade, quantity, buyPrice: price, buyCurrency, buyDate, note: note || undefined });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.reason === "auth" ? "Session expirée, reconnecte-toi." : res.message ?? "Erreur réseau.");
      return;
    }
    onAdded();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91,
          width: "min(440px, 92vw)", maxHeight: "90vh", overflowY: "auto",
          background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 14, boxShadow: "var(--shadow-pop)",
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>Ajouter une transaction</span>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Carte</span>
          {selected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-strong)" }}>{selected.name}</span>
              <button type="button" onClick={() => { setSelected(null); setQuery(""); }} style={{ appearance: "none", border: 0, background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>
                changer
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou numéro de carte…" style={inputStyle} />
              {results.length > 0 ? (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 8, boxShadow: "var(--shadow-pop)", maxHeight: 200, overflowY: "auto" }}>
                  {results.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => { setSelected(it); setResults([]); }}
                      style={{ display: "block", width: "100%", textAlign: "left", appearance: "none", border: 0, background: "transparent", padding: "8px 12px", fontSize: 12.5, color: "var(--text-strong)", cursor: "pointer" }}
                    >
                      {it.name} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>· {it.setCode ?? "—"} · {it.language}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Grade</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle}>
              {GRADES.map((g) => (
                <option key={g} value={g}>{GRADE_LABELS[g]}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Quantité</span>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Prix d&apos;achat (par carte)</span>
            <input type="number" min={0} step="0.01" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Devise</span>
            <select value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value)} style={inputStyle}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={labelStyle}>Date d&apos;achat</span>
            <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={labelStyle}>Note (optionnel)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. achetée en lot avec..." style={inputStyle} />
          </div>
        </div>

        {error ? <span style={{ fontSize: 12, color: "var(--down-500)" }}>{error}</span> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>{submitting ? "Ajout…" : "Ajouter"}</Button>
        </div>
      </div>
    </>
  );
}
