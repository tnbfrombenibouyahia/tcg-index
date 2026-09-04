import type { SalesKpis } from "@/lib/queries/transactionsOverview";

// Bandeau "Tape des ventes" de l'écran Transactions CardQuant (cf. mémoire
// projet "cardquant-rebrand"). Le mockup annonçait un "écart médian vs
// marché" en tête -- retiré : calculer un écart par vente demanderait un
// prix de référence par item au moment de chaque vente (des centaines par
// jour), qu'aucune requête existante ne fournit en lot. Remplacé par 5 KPI
// réellement calculables en une requête (lib/queries/transactionsOverview.ts
// ::getSalesKpis).
export function TxKpiBar({ kpis }: { kpis: SalesKpis }) {
  const items = [
    { label: "Ventes 24h", value: kpis.count24h.toLocaleString("fr-FR"), unit: "" },
    { label: "Valeur 24h", value: `$${Math.round(kpis.value24h).toLocaleString("fr-FR")}`, unit: "" },
    { label: "Prix moyen 24h", value: `$${kpis.avgPrice24h.toFixed(2)}`, unit: "" },
    { label: "Plus grosse vente 24h", value: `$${kpis.maxPrice24h.toFixed(0)}`, unit: "" },
    { label: "Ventes 7j", value: kpis.count7d.toLocaleString("fr-FR"), unit: "" },
  ];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "8px 14px", display: "flex", alignItems: "center", gap: "10px 20px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 1 auto", minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--down-500)", flex: "none" }} />
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-strong)", whiteSpace: "nowrap" }}>Tape des ventes</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>· toutes sources, brut</span>
      </div>
      <div style={{ flex: "1 1 420px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "4px 16px" }}>
        {items.map((k) => (
          <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
            <span style={{ fontSize: 17, fontWeight: 400, lineHeight: 1.1, color: "var(--text-strong)" }}>{k.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
