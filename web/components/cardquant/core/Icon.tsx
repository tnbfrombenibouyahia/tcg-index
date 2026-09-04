import { Circle, type LucideIcon } from "lucide-react";
import {
  Search,
  Bell,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ArrowUpRight,
  X,
  Check,
  GitCompareArrows,
  Target,
  Activity,
  Layers,
  AlertTriangle,
  Mail,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Port du composant Icon du handoff CardQuant/Slabline (cf. mémoire projet
// "cardquant-rebrand") : le prototype charge chaque glyphe lucide à la volée
// depuis unpkg.com/lucide-static via un masque CSS -- pratique pour un
// prototype jetable, mais une dépendance réseau au runtime n'a rien à faire
// dans une app en prod (offline, CSP, latence). On utilise ici le paquet
// `lucide-react` (déjà en dépendance, cf. package.json) avec un registre
// explicite plutôt qu'un import dynamique par nom : tree-shakeable, et une
// icône manquante est une erreur TypeScript à la compilation plutôt qu'une
// icône silencieusement absente en prod.
//
// Registre volontairement restreint aux glyphes utilisés par les écrans déjà
// migrés (TopNav + Dashboard) -- l'étendre au fur et à mesure des écrans
// suivants plutôt que d'importer tout lucide-react d'un coup.
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, LucideIcon> = {
  search: Search,
  bell: Bell,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "chevron-down": ChevronDown,
  "arrow-up-right": ArrowUpRight,
  x: X,
  check: Check,
  "git-compare-arrows": GitCompareArrows,
  target: Target,
  activity: Activity,
  layers: Layers,
  "triangle-alert": AlertTriangle,
  mail: Mail,
  "key-round": KeyRound,
  "shield-check": ShieldCheck,
};

export interface IconProps {
  name?: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name = "circle", size = 16, color = "currentColor", className, style }: IconProps) {
  const Cmp = REGISTRY[name] ?? Circle;
  return (
    <Cmp
      aria-hidden="true"
      width={size}
      height={size}
      color={color}
      strokeWidth={1.5}
      className={className}
      style={{ flex: "none", ...style }}
    />
  );
}
