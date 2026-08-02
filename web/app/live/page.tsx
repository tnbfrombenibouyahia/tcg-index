import { getTranslations } from "next-intl/server";
import { LiveDashboard } from "@/components/live/LiveDashboard";
import { getSyncStatus } from "@/lib/queries/syncStatus";

export default async function LivePage() {
  const initialData = await getSyncStatus();
  const tNav = await getTranslations("nav");
  const t = await getTranslations("live");

  return (
    <div style={{ padding: "0 32px 40px" }}>
      {/* ── Breadcrumbs ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "24px 0 20px" }}>
        <span style={{ fontSize: "14px", color: "#8A8480", fontWeight: 500, cursor: "pointer" }}>{tNav("home")}</span>
        <span style={{ fontSize: "14px", color: "#B8B2AC" }}>/</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.01em" }}>
          {t("breadcrumbCurrent")}
        </span>
      </div>

      <p style={{ fontSize: "13px", color: "var(--foreground-muted)", margin: "-8px 0 20px", maxWidth: "640px" }}>
        {t("description")}
      </p>

      <LiveDashboard initialData={initialData} />
    </div>
  );
}
