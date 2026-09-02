import { Icon } from "../core/Icon";

// Section "Tarifs" de la landing CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Construite fidèlement au mockup à la demande
// explicite de l'utilisateur, MAIS purement visuelle : aucun des CTA ne
// déclenche de paiement réel (pas de Stripe/billing branché côté produit
// aujourd'hui) -- "Essayer 14 jours" et "Passer en Max" restent des ancres
// inertes (#tarifs), comme dans le mockup d'origine. Seul "Installer
// l'extension" (palier gratuit) est une action réelle.
const FREE_FEATURES = [
  "Panneau d'analyse sur toute annonce reconnue",
  "Prix de marché et moyenne des 3 / 10 dernières ventes",
  "Écart vs marché et verdict de prix",
  "Comparaison EN / JP",
  "20 analyses par jour",
];

const UNLIMITED_FEATURES = [
  "Analyses illimitées, sans file d'attente",
  "Watchlist sur ton compte CardQuant",
  "Alertes de seuil de prix par carte",
  "Comparaison EN / JP et ROI gradation",
  "Historique de tes cartes suivies",
];

const MAX_FEATURES = [
  "Tout ce que contient Illimité",
  "Terminal complet : catalogue, live, population PSA",
  "Calculateur d'arbitrage et suivi de collection",
  "Valorisation de collection en temps réel",
  "Export CSV et accès API",
  "Support prioritaire",
];

function FeatureList({ items, color = "var(--text-strong)" }: { items: string[]; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((f) => (
        <div key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--text-body)" }}>
          <Icon name="check" size={14} color={color} />
          <span>{f}</span>
        </div>
      ))}
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="tarifs" style={{ maxWidth: 1600, margin: "0 auto", padding: "80px 24px 0", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, maxWidth: 660, margin: "0 auto" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Tarifs</span>
        <h2 style={{ margin: 0, fontSize: 38, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)" }}>
          L&apos;extension est gratuite. Le terminal est pour ceux qui arbitrent.
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, maxWidth: 1160, width: "100%", margin: "0 auto" }}>
        {/* Gratuit */}
        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Gratuit</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: "var(--text-strong)" }}>0 €</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ mois</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--text-muted)" }}>L&apos;EXTENSION SEULE</span>
            <span style={{ fontSize: 13, color: "var(--text-body)" }}>Pour ne plus surpayer une carte.</span>
          </div>
          <div style={{ height: 1, background: "var(--border-hairline)" }} />
          <FeatureList items={FREE_FEATURES} />
          <div style={{ marginTop: "auto", paddingTop: 6 }}>
            <a href="#tarifs" style={{ display: "flex", width: "100%", boxSizing: "border-box", alignItems: "center", justifyContent: "center", height: 42, padding: "0 22px", borderRadius: 999, background: "var(--white)", border: "1px solid var(--border-hairline)", color: "var(--text-strong)", fontSize: 14, fontWeight: 500 }}>
              Installer l&apos;extension
            </a>
          </div>
        </section>

        {/* Illimité */}
        <section style={{ background: "var(--white)", border: "1px solid var(--green-400)", borderRadius: 12, boxShadow: "var(--shadow-accent-glow)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--green-400)" }}>Illimité</span>
              <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, background: "var(--green-400)", color: "var(--ink-000)", fontSize: 10.5, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Le plus choisi</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: "var(--text-strong)" }}>5 €</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ mois</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--text-muted)" }}>OU 49 € / AN · 2 MOIS OFFERTS</span>
            <span style={{ fontSize: 13, color: "var(--text-body)" }}>Pour suivre les cartes que tu chasses.</span>
          </div>
          <div style={{ height: 1, background: "var(--border-hairline)" }} />
          <FeatureList items={UNLIMITED_FEATURES} color="var(--green-400)" />
          <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <a href="#tarifs" style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 7, height: 42, padding: "0 22px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 14, fontWeight: 500 }}>
              Essayer 14 jours
              <Icon name="arrow-up-right" size={14} color="#000" />
            </a>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Sans engagement. Résiliable en un clic.</span>
          </div>
        </section>

        {/* Max */}
        <section style={{ background: "var(--white)", border: "1px solid var(--border-strong)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-strong)" }}>Max</span>
              <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 10.5, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Terminal complet</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: "var(--text-strong)" }}>9,99 €</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ mois</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--text-muted)" }}>OU 90 € / AN · 2 MOIS OFFERTS</span>
            <span style={{ fontSize: 13, color: "var(--text-body)" }}>Pour revendre avec une marge calculée.</span>
          </div>
          <div style={{ height: 1, background: "var(--border-hairline)" }} />
          <FeatureList items={MAX_FEATURES} />
          <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <a href="#tarifs" style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 7, height: 42, padding: "0 22px", borderRadius: 999, background: "var(--ink-000)", border: "1px solid var(--border-strong)", color: "var(--white)", fontSize: 14, fontWeight: 500 }}>
              Passer en Max
              <Icon name="arrow-up-right" size={14} color="var(--white)" />
            </a>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Tout Illimité, plus le terminal et l&apos;API.</span>
          </div>
        </section>
      </div>
    </section>
  );
}
