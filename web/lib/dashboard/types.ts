// ─────────────────────────────────────────────────────────────────────────────
// Types partagés du dashboard "Terminal" (accueil) -- disposition des 6
// widgets (catalogue/live/tx/under/div/grade), portée depuis la logique du
// mockup "TCG Terminal" (Component.state dans TCG Terminal.dc.html) vers de
// vrais hooks React + persistance localStorage, cf. WidgetShell.tsx et
// TerminalDashboard.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export const WIDGET_IDS = ["catalogue", "live", "tx", "under", "div", "grade"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type WidgetSize = "s" | "m" | "l";

export interface CustomWidgetSize {
  span: number;
  height: number;
}

// Nombre de colonnes (sur 12) occupées par chaque widget selon sa taille --
// mêmes proportions que le mockup (le Live Market est le plus large, le
// Catalogue le plus étroit).
export const SIZE_SPANS: Record<WidgetId, Record<WidgetSize, number>> = {
  catalogue: { s: 3, m: 5, l: 8 },
  live: { s: 5, m: 7, l: 10 },
  tx: { s: 4, m: 6, l: 9 },
  under: { s: 4, m: 6, l: 9 },
  div: { s: 4, m: 6, l: 9 },
  grade: { s: 4, m: 6, l: 9 },
};

export const DEFAULT_MIN_HEIGHT: Record<WidgetSize, number> = {
  s: 260,
  m: 320,
  l: 400,
};

export interface DashboardLayoutState {
  order: WidgetId[];
  sizes: Record<WidgetId, WidgetSize>;
  customSize: Partial<Record<WidgetId, CustomWidgetSize | null>>;
  expanded: WidgetId | null;
}

export const DEFAULT_LAYOUT: DashboardLayoutState = {
  order: ["catalogue", "live", "tx", "under", "div", "grade"],
  sizes: { catalogue: "m", live: "m", tx: "m", under: "m", div: "m", grade: "m" },
  customSize: {},
  expanded: null,
};

export const LAYOUT_STORAGE_KEY = "tcg-terminal-layout";
