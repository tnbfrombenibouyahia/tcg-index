import type { PopulationCountRange, PopulationPriceRange } from "@/lib/queries/populationAnalysis";

// ─────────────────────────────────────────────────────────────────────────────
// Étiquettes de tranches (prix/population), extraites dans un fichier À PART
// -- import `type`-only depuis lib/queries/populationAnalysis.ts (effacé à la
// compilation, cf. commentaire ci-dessous), jamais les constantes RUNTIME de
// ce module (qui, elles, importent `sql`/`postgres` -- casserait le bundle
// navigateur si un Client Component les important, directement ou via un
// re-export en cascade). PopulationSummary.tsx ("use client") a besoin de
// `popRangeLabel` pour l'histogramme -- d'où ce fichier pur, sans aucun
// import runtime serveur, importable des deux côtés (Server ET Client
// Components) sans risque.
// ─────────────────────────────────────────────────────────────────────────────

// Compacte 1000+ en "1k"/"2.5k" (pas de décimale superflue sur les ronds) --
// même esprit que formatUsdCompact (lib/format.ts) mais sans le symbole $
// dupliqué à chaque borne d'une tranche ("$1k–2.5k", pas "$1k–$2.5k").
function formatRangeBound(n: number): string {
  if (n < 1000) return String(n);
  const thousands = n / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

export function priceRangeLabel(range: PopulationPriceRange): string {
  const min = formatRangeBound(range.min);
  return range.max == null ? `$${min}+` : `$${min}–${formatRangeBound(range.max)}`;
}

export function popRangeLabel(range: PopulationCountRange): string {
  const min = formatRangeBound(range.min);
  return range.max == null ? `${min}+` : `${min}–${formatRangeBound(range.max)}`;
}
