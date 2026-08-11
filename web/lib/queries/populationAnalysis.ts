import sql from "@/lib/db";
import type { PopulationRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Classement /population-analysis : population PSA+CGC réelle par carte (pas
// un prix -- cf. db/schema.sql::population_snapshots, [[project_population_analysis]]).
// Même squelette que lib/queries/gradingRoi.ts (candidats chargés en mémoire,
// bornés par `hardCap`, triés + paginés côté JS -- pas de COUNT séparé, cf.
// son commentaire pour la justification) : le volume de cartes avec
// population connue est du même ordre de grandeur que grading_roi_inputs
// (~14k), largement sous le plafond.
//
// `ungradedPrice`/`psa8Price`/`psa9Price`/`psa10Price` viennent de
// `grading_roi_inputs` (déjà matérialisé pour /grading-roi) en LEFT JOIN --
// contexte de valeur affiché à côté de la population. Par défaut c'est
// juste du contexte, jamais un filtre implicite (une carte sans prix gradé
// connu reste dans le classement) -- SAUF si l'appelant fournit
// `priceGrade`/`priceRange` (demande utilisateur 2026-08-10 : d'abord un
// simple seuil mini, puis des tranches fixes -- "10-50, 50-100, 100-250...
// 10k+") et/ou `popRange` (même jour, même mécanique mais sur `pop_total` --
// "pop 50, pop 100... plus de pop 2000"), auquel cas le filtre est appliqué
// en SQL (pas en JS après coup) pour rester correct même si le nombre de
// candidats dépasse un jour `hardCap`.
//
// Exclusion PERMANENTE (pas un filtre désactivable) : Common/Uncommon/Promo
// + sets pré-release/variantes Manga côté One Piece, cf.
// `_EXCLUDE_LOW_INTEREST_ITEMS_SQL` ci-dessous -- demande utilisateur, un
// pop_total de 2-3 sur ces cartes ne signale rien (personne ne les envoie
// en gradation), pas une vraie rareté.
// ─────────────────────────────────────────────────────────────────────────────

interface RawRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: string;
  language: string;
  setCode: string | null;
  code: string | null;
  rarity: string | null;
  ungradedPrice: number | null;
  psa8Price: number | null;
  psa9Price: number | null;
  psa10Price: number | null;
  capturedAt: string;
  popGrade6: number;
  popGrade7: number;
  popGrade8: number;
  popGrade9: number;
  popGrade10: number;
  popTotal: number;
}

function toRow(r: RawRow): PopulationRow {
  return {
    itemId: r.itemId,
    name: r.name,
    imageUrl: r.imageUrl,
    tcg: r.tcg as Tcg,
    language: r.language,
    setCode: r.setCode,
    code: r.code,
    rarity: r.rarity,
    ungradedPrice: r.ungradedPrice,
    psa8Price: r.psa8Price,
    psa9Price: r.psa9Price,
    psa10Price: r.psa10Price,
    population: {
      capturedAt: r.capturedAt,
      popGrade6: r.popGrade6,
      popGrade7: r.popGrade7,
      popGrade8: r.popGrade8,
      popGrade9: r.popGrade9,
      popGrade10: r.popGrade10,
      popTotal: r.popTotal,
    },
    // Placeholders -- remplacés par `withPercentiles` une fois l'ensemble
    // filtré complet connu (cf. commentaire sur PopulationRow.grade10Percentile).
    grade10Percentile: 0,
    totalPercentile: 0,
  };
}

// Rang percentile (0..1) de chaque carte au sein de `rows` pour popGrade10 et
// popTotal -- cf. commentaire de PopulationRow.grade10Percentile pour le
// pourquoi (min-max linéaire écrasé par la queue longue de la distribution).
// `rows.length <= 1` : rang neutre (0) plutôt qu'une division par zéro.
function withPercentiles(rows: PopulationRow[]): PopulationRow[] {
  if (rows.length <= 1) return rows.map((r) => ({ ...r, grade10Percentile: 0, totalPercentile: 0 }));
  const rankOf = (key: "popGrade10" | "popTotal") => {
    const byValue = [...rows].sort((a, b) => a.population[key] - b.population[key]);
    const rank = new Map<number, number>();
    byValue.forEach((r, i) => rank.set(r.itemId, i / (byValue.length - 1)));
    return rank;
  };
  const grade10Rank = rankOf("popGrade10");
  const totalRank = rankOf("popTotal");
  return rows.map((r) => ({
    ...r,
    grade10Percentile: grade10Rank.get(r.itemId) ?? 0,
    totalPercentile: totalRank.get(r.itemId) ?? 0,
  }));
}

// Paliers de prix proposés au filtre -- volontairement restreint à
// loose/PSA8/9/10 (demande utilisateur), pas les 6 grades de
// price_snapshots.grade (PSA7/9.5 exclus, pas demandés).
export type PopulationPriceGrade = "ungraded" | "psa8" | "psa9" | "psa10";

// Colonne `grading_roi_inputs` correspondante -- un seul point de vérité
// pour la correspondance grade -> colonne, réutilisé par le fragment SQL
// ci-dessous ET par la page (validation du paramètre d'URL).
export const POPULATION_PRICE_GRADES: readonly PopulationPriceGrade[] = ["ungraded", "psa8", "psa9", "psa10"];

// Tranches de prix proposées au filtre (demande utilisateur) -- `max: null`
// sur la dernière tranche = pas de plafond ("10k+"). Un seul point de vérité
// (aussi réutilisé par la page pour valider/étiqueter le paramètre d'URL,
// cf. PRICE_RANGES ré-exporté).
export interface PopulationPriceRange {
  min: number;
  max: number | null;
}

export const POPULATION_PRICE_RANGES: readonly PopulationPriceRange[] = [
  { min: 10, max: 50 },
  { min: 50, max: 100 },
  { min: 100, max: 250 },
  { min: 250, max: 500 },
  { min: 500, max: 1000 },
  { min: 1000, max: 2500 },
  { min: 2500, max: 5000 },
  { min: 5000, max: 10000 },
  { min: 10000, max: null },
];

// Pas d'accès dynamique au nom de colonne (`lp[\`${priceGrade}_price\`]`) --
// un branchement explicite par grade reste aussi court et type-safe (même
// principe que `counts()` dans lib/queries/gradingRoi.ts).
function priceFilterFragment(priceGrade: PopulationPriceGrade, range?: PopulationPriceRange) {
  if (!range) return sql``;
  const { min, max } = range;
  switch (priceGrade) {
    case "psa8":
      return max != null ? sql`AND lp.psa8_price >= ${min} AND lp.psa8_price <= ${max}` : sql`AND lp.psa8_price >= ${min}`;
    case "psa9":
      return max != null ? sql`AND lp.psa9_price >= ${min} AND lp.psa9_price <= ${max}` : sql`AND lp.psa9_price >= ${min}`;
    case "psa10":
      return max != null ? sql`AND lp.psa10_price >= ${min} AND lp.psa10_price <= ${max}` : sql`AND lp.psa10_price >= ${min}`;
    case "ungraded":
    default:
      return max != null ? sql`AND lp.ungraded_price >= ${min} AND lp.ungraded_price <= ${max}` : sql`AND lp.ungraded_price >= ${min}`;
  }
}

// Tranches de POPULATION proposées au filtre (demande utilisateur : "pop 50,
// pop 100, pop 200, pop 500, pop 1000, pop 2000, plus de pop 2000") -- même
// mécanique que POPULATION_PRICE_RANGES (min/max, dernière tranche ouverte),
// mais porte sur `pop_total` (colonne "Total" -- la population TOUTES notes
// confondues, cf. schéma) plutôt que sur un grade précis : l'utilisateur n'a
// mentionné aucun grade pour ce filtre-ci, contrairement au filtre de prix
// où loose/PSA8/9/10 étaient explicitement nommés.
export interface PopulationCountRange {
  min: number;
  max: number | null;
}

export const POPULATION_COUNT_RANGES: readonly PopulationCountRange[] = [
  { min: 0, max: 50 },
  { min: 50, max: 100 },
  { min: 100, max: 200 },
  { min: 200, max: 500 },
  { min: 500, max: 1000 },
  { min: 1000, max: 2000 },
  { min: 2000, max: null },
];

function popCountFilterFragment(range?: PopulationCountRange) {
  if (!range) return sql``;
  const { min, max } = range;
  return max != null ? sql`AND l.pop_total >= ${min} AND l.pop_total <= ${max}` : sql`AND l.pop_total >= ${min}`;
}

// Exclusion permanente des cartes "que personne n'envoie en gradation"
// (demande utilisateur -- pas un pill désactivable comme les autres
// filtres). Trois volets, chacun vérifié en base avant d'être ajouté (pas
// de supposition) :
//
// 1. Common/Uncommon (Pokémon + One Piece, 2026-08-10) : pop_total moyen
//    105/56 Pokémon, 5/4 One Piece, contre 995+ dès Holo Rare côté Pokémon
//    et 26+ dès Rare côté One Piece -- écart net sur les deux TCG.
// 2. Promo (Pokémon uniquement -- "Promo" comme valeur de `rarity` n'existe
//    que côté Pokémon dans nos données ; One Piece n'a pas cette rareté,
//    cf. point 3). `rarity IS NULL` reste ADMIS (carte pas encore classée,
//    même raisonnement que le filtre équivalent côté pricecharting.py) --
//    seule une valeur explicitement connue est exclue.
// 3. One Piece uniquement, deux volets supplémentaires demandés le même
//    jour ("les promo et aussi les manga dans One Piece") :
//    - Sets pré-release/release-event (One Piece n'a pas de rareté "Promo"
//      dédiée -- ces cartes promo y sont identifiées par set_code, pas par
//      rareté, ex. `one-piece-kingdoms-of-intrigue-pre-release-cards`).
//      Repérées en base : même après l'exclusion Common/Uncommon, 8 Super
//      Rare + 4 Leader de ces sets restaient dans le classement avec un
//      pop_total moyen de 1-27 -- même signal "personne ne grade ça" que
//      les deux premiers volets.
//    - Variantes "[Manga]" (alternate art façon manga plutôt qu'anime,
//      identifiées dans le NOM de la carte, pas un champ dédié) : 2 cartes
//      seulement en base, pop_total 1-3 chacune.
const _EXCLUDE_LOW_INTEREST_ITEMS_SQL = sql`
  AND (i.rarity IS NULL OR i.rarity NOT IN ('Common', 'Uncommon', 'Promo'))
  AND NOT (i.tcg = 'one-piece' AND (i.set_code ILIKE '%pre-release%' OR i.set_code ILIKE '%release-event%'))
  AND NOT (i.tcg = 'one-piece' AND i.name ILIKE '%manga%')
`;

async function fetchCandidates({
  tcg,
  priceGrade = "ungraded",
  priceRange,
  popRange,
  search,
  hardCap = 20000,
}: {
  tcg?: Tcg;
  priceGrade?: PopulationPriceGrade;
  priceRange?: PopulationPriceRange;
  popRange?: PopulationCountRange;
  search?: string;
  hardCap?: number;
}): Promise<PopulationRow[]> {
  const rows = await sql<RawRow[]>`
    WITH latest_pop AS (
      SELECT DISTINCT ON (item_id) *
      FROM population_snapshots
      ORDER BY item_id, captured_at DESC
    ), latest_price AS (
      SELECT DISTINCT ON (item_id) item_id, ungraded_price, psa8_price, psa9_price, psa10_price
      FROM grading_roi_inputs
      ORDER BY item_id, captured_at DESC
    )
    SELECT
      i.id::int4                AS "itemId",
      i.name,
      i.image_url               AS "imageUrl",
      i.tcg,
      i.language,
      i.set_code                AS "setCode",
      i.code,
      i.rarity,
      lp.ungraded_price::float8 AS "ungradedPrice",
      lp.psa8_price::float8     AS "psa8Price",
      lp.psa9_price::float8     AS "psa9Price",
      lp.psa10_price::float8    AS "psa10Price",
      l.captured_at::text       AS "capturedAt",
      l.pop_grade6::int4        AS "popGrade6",
      l.pop_grade7::int4        AS "popGrade7",
      l.pop_grade8::int4        AS "popGrade8",
      l.pop_grade9::int4        AS "popGrade9",
      l.pop_grade10::int4       AS "popGrade10",
      l.pop_total::int4         AS "popTotal"
    FROM latest_pop l
    JOIN items i ON i.id = l.item_id
    LEFT JOIN latest_price lp ON lp.item_id = l.item_id
    WHERE 1=1
      ${_EXCLUDE_LOW_INTEREST_ITEMS_SQL}
      ${tcg ? sql`AND i.tcg = ${tcg}` : sql``}
      ${search?.trim() ? sql`AND i.name ILIKE ${"%" + search.trim() + "%"}` : sql``}
      ${priceFilterFragment(priceGrade, priceRange)}
      ${popCountFilterFragment(popRange)}
    ORDER BY i.id
    LIMIT ${hardCap}
  `;

  return rows.map(toRow);
}

export type PopulationSort =
  | "psa10_asc"
  | "psa10_desc"
  | "total_asc"
  | "total_desc"
  | "language_asc"
  | "language_desc"
  | "ungradedPrice_asc"
  | "ungradedPrice_desc"
  | "psa10Price_asc"
  | "psa10Price_desc";

// Nulls (pas de prix connu pour cette carte à ce grade) toujours en fin de
// classement, quel que soit le sens du tri -- contrairement à popGrade10 où
// 0 est une vraie donnée (cf. commentaire du tri par défaut plus bas), un
// prix manquant n'a pas de position numérique sensée : ni "le moins cher"
// ni "le plus cher".
function comparePrice(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

// "Raw" (ungraded) et PSA10 triables (demande utilisateur 2026-08-11, clic
// sur l'en-tête de ces deux colonnes prix) -- même mécanique SortHeader
// que psa10_asc/desc (qui trient sur popGrade10, la POPULATION, pas le
// prix -- noms distincts pour ne pas confondre les deux, cf.
// PopulationAnalysisTable).
function sortRows(rows: PopulationRow[], sort?: PopulationSort): PopulationRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "psa10_desc":
      return sorted.sort((a, b) => b.population.popGrade10 - a.population.popGrade10);
    case "total_asc":
      return sorted.sort((a, b) => a.population.popTotal - b.population.popTotal);
    case "total_desc":
      return sorted.sort((a, b) => b.population.popTotal - a.population.popTotal);
    case "language_asc":
      return sorted.sort((a, b) => a.language.localeCompare(b.language) || a.population.popGrade10 - b.population.popGrade10);
    case "language_desc":
      return sorted.sort((a, b) => b.language.localeCompare(a.language) || a.population.popGrade10 - b.population.popGrade10);
    case "ungradedPrice_asc":
      return sorted.sort((a, b) => comparePrice(a.ungradedPrice, b.ungradedPrice, 1));
    case "ungradedPrice_desc":
      return sorted.sort((a, b) => comparePrice(a.ungradedPrice, b.ungradedPrice, -1));
    case "psa10Price_asc":
      return sorted.sort((a, b) => comparePrice(a.psa10Price, b.psa10Price, 1));
    case "psa10Price_desc":
      return sorted.sort((a, b) => comparePrice(a.psa10Price, b.psa10Price, -1));
    case "psa10_asc":
    default:
      // Défaut : le plus rare en PSA 10 en premier (y compris 0 -- une carte
      // jamais vue en Gem Mint est un signal de rareté à part entière, pas
      // un manque de donnée -- popTotal > 0 garantit déjà qu'elle a été
      // gradée à un autre palier).
      return sorted.sort((a, b) => a.population.popGrade10 - b.population.popGrade10);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrégats pour la vue "analytique" (demande utilisateur 2026-08-11 : critères
// de sélection et listing séparés à l'écran + heatmap/graphe). Calculés sur
// l'ensemble filtré COMPLET (`sorted`, avant la pagination) plutôt que sur la
// seule page courante -- une médiane ou un histogramme qui changerait de page
// en page serait trompeur. Coût nul : le tableau complet est déjà en mémoire
// pour le tri (cf. commentaire d'en-tête sur `hardCap`).
// ─────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PopulationHistogramBucket {
  range: PopulationCountRange;
  count: number;
}

// Heatmap de CAPITALISATION par grade (demande utilisateur 2026-08-11, colonne
// "analyse" de gauche) -- PAS un comptage de population comme l'ancien heatmap
// grade×TCG retiré la veille (jugé redondant avec celui déjà présent dans le
// tableau) : ici chaque cellule = Σ (population à ce grade × prix à ce grade)
// sur l'ensemble filtré, un proxy de "combien de valeur $ est immobilisée à ce
// palier de note". Limité à 8/9/10 -- ce sont les seuls grades pour lesquels on
// a un prix (grading_roi_inputs ne couvre que ungraded/psa8/psa9/psa10, cf.
// POPULATION_PRICE_GRADES) ; les grades 6/7 ont une population mais aucun prix
// connu, donc aucune capitalisation calculable. Une carte sans prix à un grade
// donné contribue 0 à cette grille (pas d'estimation), plutôt que d'être
// exclue du dénominateur -- la métrique reste une somme, pas une moyenne.
const CAP_GRADES = [8, 9, 10] as const;
export type PopulationCapGrade = (typeof CAP_GRADES)[number];

const CAP_PRICE_KEY: Record<PopulationCapGrade, "psa8Price" | "psa9Price" | "psa10Price"> = {
  8: "psa8Price",
  9: "psa9Price",
  10: "psa10Price",
};
const CAP_POP_KEY: Record<PopulationCapGrade, "popGrade8" | "popGrade9" | "popGrade10"> = {
  8: "popGrade8",
  9: "popGrade9",
  10: "popGrade10",
};

export interface PopulationCapHeatmapCell {
  tcg: Tcg;
  grade: PopulationCapGrade;
  totalCap: number;
}

function computeCapHeatmap(rows: PopulationRow[]): PopulationCapHeatmapCell[] {
  const tcgs: Tcg[] = ["pokemon", "one-piece"];
  const cells: PopulationCapHeatmapCell[] = [];
  for (const tcg of tcgs) {
    const tcgRows = rows.filter((r) => r.tcg === tcg);
    for (const grade of CAP_GRADES) {
      const priceKey = CAP_PRICE_KEY[grade];
      const popKey = CAP_POP_KEY[grade];
      const totalCap = tcgRows.reduce((sum, r) => {
        const price = r[priceKey];
        return price == null ? sum : sum + price * r.population[popKey];
      }, 0);
      cells.push({ tcg, grade, totalCap });
    }
  }
  return cells;
}

// Corrélation population × prix PSA10 (demande utilisateur 2026-08-11, même
// message que le heatmap ci-dessus) -- PSA10 spécifiquement (pas les autres
// grades) : c'est la paire population/prix la plus complète en base et déjà
// mise en avant partout ailleurs sur cette page (colonne triable, chiffre-clé
// "Prix médian PSA 10"). Pearson sur les valeurs LOG-transformées, pas les
// valeurs brutes -- population et prix suivent tous les deux une distribution
// à longue traîne (quelques cartes à population/prix énorme, l'immense
// majorité petite) ; une corrélation linéaire sur les valeurs brutes serait
// dominée par une poignée d'outliers et ne refléterait pas la relation
// "typique" carte par carte. `points` échantillonné (max
// CORRELATION_MAX_POINTS) pour le nuage de points -- pas les N premières
// lignes (biaiserait vers l'ordre de tri actuel de la table), un pas régulier
// sur l'ensemble trié par population pour rester représentatif sur toute la
// plage, tout en gardant `r`/`sampleSize` calculés sur l'ensemble filtré
// COMPLET (jamais juste l'échantillon affiché).
const CORRELATION_MAX_POINTS = 400;

export interface PopulationCorrelationPoint {
  pop: number;
  price: number;
}

export interface PopulationCorrelation {
  r: number | null;
  sampleSize: number;
  points: PopulationCorrelationPoint[];
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

function computeCorrelation(rows: PopulationRow[]): PopulationCorrelation {
  const valid = rows.filter((r) => r.psa10Price != null && r.psa10Price > 0 && r.population.popGrade10 > 0);
  const r = pearson(
    valid.map((row) => Math.log(row.population.popGrade10)),
    valid.map((row) => Math.log(row.psa10Price as number))
  );

  const sortedByPop = [...valid].sort((a, b) => a.population.popGrade10 - b.population.popGrade10);
  const step = Math.max(1, Math.floor(sortedByPop.length / CORRELATION_MAX_POINTS));
  const points: PopulationCorrelationPoint[] = [];
  for (let i = 0; i < sortedByPop.length; i += step) {
    points.push({ pop: sortedByPop[i].population.popGrade10, price: sortedByPop[i].psa10Price as number });
  }

  return { r, sampleSize: valid.length, points };
}

export interface PopulationStats {
  medianPopTotal: number;
  medianPsa10Price: number | null;
  histogram: PopulationHistogramBucket[];
  capHeatmap: PopulationCapHeatmapCell[];
  correlation: PopulationCorrelation;
}

function computeStats(rows: PopulationRow[]): PopulationStats {
  const popTotals = rows.map((r) => r.population.popTotal);
  const psa10Prices = rows.map((r) => r.psa10Price).filter((p): p is number => p != null);
  return {
    medianPopTotal: median(popTotals),
    medianPsa10Price: psa10Prices.length ? median(psa10Prices) : null,
    histogram: POPULATION_COUNT_RANGES.map((range) => ({
      range,
      count: rows.filter(
        (r) => r.population.popTotal >= range.min && (range.max == null || r.population.popTotal <= range.max)
      ).length,
    })),
    capHeatmap: computeCapHeatmap(rows),
    correlation: computeCorrelation(rows),
  };
}

export interface PopulationRankingParams {
  tcg?: Tcg;
  sort?: PopulationSort;
  priceGrade?: PopulationPriceGrade;
  priceRange?: PopulationPriceRange;
  popRange?: PopulationCountRange;
  search?: string;
  limit?: number;
  page?: number;
}

export interface PopulationRankingResult {
  rows: PopulationRow[];
  totalCount: number;
  stats: PopulationStats;
}

export async function getPopulationRanking({
  tcg,
  sort = "psa10_asc",
  priceGrade = "ungraded",
  priceRange,
  popRange,
  search,
  limit = 50,
  page = 1,
}: PopulationRankingParams): Promise<PopulationRankingResult> {
  const candidates = await fetchCandidates({ tcg, priceGrade, priceRange, popRange, search });
  const sorted = sortRows(candidates, sort);
  const ranked = withPercentiles(sorted);
  const offset = (Math.max(1, page) - 1) * limit;
  return {
    rows: ranked.slice(offset, offset + limit),
    totalCount: ranked.length,
    stats: computeStats(ranked),
  };
}
