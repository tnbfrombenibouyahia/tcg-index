import Link from "next/link";

// Pagination du Catalogue CardQuant -- pas de contrôle de pagination dans le
// mockup .dc.html (grille statique de 12 cartes) : ajoutée ici, nécessaire
// dès qu'on branche un vrai catalogue de 41k+ items, mais stylée avec les
// tokens du design system pour rester cohérente avec le reste de l'écran.
export function CataloguePager({ page, totalPages, searchParams }: { page: number; totalPages: number; searchParams: URLSearchParams }) {
  if (totalPages <= 1) return null;

  function hrefFor(p: number): string {
    const params = new URLSearchParams(searchParams);
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return `/catalog${qs ? `?${qs}` : ""}`;
  }

  const linkStyle = (disabled: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", height: 30, padding: "0 14px",
    borderRadius: 999, border: "1px solid var(--border-hairline)", fontSize: 12, fontFamily: "var(--font-mono)",
    color: disabled ? "var(--text-muted)" : "var(--text-strong)", pointerEvents: disabled ? "none" : "auto",
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "4px 0" }}>
      <Link href={hrefFor(page - 1)} style={linkStyle(page <= 1)}>Précédent</Link>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
        Page {page} / {totalPages}
      </span>
      <Link href={hrefFor(page + 1)} style={linkStyle(page >= totalPages)}>Suivant</Link>
    </div>
  );
}
