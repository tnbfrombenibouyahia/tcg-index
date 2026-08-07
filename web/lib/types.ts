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

export type SyncStep = "items" | "prices" | "grades_sales" | "index" | "sealed_ev" | "volume" | "undervalued" | "grading_roi";
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

export interface SyncStatusResponse {
  runningNow: SyncRun[];
  recentRuns: SyncRun[];
  freshness: FreshnessCell[];
  fetchedAt: string;
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

export interface ItemDetail extends ItemSummary {
  releaseDate: string | null;
  latestPrices: ItemPriceEntry[];
  undervalued: UndervaluedCalc | null;
  sealedEv: SealedEvCalc | null;
  liquidity: LiquidityCalc | null;
}
