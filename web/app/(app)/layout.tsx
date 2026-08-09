import { TopHeader } from "@/components/ui/TopHeader";
import { GlobalDock } from "@/components/dashboard/GlobalDock";
import { LiveDataDock } from "@/components/dashboard/LiveDataDock";

// Coquille des pages "produit" (dashboard, catalog, transactions, ...) --
// header global + contenu. La sidebar fixe a été retirée (demande
// utilisateur du 2026-08-08, cf. mémoire projet "project_terminal_redesign") :
// la navigation vit désormais entièrement dans le dock flottant du bas
// (GlobalDock -> WidgetDock, verre liquide, mêmes 9 destinations qu'avant).
// `paddingBottom` sur <main> réserve la place pour que le dock (position
// fixed) ne recouvre jamais le bas du contenu. Un route group ((app))
// n'apparaît pas dans l'URL : /dashboard, /catalog etc. restent inchangés.
//
// LiveDataDock (demande utilisateur 2026-08-09) : pastille "Live Market
// Data" compacte, ancrée tout à droite de cette même barre du bas --
// contrairement à GlobalDock, jamais masquée sur /dashboard (widget
// d'info, pas de navigation, les deux coexistent partout).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "var(--bg-from)" }}>
      <TopHeader />
      <main style={{ flex: 1, paddingBottom: "100px" }}>{children}</main>
      <GlobalDock />
      <LiveDataDock />
    </div>
  );
}
