import type { WatchedCard } from "@/lib/watchlistApi";

// 4 KPI de l'écran Watchlist CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- réels, calculés sur les favoris de l'utilisateur.
// Le mockup annonçait "seuil"/"intention d'achat" (prix cible par carte) --
// favorites (cf. db/schema.sql) ne stocke qu'un item_id + une date, aucun
// prix cible : ces KPI utilisent ce qui existe réellement (nombre suivi,
// valeur cumulée au prix brut actuel, couverture prix) plutôt que le
// P/V immédiat vs seuil du mockup.
export function WatchlistKpiRow({ cards, limit, isPremium }: { cards: WatchedCard[]; limit: number; isPremium: boolean }) {
  const priced = cards.filter((c) => c.currentPrice != null);
  const totalValue = priced.reduce((s, c) => s + (c.currentPrice ?? 0), 0);

  const kpis = [
    { k: "Cartes suivies", v: isPremium ? String(cards.length) : `${cards.length} / ${limit}`, note: isPremium ? "Illimité" : "Compte gratuit", color: "var(--text-strong)" },
    { k: "Valeur cumulée (brut)", v: `€${totalValue.toFixed(2)}`, note: `${priced.length} carte${priced.length !== 1 ? "s" : ""} pricée${priced.length !== 1 ? "s" : ""}`, color: "var(--text-strong)" },
    { k: "Sans prix connu", v: String(cards.length - priced.length), note: "jamais snapshottées", color: cards.length - priced.length > 0 ? "var(--warn-600)" : "var(--text-strong)" },
    { k: "Formule", v: isPremium ? "Premium" : "Gratuit", note: isPremium ? "favoris illimités" : `${limit} favoris max`, color: isPremium ? "var(--green-600)" : "var(--text-strong)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
      {kpis.map((k) => (
        <section key={k.k} style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{k.k}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(22px, 3vh, 28px)", fontWeight: 300, letterSpacing: "-0.01em", color: k.color }}>{k.v}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{k.note}</span>
        </section>
      ))}
    </div>
  );
}
