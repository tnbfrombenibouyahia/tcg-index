import Link from "next/link";

// Fil d'Ariane de la navigation "poupée russe" du Catalogue (demande
// utilisateur 2026-09-10 : "vraiment comme PokéCardex", cf. mémoire projet
// [[cardquant-rebrand]]) -- Générations -> [Génération] -> [Set], chaque
// maillon sauf le dernier est cliquable pour remonter d'un niveau (retire
// `set` puis `era` de l'URL, garde tcg/langue). C'est le SEUL moyen de
// remonter du niveau 3 (cartes) ou 2 (sets) -- il n'y a plus de bascule de
// vue globale (cf. CatalogueScreen.tsx, CatalogueViewToggle.tsx supprimé).
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

export function CatalogueBreadcrumb({ era, setLabel, searchParams }: { era?: string; setLabel?: string; searchParams: URLSearchParams }) {
  const crumbs: { label: string; href?: string }[] = [
    { label: "Générations", href: era ? buildHref(searchParams, { era: undefined, set: undefined }) : undefined },
  ];
  if (era) crumbs.push({ label: era, href: setLabel ? buildHref(searchParams, { set: undefined }) : undefined });
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
