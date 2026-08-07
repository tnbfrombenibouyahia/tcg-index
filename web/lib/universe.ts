import { cookies } from "next/headers";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Univers actif (Pokémon / One Piece) — filtre global persistant (demande
// utilisateur), même mécanique que i18n/request.ts pour la langue : un
// cookie plutôt qu'un préfixe d'URL, lu côté serveur donc sans flash (contrairement
// au thème clair/sombre, qui dépend de localStorage et a besoin d'un script
// avant peinture, cf. THEME_INIT_SCRIPT dans layout.tsx).
//
// Réutilise le type Tcg existant (lib/constants.ts) plutôt qu'un nouveau
// type "Universe" -- c'est la même notion, pas la peine de la dupliquer.
// ─────────────────────────────────────────────────────────────────────────────

export const UNIVERSE_COOKIE = "universe";
export const DEFAULT_UNIVERSE: Tcg = "pokemon";

export async function getUniverse(): Promise<Tcg> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(UNIVERSE_COOKIE)?.value;
  return raw === "pokemon" || raw === "one-piece" ? raw : DEFAULT_UNIVERSE;
}
