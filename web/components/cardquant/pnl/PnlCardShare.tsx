import type { User } from "firebase/auth";
import type { PortfolioPosition } from "@/lib/portfolioApi";

// "Carte P/V" partageable de l'écran PnL CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- pop-up format "carte crypto", chiffres réels de la
// position. Simplifiée vs le mockup : halos de fond statiques (pas les 3
// animations `pnlDriftA/B/C` du prototype -- un détail de mouvement, pas la
// donnée) et pas d'emplacement meme déposable (fonctionnalité de partage
// social, pas de calcul PnL derrière) ; le contenu financier, lui, est
// intégralement réel.
export function PnlCardShare({ position, user, onClose }: { position: PortfolioPosition; user: User; onClose: () => void }) {
  const cost = position.buyPrice * position.quantity;
  const currentTotal = position.currentPrice != null ? position.currentPrice * position.quantity : null;
  const realized = position.status === "closed" ? (position.sellPrice! - position.buyPrice) * position.quantity : null;
  const unrealized = position.status === "open" && currentTotal != null ? currentTotal - cost : null;
  const pnl = realized ?? unrealized;
  const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
  const up = (pnl ?? 0) >= 0;
  const accent = up ? "var(--up-600)" : "var(--down-500)";

  const cells = [
    { k: "Coût total", v: `€${cost.toFixed(2)}` },
    { k: "Prix de revente", v: position.sellPrice != null ? `€${(position.sellPrice * position.quantity).toFixed(2)}` : "—" },
    { k: "Valeur actuelle", v: currentTotal != null ? `€${currentTotal.toFixed(2)}` : "—" },
    { k: "P/V sur coût", v: pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : "—" },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.72)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91,
          width: "min(460px, 92vw)", borderRadius: 16, overflow: "hidden", border: `1px solid color-mix(in srgb, ${accent} 40%, var(--border-hairline))`,
          background: "#0A0B0A", boxShadow: "0 30px 80px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse 70% 50% at 20% 0%, color-mix(in srgb, ${accent} 22%, transparent) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, color-mix(in srgb, ${accent} 16%, transparent) 0%, transparent 70%)` }} />
        <div style={{ position: "relative", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", color: "#FFFFFF" }}>CARDQUANT</span>
            <span style={{ width: 20, height: 20, borderRadius: 999, background: "var(--green-400)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "#000" }}>
              {(user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8A918C" }}>{user.displayName ?? user.email}</span>
          </div>

          <div>
            <div style={{ fontSize: 15, color: "#FFFFFF", fontWeight: 500 }}>{position.name}</div>
            <div style={{ fontSize: 11, color: "#8A918C" }}>{position.setCode ?? "—"} · {position.status === "open" ? "Position ouverte" : "Vendue"}</div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(34px, 5.6vw, 54px)", color: accent, lineHeight: 1 }}>
              {pnl != null ? `${pnl >= 0 ? "+" : ""}€${pnl.toFixed(2)}` : "—"}
            </span>
            {pnlPct != null ? (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(22px, 3.4vw, 32px)", color: accent }}>
                {pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(1)}%
              </span>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, paddingTop: 10, borderTop: "1px solid #242724" }}>
            {cells.map((c) => (
              <div key={c.k} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A918C", whiteSpace: "nowrap" }}>{c.k}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.v}</span>
              </div>
            ))}
          </div>

          <button type="button" onClick={onClose} style={{ alignSelf: "flex-end", appearance: "none", border: 0, background: "none", color: "#8A918C", fontSize: 12, cursor: "pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}
