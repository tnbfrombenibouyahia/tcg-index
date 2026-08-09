// Petite pastille "i" avec info-bulle native (`title`) -- demande utilisateur
// 2026-08-09 : les blocs de texte explicatifs de /live prenaient trop de
// place verticale ("même sur un écran 27 pouces je dois scroller"). Pas de
// tooltip custom en JS (état, positionnement, a11y à gérer) : l'attribut
// `title` natif fait déjà le travail, survolable/focusable au clavier, et
// c'est le même pattern déjà utilisé sur les en-têtes de colonnes du tableau
// de couverture juste à côté.
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      role="note"
      aria-label={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "15px",
        height: "15px",
        borderRadius: "50%",
        border: "1px solid var(--foreground-subtle)",
        color: "var(--foreground-subtle)",
        fontSize: "10px",
        fontWeight: 700,
        fontStyle: "italic",
        fontFamily: "Georgia, serif",
        cursor: "help",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      i
    </span>
  );
}
