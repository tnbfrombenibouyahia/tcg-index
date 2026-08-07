import { getTranslations } from "next-intl/server";
import { LastUpdatedBadge } from "@/components/ui/LastUpdatedBadge";
import { HeadlineSection } from "@/components/homepage/HeadlineSection";
import { SubIndexGrid } from "@/components/homepage/SubIndexGrid";
import { DailyExchangeSection } from "@/components/homepage/DailyExchangeSection";
import { TerminalDashboard } from "@/components/dashboard/TerminalDashboard";
import { AuthTrigger } from "@/components/dashboard/AuthTrigger";
import { getAllIndices } from "@/lib/queries/indices";
import { searchItems } from "@/lib/queries/items";
import { getDivergence } from "@/lib/queries/divergence";
import { getSales } from "@/lib/queries/sales";
import { getUndervalued } from "@/lib/queries/undervalued";
import { getGradingRoiRanking } from "@/lib/queries/gradingRoi";
import { getUniverse } from "@/lib/universe";

// ─────────────────────────────────────────────────────────────────────────────
// Accueil = dashboard "Terminal" (redesign 2026-08-07, cf. mémoire projet
// "site_terminal_redesign") : 6 widgets déplaçables/redimensionnables
// branchés sur les mêmes requêtes que les pages dédiées (/catalog,
// /transactions, /undervalued, /divergence, /grading-roi), filtrés sur
// l'univers actif (cookie "universe", cf. lib/universe.ts). Tout le fetch
// est fait ici, en parallèle, côté serveur -- TerminalDashboard (Client
// Component) ne fait que l'état d'affichage (ordre/taille/agrandissement).
// ─────────────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const tcg = await getUniverse();
  const tNav = await getTranslations("nav");
  const tHome = await getTranslations("home");

  const [{ asOf, indices }, catalogueInitialItems, liveMovers, salesResponse, undervalued, divergences, gradingRoiRanking] =
    await Promise.all([
      getAllIndices(400), // 400j : couvre la fenêtre 1Y du widget Live Market + marge
      searchItems({ q: "", tcg, limit: 6 }),
      // minPrice: 5 -- même défaut que /divergence (DEFAULT_MIN_PRICE), évite
      // que le widget ne remonte que du bruit sur des cartes à $0.05.
      getDivergence({ tcg, grade: "ungraded", windowDays: 7, minPrice: 5, sort: "price_delta_desc", limit: 3 }),
      getSales({ tcg, sort: "date_desc", pageSize: 6 }),
      // minMarketPrice: 2 -- même défaut que /undervalued.
      getUndervalued({ tcg, minMarketPrice: 2, sort: "score_desc", limit: 6 }),
      getDivergence({ tcg, grade: "ungraded", windowDays: 30, minPrice: 5, sort: "divergence_desc", limit: 6 }),
      getGradingRoiRanking({ tcg, sort: "roi_desc", limit: 6 }), // minUngradedPrice par défaut (2) déjà aligné avec /grading-roi
    ]);

  const universeIndices = indices.filter((i) => i.tcg === tcg);
  const liveIndex = universeIndices.find((i) => i.kind === "global") ?? null;
  const headline = universeIndices.filter((i) => i.kind === "global");
  const detail = universeIndices.filter((i) => i.kind !== "global");

  return (
    <div style={{ padding: "0 32px 40px" }}>
      {/* ── Breadcrumbs ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "24px 0 20px" }}>
        <span style={{ fontSize: "14px", color: "var(--foreground-muted)", fontWeight: 500, cursor: "pointer" }}>
          {tNav("home")}
        </span>
        <span style={{ fontSize: "14px", color: "var(--foreground-subtle)" }}>/</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {tHome("breadcrumbCurrent")}
        </span>

        <div style={{ flex: 1 }} />

        <LastUpdatedBadge asOf={asOf} />
        <AuthTrigger />
      </div>

      {/* ── Dashboard "Terminal" ─────────────────────────────────────────────── */}
      <TerminalDashboard
        tcg={tcg}
        catalogueInitialItems={catalogueInitialItems}
        liveIndex={liveIndex}
        liveMovers={liveMovers}
        liveExpandedContent={
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <HeadlineSection indices={headline} />
            <SubIndexGrid indices={detail} />
            <DailyExchangeSection indices={headline} />
          </div>
        }
        sales={salesResponse.sales}
        undervalued={undervalued}
        divergences={divergences}
        gradingRoi={gradingRoiRanking.rows}
      />
    </div>
  );
}
