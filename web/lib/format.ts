export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatIndexValue(value: number): string {
  return value.toFixed(2);
}

export function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

// Utilisé pour distinguer les jours "stabilisés" des jours encore
// provisoires dans les séries de volume (cf. lib/constants.ts
// VOLUME_STABILIZATION_DAYS) -- comparaison de string 'YYYY-MM-DD' pure,
// pas besoin de re-parser en Date ensuite.
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string, locale: string = "fr"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Accepte une date pure ('YYYY-MM-DD', ex. price_snapshots.captured_at) ou un
// timestamp complet ('...T...Z', ex. sync_runs.started_at) -- seule la
// première a besoin du 'T00:00:00Z' pour ne pas être lue en fuseau local.
function toDate(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}

export function formatDuration(startIso: string, endIso: string): string {
  const ms = toDate(endIso).getTime() - toDate(startIso).getTime();
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

// Intl.RelativeTimeFormat gère nativement "à l'instant"/"il y a 5 min"/"5
// min ago"/"hace 5 min" pour n'importe quelle locale BCP-47 -- pas besoin de
// traduire ces fragments à la main dans messages/*.json.
export function formatRelativeTime(iso: string, locale: string = "fr"): string {
  const diffMs = Date.now() - toDate(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffMin < 1) return rtf.format(0, "second");
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return rtf.format(-diffH, "hour");
  const diffJ = Math.round(diffH / 24);
  if (diffJ < 14) return rtf.format(-diffJ, "day");
  return formatDate(iso.length === 10 ? iso : iso.slice(0, 10), locale);
}
