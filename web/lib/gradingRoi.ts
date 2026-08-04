import {
  GRADED_TIERS,
  GRADING_ROI_DEFAULTS,
  MIN_GRADED_SALES_SAMPLE,
  PSA_SERVICE_TIERS,
  type GradedTier,
  type Tcg,
} from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
// Calculateur ROI de gradation (demande utilisateur) : compare le prix
// ungraded + coût de soumission PSA à la valeur espérée une fois gradée,
// pondérée par une distribution de grades réaliste PAR CARTE plutôt que par
// le seul prix PSA10 optimiste.
//
// Pas de vraies Population Reports PSA en entrée (probe du 2026-08-04 :
// psacard.com/pop et ses mirroirs -- Pikawiz, GemRate -- sont tous
// bloqués/JS-only pour un scraping simple, cf. mémoire projet
// "psa_pop_report_blocked"). La distribution de grades est donc dérivée du
// mix réel des ventes gradées de la carte (`sales.grade`), avec un repli en
// cascade (carte -> set+rareté -> set -> tcg) quand l'échantillon carte est
// trop petit -- cf. resolveGradeDistribution. C'est un proxy, pas la vraie
// population soumise : biaisé vers ce qui se REVEND gradé (une carte gradée
// bas peut ne jamais repasser en vente), assumé et documenté en UI plutôt
// que caché.
//
// Notre plage tracée s'arrête à psa7 (cf. schéma, mémoire "grading_tiers") :
// aucune donnée, mesurée ou non, n'existe sous ce seuil. Le risque de
// sous-note (< psa7) est donc une hypothèse manuelle de l'utilisateur
// (`lowGradeProbabilityPct`), jamais une proportion calculée -- distinction
// gardée explicite dans toute l'UI du calculateur.
// ─────────────────────────────────────────────────────────────────────────────

export type DistributionSourceLevel = "card" | "setRarity" | "set" | "tcg";

export interface GradeCounts {
  psa7: number;
  psa8: number;
  psa9: number;
  "psa9.5": number;
  psa10: number;
}

export interface GradeDistributionResult {
  gradeMix: Partial<Record<GradedTier, number>>; // proportions, somme à 1 sur les grades avec un compte > 0
  sourceLevel: DistributionSourceLevel;
  sampleSize: number; // nb de ventes gradées ayant servi à ce niveau
}

function totalOf(counts: GradeCounts): number {
  return GRADED_TIERS.reduce((sum, g) => sum + counts[g], 0);
}

function mixOf(counts: GradeCounts, total: number): Partial<Record<GradedTier, number>> {
  if (total <= 0) return {};
  const mix: Partial<Record<GradedTier, number>> = {};
  for (const g of GRADED_TIERS) {
    if (counts[g] > 0) mix[g] = counts[g] / total;
  }
  return mix;
}

// Cascade carte -> set+rareté -> set -> tcg : le premier niveau dont
// l'échantillon atteint MIN_GRADED_SALES_SAMPLE l'emporte. Le niveau 'tcg'
// est le filet de sécurité final (toujours retourné même sous le seuil,
// plutôt que de renvoyer une distribution vide) -- son sampleSize reste
// affiché en UI pour que le niveau de confiance soit visible même là.
export function resolveGradeDistribution(levels: {
  card: GradeCounts;
  setRarity: GradeCounts;
  set: GradeCounts;
  tcg: GradeCounts;
}): GradeDistributionResult {
  const order: [DistributionSourceLevel, GradeCounts][] = [
    ["card", levels.card],
    ["setRarity", levels.setRarity],
    ["set", levels.set],
    ["tcg", levels.tcg],
  ];

  for (const [sourceLevel, counts] of order) {
    const total = totalOf(counts);
    if (total >= MIN_GRADED_SALES_SAMPLE || sourceLevel === "tcg") {
      return { gradeMix: mixOf(counts, total), sourceLevel, sampleSize: total };
    }
  }
  // Inatteignable ('tcg' retourne toujours) -- satisfait juste le typeur.
  return { gradeMix: {}, sourceLevel: "tcg", sampleSize: 0 };
}

// ── Le calcul ROI proprement dit ────────────────────────────────────────────

export interface GradingRoiCandidate {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  language: string;
  setCode: string | null;
  code: string | null;
  rarity: string | null;
  ungradedPrice: number;
  gradePrices: Partial<Record<GradedTier, number>>; // seuls les grades avec un prix connu sont présents
  gradeMix: Partial<Record<GradedTier, number>>;
  distributionSourceLevel: DistributionSourceLevel;
  distributionSampleSize: number;
}

export interface GradingRoiAssumptions {
  serviceTierId?: string; // undefined -> auto-suggéré via suggestServiceTier
  extraCostsUsd: number;
  lowGradeProbabilityPct: number; // 0-100, hypothèse manuelle (cf. bandeau ci-dessus)
  lowGradeValueFactor: number; // valeur d'une carte sous psa7, en fraction du prix ungraded
  resaleFeePct: number; // 0-100
}

export const DEFAULT_GRADING_ROI_ASSUMPTIONS: GradingRoiAssumptions = {
  extraCostsUsd: GRADING_ROI_DEFAULTS.extraCostsUsd,
  lowGradeProbabilityPct: GRADING_ROI_DEFAULTS.lowGradeProbabilityPct,
  lowGradeValueFactor: GRADING_ROI_DEFAULTS.lowGradeValueFactor,
  resaleFeePct: GRADING_ROI_DEFAULTS.resaleFeePct,
};

export interface GradingRoiBreakdownEntry {
  key: GradedTier | "lowGrade";
  price: number;
  probability: number;
  contribution: number;
}

export interface GradingRoiResult {
  serviceTierId: string;
  submissionFeeUsd: number;
  expectedValueGross: number;
  expectedValueNet: number;
  totalCost: number;
  netProfit: number;
  roiPct: number;
  breakdown: GradingRoiBreakdownEntry[];
}

export interface GradingRoiRow extends GradingRoiCandidate {
  defaultResult: GradingRoiResult;
}

function clampPct(pct: number): number {
  return Math.min(Math.max(pct, 0), 100) / 100;
}

// Palier suggéré : le moins cher dont la valeur déclarée max couvre le
// meilleur scénario (le prix gradé le plus élevé qu'on connaisse pour cette
// carte -- pas juste l'ungraded, sinon la valeur déclarée sous-couvrirait
// l'assurance en cas de gem mint). Retombe sur le palier le plus haut si
// même Walk-Through ne suffit pas (carte hors barème).
export function suggestServiceTier(candidate: GradingRoiCandidate): string {
  const knownPrices = [candidate.ungradedPrice, ...Object.values(candidate.gradePrices)] as number[];
  const bestCase = Math.max(...knownPrices);
  const fit = PSA_SERVICE_TIERS.find((t) => t.maxDeclaredValue >= bestCase);
  return (fit ?? PSA_SERVICE_TIERS[PSA_SERVICE_TIERS.length - 1]).id;
}

// Compare ungraded + coût de soumission à l'espérance de gain une fois
// gradée. Grades sans prix connu (ex. psa9.5 jamais scrapé pour cette
// carte) : leur part du mix est redistribuée au prorata sur les grades qui
// ONT un prix, plutôt que d'inventer un prix -- documenté en UI, pas caché.
export function computeGradingRoi(
  candidate: GradingRoiCandidate,
  assumptions: GradingRoiAssumptions
): GradingRoiResult {
  const tierId = assumptions.serviceTierId ?? suggestServiceTier(candidate);
  const tier = PSA_SERVICE_TIERS.find((t) => t.id === tierId) ?? PSA_SERVICE_TIERS[PSA_SERVICE_TIERS.length - 1];

  const presentGrades = GRADED_TIERS.filter((g) => candidate.gradePrices[g] != null);
  const presentMixSum = presentGrades.reduce((sum, g) => sum + (candidate.gradeMix[g] ?? 0), 0);

  const lowGradeP = clampPct(assumptions.lowGradeProbabilityPct);
  const gradedP = 1 - lowGradeP;

  const breakdown: GradingRoiBreakdownEntry[] = presentGrades.map((g) => {
    const share = presentMixSum > 0 ? (candidate.gradeMix[g] ?? 0) / presentMixSum : 1 / presentGrades.length;
    const probability = share * gradedP;
    const price = candidate.gradePrices[g]!;
    return { key: g, price, probability, contribution: probability * price };
  });

  const lowGradeValue = candidate.ungradedPrice * assumptions.lowGradeValueFactor;
  breakdown.push({ key: "lowGrade", price: lowGradeValue, probability: lowGradeP, contribution: lowGradeP * lowGradeValue });

  const expectedValueGross = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  const expectedValueNet = expectedValueGross * (1 - clampPct(assumptions.resaleFeePct));
  const totalCost = candidate.ungradedPrice + tier.feeUsd + assumptions.extraCostsUsd;
  const netProfit = expectedValueNet - totalCost;
  const roiPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  return {
    serviceTierId: tier.id,
    submissionFeeUsd: tier.feeUsd,
    expectedValueGross,
    expectedValueNet,
    totalCost,
    netProfit,
    roiPct,
    breakdown,
  };
}
