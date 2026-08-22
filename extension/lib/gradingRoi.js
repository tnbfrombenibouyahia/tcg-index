/**
 * Calculateur ROI de gradation -- port JS 1:1 de web/lib/gradingRoi.ts
 * (formules, constantes et commentaires repris tels quels ; seule la
 * syntaxe change TS -> JS). Volontairement dupliqué plutôt que partagé :
 * pas de bundler dans ce repo côté extension (scripts injectés bruts par
 * manifest.json, cf. son commentaire content_scripts), et le site (Next.js)
 * a son propre pipeline de build -- une vraie lib partagée demanderait un
 * workspace commun, hors scope de ce commit. À garder en sync à la main si
 * la formule change côté site (même situation déjà assumée pour
 * KNOWN_GRADES entre pricing/models.py et content.js::GRADE_OPTIONS).
 *
 * Ingrédients bruts (prix par grade + comptage de ventes gradées à 4
 * niveaux) fournis par pricing_api (`grading_roi_inputs`, cf.
 * pricing/grading_roi.py) -- le calcul EV/coût/ROI reste ici, jamais
 * côté serveur, pour rester recalculable en live quand l'utilisateur change
 * ses hypothèses dans le panneau (cf. content.js::renderGradingRoi).
 *
 * Pas de vraies Population Reports PSA en entrée (psacard.com/pop bloqué au
 * scraping simple, cf. web/lib/gradingRoi.ts) -- la distribution de grades
 * est dérivée du mix réel des ventes gradées de la carte, avec repli en
 * cascade (carte -> set+rareté -> set -> tcg) quand l'échantillon carte est
 * trop petit. C'est un proxy, pas la vraie population soumise -- documenté
 * en UI, pas caché.
 */
window.CardQuantGradingRoi = (function () {
  const GRADED_TIERS = ["psa7", "psa8", "psa9", "psa9.5", "psa10"];

  // Tarifs indicatifs PSA (US) -- mêmes valeurs que web/lib/constants.ts,
  // éditables dans le calculateur.
  const PSA_SERVICE_TIERS = [
    { id: "value", label: "Value", feeUsd: 30, maxDeclaredValue: 499, turnaroundBusinessDays: 65 },
    { id: "valuePlus", label: "Value Plus", feeUsd: 50, maxDeclaredValue: 999, turnaroundBusinessDays: 45 },
    { id: "regular", label: "Regular", feeUsd: 80, maxDeclaredValue: 1500, turnaroundBusinessDays: 40 },
    { id: "express", label: "Express", feeUsd: 150, maxDeclaredValue: 2499, turnaroundBusinessDays: 20 },
    { id: "superExpress", label: "Super Express", feeUsd: 349, maxDeclaredValue: 9999, turnaroundBusinessDays: 7 },
    { id: "walkThrough", label: "Walk-Through", feeUsd: 599, maxDeclaredValue: 24999, turnaroundBusinessDays: 7 },
  ];

  // Hypothèses par défaut -- toutes éditables en UI. lowGradeProbabilityPct/
  // lowGradeValueFactor n'ont pas de source mesurée (aucune vente sous psa7
  // tracée) : hypothèse manuelle, pas une donnée.
  const DEFAULT_ASSUMPTIONS = {
    serviceTierId: undefined,
    extraCostsUsd: 20,
    lowGradeProbabilityPct: 8,
    lowGradeValueFactor: 0.85,
    resaleFeePct: 0,
  };

  const MIN_GRADED_SALES_SAMPLE = 5;

  function totalOf(counts) {
    return GRADED_TIERS.reduce((sum, g) => sum + (counts[g] || 0), 0);
  }

  function mixOf(counts, total) {
    if (total <= 0) return {};
    const mix = {};
    for (const g of GRADED_TIERS) {
      if (counts[g] > 0) mix[g] = counts[g] / total;
    }
    return mix;
  }

  // Cascade card -> setRarity -> set -> tcg : le premier niveau dont
  // l'échantillon atteint MIN_GRADED_SALES_SAMPLE l'emporte. 'tcg' est le
  // filet de sécurité final (toujours retourné même sous le seuil).
  function resolveGradeDistribution(levels) {
    const order = [
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
    return { gradeMix: {}, sourceLevel: "tcg", sampleSize: 0 }; // inatteignable, satisfait juste le linter
  }

  function clampPct(pct) {
    return Math.min(Math.max(pct, 0), 100) / 100;
  }

  // Palier suggéré : le moins cher dont la valeur déclarée max couvre le
  // meilleur scénario (le prix gradé le plus élevé connu, pas juste
  // l'ungraded -- sinon la valeur déclarée sous-couvrirait un gem mint).
  function suggestServiceTier(candidate) {
    const knownPrices = [candidate.ungradedPrice, ...Object.values(candidate.gradePrices)];
    const bestCase = Math.max(...knownPrices);
    const fit = PSA_SERVICE_TIERS.find((t) => t.maxDeclaredValue >= bestCase);
    return (fit || PSA_SERVICE_TIERS[PSA_SERVICE_TIERS.length - 1]).id;
  }

  // Compare ungraded + coût de soumission à l'espérance de gain une fois
  // gradée. Grades sans prix connu : leur part du mix est redistribuée au
  // prorata sur les grades qui ONT un prix, plutôt que d'inventer un prix.
  function computeGradingRoi(candidate, assumptions) {
    const tierId = assumptions.serviceTierId || suggestServiceTier(candidate);
    const tier = PSA_SERVICE_TIERS.find((t) => t.id === tierId) || PSA_SERVICE_TIERS[PSA_SERVICE_TIERS.length - 1];

    const presentGrades = GRADED_TIERS.filter((g) => candidate.gradePrices[g] != null);
    const presentMixSum = presentGrades.reduce((sum, g) => sum + (candidate.gradeMix[g] || 0), 0);

    const lowGradeP = clampPct(assumptions.lowGradeProbabilityPct);
    const gradedP = 1 - lowGradeP;

    const breakdown = presentGrades.map((g) => {
      const share = presentMixSum > 0 ? (candidate.gradeMix[g] || 0) / presentMixSum : 1 / presentGrades.length;
      const probability = share * gradedP;
      const price = candidate.gradePrices[g];
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

  // Meilleur prix gradé réellement connu (gradePrices est partiel -- souvent
  // pas de psa10).
  const TIERS_HIGH_TO_LOW = ["psa10", "psa9.5", "psa9", "psa8", "psa7"];
  function bestGradedPrice(candidate) {
    const grade = TIERS_HIGH_TO_LOW.find((g) => candidate.gradePrices[g] != null);
    return grade ? candidate.gradePrices[grade] : null;
  }

  return {
    GRADED_TIERS,
    PSA_SERVICE_TIERS,
    DEFAULT_ASSUMPTIONS,
    MIN_GRADED_SALES_SAMPLE,
    resolveGradeDistribution,
    suggestServiceTier,
    computeGradingRoi,
    bestGradedPrice,
  };
})();
