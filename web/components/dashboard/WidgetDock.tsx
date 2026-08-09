"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { WidgetId } from "@/lib/dashboard/types";
import {
  GridIcon,
  SearchIcon,
  TransactionsIcon,
  BoxIcon,
  TrendingUpIcon,
  GradingRoiIcon,
  DivergenceIcon,
  LiquidityIcon,
} from "@/components/ui/icons";

// ─────────────────────────────────────────────────────────────────────────────
// Dock flottant -- navigation UNIQUE du site (la sidebar a été retirée, cf.
// mémoire projet "project_terminal_redesign"), porté du "nav" bas de TCG
// Terminal.dc.html : pilule fixe en bas d'écran, verre liquide, se déplie au
// survol. Couvre les destinations de l'ancienne sidebar -- 5 ont un widget
// équivalent sur /dashboard (Catalogue, Transactions, Sous-évalué,
// Divergences, ROI Gradation), 2 n'en ont pas (Scellés sous-évalués,
// Liquidité) et naviguent toujours vers leur page dédiée.
//
// "live" (Live Market Data) retiré du front entièrement -- demande
// utilisateur du 2026-08-09 : plus de widget, plus de page /live, donc plus
// de point d'entrée nav ici non plus (cf. lib/dashboard/types.ts).
//
// Double comportement au clic, résolu ici plutôt que dans deux composants
// séparés :
// - Sur /dashboard, avec `expanded`/`onSelect` fournis (par TerminalDashboard) :
//   les items à widget AGRANDISSENT ce widget en place (même geste que le
//   ⤢ de son en-tête). Les 2 sans widget naviguent quand même (rien à
//   agrandir sur place).
// - Partout ailleurs (GlobalDock.tsx, sans `expanded`/`onSelect`) : tous les
//   items naviguent vers leur route, comme l'ancienne sidebar.
// ─────────────────────────────────────────────────────────────────────────────

interface DockItem {
  id: WidgetId | "sealedEv" | "liquidity";
  href: string;
  labelKey: string;
  Icon: (props: { size?: number }) => React.ReactElement;
  hasWidget: boolean;
}

const ITEMS: DockItem[] = [
  { id: "catalogue", href: "/catalog", labelKey: "catalog", Icon: SearchIcon, hasWidget: true },
  { id: "tx", href: "/transactions", labelKey: "transactions", Icon: TransactionsIcon, hasWidget: true },
  { id: "sealedEv", href: "/sealed-ev", labelKey: "sealedEv", Icon: BoxIcon, hasWidget: false },
  { id: "under", href: "/undervalued", labelKey: "undervalued", Icon: TrendingUpIcon, hasWidget: true },
  { id: "grade", href: "/grading-roi", labelKey: "gradingRoi", Icon: GradingRoiIcon, hasWidget: true },
  { id: "div", href: "/divergence", labelKey: "divergence", Icon: DivergenceIcon, hasWidget: true },
  { id: "liquidity", href: "/liquidity", labelKey: "liquidity", Icon: LiquidityIcon, hasWidget: false },
];

export function WidgetDock({
  expanded,
  onSelect,
}: {
  /** Fournis uniquement par TerminalDashboard (rendu sur /dashboard) -- leur
   *  absence signale le mode "navigation pure" (GlobalDock, autres pages). */
  expanded?: WidgetId | null;
  onSelect?: (id: WidgetId | null) => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [hover, setHover] = useState(false);

  const isDashboard = pathname === "/dashboard";
  const canExpand = isDashboard && !!onSelect;

  function goHome() {
    if (canExpand) onSelect!(null);
    else router.push("/dashboard");
  }

  function goItem(item: DockItem) {
    if (canExpand && item.hasWidget) onSelect!(item.id as WidgetId);
    else router.push(item.href);
  }

  function homeActive() {
    return canExpand ? expanded == null : pathname === "/dashboard";
  }

  function itemActive(item: DockItem) {
    if (canExpand && item.hasWidget) return expanded === item.id;
    if (isDashboard) return false; // sans widget, jamais "sur place" depuis le dashboard
    return pathname.startsWith(item.href);
  }

  return (
    <nav
      aria-label={t("home")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed",
        left: "50%",
        bottom: "26px",
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        flexDirection: "row",
        gap: hover ? "3px" : "2px",
        padding: hover ? "0 14px" : "0 8px",
        height: hover ? "60px" : "46px",
        alignItems: "center",
        borderRadius: "24px",
        background: "var(--glass-widget-bg)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        border: "1px solid var(--glass-widget-border)",
        boxShadow: "var(--glass-widget-shadow)",
        transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <button
        type="button"
        onClick={goHome}
        aria-label={t("home")}
        aria-pressed={homeActive()}
        title={t("home")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: hover ? "13px" : "0px",
          padding: hover ? "10px 16px" : "6px",
          marginRight: hover ? "4px" : "8px",
          borderRadius: "14px",
          cursor: "pointer",
          border: "none",
          flexShrink: 0,
          background: homeActive() ? "var(--accent)" : "transparent",
          boxShadow: homeActive() ? "0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)" : "none",
          transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <span style={{ display: "flex", color: homeActive() ? "#fff" : "var(--foreground)", flexShrink: 0 }}>
          <GridIcon size={hover ? 16 : 14} />
        </span>
        <span
          style={{
            color: "#fff",
            fontSize: "12.5px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            opacity: hover ? 1 : 0,
            maxWidth: hover ? "140px" : "0px",
            overflow: "hidden",
            transition: "opacity 0.2s, max-width 0.3s",
          }}
        >
          {t("home")}
        </span>
      </button>

      {ITEMS.map((item) => {
        const active = itemActive(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => goItem(item)}
            aria-pressed={active}
            title={t(item.labelKey)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: hover ? "13px" : "0px",
              padding: hover ? "10px 16px" : "6px",
              margin: hover ? "0 4px" : "0 2px",
              borderRadius: "14px",
              cursor: "pointer",
              border: "none",
              flexShrink: 0,
              background: active ? "var(--tint-neutral-strong)" : "transparent",
              transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
            }}
          >
            <span style={{ display: "flex", color: "var(--foreground)", flexShrink: 0 }}>
              <item.Icon size={hover ? 16 : 14} />
            </span>
            <span
              style={{
                color: "var(--foreground)",
                fontSize: "12.5px",
                fontWeight: 700,
                whiteSpace: "nowrap",
                opacity: hover ? 1 : 0,
                maxWidth: hover ? "140px" : "0px",
                overflow: "hidden",
                transition: "opacity 0.2s, max-width 0.3s",
              }}
            >
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
