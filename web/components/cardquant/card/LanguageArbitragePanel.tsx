import type { ItemDetail } from "@/lib/types";
import type { LanguageCompareResult } from "@/lib/queries/compareLanguage";

// "Arbitrage EN / JP" de la Fiche carte CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- réutilise lib/queries/compareLanguage.ts::getLanguageComparison
// (déjà utilisé par DivergencePanel.tsx), qui ne matche QUE quand un seul
// candidat existe dans l'autre langue (nom + rareté, cf. son commentaire) :
// pas de correspondance forcée. Le mockup ajoutait une estimation "Import +
// douane" et une "marge résiduelle" -- omises ici, aucun modèle de coût
// d'import réel n'existe dans le produit ; les inventer serait le genre de
// chiffre qui a l'air d'un conseil financier sans en être un.
export function LanguageArbitragePanel({
  item,
  ownUngradedPrice,
  comparison,
}: {
  item: ItemDetail;
  ownUngradedPrice: number | null;
  comparison: LanguageCompareResult;
}) {
  if (!comparison.matched || ownUngradedPrice == null || comparison.points.length === 0) {
    return (
      <section style={{ flex: "2 1 300px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Pas d&apos;équivalent {item.language === "JP" ? "EN" : "JP"} identifié avec certitude pour cette carte.
        </span>
      </section>
    );
  }

  const otherPrice = comparison.points[comparison.points.length - 1].price;
  const [enPrice, jpPrice] = item.language === "JP" ? [otherPrice, ownUngradedPrice] : [ownUngradedPrice, otherPrice];
  const deltaPct = ((jpPrice - enPrice) / enPrice) * 100;
  const maxPrice = Math.max(enPrice, jpPrice, 1);

  return (
    <section style={{ flex: "2 1 300px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Arbitrage EN / JP</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: deltaPct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
          JP {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-strong)" }}>Brut, dernier prix connu</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", width: 20 }}>EN</span>
          <div style={{ flex: 1, height: 9, background: "var(--grey-100)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(enPrice / maxPrice) * 100}%`, height: "100%", background: "var(--ink-000)" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", width: 64, textAlign: "right" }}>${enPrice.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", width: 20 }}>JP</span>
          <div style={{ flex: 1, height: 9, background: "var(--grey-100)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(jpPrice / maxPrice) * 100}%`, height: "100%", background: "var(--green-400)" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", width: 64, textAlign: "right" }}>${jpPrice.toFixed(2)}</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)" }}>
        Écart hors frais d&apos;import/douane (non modélisés) — comparaison brute des derniers prix connus dans chaque édition.
      </p>
    </section>
  );
}
