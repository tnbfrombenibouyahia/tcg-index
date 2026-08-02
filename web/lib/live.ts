// Les libellés (étapes de sync, paliers, segments) vivent désormais dans
// messages/*.json (namespace "live") -- cf. LanguageSelector -- plutôt
// qu'ici en dur, pour suivre la langue choisie dans l'UI.

export type FreshnessTone = "fresh" | "warn" | "stale" | "unknown";

// Seuils calés sur la cadence de cron réelle (daily-sync quotidien à 06:00
// UTC, cf. .github/workflows) : au-delà de 2 jours sans nouvelle donnée, un
// run a probablement été manqué ; au-delà de 7, ça mérite d'être regardé.
export function getFreshnessTone(lastUpdated: string | null): FreshnessTone {
  if (!lastUpdated) return "unknown";
  const iso = lastUpdated.length === 10 ? `${lastUpdated}T00:00:00Z` : lastUpdated;
  const diffHours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (diffHours <= 48) return "fresh";
  if (diffHours <= 24 * 7) return "warn";
  return "stale";
}

export const TONE_COLORS: Record<FreshnessTone, string> = {
  fresh: "var(--positive)",
  warn: "#B8860B",
  stale: "var(--negative)",
  unknown: "var(--foreground-subtle)",
};
