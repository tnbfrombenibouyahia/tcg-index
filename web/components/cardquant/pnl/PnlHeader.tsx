import type { User } from "firebase/auth";

// En-tête de l'écran PnL CardQuant (cf. mémoire projet "cardquant-rebrand")
// -- identité réelle Firebase (pas de photo/pseudo CardQuant dédiés, pas
// construits ici : displayName/email/photoURL du compte Google tels quels).
export function PnlHeader({
  user,
  totalValue,
  totalCost,
  totalPnl,
  totalPnlPct,
}: {
  user: User;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number | null;
}) {
  const initials = (user.displayName ?? user.email ?? "?").slice(0, 2).toUpperCase();

  const stats = [
    { k: "Coût total", v: `€${totalCost.toFixed(2)}`, color: "var(--text-strong)" },
    { k: "Valeur actuelle", v: `€${totalValue.toFixed(2)}`, color: "var(--text-strong)" },
    { k: "P/V total", v: `${totalPnl >= 0 ? "+" : ""}€${totalPnl.toFixed(2)}${totalPnlPct != null ? ` (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%)` : ""}`, color: totalPnl >= 0 ? "var(--up-600)" : "var(--down-500)" },
  ];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "16px 22px", display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <span style={{ display: "grid", placeItems: "center", width: "clamp(52px, 5.6vw, 74px)", height: "clamp(52px, 5.6vw, 74px)", flex: "none", borderRadius: 999, background: "var(--green-400)", color: "#000", fontFamily: "var(--font-mono)", fontSize: "clamp(18px, 2vw, 26px)", letterSpacing: "0.02em" }}>
        {initials}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{user.displayName ?? "Portefeuille"}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{user.email}</span>
      </div>
      <span style={{ flex: "none", width: 1, alignSelf: "stretch", background: "var(--border-hairline)" }} />
      <div style={{ flex: "1 1 340px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px 30px" }}>
        {stats.map((s) => (
          <div key={s.k} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.k}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 25, fontWeight: 300, letterSpacing: "-0.01em", lineHeight: 1, color: s.color, whiteSpace: "nowrap" }}>{s.v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
