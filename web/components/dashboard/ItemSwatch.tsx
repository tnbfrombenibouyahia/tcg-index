// ─────────────────────────────────────────────────────────────────────────────
// Vignette carte/scellé des lignes de widget -- vraie image (item.imageUrl,
// cf. mémoire projet "item_images") quand disponible, sinon le motif rayé
// du mockup en repli plutôt qu'un cadre vide.
// ─────────────────────────────────────────────────────────────────────────────

export function ItemSwatch({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- même convention que UndervaluedTableBody (pas de next/image, pas de domaine distant configuré)
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        style={{
          width: "36px",
          height: "50px",
          objectFit: "cover",
          borderRadius: "4px",
          flexShrink: 0,
          border: "1px solid var(--border)",
          background: "var(--surface-alt)",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: "36px",
        height: "50px",
        borderRadius: "4px",
        flexShrink: 0,
        border: "1px solid var(--border)",
        background:
          "repeating-linear-gradient(135deg, var(--tint-neutral) 0 4px, transparent 4px 8px)",
      }}
    />
  );
}
