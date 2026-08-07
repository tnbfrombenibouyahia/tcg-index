import { getLocale } from "next-intl/server";
import { LandingPage } from "@/components/landing/LandingPage";
import { getGradingRoiRanking } from "@/lib/queries/gradingRoi";
import { getLandingStats } from "@/lib/queries/landingStats";
import { bestGradedPrice, type GradingRoiRow } from "@/lib/gradingRoi";
import type { LandingCard } from "@/lib/landing";
import { getUniverse } from "@/lib/universe";

// ─────────────────────────────────────────────────────────────────────────────
// Landing page = nouvelle racine "/" (décision utilisateur du 2026-08-07,
// cf. mémoire projet "project_terminal_redesign") -- le dashboard applicatif
// a déménagé sur /dashboard (cf. app/(app)/dashboard/page.tsx). Toutes les
// données du hero viennent des mêmes requêtes que le reste du site.
// ─────────────────────────────────────────────────────────────────────────────

function toLandingCard(row: GradingRoiRow): LandingCard | null {
  const sellPrice = bestGradedPrice(row);
  if (sellPrice == null) return null;
  return {
    itemId: row.itemId,
    name: row.name,
    imageUrl: row.imageUrl,
    tcg: row.tcg,
    buyPrice: row.ungradedPrice,
    sellPrice,
    roiPct: row.defaultResult.roiPct,
  };
}

export default async function LandingRoute() {
  const locale = await getLocale();
  const universe = await getUniverse();

  const [pokemonRoi, onePieceRoi, stats] = await Promise.all([
    getGradingRoiRanking({ tcg: "pokemon", sort: "roi_desc", limit: 6 }),
    getGradingRoiRanking({ tcg: "one-piece", sort: "roi_desc", limit: 6 }),
    getLandingStats(),
  ]);

  const pokemonCards = pokemonRoi.rows.map(toLandingCard).filter((c): c is LandingCard => c !== null);
  const onePieceCards = onePieceRoi.rows.map(toLandingCard).filter((c): c is LandingCard => c !== null);

  return (
    <LandingPage
      pokemonCards={pokemonCards}
      onePieceCards={onePieceCards}
      itemCount={stats.itemCount}
      saleCount={stats.saleCount}
      locale={locale}
      initialUniverse={universe}
    />
  );
}
