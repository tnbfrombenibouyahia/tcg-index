"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "../core/Select";
import type { PriceState } from "@/lib/queries/catalogueBrowse";
import type { Tcg } from "@/lib/constants";

// Barre de filtres du Catalogue CardQuant (cf. mémoire projet
// "cardquant-rebrand"). État dans l'URL (comme /undervalued, /divergence...)
// -- Select (composant du design system, value+onChange) sert juste
// d'affichage/interaction, le vrai state reste les search params, poussés
// via router.push (partageable/rafraîchissable, cohérent avec le reste du
// site). Changer un filtre repart en page 1, même règle que
// app/(app)/undervalued/page.tsx::buildHref.
//
// "Filtres avancés" du mockup omis : aucun filtre supplémentaire n'est
// implémenté derrière (pas de plage de prix, etc.) -- un bouton qui ne fait
// rien serait pire qu'un bouton absent.
const TCG_LABELS: Record<Tcg, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };

export function CatalogueFilters({
  view,
  tcg,
  language,
  rarity,
  priceState,
  setCode,
  languages,
  rarities,
  totalCount,
  resultsLabel = "résultats",
}: {
  // Rareté/état brut-gradé n'ont pas de sens sur la vue "Par set" (ce sont
  // des filtres de CARTE, pas de set) -- masqués plutôt qu'affichés inertes.
  view: "grid" | "sets";
  tcg?: Tcg;
  language?: string;
  rarity?: string;
  priceState: PriceState;
  // Filtre posé depuis la vue "Par set" (cf. SetBrowser.tsx) -- affiché en
  // chip retirable plutôt que dans un des Select ci-dessous (pas une liste
  // fermée, 400+ valeurs possibles).
  setCode?: string;
  languages: string[];
  rarities: string[];
  totalCount: number;
  // "résultats" (cartes) en vue grille, "sets" en vue "Par set" -- même
  // compteur, unité différente selon ce qui est effectivement listé.
  resultsLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushWith(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(`/catalog${qs ? `?${qs}` : ""}`);
  }

  const gameValue = tcg ? TCG_LABELS[tcg] : "Tous les jeux";
  const gameOptions = ["Tous les jeux", "Pokémon", "One Piece"];
  const gameByLabel: Record<string, Tcg | undefined> = { "Tous les jeux": undefined, Pokémon: "pokemon", "One Piece": "one-piece" };

  const langValue = language ?? "Toutes les langues";
  const langOptions = ["Toutes les langues", ...languages];

  const rarityValue = rarity ?? "Toutes raretés";
  const rarityOptions = ["Toutes raretés", ...rarities];

  const STATE_LABELS: Record<PriceState, string> = { any: "Brut + gradé", raw: "Brut", graded: "Gradé" };
  const stateValue = STATE_LABELS[priceState];
  const stateByLabel: Record<string, PriceState> = { "Brut + gradé": "any", Brut: "raw", Gradé: "graded" };

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Select value={gameValue} options={gameOptions} size="sm" style={{ width: 150 }} onChange={(v) => pushWith({ tcg: gameByLabel[v] })} />
      <Select value={langValue} options={langOptions} size="sm" style={{ width: 170 }} onChange={(v) => pushWith({ language: v === "Toutes les langues" ? undefined : v })} />
      {view === "grid" ? (
        <>
          <Select value={rarityValue} options={rarityOptions} size="sm" style={{ width: 190 }} onChange={(v) => pushWith({ rarity: v === "Toutes raretés" ? undefined : v })} />
          <Select value={stateValue} options={Object.values(STATE_LABELS)} size="sm" style={{ width: 150 }} onChange={(v) => pushWith({ state: stateByLabel[v] === "any" ? undefined : stateByLabel[v] })} />
        </>
      ) : null}
      {setCode ? (
        <button
          type="button"
          onClick={() => pushWith({ set: undefined })}
          style={{ appearance: "none", border: "1px solid var(--border-hairline)", cursor: "pointer", borderRadius: 999, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-sunken)", color: "var(--text-body)", fontFamily: "var(--font-mono)", fontSize: 11 }}
        >
          Set : {setCode} ✕
        </button>
      ) : null}
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{totalCount.toLocaleString("fr-FR")} {resultsLabel}</span>
    </section>
  );
}
