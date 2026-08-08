import { getTranslations } from "next-intl/server";
import { LiveDashboard } from "@/components/live/LiveDashboard";
import { HeadlineSection } from "@/components/homepage/HeadlineSection";
import { SubIndexGrid } from "@/components/homepage/SubIndexGrid";
import { DailyExchangeSection } from "@/components/homepage/DailyExchangeSection";
import { getSyncStatus } from "@/lib/queries/syncStatus";
import { getAllIndices } from "@/lib/queries/indices";
import { getUniverse } from "@/lib/universe";

// ─────────────────────────────────────────────────────────────────────────────
// "Live Market" = fusion de l'ancien indice de marché (ex-page d'accueil) et
// du statut de synchro (demande utilisateur du 2026-08-08, cf. mémoire projet
// "project_terminal_redesign") : un seul point d'entrée dans le dock plutôt
// que deux entrées au nom proche mais au contenu différent. Même contenu que
// le widget "Live Market" du dashboard une fois agrandi (app/(app)/dashboard/
// page.tsx), juste en page pleine ici plutôt qu'en panneau compact.
// ─────────────────────────────────────────────────────────────────────────────

export default async function LivePage() {
  const tcg = await getUniverse();
  const [initialData, { indices }] = await Promise.all([getSyncStatus(), getAllIndices(180)]);
  const tNav = await getTranslations("nav");
  const t = await getTranslations("live");

  const universeIndices = indices.filter((i) => i.tcg === tcg);
  const headline = universeIndices.filter((i) => i.kind === "global");
  const detail = universeIndices.filter((i) => i.kind !== "global");

  return (
    <div style={{ padding: "0 32px 40px" }}>
      {/* ── Breadcrumbs ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "24px 0 20px" }}>
        <span style={{ fontSize: "14px", color: "var(--foreground-muted)", fontWeight: 500, cursor: "pointer" }}>{tNav("home")}</span>
        <span style={{ fontSize: "14px", color: "var(--foreground-subtle)" }}>/</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {t("breadcrumbCurrent")}
        </span>
      </div>

      <p style={{ fontSize: "13px", color: "var(--foreground-muted)", margin: "-8px 0 20px", maxWidth: "640px" }}>
        {t("description")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "32px" }}>
        <HeadlineSection indices={headline} />
        <SubIndexGrid indices={detail} />
        <DailyExchangeSection indices={headline} />
      </div>

      <LiveDashboard initialData={initialData} />
    </div>
  );
}
