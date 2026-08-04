// Miroir de index/methodology.py::INDEX_DEFINITIONS (Python, côté ingestion) --
// les 6 codes ne changent pas souvent, pas la peine d'aller les lire en base
// à chaque requête. Si un nouveau sous-indice est ajouté côté Python, ce
// fichier doit être mis à jour en miroir.
export type Tcg = "pokemon" | "one-piece";
export type IndexKind = "global" | "sealed" | "single";

export interface IndexDefinition {
  code: string;
  tcg: Tcg;
  kind: IndexKind;
  label: string;
}

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  { code: "PKM_GLOBAL", tcg: "pokemon", kind: "global", label: "Pokémon" },
  { code: "PKM_SEALED", tcg: "pokemon", kind: "sealed", label: "Pokémon — Scellé" },
  { code: "PKM_SINGLES", tcg: "pokemon", kind: "single", label: "Pokémon — Cartes" },
  { code: "OP_GLOBAL", tcg: "one-piece", kind: "global", label: "One Piece" },
  { code: "OP_SEALED", tcg: "one-piece", kind: "sealed", label: "One Piece — Scellé" },
  { code: "OP_SINGLES", tcg: "one-piece", kind: "single", label: "One Piece — Cartes" },
];

export const INDEX_CODES = INDEX_DEFINITIONS.map((d) => d.code);

// Même vocabulaire que price_snapshots.grade / sales.grade côté Python
// (cf. mémoire projet "grading_tiers") -- PSA uniquement, pas CGC/BGS/SGC/...
export const GRADES = ["ungraded", "psa7", "psa8", "psa9", "psa9.5", "psa10"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  ungraded: "Ungraded",
  psa7: "PSA 7",
  psa8: "PSA 8",
  psa9: "PSA 9",
  "psa9.5": "PSA 9.5",
  psa10: "PSA 10",
};

export const TCGS: { value: Tcg; label: string }[] = [
  { value: "pokemon", label: "Pokémon" },
  { value: "one-piece", label: "One Piece" },
];

// Fenêtres de temps du détecteur de divergence volume/prix (cf.
// lib/queries/divergence.ts). Vivent ici (fichier de constantes pures, sans
// import serveur) et non dans divergence.ts car des Client Components
// (DivergenceDetailModal, PriceVolumeChart...) en ont besoin -- importer une
// valeur runtime (pas juste un type) depuis un module qui importe `sql`
// (postgres -> fs) casse le bundle navigateur, même via un ré-export.
export const DIVERGENCE_WINDOWS = [7, 15, 30, 90, 180] as const;
export type DivergenceWindowDays = (typeof DIVERGENCE_WINDOWS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Calculateur ROI de gradation (demande utilisateur, cf. lib/gradingRoi.ts) --
// vivent ici (pas dans lib/gradingRoi.ts) pour la même raison que
// DIVERGENCE_WINDOWS ci-dessus : ce sont des constantes pures réutilisées par
// des Client Components.
// ─────────────────────────────────────────────────────────────────────────────

// Les 5 paliers qu'on trace réellement (cf. GRADES) -- 'ungraded' exclu, ce
// n'est jamais un résultat de gradation.
export const GRADED_TIERS = GRADES.filter((g) => g !== "ungraded") as Exclude<Grade, "ungraded">[];
export type GradedTier = (typeof GRADED_TIERS)[number];

export interface PsaServiceTier {
  id: string;
  label: string;
  feeUsd: number;
  maxDeclaredValue: number;
  turnaroundBusinessDays: number;
}

// Tarifs indicatifs PSA (US), relevés le 2026-08-04 par recherche web --
// PSA révise ses tarifs régulièrement (dernière hausse notée : +5$ sur la
// plupart des paliers le 2026-02-10) et les sources tierces se
// contredisent déjà entre elles sur certains paliers (Value/Value Plus
// signalés "en pause" par une source, actifs par une autre le même jour).
// Défauts éditables dans le calculateur (cf. GradingRoiCalculator) -- à
// vérifier sur https://www.psacard.com/services avant toute soumission
// réelle, jamais présentés comme une donnée live.
export const PSA_SERVICE_TIERS: PsaServiceTier[] = [
  { id: "value", label: "Value", feeUsd: 30, maxDeclaredValue: 499, turnaroundBusinessDays: 65 },
  { id: "valuePlus", label: "Value Plus", feeUsd: 50, maxDeclaredValue: 999, turnaroundBusinessDays: 45 },
  { id: "regular", label: "Regular", feeUsd: 80, maxDeclaredValue: 1500, turnaroundBusinessDays: 40 },
  { id: "express", label: "Express", feeUsd: 150, maxDeclaredValue: 2499, turnaroundBusinessDays: 20 },
  { id: "superExpress", label: "Super Express", feeUsd: 349, maxDeclaredValue: 9999, turnaroundBusinessDays: 7 },
  { id: "walkThrough", label: "Walk-Through", feeUsd: 599, maxDeclaredValue: 24999, turnaroundBusinessDays: 7 },
];

// Hypothèses par défaut du calculateur -- toutes éditables en UI.
// `lowGradeProbabilityPct`/`lowGradeValueFactor` n'ont PAS de source
// mesurée : on ne trace aucune vente/prix en dessous de psa7 (cf. schéma,
// mémoire projet "grading_tiers"), donc le risque de sous-note reste une
// hypothèse manuelle, pas une donnée -- cf. lib/gradingRoi.ts.
export const GRADING_ROI_DEFAULTS = {
  extraCostsUsd: 20, // envoi + assurance + retour, forfait éditable
  lowGradeProbabilityPct: 8,
  lowGradeValueFactor: 0.85,
  resaleFeePct: 0, // frais de revente (ex. ~12-13% eBay/TCGPlayer) -- 0 par défaut
};

// Seuil de ventes gradées avant repli set+rareté -> set -> tcg (cf.
// resolveGradeDistribution dans lib/gradingRoi.ts) -- même ordre de
// grandeur que MIN_SALES_PER_WINDOW (lib/queries/divergence.ts) pour la
// même raison : en dessous, la proportion mesurée est trop instable pour
// être montrée comme "la" distribution de cette carte.
export const MIN_GRADED_SALES_SAMPLE = 5;

// Le volume de ventes (`sales`, agrégé dans index_volume) n'arrive jamais
// "en temps réel" : chaque carte n'est rescannée que sur le rythme de son
// palier (hot = quotidien, recent = 3x/semaine, established = hebdo,
// vintage/jp_singles = 1 tranche/semaine soit une rotation complète toutes
// les 8-12 semaines, cf. ingestion/orchestrator.py TIERS). Une vente datée
// d'il y a quelques jours peut donc n'être détectée que bien plus tard,
// quand la carte concernée retombe dans une tranche scannée -- vérifié
// empiriquement le 2026-08-03 : le total de ventes d'une journée continue
// de grimper sensiblement même après 40+ jours (cf. mémoire projet
// "sales_volume_tracking"). 14 jours ne rend donc pas les chiffres
// définitifs, mais couvre plusieurs cycles hot/recent (les paliers les plus
// actifs) -- assez pour que la tendance récente cesse d'être dominée par le
// bruit de scan plutôt que par une vraie variation de marché.
export const VOLUME_STABILIZATION_DAYS = 14;
