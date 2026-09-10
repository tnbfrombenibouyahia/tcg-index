import Link from "next/link";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";

// Vue "Par set" du Catalogue CardQuant (demande utilisateur 2026-09-10 :
// "comme PokéCardex, des sets par génération et les images des sets", cf.
// mémoire projet [[cardquant-rebrand]]). Chaque tuile lie vers la grille de
// cartes filtrée sur ce set (`/catalog?tcg=...&set=...`, cf.
// lib/queries/catalogueBrowse.ts::CatalogueBrowseParams.setCode) -- pas de
// nouvelle fiche "set", ce filtre réutilise l'écran existant.
export function SetBrowser({ groups }: { groups: SetGenerationGroup[] }) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Aucun set ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <section key={g.label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{g.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              {g.sets.length} set{g.sets.length > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {g.sets.map((s) => (
              <Link
                key={`${s.tcg}-${s.setCode}`}
                href={`/catalog?tcg=${s.tcg}&set=${encodeURIComponent(s.setCode)}`}
                // prefetch={false} : même raisonnement que CatalogueGrid.tsx /
                // PopulationRankTable.tsx (incidents du 2026-09-06 et
                // 2026-09-10) -- une grille de plusieurs dizaines de tuiles
                // toutes dans le viewport prefetcherait sinon autant de
                // requêtes Cloud SQL simultanées au premier rendu.
                prefetch={false}
                style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 12, display: "flex", flexDirection: "column", gap: 8, color: "inherit" }}
              >
                <div style={{ height: 46, borderRadius: 8, background: "var(--surface-sunken)", border: s.logoUrl ? "1px solid var(--border-hairline)" : "1px dashed var(--border-strong)", display: "grid", placeItems: "center", padding: 8, textAlign: "center" }}>
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- hôte CDN externe (PokéCardex), cf. plan §5
                    <img src={s.logoUrl} alt={s.displayName} loading="lazy" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.displayName}</span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>
                    {s.language} · {s.itemCount.toLocaleString("fr-FR")} cartes
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
