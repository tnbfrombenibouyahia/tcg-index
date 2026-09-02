// Footer de la landing CardQuant (cf. mémoire projet "cardquant-rebrand").
// "Ressources" du mockup pointait vers des pages qui n'existent pas
// (méthode de calcul, glossaire, statut des synchros) -- retirées plutôt que
// promettre des liens morts ; à réintroduire quand ces pages existeront.
export function LandingFooter() {
  return (
    <footer style={{ marginTop: 80, borderTop: "1px solid var(--border-hairline)", background: "var(--surface-sunken)" }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "40px 24px", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-strong)" }}>CARDQUANT</span>
          <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-muted)" }}>
            Suivi de marché pour cartes à collectionner. Prix indicatifs agrégés de sources tierces — pas un conseil d&apos;investissement.
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Produit</span>
          <a href="#couverture" style={{ color: "var(--text-link)" }}>Couverture</a>
          <a href="#metriques" style={{ color: "var(--text-link)" }}>Métriques</a>
          <a href="#tarifs" style={{ color: "var(--text-link)" }}>Tarifs</a>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border-hairline)" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "16px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>© 2026 CARDQUANT</span>
          <span style={{ flex: 1 }} />
          <a href="/privacy" style={{ fontSize: 12, color: "var(--text-muted)" }}>Confidentialité</a>
        </div>
      </div>
    </footer>
  );
}
