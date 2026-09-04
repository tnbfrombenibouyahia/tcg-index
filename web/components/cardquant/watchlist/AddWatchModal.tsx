"use client";

import { useEffect, useState } from "react";
import type { ItemSummary } from "@/lib/types";
import { addFavorite } from "@/lib/watchlistApi";
import { Button } from "../core/Button";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 999,
  border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)",
  font: "inherit", fontSize: 13, outline: "none",
};

// "Ajouter une carte" de l'écran Watchlist CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- recherche via /api/items/search (existant),
// ajout réel via POST pricing_api::/favorites (cf. lib/watchlistApi.ts).
export function AddWatchModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/items/search?q=${encodeURIComponent(trimmed)}&limit=10`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data) => setResults(data.items ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  async function pick(item: ItemSummary) {
    setAdding(item.id);
    setError(null);
    const res = await addFavorite(item.id);
    setAdding(null);
    if (!res.ok) {
      setError(res.reason === "auth" ? "Session expirée, reconnecte-toi." : res.reason === "limit" ? res.message ?? "Limite de favoris atteinte." : res.message ?? "Erreur réseau.");
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
          width: "min(420px, 92vw)", maxHeight: "80vh", overflowY: "auto",
          background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 14, boxShadow: "var(--shadow-pop)",
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>Ajouter une carte à la watchlist</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou numéro de carte…" style={inputStyle} autoFocus />
        {error ? <span style={{ fontSize: 12, color: "var(--down-500)" }}>{error}</span> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {results.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => pick(it)}
              disabled={adding === it.id}
              style={{ display: "flex", alignItems: "baseline", gap: 8, appearance: "none", border: 0, background: "transparent", padding: "8px 4px", fontSize: 12.5, color: "var(--text-strong)", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{it.setCode ?? "—"} · {it.language}</span>
              <span style={{ fontSize: 11, color: "var(--green-600)" }}>{adding === it.id ? "…" : "Ajouter"}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </>
  );
}
