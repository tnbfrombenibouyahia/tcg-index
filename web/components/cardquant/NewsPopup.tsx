import { Button } from "./core/Button";

// Pop-up "Nouveautés" du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- pas de flux de changelog réel (aucune table de
// versions, aucun CMS) : ces 4 entrées sont écrites à la main, mais portent
// sur de vrais changements réellement livrés (dates et contenu tirés de
// l'historique git réel), pas des exemples inventés. À reprendre par une
// vraie source si un jour ce produit a un vrai système de changelog.
const NEWS_ITEMS: { tag: string; tagColor: string; date: string; title: string; body: string }[] = [
  {
    tag: "Nouveau", tagColor: "var(--up-400)", date: "02 sept. 2026",
    title: "Nouveau design du Terminal",
    body: "Le Dashboard, le Catalogue, les fiches carte et huit autres écrans passent au design CardQuant — plus dense, pensé pour l'analyse plutôt que la navigation.",
  },
  {
    tag: "Nouveau", tagColor: "var(--up-400)", date: "30 août 2026",
    title: "Score de valeur relative",
    body: "Un nouvel indice compare chaque carte aux autres cartes de son groupe (même set, même rareté, même langue) pour repérer les sous-évaluations relatives.",
  },
  {
    tag: "Nouveau", tagColor: "var(--up-400)", date: "29 août 2026",
    title: "Watchlist",
    body: "Suis des cartes depuis le site ou l'extension et retrouve-les toutes dans l'onglet Watchlist du Terminal.",
  },
  {
    tag: "Correctif", tagColor: "var(--down-500)", date: "28 août 2026",
    title: "Médiane des ventes plus fiable",
    body: "Le prix de référence utilise une fenêtre de 3 à 5 ventes récentes au lieu d'une moyenne fixe sur les 3 dernières — moins sensible aux valeurs aberrantes.",
  },
];

export function NewsPopup({ onClose }: { onClose: () => void }) {
  return (
    <section
      style={{
        position: "fixed", top: 58, right: 16, zIndex: 81, width: "min(400px, calc(100vw - 32px))",
        maxHeight: "min(560px, calc(100dvh - 90px))",
        background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 14,
        boxShadow: "var(--shadow-pop)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--border-hairline)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Nouveautés</span>
        <span style={{ flex: 1 }} />
        <span onClick={onClose} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Fermer</span>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {NEWS_ITEMS.map((n) => (
          <div key={n.title} style={{ padding: "12px 15px", borderBottom: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 999, color: n.tagColor, background: `color-mix(in srgb, ${n.tagColor} 16%, transparent)` }}>{n.tag}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>{n.date}</span>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--text-strong)", lineHeight: 1.35 }}>{n.title}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-body)", lineHeight: 1.45 }}>{n.body}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "11px 15px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Historique complet sur GitHub</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={onClose}>Tout marquer comme lu</Button>
      </div>
    </section>
  );
}
