import { NavBar } from "@/components/ui/NavBar";

// Coquille des pages "produit" (dashboard, catalog, transactions, ...) --
// sidebar fixe + zone de contenu scrollable. Extrait de l'ancien
// app/layout.tsx (racine) pour que la landing page (app/page.tsx, hors de ce
// groupe de routes) puisse avoir sa propre mise en page plein écran sans
// sidebar. Un route group ((app)) n'apparaît pas dans l'URL : /dashboard,
// /catalog etc. restent inchangés.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", minHeight: "100dvh" }}>
      <NavBar />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-from)",
        }}
      >
        <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
