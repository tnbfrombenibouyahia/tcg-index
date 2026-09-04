// Libellés réels de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- repris tels quels de messages/fr.json (namespace
// "live"), pas réinventés : ce texte a déjà été vérifié/affiné en prod sur
// l'ancien /live, mieux vaut le garder que produire une deuxième version
// divergente en dur pour ce seul écran (le reskin CardQuant n'est pas
// encore branché sur next-intl, cf. TopNav.tsx).
import type { SyncStep } from "@/lib/types";

export const STEP_LABEL: Record<SyncStep, string> = {
  items: "Référentiel",
  prices: "Prix — scellé & cartes",
  grades_sales: "Gradation PSA & ventes",
  index: "Calcul des indices",
  sealed_ev: "Ratio EV scellés",
  undervalued: "Scores de sous-évaluation",
  grading_roi: "Données ROI de gradation",
  volume: "Volume de ventes",
  active_listings: "Annonces actives eBay",
  population: "Population PSA/CGC",
};

export const TIER_LABEL: Record<string, string> = {
  hot: "Hot (< 6 mois)",
  recent: "Recent (6–18 mois)",
  established: "Established (18–36 mois)",
  vintage: "Vintage (36+ mois)",
};

// Cadence connue uniquement pour les steps couverts par les workflows
// GitHub Actions documentés (cf. ScheduleBar.tsx de l'ancien design) --
// les autres steps (index, sealed_ev, undervalued, grading_roi, volume)
// tournent en aval du même run mais n'ont pas leur propre cron nommé :
// pas de cadence affichée pour eux plutôt qu'une valeur inventée.
export const STEP_CADENCE: Partial<Record<SyncStep, string>> = {
  items: "quotidien 06:00 UTC",
  prices: "quotidien 06:00 UTC",
  grades_sales: "cf. palier",
  active_listings: "quotidien 06:00 UTC",
  population: "quotidien 06:00 UTC",
};
