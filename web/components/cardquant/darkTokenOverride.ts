// ─────────────────────────────────────────────────────────────────────────────
// Surcharge sombre du design system CardQuant/Slabline (cf. mémoire projet
// "cardquant-rebrand"), reprise TELLE QUELLE du bloc de style inline posé sur
// le conteneur racine de "CardQuant Terminal.dc.html" ET "CardQuant
// Landing.dc.html" dans le handoff -- identique dans les deux fichiers : les
// tokens clairs (styles/cardquant/tokens/colors.css) restent la valeur par
// défaut du design system lui-même (utilisée par ses specimens/guidelines),
// mais les DEUX surfaces produit réelles (Terminal ET Landing) appliquent
// cette même surcharge sombre sur leur conteneur racine. Un seul écran migré
// avec un fond clair serait un bug, pas une variante voulue -- toujours
// importer cette constante plutôt que de retaper le bloc de variables.
// ─────────────────────────────────────────────────────────────────────────────

export const DARK_TOKEN_OVERRIDE: Record<string, string> = {
  "--surface-page": "#000000",
  "--white": "#121412",
  "--surface-card": "#121412",
  "--surface-sunken": "#0A0B0A",
  "--grey-050": "#1A1D1B",
  "--grey-100": "#1A1D1B",
  "--grey-200": "#262927",
  "--grey-300": "#4A514D",
  "--grey-400": "#8A918C",
  "--border-hairline": "#242724",
  "--border-strong": "#343835",
  "--text-strong": "#FFFFFF",
  "--text-body": "#C9CFCB",
  "--text-muted": "#8A918C",
  "--ink-000": "#FFFFFF",
  "--ink-500": "#8A918C",
  "--ink-600": "#9AA29D",
  "--ink-700": "#6E756F",
  "--ink-800": "#1A1D1B",
  "--ink-900": "#0A0B0A",
  "--up-600": "#4EE873",
  "--down-500": "#FF5A72",
  "--down-700": "#FF8A9C",
  "--text-link": "#76FB91",
  "--text-link-hover": "#FFFFFF",
  "--shadow-card": "0 0 0 0 rgba(0,0,0,0)",
  "--viz-grid": "#242724",
};

export function darkOverrideStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    ...DARK_TOKEN_OVERRIDE,
    fontFamily: "var(--font-core)",
    color: "var(--text-body)",
    background: "var(--surface-page)",
    ...extra,
  } as React.CSSProperties;
}
