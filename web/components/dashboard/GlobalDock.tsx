"use client";

import { usePathname } from "next/navigation";
import { WidgetDock } from "@/components/dashboard/WidgetDock";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Monte le dock en navigation pure sur toutes les pages SAUF /dashboard, qui
// monte sa propre instance "agrandissante" (expanded/onSelect connectés à
// l'état local de TerminalDashboard, cf. WidgetDock.tsx). Un seul dock actif
// à la fois -- pas de state partagé entre arbres React à mettre en place.
//
// `universe` vient du cookie côté serveur (AppShellLayout -> getUniverse()) :
// WidgetDock en a besoin pour son sélecteur d'univers (ex-TopHeader), et un
// Client Component ne peut pas lire ce cookie lui-même sans un aller-retour.
// ─────────────────────────────────────────────────────────────────────────────

export function GlobalDock({ universe }: { universe: Tcg }) {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return <WidgetDock universe={universe} />;
}
