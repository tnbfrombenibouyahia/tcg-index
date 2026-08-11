import type { Grade, IndexKind, Tcg } from "./constants";

export interface IndexPoint {
  capturedAt: string;
  value: number;
  constituents: number;
}

export interface VolumePoint {
  capturedAt: string;
  salesCount: number;
  salesValue: number;
}

export interface IndexSummary {
  code: string;
  tcg: Tcg;
  kind: IndexKind;
  label: string;
  latest: IndexPoint | null;
  previous: IndexPoint | null;
  changePct: number | null;
  history: IndexPoint[];
  volume: VolumePoint[];
}

export interface IndicesResponse {
  asOf: string | null;
  indices: IndexSummary[];
}

export interface ItemSummary {
  id: number;
  name: string;
  tcg: Tcg;
  category: "sealed" | "single";
  setCode: string | null;
  code: string | null;
  imageUrl: string | null;
  language: string;
  rarity: string | null;
  interestTier: string | null;
}

export interface SaleRow {
  id: number;
  saleDate: string;
  price: number;
  currency: string;
  grade: Grade;
  marketplace: string;
  title: string | null;
  item: ItemSummary;
}

export interface SalesResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  sales: SaleRow[];
  // Agrégats sur l'ensemble filtré (pas juste la page courante) -- bandeau
  // de stats de /transactions. Calculés dans la même requête COUNT que
  // totalCount (cf. lib/queries/sales.ts), donc "gratuits" partout ailleurs
  // (ex. /api/sales pour une seule carte) même quand ils ne sont pas utilisés.
  totalVolume: number;
  avgPrice: number;
  maxPrice: number;
}

export interface SetOption {
  setCode: string;
  releaseDate: string | null;
  itemCount: number;
}

export interface SalesFiltersResponse {
  sets: SetOption[];
  grades: readonly Grade[];
  rarities: string[];
}

export type SyncStep =
  | "items"
  | "prices"
  | "grades_sales"
  | "index"
  | "sealed_ev"
  | "volume"
  | "undervalued"
  | "grading_roi"
  | "active_listings"
  | "population";
export type SyncRunStatus = "running" | "success" | "error";

export interface SyncRun {
  id: number;
  runType: "daily" | "tier";
  tier: string | null;
  step: SyncStep;
  tcg: Tcg | null;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  rowsWritten: number | null;
  detail: string | null;
}

export type FreshnessSegment = "items" | "sealed" | "single" | "grading";

export interface FreshnessCell {
  tcg: Tcg;
  segment: FreshnessSegment;
  lastUpdated: string | null;
  constituents: number | null;
}

// Un jour par case, façon calendrier de contributions GitHub (demande
// utilisateur 2026-08-11, "dans le creux qui reste") -- "ok" = au moins un
// run réussi ce jour-là et aucune erreur, "error" = au moins une erreur,
// "none" = aucune ligne sync_runs ce jour-là (cron manqué ou avant le début
// du suivi). Toujours un jour calendaire, y compris les jours sans donnée --
// cf. getDailyHealth (lib/queries/syncStatus.ts) qui comble les trous.
export type DailyHealthStatus = "ok" | "error" | "none";

export interface DailyHealthCell {
  date: string; // 'YYYY-MM-DD', UTC
  status: DailyHealthStatus;
}

export interface SyncStatusResponse {
  runningNow: SyncRun[];
  recentRuns: SyncRun[];
  recentErrors: SyncRun[];
  freshness: FreshnessCell[];
  dailyHealth: DailyHealthCell[];
  fetchedAt: string;
}

// Recap de couverture (demande utilisateur 2026-08-09, page /live) :
// combien d'items on référence vs. combien ont réellement du prix/rareté/
// image, par tcg × langue × catégorie -- pas de la fraîcheur (FreshnessCell,
// "quand"), de la complétude ("combien"). Sert au debug direct : un ratio
// bas explique tout de suite pourquoi une carte donnée n'a pas de prix.
//
// `tracked*` (ajouté 2026-08-09, même jour) sépare deux questions qu'un
// simple withAnyPrice/totalItems conflait et qui induisait en erreur :
// "combien de cartes suit-on activement" vs "parmi celles qu'on suit,
// combien ont un prix". Pour les singles Pokémon, `trackedItems` = celles
// avec interest_tier renseigné (scope volontaire, cf. index/interest_tier.py
// + [[project_price_sync_scope]] -- les commons ne sont délibérément pas
// pricées pour contenir la croissance du stockage). Pour tout le reste
// (scellé, singles One Piece -- interest_tier n'existe pas hors Pokémon),
// `trackedItems === totalItems` : rien n'est exclu par design, un ratio bas
// là y signale un vrai trou de couverture, pas un choix de scope.
export interface DataCoverageRow {
  tcg: Tcg;
  language: string;
  category: "sealed" | "single";
  totalItems: number;
  withAnyPrice: number;
  withRecentPrice: number; // captured_at dans les 30 derniers jours
  withRarity: number;
  withImage: number;
  trackedItems: number;
  trackedWithPrice: number;
  trackedWithRecentPrice: number;
}

export type SealedEvMode = "total" | "top10";

export interface SealedEvRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  capturedAt: string;
  boxPrice: number;
  boxPriceSource: "sales_median" | "pricecharting_aggregate";
  boxSalesUsed: number;
  boxReliabilityScore: number | null;
  singlesCount: number;
  singlesTotalValue: number;
  singlesTop10Value: number;
  evRatioTotal: number;
  evRatioTop10: number;
}

export interface DailyTimelinePoint {
  date: string;
  count: number;
  avgPrice: number | null;
}

export interface DivergenceRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  rarity: string | null;
  volumeCurrent: number;
  volumePrevious: number;
  priceCurrent: number;
  pricePrevious: number;
  priceChangePct: number;
  volumeChangePct: number;
  divergenceScore: number;
}

export interface UndervaluedRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  rarity: string | null;
  capturedAt: string;
  packPrice: number | null;
  pullRate: number | null;
  pullCost: number | null;
  characterMultiplier: number | null;
  theoreticalValue: number;
  marketPrice: number;
  undervaluedScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page catalogue / fiche carte (recherche générale par nom ou numéro +
// "analyse totale") -- cf. lib/queries/itemDetail.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemPriceEntry {
  grade: Grade;
  price: number;
  currency: string;
  capturedAt: string;
  volume: number | null;
  source: string;
}

// Sous-ensembles de UndervaluedRow / SealedEvRow sans les champs déjà portés
// par ItemDetail (itemId, name, imageUrl, tcg, language, setCode...) --
// évite la duplication quand ces calculs sont affichés dans le contexte
// d'une fiche carte déjà identifiée.
export interface UndervaluedCalc {
  capturedAt: string;
  packPrice: number | null;
  pullRate: number | null;
  pullCost: number | null;
  characterMultiplier: number | null;
  theoreticalValue: number;
  marketPrice: number;
  undervaluedScore: number;
}

export interface SealedEvCalc {
  capturedAt: string;
  boxPrice: number;
  boxPriceSource: "sales_median" | "pricecharting_aggregate";
  boxSalesUsed: number;
  boxReliabilityScore: number | null;
  singlesCount: number;
  singlesTotalValue: number;
  singlesTop10Value: number;
  evRatioTotal: number;
  evRatioTop10: number;
}

// "Stock vs flux" : combien de cette carte est encore en vente (dernier
// instantané eBay, active_listings) vs combien s'est réellement vendu
// récemment (sales) -- PAS un carnet d'ordres (pas de bid/ask, eBay n'a que
// des prix demandés), plutôt un taux d'écoulement façon retail/resale.
// N'existe que pour le scellé EN couvert par active_listings ET avec ≥1
// vente sur 90j (cf. mémoire projet "liquidity_sell_through") -- sinon la
// carte n'a jamais ce champ (null), pas de ligne à zéro trompeuse.
export interface LiquidityCalc {
  capturedAt: string;
  listingCount: number;
  salesCount30d: number;
  salesCount90d: number;
  // ventes30j / (ventes30j + encore en vente) -- borné [0,1], null si les
  // deux valent 0 (jamais le cas ici vu le gate salesCount90d > 0 en amont,
  // mais le type reste honnête sur le cas limite).
  sellThroughRate30d: number | null;
}

// Ligne de classement /liquidity -- même LiquidityCalc + identité carte,
// même duplication volontaire que UndervaluedRow/DivergenceRow vs leurs
// Calc respectifs (contexte page liste vs contexte fiche déjà identifiée).
export interface LiquidityRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  capturedAt: string;
  listingCount: number;
  salesCount30d: number;
  salesCount90d: number;
  sellThroughRate30d: number | null;
}

// Population PSA+CGC réelle (comptage par grade, PAS un prix -- cf.
// db/schema.sql::population_snapshots, [[project_population_analysis]]).
// pop_grade6..10 = comptage PSA+CGC combiné pour ce grade entier ; popTotal =
// grand total toutes notes confondues (PAS juste la somme de pop_grade6..10,
// les grades 1-5 y sont inclus sans être détaillés -- cf. schéma). Scellé n'a
// jamais ce champ (PSA/CGC ne gradent pas de boîtes de TCG scellées).
export interface PopulationCalc {
  capturedAt: string;
  popGrade6: number;
  popGrade7: number;
  popGrade8: number;
  popGrade9: number;
  popGrade10: number;
  popTotal: number;
}

export interface PopulationRow {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  code: string | null;
  rarity: string | null;
  ungradedPrice: number | null;
  psa8Price: number | null;
  psa9Price: number | null;
  psa10Price: number | null;
  population: PopulationCalc;
  // Rang percentile (0 = population la plus basse, 1 = la plus haute) au sein
  // de l'ensemble filtré COMPLET (pas juste la page affichée) -- calculé par
  // getPopulationRanking, cf. son commentaire. Alimente la heatmap du
  // tableau : un simple ratio valeur/max serait écrasé par la queue très
  // longue de la distribution (quelques cartes à population 5 chiffres,
  // l'immense majorité à 1-2 chiffres) -- un rang percentile reste lisible
  // quelle que soit la forme de la distribution.
  grade10Percentile: number;
  totalPercentile: number;
}

export interface ItemDetail extends ItemSummary {
  releaseDate: string | null;
  latestPrices: ItemPriceEntry[];
  undervalued: UndervaluedCalc | null;
  sealedEv: SealedEvCalc | null;
  liquidity: LiquidityCalc | null;
  population: PopulationCalc | null;
}
