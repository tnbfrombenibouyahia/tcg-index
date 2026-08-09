import { GlobalDock } from "@/components/dashboard/GlobalDock";
import { getUniverse } from "@/lib/universe";

// Coquille des pages "produit" (dashboard, catalog, transactions, ...) --
// contenu + dock flottant, plus de header fixe. La sidebar fixe a été
// retirée (demande utilisateur du 2026-08-08, cf. mémoire projet
// "project_terminal_redesign") ; le header du haut (TopHeader, emblème +
// tagline + univers/langue/thème/compte) l'a suivi le 2026-08-09 -- tous ses
// contrôles (hors emblème/tagline, supprimés) vivent maintenant DANS le dock
// (GlobalDock -> WidgetDock : univers tout à gauche, langue+compte tout à
// droite, cf. commentaire WidgetDock.tsx). `paddingBottom` sur <main>
// réserve la place pour que le dock (position fixed) ne recouvre jamais le
// bas du contenu. Un route group ((app)) n'apparaît pas dans l'URL :
// /dashboard, /catalog etc. restent inchangés.
//
// LiveDataDock (pastille "Live Market Data" ancrée à droite, ajoutée le
// 2026-08-09) retirée le même jour -- demande utilisateur : plus de bouton
// dédié pour ça, ni dans le dock ni à part.
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const universe = await getUniverse();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "var(--bg-from)" }}>
      <main style={{ flex: 1, paddingBottom: "100px" }}>{children}</main>
      <GlobalDock universe={universe} />
    </div>
  );
}
