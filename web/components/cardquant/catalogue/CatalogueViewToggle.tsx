"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Bascule "Grille de cartes" / "Par set" du Catalogue CardQuant (demande
// utilisateur 2026-09-10, cf. mémoire projet [[cardquant-rebrand]]). État
// dans l'URL (`?view=sets`, absent = grille) -- même mécanique que le reste
// du Catalogue (CatalogueFilters.tsx), partageable/rafraîchissable.
export function CatalogueViewToggle({ view }: { view: "grid" | "sets" }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goTo(next: "grid" | "sets") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "sets") params.set("view", "sets");
    else params.delete("view");
    params.delete("page");
    const qs = params.toString();
    router.push(`/catalog${qs ? `?${qs}` : ""}`);
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    appearance: "none",
    border: 0,
    cursor: "pointer",
    font: "inherit",
    padding: "6px 13px",
    borderRadius: 999,
    background: active ? "var(--ink-000)" : "transparent",
    color: active ? "var(--white)" : "var(--text-body)",
    fontSize: 12,
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", width: "fit-content" }}>
      <button type="button" onClick={() => goTo("grid")} style={pillStyle(view === "grid")}>
        Grille de cartes
      </button>
      <button type="button" onClick={() => goTo("sets")} style={pillStyle(view === "sets")}>
        Par set
      </button>
    </div>
  );
}
