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

export type SyncStep = "items" | "prices" | "grades_sales" | "index" | "sealed_ev" | "volume" | "undervalued";
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
