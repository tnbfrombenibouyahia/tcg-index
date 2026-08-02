import sql from "@/lib/db";
import type { Grade } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Recherche de "la même carte" dans l'autre langue, pour la ligne de
// comparaison du graphique de ventes (demande utilisateur). Rien ne relie
// explicitement un item EN à son équivalent JP en base -- set_code et code
// vivent dans des référentiels totalement différents entre les deux langues
// (cf. mémoire projet jp_singles_tracking). Le seul terrain commun fiable est
// le nom + la rareté, tous deux normalisés en casse/espaces.
//
// Match volontairement strict : nom ET rareté doivent être non-nuls et égaux,
// ET il ne doit exister qu'UN SEUL candidat dans l'autre langue. Un nom
// ambigu (plusieurs candidats) ou une rareté manquante d'un côté ou de
// l'autre --> pas de comparaison plutôt que de risquer de superposer le prix
// de la mauvaise variante (ex. JP "Umbreon V" Secret Rare n'a pas
// d'équivalent EN exact -- les Full Art EN sont nommés différemment, donc
// exclus naturellement par le match sur le nom).
// ─────────────────────────────────────────────────────────────────────────────

export interface LanguageComparePoint {
  capturedAt: string;
  price: number;
}

export interface LanguageCompareResult {
  matched: boolean;
  language: string | null;
  itemId: number | null;
  points: LanguageComparePoint[];
}

export async function getLanguageComparison(params: {
  tcg: string;
  name: string;
  rarity: string | null;
  language: string;
  grade: Grade;
}): Promise<LanguageCompareResult> {
  if (!params.rarity) {
    return { matched: false, language: null, itemId: null, points: [] };
  }

  const candidates = await sql<{ id: number; language: string }[]>`
    SELECT id::int AS id, language
    FROM items
    WHERE tcg = ${params.tcg}
      AND category = 'single'
      AND language <> ${params.language}
      AND rarity IS NOT NULL
      AND lower(trim(name)) = lower(trim(${params.name}))
      AND lower(trim(rarity)) = lower(trim(${params.rarity}))
  `;

  if (candidates.length !== 1) {
    return { matched: false, language: null, itemId: null, points: [] };
  }

  const match = candidates[0];

  const points = await sql<LanguageComparePoint[]>`
    SELECT captured_at::text AS "capturedAt", price::float8 AS price
    FROM price_snapshots
    WHERE item_id = ${match.id} AND grade = ${params.grade}
    ORDER BY captured_at ASC
  `;

  return { matched: true, language: match.language, itemId: match.id, points };
}
