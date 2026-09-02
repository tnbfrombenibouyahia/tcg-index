"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { fetchFavorites, removeFavorite, type WatchedCard } from "@/lib/watchlistApi";
import { Button } from "../core/Button";
import { WatchlistKpiRow } from "./WatchlistKpiRow";
import { WatchlistTable } from "./WatchlistTable";
import { AddWatchModal } from "./AddWatchModal";

// Corps de l'écran Watchlist CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- même architecture que PnlApp.tsx : entièrement
// client, données personnelles via pricing_api (jamais via web/, lecture
// seule sur Postgres, cf. lib/db.ts).
export function WatchlistApp() {
  const { user, loading } = useAuth();
  const [cards, setCards] = useState<WatchedCard[] | null>(null);
  const [limit, setLimit] = useState(3);
  const [isPremium, setIsPremium] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetchFavorites();
    if (!res.ok) {
      setError(res.reason === "auth" ? "Connecte-toi pour voir ta watchlist." : res.message ?? "Erreur réseau.");
      setCards([]);
      return;
    }
    setError(null);
    setCards(res.data.favorites);
    setLimit(res.data.limit);
    setIsPremium(res.data.isPremium);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    // setTimeout : même contournement react-hooks/set-state-in-effect que
    // components/cardquant/pnl/PnlApp.tsx (cf. son commentaire).
    const id = setTimeout(() => void reload(), 0);
    return () => clearTimeout(id);
  }, [loading, user, reload]);

  async function handleRemove(itemId: number) {
    const res = await removeFavorite(itemId);
    if (res.ok) void reload();
  }

  if (loading) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Chargement…</span>;

  if (!user) {
    return (
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
        <span style={{ fontSize: 15, color: "var(--text-strong)" }}>Connecte-toi pour voir ta watchlist.</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>La liste de cartes suivies est personnelle.</span>
      </section>
    );
  }

  const rows = cards ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <WatchlistKpiRow cards={rows} limit={limit} isPremium={isPremium} />
      {error ? <span style={{ fontSize: 12, color: "var(--down-500)" }}>{error}</span> : null}
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 160, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Ma watchlist · {rows.length} carte{rows.length !== 1 ? "s" : ""}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>Ajouter une carte</Button>
      </section>
      <WatchlistTable cards={rows} onRemove={handleRemove} />
      {showAdd ? <AddWatchModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); void reload(); }} /> : null}
    </div>
  );
}
