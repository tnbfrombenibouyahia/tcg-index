"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { fetchPositions, deletePosition, reopenPosition, type PortfolioPosition } from "@/lib/portfolioApi";
import { Button } from "../core/Button";
import { PnlHeader } from "./PnlHeader";
import { PnlKpiRow } from "./PnlKpiRow";
import { PositionsTable } from "./PositionsTable";
import { AddPositionModal } from "./AddPositionModal";
import { ClosePositionModal } from "./ClosePositionModal";
import { PnlCardShare } from "./PnlCardShare";

// Corps de l'écran PnL CardQuant (cf. mémoire projet "cardquant-rebrand") --
// entièrement piloté côté client : identité (useAuth, Firebase) + données
// (pricing_api::/portfolio, cf. lib/portfolioApi.ts). web/ n'a aucun accès
// serveur à ces données personnelles (lecture seule sur Postgres, cf.
// lib/db.ts) -- contrairement à tous les autres écrans du redesign, celui-ci
// n'a pas de page.tsx qui pré-charge quoi que ce soit.
//
// Somme des montants en dur en EUR (cf. PnlHeader.tsx) : une position peut
// être en USD (buy_currency), mais additionner des devises différentes sans
// conversion réelle serait faux -- accepté comme simplification tant que la
// conversion de devise (déjà signalée non branchée ailleurs, cf.
// TopNav.tsx) n'existe pas.
export function PnlApp() {
  const { user, loading } = useAuth();
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState<PortfolioPosition | null>(null);
  const [sharing, setSharing] = useState<PortfolioPosition | null>(null);

  const reload = useCallback(async () => {
    const res = await fetchPositions();
    if (!res.ok) {
      setError(res.reason === "auth" ? "Connecte-toi pour voir ton portefeuille." : res.message ?? "Erreur réseau.");
      setPositions([]);
      return;
    }
    setError(null);
    setPositions(res.data);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    // setTimeout (pas un appel direct) : même contournement que
    // components/cardquant/live/LiveBody.tsx pour react-hooks/set-state-in-effect
    // -- reload() met à jour l'état de façon asynchrone (après un fetch),
    // mais la règle ne le voit que si l'appel initial n'est pas synchrone
    // dans le corps de l'effet lui-même.
    const id = setTimeout(() => void reload(), 0);
    return () => clearTimeout(id);
  }, [loading, user, reload]);

  async function handleDelete(p: PortfolioPosition) {
    const res = await deletePosition(p.id);
    if (res.ok) void reload();
  }

  async function handleReopen(p: PortfolioPosition) {
    const res = await reopenPosition(p.id);
    if (res.ok) void reload();
  }

  if (loading) {
    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Chargement…</span>;
  }

  if (!user) {
    return (
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
        <span style={{ fontSize: 15, color: "var(--text-strong)" }}>Connecte-toi pour voir ton portefeuille.</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Le PnL est personnel — visible seulement une fois connecté.</span>
      </section>
    );
  }

  const rows = positions ?? [];
  const open = rows.filter((p) => p.status === "open");
  const closed = rows.filter((p) => p.status === "closed");
  const totalCost = open.reduce((s, p) => s + p.buyPrice * p.quantity, 0);
  const totalValue = open.reduce((s, p) => s + (p.currentPrice ?? p.buyPrice) * p.quantity, 0);
  const realizedPnl = closed.reduce((s, p) => s + (p.sellPrice! - p.buyPrice) * p.quantity, 0);
  const unrealizedPnl = totalValue - totalCost;
  const totalPnl = realizedPnl + unrealizedPnl;
  const totalPnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PnlHeader user={user} totalValue={totalValue} totalCost={totalCost} totalPnl={totalPnl} totalPnlPct={totalPnlPct} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="accent" onClick={() => setShowAdd(true)}>Ajouter une transaction</Button>
      </div>
      <PnlKpiRow positions={rows} />
      {error ? <span style={{ fontSize: 12, color: "var(--down-500)" }}>{error}</span> : null}
      <PositionsTable
        positions={rows}
        onOpenCard={(p) => setSharing(p)}
        onClose={(p) => setClosing(p)}
        onReopen={handleReopen}
        onDelete={handleDelete}
      />

      {showAdd ? <AddPositionModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); void reload(); }} /> : null}
      {closing ? <ClosePositionModal position={closing} onClose={() => setClosing(null)} onClosed={() => { setClosing(null); void reload(); }} /> : null}
      {sharing ? <PnlCardShare position={sharing} user={user} onClose={() => setSharing(null)} /> : null}
    </div>
  );
}
