import { unstable_cache } from "next/cache";
import sql from "@/lib/db";
import type { Tcg } from "@/lib/constants";
import { SYNC_DATA_REVALIDATE_SECONDS, SYNC_DATA_TAG } from "@/lib/queryCache";

// ─────────────────────────────────────────────────────────────────────────────
// Vue "Par set" du Catalogue CardQuant (demande utilisateur 2026-09-10 :
// "une page comme PokéCardex avec des sets par génération et les images des
// sets", cf. mémoire projet [[cardquant-rebrand]]). Regroupe les sets par ère
// (Pokémon) ou par année de sortie (One Piece -- pas d'équivalent "bloc"
// connu, même simplification déjà documentée par
// lib/queries/setAnalysis.ts::SetSummary : `items` n'a qu'une release_date,
// aucune notion de "série"/génération en base).
//
// Logos : uniquement les sets Pokémon mappés par le backfill PokéCardex (cf.
// db/schema.sql::sets, ingestion/sources/pokecardex_mapping.py). One Piece et
// les sets Pokémon pas (encore) mappés retombent sur une tuile texte
// (set_code) -- même repli que CatalogueGrid.tsx pour les cartes elles-mêmes.
// ─────────────────────────────────────────────────────────────────────────────

export interface SetBrowseRow {
  setCode: string;
  tcg: Tcg;
  language: string;
  displayName: string;
  logoUrl: string | null;
  itemCount: number;
  releaseYear: number | null;
}

export interface SetGenerationGroup {
  label: string;
  sets: SetBrowseRow[];
}

interface PokemonEra {
  minYear: number;
  maxYear: number;
  label: string;
}

// Blocs "génération" Pokémon usuels (Base/Jungle/Fossil ... Scarlet & Violet,
// vocabulaire PokéCardex) dérivés de l'année de sortie MIN par set -- pas de
// colonne "série" en base, cf. commentaire de tête. Bornes larges
// volontairement : un set qui déborde légèrement d'une frontière réelle reste
// dans le bloc le plus proche plutôt que de créer un groupe à part pour lui
// seul.
const POKEMON_ERAS: PokemonEra[] = [
  { minYear: 0, maxYear: 2002, label: "Wizards of the Coast" },
  { minYear: 2003, maxYear: 2006, label: "EX" },
  { minYear: 2007, maxYear: 2008, label: "Diamond & Pearl" },
  { minYear: 2009, maxYear: 2010, label: "Platinum / HeartGold SoulSilver" },
  { minYear: 2011, maxYear: 2013, label: "Black & White" },
  { minYear: 2014, maxYear: 2016, label: "XY" },
  { minYear: 2017, maxYear: 2019, label: "Sun & Moon" },
  { minYear: 2020, maxYear: 2022, label: "Sword & Shield" },
  { minYear: 2023, maxYear: 2025, label: "Scarlet & Violet" },
];
// Au-delà de POKEMON_ERAS (sets plus récents que la dernière borne connue,
// jamais figée en dur au-delà -- un nouveau bloc réel n'a qu'à être ajouté
// ci-dessus le jour venu) : bucket générique plutôt qu'un groupe par année
// qui casserait le ton "par génération" du reste de la liste.
const POKEMON_LATEST_ERA_LABEL = "Génération la plus récente";

function eraLabel(tcg: Tcg, year: number | null): string {
  if (year == null) return "Année inconnue";
  if (tcg === "pokemon") {
    const era = POKEMON_ERAS.find((e) => year >= e.minYear && year <= e.maxYear);
    return era ? era.label : POKEMON_LATEST_ERA_LABEL;
  }
  // One Piece (et tout futur jeu) : pas de découpage par bloc connu, simple
  // regroupement par année de sortie -- même simplification que
  // setAnalysis.ts::SetSummary.generationAvgValue.
  return String(year);
}

// Nom affiché : `sets.name` (vrai nom scrapé PokéCardex) en priorité, repli
// sur le set_code nettoyé (préfixe jeu retiré, tirets -> espaces) pour les
// sets pas encore mappés ou hors Pokémon -- pas de tentative de découper un
// code d'ère (ex. "swsh07-") du reste du nom, trop de faux positifs pour les
// codes qui ne suivent pas ce format (ex. "base-set").
function cleanSetCode(tcg: Tcg, setCode: string): string {
  return setCode.replace(new RegExp(`^${tcg}-`), "").replace(/-/g, " ");
}

interface RawRow {
  setCode: string;
  tcg: string;
  language: string;
  name: string | null;
  logoUrl: string | null;
  itemCount: number;
  releaseYear: number | null;
}

async function getSetsByGenerationUncached({ tcg, language }: { tcg?: Tcg; language?: string }): Promise<SetGenerationGroup[]> {
  const rows = await sql<RawRow[]>`
    SELECT
      i.set_code                                    AS "setCode",
      i.tcg,
      i.language,
      MAX(s.name)                                    AS name,
      MAX(s.logo_url)                                AS "logoUrl",
      COUNT(*)::int4                                 AS "itemCount",
      MIN(EXTRACT(YEAR FROM i.release_date))::int4   AS "releaseYear"
    FROM items i
    LEFT JOIN sets s ON s.tcg = i.tcg AND s.set_code = i.set_code
    WHERE i.set_code IS NOT NULL
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      ${language ? sql`AND i.language = ${language}` : sql``}
    GROUP BY i.set_code, i.tcg, i.language
  `;

  // Regroupement + tri en JS (pas en SQL) : le libellé de groupe dépend du
  // tcg de CHAQUE ligne (POKEMON_ERAS vs année brute pour le reste), pas
  // exprimable proprement en une seule expression SQL portable.
  const groups = new Map<string, { label: string; sortYear: number; sets: SetBrowseRow[] }>();
  for (const r of rows) {
    const rowTcg = r.tcg as Tcg;
    const label = eraLabel(rowTcg, r.releaseYear);
    const set: SetBrowseRow = {
      setCode: r.setCode,
      tcg: rowTcg,
      language: r.language,
      displayName: r.name ?? cleanSetCode(rowTcg, r.setCode),
      logoUrl: r.logoUrl,
      itemCount: r.itemCount,
      releaseYear: r.releaseYear,
    };
    const existing = groups.get(label);
    if (existing) {
      existing.sets.push(set);
      existing.sortYear = Math.max(existing.sortYear, r.releaseYear ?? 0);
    } else {
      groups.set(label, { label, sortYear: r.releaseYear ?? 0, sets: [set] });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => b.sortYear - a.sortYear);
  for (const g of ordered) {
    g.sets.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || a.displayName.localeCompare(b.displayName));
  }
  return ordered.map(({ label, sets }) => ({ label, sets }));
}

// Mise en cache (5 min, cf. lib/queryCache.ts) : même levier que le reste du
// catalogue -- le vocabulaire de sets ne bouge qu'au rythme de l'ingestion.
export const getSetsByGeneration = unstable_cache(getSetsByGenerationUncached, ["sets-by-generation"], {
  revalidate: SYNC_DATA_REVALIDATE_SECONDS,
  tags: [SYNC_DATA_TAG],
});
