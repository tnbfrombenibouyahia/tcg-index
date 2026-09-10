import Link from "next/link";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";

// Niveau 2 de la navigation "poupée russe" du Catalogue (demande utilisateur
// 2026-09-10 : "vraiment comme PokéCardex", cf. mémoire projet
// [[cardquant-rebrand]]) -- les sets d'UNE SEULE génération (celle choisie
// au niveau 1, cf. GenerationBrowser.tsx), jamais toutes les générations à
// plat comme l'ancienne version de ce composant. Chaque tuile lie vers la
// grille de cartes filtrée sur ce set (`/catalog?tcg=...&era=...&set=...`,
// cf. lib/queries/catalogueBrowse.ts::CatalogueBrowseParams.setCode) -- pas
// de nouvelle fiche "set", ce filtre réutilise l'écran existant. `era` est
// repoussé dans l'URL pour que le fil d'Ariane (CatalogueBreadcrumb.tsx)
// puisse revenir au niveau 2 sans re-choisir la génération.
function buildHref(base: URLSearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  params.delete("page");
  const qs = params.toString();
  return `/catalog${qs ? `?${qs}` : ""}`;
}

export function SetBrowser({ group, searchParams }: { group: SetGenerationGroup; searchParams: URLSearchParams }) {
  if (group.sets.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Aucun set ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
      {group.sets.map((s) => (
        <Link
          key={`${s.tcg}-${s.setCode}`}
          href={buildHref(searchParams, { era: group.label, set: s.setCode })}
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
  );
}
