// ─────────────────────────────────────────────────────────────────────────────
// Rendu pixel-art générique — grille de caractères -> <rect> avec bords nets
// (pas d'anti-aliasing), pour un vrai rendu "pixel" plutôt qu'un simple SVG
// lissé. Extrait de TcgIcon.tsx (pokéball/chapeau de paille) pour être
// réutilisé par LanguageFlag (drapeaux EN/JP) -- même technique, même DA.
// ─────────────────────────────────────────────────────────────────────────────

export function PixelGrid({
  rows,
  colors,
  pixelSize = 2,
  size = 20,
}: {
  rows: string[];
  colors: Record<string, string>;
  pixelSize?: number;
  size?: number;
}) {
  const cols = rows[0]?.length ?? 0;
  const viewW = cols * pixelSize;
  const viewH = rows.length * pixelSize;

  return (
    <svg
      width={size}
      height={(size * viewH) / viewW}
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
              fill={colors[ch]}
            />
          )
        )
      )}
    </svg>
  );
}
