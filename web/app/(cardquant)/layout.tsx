// Coquille des écrans déjà migrés au design CardQuant/Slabline (cf. mémoire
// projet "cardquant-rebrand") -- volontairement minimale : pas de
// GlobalDock (dock flottant de l'ancien design "TCG Index", cf.
// app/(app)/layout.tsx), chaque écran de ce groupe pose lui-même son propre
// chrome (TopNav) et sa propre surcharge de thème sur son conteneur racine.
// Route group ((cardquant)) : n'apparaît pas dans l'URL, /dashboard reste
// /dashboard -- juste un layout différent de celui du groupe (app).
export default function CardQuantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
