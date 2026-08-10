// ─────────────────────────────────────────────────────────────────────────────
// Icônes ligne (15×15 par défaut) partagées entre les points de navigation du
// site -- historiquement propres à NavBar.tsx (sidebar), maintenant réutilisées
// telles quelles par WidgetDock (la sidebar a été retirée au profit du dock
// flottant, cf. mémoire projet "project_terminal_redesign" -- même langage
// visuel, juste déplacé en bas d'écran).
// ─────────────────────────────────────────────────────────────────────────────

type IconProps = { size?: number };

export function HomeIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function TransactionsIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="7 16 3 12 7 8" />
      <polyline points="17 8 21 12 17 16" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function BoxIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function PulseIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.5-7L14 19l2.5-7H21" />
    </svg>
  );
}

export function TrendingUpIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function GradingRoiIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function DivergenceIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c4-9 6-9 9 0" />
      <path d="M12 17c2-5 4-9 9-13" />
    </svg>
  );
}

export function LiquidityIcon({ size = 15 }: IconProps) {
  // Stock (barre pleine, en train de se vider) vs flux (flèche sortante) --
  // pas une jauge de vitesse, un stock qui s'écoule.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="16" rx="1" />
      <path d="M14 9h7" />
      <path d="M17 6l4 3-4 3" />
    </svg>
  );
}

export function PopulationIcon({ size = 15 }: IconProps) {
  // Histogramme (barres croissantes) -- une distribution figée par grade,
  // pas une évolution dans le temps (à distinguer de TrendingUpIcon, qui
  // trace une tendance).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V14" />
      <path d="M10 20V10" />
      <path d="M16 20V6" />
      <path d="M22 20V13" />
    </svg>
  );
}

export function GridIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
