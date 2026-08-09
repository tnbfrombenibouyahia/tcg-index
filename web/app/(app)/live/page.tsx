import { getTranslations } from "next-intl/server";
import { LiveDashboard } from "@/components/live/LiveDashboard";
import { getSyncStatus } from "@/lib/queries/syncStatus";
import { getDataCoverage } from "@/lib/queries/dataCoverage";

// ─────────────────────────────────────────────────────────────────────────────
// "Live Synchronisation" -- reconstruite le 2026-08-09 après le retrait
// complet du 2026-08-09 (même jour, cf. mémoire projet), cette fois comme
// outil d'exploitation/debug dédié plutôt qu'un widget marché : ce qui
// tourne, ce qui a planté (ErrorsPanel, en tête), la fraîcheur par segment
// (FreshnessGrid) et un nouveau recap de COMPLÉTUDE par tcg × langue ×
// catégorie (DataCoverageSection, lib/queries/dataCoverage.ts) -- répond
// directement à "pourquoi cette carte n'a pas de prix ?" en croisant avec
// [[project_price_sync_scope]]. Aucun indice de marché/chart ici (cf.
// décision du même jour) : uniquement du scheduling/de la donnée opérationnelle.
//
// `coverage` est un agrégat plein-catalogue (~74k items), calculé une fois
// côté serveur ici plutôt que re-interrogé à chaque poll 10s côté client
// (cf. commentaire LiveDashboard.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export default async function LivePage() {
  const [initialData, coverage] = await Promise.all([getSyncStatus(), getDataCoverage()]);
  const tNav = await getTranslations("nav");
  const t = await getTranslations("live");

  return (
    <div style={{ padding: "0 32px 40px" }}>
      {/* ── Breadcrumbs ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "18px 0 12px" }}>
        <span style={{ fontSize: "14px", color: "var(--foreground-muted)", fontWeight: 500, cursor: "pointer" }}>{tNav("home")}</span>
        <span style={{ fontSize: "14px", color: "var(--foreground-subtle)" }}>/</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {t("breadcrumbCurrent")}
        </span>
      </div>

      <p style={{ fontSize: "12.5px", color: "var(--foreground-muted)", margin: "-4px 0 14px", maxWidth: "640px" }}>
        {t("description")}
      </p>

      <LiveDashboard initialData={initialData} coverage={coverage} />
    </div>
  );
}
