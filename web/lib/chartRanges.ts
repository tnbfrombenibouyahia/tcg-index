// Sélecteur de plage temporelle partagé entre les graphiques (prix, volume) --
// même échelle de temps partout, un seul endroit à faire évoluer.
export const TIME_RANGES = ["1H", "1D", "1W", "1M", "3M", "6M", "1Y", "ALL"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

const MS_MAP: Record<TimeRange, number> = {
  "1H": 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  "6M": 180 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

export function filterByRange<T extends { capturedAt: string }>(
  points: T[],
  range: TimeRange
): T[] {
  if (range === "ALL" || points.length === 0) return points;

  const last = new Date(points[points.length - 1].capturedAt).getTime();
  const cutoff = last - MS_MAP[range];
  return points.filter((p) => new Date(p.capturedAt).getTime() >= cutoff);
}
