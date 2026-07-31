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
}
