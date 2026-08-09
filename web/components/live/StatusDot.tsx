// Petit point de statut réutilisé partout sur /live (StatusIcon de
// RunsTimeline, en-têtes de panneaux, badge live/disconnected) -- juste la
// pastille, la couleur/pulsation restent au choix de l'appelant.
export function StatusDot({ color, pulsing = false, size = 8 }: { color: string; pulsing?: boolean; size?: number }) {
  return (
    <span
      className={pulsing ? "pulse-dot" : undefined}
      style={{ display: "inline-block", width: size, height: size, borderRadius: "9999px", background: color, flexShrink: 0 }}
    />
  );
}
