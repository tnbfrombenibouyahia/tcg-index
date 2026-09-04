import { notFound } from "next/navigation";
import { CardScreen } from "@/components/cardquant/card/CardScreen";
import type { PriceSeries } from "@/components/cardquant/card/PriceHistoryPanel";
import { getItemById, getItemPriceHistory, getItemMonthlySales, type PriceHistoryPoint } from "@/lib/queries/itemDetail";
import { getGradingRoiCandidate } from "@/lib/queries/gradingRoi";
import { computeGradingRoi, DEFAULT_GRADING_ROI_ASSUMPTIONS } from "@/lib/gradingRoi";
import { getLanguageComparison } from "@/lib/queries/compareLanguage";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";
import { GRADES, type Grade } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Fiche carte "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand"). Remplace app/(app)/catalog/[id]/page.tsx (version
// pleine page de l'ancien design -- ItemDetailModal/CatalogSearch, qui
// ouvraient cette fiche en popup, restent orphelins). CatalogueGrid.tsx a
// été mis à jour pour naviguer ici au lieu d'ouvrir la modale.
//
// Presque tout est réutilisé tel quel de la couche de données existante
// (getItemById, getGradingRoiCandidate, getLanguageComparison) -- la seule
// vraie nouveauté est getItemMonthlySales (cf. son commentaire) et l'appel
// en parallèle de getItemPriceHistory pour chaque grade (6 requêtes légères,
// un seul item).
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_SERIES: { grade: Grade; label: string; color: string }[] = [
  { grade: "ungraded", label: "Brut", color: "var(--ink-000)" },
  { grade: "psa7", label: "PSA 7", color: "var(--grey-300)" },
  { grade: "psa8", label: "PSA 8", color: "var(--grey-400)" },
  { grade: "psa9", label: "PSA 9", color: "var(--ink-700)" },
  { grade: "psa9.5", label: "PSA 9.5", color: "var(--up-600)" },
  { grade: "psa10", label: "PSA 10", color: "var(--green-400)" },
];

const BEST_GRADED_ORDER: Grade[] = ["psa10", "psa9.5", "psa9", "psa8", "psa7"];

function deltaOverDays(points: PriceHistoryPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  const cutoff = new Date(latest.capturedAt).getTime() - days * 86_400_000;
  const past = [...points].reverse().find((p) => new Date(p.capturedAt).getTime() <= cutoff);
  if (!past || past.price === 0) return null;
  return ((latest.price - past.price) / past.price) * 100;
}

export default async function CardQuantCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) notFound();

  const item = await getItemById(itemId);
  if (!item) notFound();

  const [histories, gradingRoiCandidate, monthlySales, languageComparison, syncLabel] = await Promise.all([
    Promise.all(GRADES.map((g) => getItemPriceHistory(itemId, g))),
    getGradingRoiCandidate(itemId),
    getItemMonthlySales(itemId, 12),
    getLanguageComparison({ tcg: item.tcg, name: item.name, rarity: item.rarity, language: item.language, grade: "ungraded" }),
    buildSyncLabel(),
  ]);

  const historyByGrade = new Map(GRADES.map((g, i) => [g, histories[i]]));
  const priceSeries: PriceSeries[] = GRADE_SERIES.map((s) => ({ grade: s.grade, label: s.label, color: s.color, points: historyByGrade.get(s.grade) ?? [] }));

  const ungradedHistory = historyByGrade.get("ungraded") ?? [];
  const ungradedPrice = item.latestPrices.find((p) => p.grade === "ungraded")?.price ?? null;
  const ungradedDeltaPct = deltaOverDays(ungradedHistory, 30);

  const bestGradedTier = BEST_GRADED_ORDER.find((g) => item.latestPrices.some((p) => p.grade === g)) ?? null;
  const bestGradedPrice = bestGradedTier ? item.latestPrices.find((p) => p.grade === bestGradedTier)!.price : null;
  const bestGradedDeltaPct = bestGradedTier ? deltaOverDays(historyByGrade.get(bestGradedTier) ?? [], 30) : null;

  const gradingRoi = gradingRoiCandidate
    ? { candidate: gradingRoiCandidate, result: computeGradingRoi(gradingRoiCandidate, DEFAULT_GRADING_ROI_ASSUMPTIONS) }
    : null;

  return (
    <CardScreen
      syncLabel={syncLabel}
      item={item}
      ungradedPrice={ungradedPrice}
      ungradedDeltaPct={ungradedDeltaPct}
      bestGradedPrice={bestGradedPrice}
      bestGradedTier={bestGradedTier}
      bestGradedDeltaPct={bestGradedDeltaPct}
      priceSeries={priceSeries}
      monthlySales={monthlySales}
      languageComparison={languageComparison}
      gradingRoi={gradingRoi}
    />
  );
}
