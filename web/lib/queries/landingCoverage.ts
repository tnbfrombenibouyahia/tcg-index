import sql from "@/lib/db";
import { EXCLUDE_FILTER } from "./dataCoverage";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Section "Couverture" de la landing CardQuant (cf. mémoire projet
// "cardquant-rebrand") : 4 cartes tcg × langue, remplaçant les chiffres
// d'exemple du mockup ("18 420 cartes"...) par de vrais comptages -- même
// logique que lib/queries/landingStats.ts pour le bandeau de stats existant
// ("demande utilisateur : remplacer les chiffres inventés du mockup par de
// vraies données").
//
// Réutilise EXCLUDE_FILTER de dataCoverage.ts (même définition de "carte
// suivie sérieusement" que /live -- sets fourre-tout et Code Card exclus,
// cf. son commentaire) plutôt que de dupliquer la logique.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageCard {
  tcg: Tcg;
  language: string;
  cardsCount: number;
  setsCount: number;
  slabsTracked: number;
  pricedPct: number; // part des cartes (single) avec un prix ungraded récent (30j)
}

interface CardsRow {
  tcg: string;
  language: string;
  cardsCount: number;
  setsCount: number;
  withRecentPrice: number;
}

interface SlabsRow {
  tcg: string;
  language: string;
  slabsTracked: number;
}

export async function getCoverageCards(): Promise<CoverageCard[]> {
  const [cardsRows, slabsRows] = await Promise.all([
    sql<CardsRow[]>`
      SELECT
        i.tcg, i.language,
        COUNT(*)::int4                          AS "cardsCount",
        COUNT(DISTINCT i.set_code)::int4        AS "setsCount",
        COUNT(DISTINCT ps.item_id)::int4        AS "withRecentPrice"
      FROM items i
      LEFT JOIN price_snapshots ps
        ON ps.item_id = i.id AND ps.grade = 'ungraded' AND ps.captured_at >= CURRENT_DATE - 30
      WHERE i.category = 'single' AND (${EXCLUDE_FILTER})
      GROUP BY i.tcg, i.language
    `,
    sql<SlabsRow[]>`
      SELECT i.tcg, i.language, COUNT(DISTINCT ps.item_id)::int4 AS "slabsTracked"
      FROM population_snapshots ps
      JOIN items i ON i.id = ps.item_id
      GROUP BY i.tcg, i.language
    `,
  ]);

  const slabsByKey = new Map(slabsRows.map((r) => [`${r.tcg}|${r.language}`, r.slabsTracked]));

  return cardsRows
    .map((r) => ({
      tcg: r.tcg as Tcg,
      language: r.language,
      cardsCount: r.cardsCount,
      setsCount: r.setsCount,
      slabsTracked: slabsByKey.get(`${r.tcg}|${r.language}`) ?? 0,
      pricedPct: r.cardsCount > 0 ? (r.withRecentPrice / r.cardsCount) * 100 : 0,
    }))
    // EN avant JP pour chaque jeu, Pokémon avant One Piece -- même ordre que
    // le mockup (coverage: [Pokémon EN, Pokémon JP, One Piece EN, One Piece JP]).
    .sort((a, b) => a.tcg.localeCompare(b.tcg) || (a.language === b.language ? 0 : a.language === "EN" ? -1 : 1));
}
