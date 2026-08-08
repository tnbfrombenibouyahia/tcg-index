import { INTEREST_TIER_LABELS, type InterestTier } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Badge "carte d'intérêt" (SIR/IR/FA/Secret/Chase) -- même pattern que
// SourceBadge (pastille de couleur + libellé), affiché à côté du badge
// rareté existant plutôt qu'en colonne séparée (ne perturbe pas la mise en
// page des tableaux déjà en place). Pokémon uniquement (cf.
// index/interest_tier.py) -- `tier` est `null` pour tout le reste (One
// Piece, scellé, cartes hors tier), auquel cas ce composant ne rend rien
// (pas de badge vide à afficher).
// ─────────────────────────────────────────────────────────────────────────────

interface TierInfo {
  color: string;
  bg: string;
}

const TIER_INFO: Record<InterestTier, TierInfo> = {
  sir: { color: "#be185d", bg: "rgba(190, 24, 93, 0.1)" },
  ir: { color: "#7e22ce", bg: "rgba(126, 34, 206, 0.1)" },
  fa: { color: "#b45309", bg: "rgba(180, 83, 9, 0.1)" },
  secret: { color: "#a16207", bg: "rgba(161, 98, 7, 0.1)" },
  chase: { color: "#0f766e", bg: "rgba(15, 118, 110, 0.1)" },
};

function isInterestTier(tier: string): tier is InterestTier {
  return tier in TIER_INFO;
}

export function InterestTierBadge({ tier, className }: { tier: string | null; className?: string }) {
  if (!tier || !isInterestTier(tier)) return null;
  const info = TIER_INFO[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className ?? ""}`}
      style={{ color: info.color, background: info.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {INTEREST_TIER_LABELS[tier]}
    </span>
  );
}
