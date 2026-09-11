import Link from "next/link";
import type { SetGenerationGroup } from "@/lib/queries/setsBrowse";

// Vue "Par set" du Catalogue CardQuant (demande utilisateur 2026-09-10, 3e
// itération sur ce composant, cf. mémoire projet [[cardquant-rebrand]]) :
// "les sets de toutes les générations directement, juste des dividers
// entre chaque génération, comme PokéCardex" -- remplace le niveau 1
// "Générations" cliquable (GenerationBrowser.tsx, supprimé) par un simple
// regroupement visuel sur UNE SEULE page (bordure + libellé au-dessus de
// chaque section). La navigation "poupée russe" ne porte donc plus que sur
// Set -> Cartes (2 niveaux, cf. CatalogueScreen.tsx), pas sur
// Génération -> Set comme la version précédente.
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

export function SetBrowser({ groups, searchParams }: { groups: SetGenerationGroup[]; searchParams: URLSearchParams }) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Aucun set ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {groups.map((g) => (
        <section key={g.label} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Divider entre générations (demande "comme PokéCardex") : libellé
              + compteur au-dessus d'une ligne de séparation, pas un bouton --
              cette vue ne se replie plus, elle liste tout. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--border-hairline)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{g.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              {g.sets.length} set{g.sets.length > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {g.sets.map((s) => (
              <Link
                key={`${s.tcg}-${s.setCode}`}
                href={buildHref(searchParams, { set: s.setCode })}
                // prefetch={false} : même raisonnement que CatalogueGrid.tsx /
                // PopulationRankTable.tsx (incidents du 2026-09-06 et
                // 2026-09-10) -- toutes les générations sont maintenant dans
                // le viewport dès le premier rendu (page unique, plus de
                // niveau intermédiaire), donc encore plus de tuiles
                // simultanées qu'avant.
                prefetch={false}
                style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 12, display: "flex", flexDirection: "column", gap: 8, color: "inherit" }}
              >
                <div style={{ height: 72, borderRadius: 8, background: "var(--surface-sunken)", border: s.logoUrl ? "1px solid var(--border-hairline)" : "1px dashed var(--border-strong)", display: "grid", placeItems: "center", padding: 10, textAlign: "center" }}>
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
