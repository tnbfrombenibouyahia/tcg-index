import Link from "next/link";

// Fil d'Ariane du Catalogue CardQuant (cf. mémoire projet
// [[cardquant-rebrand]]) -- Sets -> [Set], 2 niveaux seulement depuis que la
// génération n'est plus un niveau cliquable à part (demande utilisateur
// 2026-09-10, 3e itération : "les sets de toutes les générations
// directement, juste des dividers" -- cf. SetBrowser.tsx). Le premier
// maillon ramène à la liste complète des sets (retire `set` de l'URL,
// garde tcg/langue) -- seul moyen de remonter du niveau "cartes".
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

export function CatalogueBreadcrumb({ setLabel, searchParams }: { setLabel?: string; searchParams: URLSearchParams }) {
  const crumbs: { label: string; href?: string }[] = [
    { label: "Sets", href: setLabel ? buildHref(searchParams, { set: undefined }) : undefined },
  ];
  if (setLabel) crumbs.push({ label: setLabel });

  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 ? <span style={{ color: "var(--border-strong)" }}>/</span> : null}
          {c.href ? (
            <Link href={c.href} prefetch={false} style={{ color: "var(--text-body)" }}>
              {c.label}
            </Link>
          ) : (
            <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
