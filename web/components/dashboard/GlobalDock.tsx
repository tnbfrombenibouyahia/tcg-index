"use client";

import { usePathname } from "next/navigation";
import { WidgetDock } from "@/components/dashboard/WidgetDock";

// ─────────────────────────────────────────────────────────────────────────────
// Monte le dock en navigation pure sur toutes les pages SAUF /dashboard, qui
// monte sa propre instance "agrandissante" (expanded/onSelect connectés à
// l'état local de TerminalDashboard, cf. WidgetDock.tsx). Un seul dock actif
// à la fois -- pas de state partagé entre arbres React à mettre en place.
// ─────────────────────────────────────────────────────────────────────────────

export function GlobalDock() {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return <WidgetDock />;
}
