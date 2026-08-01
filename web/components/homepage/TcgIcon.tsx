import type { Tcg } from "@/lib/constants";
import { PixelGrid } from "@/components/ui/PixelGrid";

// ─────────────────────────────────────────────────────────────────────────────
// Icônes pixel-art par TCG — pokéball 8-bit pour Pokémon, chapeau de paille
// pour One Piece. Rendu via PixelGrid (composants/ui/PixelGrid.tsx), partagé
// avec LanguageFlag (drapeaux EN/JP).
// ─────────────────────────────────────────────────────────────────────────────

const PIXEL_COLORS: Record<string, string> = {
  R: "#EE1515", // rouge pokéball
  W: "#FFFFFF",
  K: "#1A1A1A", // bande noire / contour, même noir que --foreground
  T: "#DEB668", // paille
  B: "#C23B3B", // bande rouge du chapeau
};

const POKEBALL_ROWS = [
  ".RRRRRR.",
  "RRRRRRRR",
  "RRRRRRRR",
  "KKKWWKKK",
  "KKKWWKKK",
  "WWWWWWWW",
  "WWWWWWWW",
  ".WWWWWW.",
];

const STRAW_HAT_ROWS = [
  "...TTTT...",
  "..TTTTTT..",
  "..TTTTTT..",
  "..BBBBBB..",
  ".TTTTTTTT.",
  "TTTTTTTTTT",
];

export function PokemonPixelIcon() {
  return <PixelGrid rows={POKEBALL_ROWS} colors={PIXEL_COLORS} />;
}

export function StrawHatPixelIcon() {
  return <PixelGrid rows={STRAW_HAT_ROWS} colors={PIXEL_COLORS} />;
}

export function TcgIcon({ tcg }: { tcg: Tcg }) {
  return tcg === "pokemon" ? <PokemonPixelIcon /> : <StrawHatPixelIcon />;
}
