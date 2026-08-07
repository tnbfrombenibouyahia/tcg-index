import type { Tcg } from "@/lib/constants";

// Carte animée du hero de la landing page -- dérivée de GradingRoiRow
// (bestGradedPrice + defaultResult.roiPct, cf. lib/gradingRoi.ts) plutôt que
// du cardPool fictif du mockup ("Manga Rare Zoro OP06" à prix inventés) :
// achat = prix ungraded réel, vente = meilleur prix gradé réel, ROI = calcul
// réel du calculateur de gradation (mêmes hypothèses que /grading-roi).
export interface LandingCard {
  itemId: number;
  name: string;
  imageUrl: string | null;
  tcg: Tcg;
  buyPrice: number;
  sellPrice: number;
  roiPct: number;
}
