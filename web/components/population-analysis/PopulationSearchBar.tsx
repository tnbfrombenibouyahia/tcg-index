"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// ─────────────────────────────────────────────────────────────────────────────
// Recherche par nom directement sur le listing filtré (demande utilisateur
// 2026-08-11, "une barre de recherche pour trouver la carte qui m'intéresse
// directement au-dessus de la liste") -- PAS un typeahead vers un item précis
// façon CardSearchCombobox (transactions) : ici la liste est déjà scoped par
// les critères de la colonne de gauche (TCG/prix/population), donc un simple
// filtre texte (`?q=`, ILIKE côté serveur cf. lib/queries/populationAnalysis)
// suffit et reste cohérent avec le reste de la page (URL-driven, pas de state
// React qui ne survivrait pas à un partage de lien).
//
// `router.replace` (pas `push`, même pattern que CatalogSearch) -- sinon
// chaque frappe empilerait une entrée d'historique.
const DEBOUNCE_MS = 300;

export function PopulationSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("populationAnalysis");

  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (value.trim() === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, searchParams, pathname, router]);

  return (
    <div className="relative mb-4">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchAria")}
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}
