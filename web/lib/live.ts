// ─────────────────────────────────────────────────────────────────────────────
// Tonalité de fraîcheur pour FreshnessGrid (page /live) : traduit un
// timestamp brut en signal visuel simple (vert/ambre/rouge/gris). Seuils
// calés sur la cadence réelle des crons (cf. live.schedule dans messages/*) --
// le palier le moins fréquent est hebdomadaire (established/vintage,
// dimanche/samedi), donc "stale" tolère jusqu'à 8 jours avant de basculer
// "old" (véritable signal d'alerte : quelque chose a raté plus d'un cycle).
// ─────────────────────────────────────────────────────────────────────────────

export type FreshnessTone = "fresh" | "stale" | "old" | "unknown";

export const TONE_COLORS: Record<FreshnessTone, string> = {
  fresh: "var(--positive)",
  stale: "#d97706",
  old: "var(--negative)",
  unknown: "var(--foreground-subtle)",
};

const HOUR_MS = 3_600_000;

export function getFreshnessTone(lastUpdated: string | null): FreshnessTone {
  if (!lastUpdated) return "unknown";
  const hours = (Date.now() - new Date(lastUpdated).getTime()) / HOUR_MS;
  if (hours <= 48) return "fresh";
  if (hours <= 24 * 8) return "stale";
  return "old";
}
