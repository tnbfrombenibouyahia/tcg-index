import Link from "next/link";
import type { CatalogueBrowseRow } from "@/lib/queries/catalogueBrowse";

// Grille du Catalogue CardQuant (cf. mémoire projet "cardquant-rebrand").
// Chaque carte lie vers /catalog/[id] -- l'écran "Fiche carte" du Terminal
// (cf. app/(cardquant)/catalog/[id]/page.tsx), pas la modale
// ItemDetailModal de l'ancien design (celle-ci reste utilisée par
// CatalogSearch.tsx, orphelin, cf. commentaire de la page catalogue). Server
// Component pur maintenant que la navigation remplace l'état "selected".
function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) return "—";
  const symbol = currency === "EUR" ? "€" : "$";
  return `${symbol}${price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CatalogueGrid({ rows }: { rows: CatalogueBrowseRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Aucune carte ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
      {rows.map((c) => {
        const hasDelta = c.priceChangePct != null;
        return (
          <Link
            key={c.itemId}
            href={`/catalog/${c.itemId}`}
            style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 12, display: "flex", flexDirection: "column", gap: 10, color: "inherit" }}
          >
            <div style={{ position: "relative", aspectRatio: "3.5 / 4.55", borderRadius: 8, overflow: "hidden", background: "var(--surface-sunken)", border: c.imageUrl ? "1px solid var(--border-hairline)" : "1px dashed var(--border-strong)", display: "grid", placeItems: "center", padding: 8, textAlign: "center" }}>
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
                <img src={c.imageUrl} alt={c.name} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-muted)" }}>{c.code ?? c.setCode ?? "—"}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-strong)", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.setCode ?? "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: "auto" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-strong)" }}>{formatPrice(c.price, c.currency)}</span>
              {hasDelta ? (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: c.priceChangePct! >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
                  {c.priceChangePct! >= 0 ? "+" : ""}
                  {c.priceChangePct!.toFixed(1)}%
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
