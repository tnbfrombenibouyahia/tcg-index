import { getTranslations } from "next-intl/server";
import { LastUpdatedBadge } from "@/components/ui/LastUpdatedBadge";
import { TerminalDashboard } from "@/components/dashboard/TerminalDashboard";
import { getAllIndices } from "@/lib/queries/indices";
import { searchItems } from "@/lib/queries/items";
import { getDivergence } from "@/lib/queries/divergence";
import { getSales } from "@/lib/queries/sales";
import { getUndervalued } from "@/lib/queries/undervalued";
import { getGradingRoiRanking } from "@/lib/queries/gradingRoi";
import { getUniverse } from "@/lib/universe";

// ─────────────────────────────────────────────────────────────────────────────
// Accueil = dashboard "Terminal" (redesign 2026-08-07, cf. mémoire projet
// "site_terminal_redesign") : widgets déplaçables/redimensionnables
// branchés sur les mêmes requêtes que les pages dédiées (/catalog,
// /transactions, /undervalued, /divergence, /grading-roi), filtrés sur
// l'univers actif (cookie "universe", cf. lib/universe.ts). Tout le fetch
// est fait ici, en parallèle, côté serveur -- TerminalDashboard (Client
// Component) ne fait que l'état d'affichage (ordre/taille/agrandissement).
//
// Widget "Live Market Data" retiré du front (demande utilisateur 2026-08-09,
// avec tout ce qui touchait au run/schedule -- components/live/*, /live,
// getSyncStatus ici). Backend (lib/queries/syncStatus.ts, app/api/
// sync-status) laissé intact pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const tcg = await getUniverse();
  const tNav = await getTranslations("nav");
  const tHome = await getTranslations("home");

  const [{ asOf }, catalogueInitialItems, salesResponse, undervalued, divergences, gradingRoiRanking] =
    await Promise.all([
      getAllIndices(2), // profondeur minimale -- seul "asOf" (fraîcheur) sert ici
      searchItems({ q: "", tcg, limit: 6 }),
      getSales({ tcg, sort: "date_desc", pageSize: 6 }),
      // minMarketPrice: 5 -- même plancher que /undervalued (cf. commentaire
      // lib/queries/undervalued.ts).
      getUndervalued({ tcg, minMarketPrice: 5, sort: "score_desc", limit: 6 }),
      getDivergence({ tcg, grade: "ungraded", windowDays: 30, minPrice: 5, sort: "divergence_desc", limit: 6 }),
      getGradingRoiRanking({ tcg, sort: "roi_desc", limit: 6 }), // minUngradedPrice par défaut (2) déjà aligné avec /grading-roi
    ]);

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
      </div>

      {/* ── Dashboard "Terminal" ─────────────────────────────────────────────── */}
      <TerminalDashboard
        tcg={tcg}
        catalogueInitialItems={catalogueInitialItems}
        sales={salesResponse.sales}
        undervalued={undervalued}
        divergences={divergences}
        gradingRoi={gradingRoiRanking.rows}
      />
    </div>
  );
}
