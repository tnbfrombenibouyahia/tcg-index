import { ExtensionPage } from "@/components/cardquant/extension/ExtensionPage";

// ─────────────────────────────────────────────────────────────────────────────
// Route /extension (port de "CardQuant Extension.dc.html", cf. mémoire
// projet "cardquant-rebrand") -- la page d'installation de l'extension
// Chrome. Hors du groupe (cardquant) : pas de TopNav, comme /auth, pose son
// propre header minimal (dans ExtensionPage.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export default function ExtensionRoute() {
  return <ExtensionPage />;
}
