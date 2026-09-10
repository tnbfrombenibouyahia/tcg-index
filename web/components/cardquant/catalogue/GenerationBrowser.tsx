import Link from "next/link";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";

// Niveau 1 de la navigation "poupée russe" du Catalogue (demande utilisateur
// 2026-09-10 : "vraiment comme PokéCardex", cf. mémoire projet
// [[cardquant-rebrand]]) -- une tuile par génération, jamais les sets
// directement (contrairement à l'ancien SetBrowser.tsx qui affichait tout à
// plat sur une seule page). Clic sur une tuile -> `?era=<label>`, qui fait
// passer CatalogueScreen.tsx au niveau 2 (SetBrowser.tsx, sets de CETTE
// génération seulement).
//
// Pas de logo par génération en base (seuls les sets sont mappés PokéCardex,
// cf. lib/queries/setsBrowse.ts) -- on réutilise le logo du premier set
// mappé du groupe comme vignette, repli sur le libellé sinon.
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

export function GenerationBrowser({ groups, searchParams }: { groups: SetGenerationGroup[]; searchParams: URLSearchParams }) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Aucune génération ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
      {groups.map((g) => {
        const sampleLogo = g.sets.find((s) => s.logoUrl)?.logoUrl ?? null;
        const itemCount = g.sets.reduce((sum, s) => sum + s.itemCount, 0);
        return (
          <Link
            key={g.label}
            href={buildHref(searchParams, { era: g.label, set: undefined })}
            // prefetch={false} : même raisonnement que SetBrowser.tsx /
            // CatalogueGrid.tsx (incidents du 2026-09-06 et 2026-09-10) --
            // toutes les tuiles de génération sont dans le viewport dès le
            // premier rendu.
            prefetch={false}
            style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, color: "inherit" }}
          >
            <div style={{ height: 64, borderRadius: 8, background: "var(--surface-sunken)", border: sampleLogo ? "1px solid var(--border-hairline)" : "1px dashed var(--border-strong)", display: "grid", placeItems: "center", padding: 10, textAlign: "center" }}>
              {sampleLogo ? (
                // eslint-disable-next-line @next/next/no-img-element -- hôte CDN externe (PokéCardex), cf. plan §5
                <img src={sampleLogo} alt={g.label} loading="lazy" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.03em", color: "var(--text-muted)" }}>{g.label}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>
                {g.sets.length} set{g.sets.length > 1 ? "s" : ""} · {itemCount.toLocaleString("fr-FR")} cartes
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
