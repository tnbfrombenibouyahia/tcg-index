"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Barre de recherche de l'écran Population PSA CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- même mécanique `?q=` que PopulationSearchBar.tsx
// (ancien design), réécrite ici pour la nouvelle chrome. router.push (pas de
// debounce serveur -- la recherche ne part qu'à Entrée, plus simple que
// l'ancien composant client qui re-fetchait à chaque frappe côté client).
export function PopulationSearchHeader({ totalCount }: { totalCount: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  function submit() {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(`/population-analysis${qs ? `?${qs}` : ""}`);
  }

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Recherche set / carte</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Evolving Skies, Umbreon VMAX, OP06…"
        style={{ flex: "1 1 260px", minWidth: 0, boxSizing: "border-box", padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)", font: "inherit", fontSize: 12.5, outline: "none" }}
      />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{totalCount.toLocaleString("fr-FR")} cartes</span>
    </section>
  );
}
