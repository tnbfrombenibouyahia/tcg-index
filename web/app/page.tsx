import { LastUpdatedBadge } from "@/components/ui/LastUpdatedBadge";
import { HeadlineSection } from "@/components/homepage/HeadlineSection";
import { SubIndexGrid } from "@/components/homepage/SubIndexGrid";
import { DailyExchangeSection } from "@/components/homepage/DailyExchangeSection";
import { getAllIndices } from "@/lib/queries/indices";

export default async function HomePage() {
  const { asOf, indices } = await getAllIndices(180);

  const headline = indices.filter((i) => i.kind === "global");
  const detail = indices.filter((i) => i.kind !== "global");

  return (
    <div style={{ padding: "0 32px 40px" }}>
      {/* ── Breadcrumbs ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "24px 0 20px",
        }}
      >
        <span
          style={{
            fontSize: "14px",
            color: "#8A8480",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Accueil
        </span>
        <span style={{ fontSize: "14px", color: "#B8B2AC" }}>/</span>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#1A1A1A",
            letterSpacing: "-0.01em",
          }}
        >
          Marché TCG
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Last updated badge */}
        <LastUpdatedBadge asOf={asOf} />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Headline card */}
        <HeadlineSection indices={headline} />

        {/* Sub-index tiles */}
        <SubIndexGrid indices={detail} />

        {/* Daily exchange volume */}
        <DailyExchangeSection indices={headline} />
      </div>
    </div>
  );
}
