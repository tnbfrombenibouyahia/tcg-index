import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Icônes pixel-art par TCG — pokéball 8-bit pour Pokémon, chapeau de paille
// pour One Piece. Grille de caractères -> <rect> avec bords nets (pas
// d'anti-aliasing), pour un vrai rendu "pixel" plutôt qu'un simple SVG lissé.
// ─────────────────────────────────────────────────────────────────────────────

const PIXEL_COLORS: Record<string, string> = {
  R: "#EE1515", // rouge pokéball
  W: "#FFFFFF",
  K: "#1A1A1A", // bande noire / contour, même noir que --foreground
  T: "#DEB668", // paille
  B: "#C23B3B", // bande rouge du chapeau
};

function PixelGrid({ rows, pixelSize = 2 }: { rows: string[]; pixelSize?: number }) {
  const cols = rows[0]?.length ?? 0;
  const viewW = cols * pixelSize;
  const viewH = rows.length * pixelSize;

  return (
    <svg
      width="20"
      height="20"
      viewBox={`0 0 ${viewW} ${viewH}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rows.map((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x * pixelSize}
              y={y * pixelSize}
              width={pixelSize}
              height={pixelSize}
              fill={PIXEL_COLORS[ch]}
            />
          )
        )
      )}
    </svg>
  );
}

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
  return <PixelGrid rows={POKEBALL_ROWS} />;
}

export function StrawHatPixelIcon() {
  return <PixelGrid rows={STRAW_HAT_ROWS} />;
}

export function TcgIcon({ tcg }: { tcg: Tcg }) {
  return tcg === "pokemon" ? <PokemonPixelIcon /> : <StrawHatPixelIcon />;
}
