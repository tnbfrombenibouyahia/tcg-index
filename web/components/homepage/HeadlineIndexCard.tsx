import { getLocale, getTranslations } from "next-intl/server";
import { StatDelta } from "@/components/ui/StatDelta";
import { formatIndexValue } from "@/lib/format";
import type { IndexSummary } from "@/lib/types";
import { IndexChart } from "./IndexChart";
import { TcgIcon } from "./TcgIcon";

// ─────────────────────────────────────────────────────────────────────────────
// HeadlineIndexCard — "Quiet Luxury / White Mode"
// Layout mirrors the stock detail card from the reference image:
// • Header: label + USD badge + market info top-right
// • Price + delta displayed prominently on the chart itself
// • Action buttons: "Sell" (outline) + "Invest" (solid black)
// • Tabs: Overview · Markets · Alerts · History
// • Details block below
// ─────────────────────────────────────────────────────────────────────────────

export async function HeadlineIndexCard({ summary }: { summary: IndexSummary }) {
  const positive = (summary.changePct ?? 0) >= 0;
  const hasData = !!summary.latest;
  const t = await getTranslations("headlineCard");
  const tIndices = await getTranslations("indices");
  const locale = await getLocale();
  const label = tIndices(summary.code);

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.06)",
        border: "1px solid rgba(26,26,26,0.06)",
        overflow: "hidden",
      }}
    >
      {/* ── Stock header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 28px 0",
          gap: "12px",
        }}
      >
        {/* Left: index icon + name */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Icon badge */}
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "#F8F9FA",
              border: "1px solid rgba(26,26,26,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <TcgIcon tcg={summary.tcg} />
          </div>

          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#1A1A1A",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              {label}
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "#8A8480",
                margin: "2px 0 0",
                fontWeight: 500,
              }}
            >
              {t("marketGlobal")}
            </p>
          </div>
        </div>

        {/* Right: market badge */}
        <div
          style={{
            fontSize: "11px",
            color: "#8A8480",
            fontWeight: 500,
          }}
        >
          EUR · GLOBAL
        </div>
      </div>

      {/* ── Chart zone ───────────────────────────────────────────────────── */}
      <div style={{ padding: "0 28px", marginTop: "20px", position: "relative" }}>
        {/* Currency badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            borderRadius: "8px",
            background: "#F8F9FA",
            border: "1px solid rgba(26,26,26,0.08)",
            fontSize: "12px",
            fontWeight: 600,
            color: "#1A1A1A",
            marginBottom: "16px",
          }}
        >
          🇪🇺 EUR
        </div>

        {/* Price overlay */}
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "clamp(1.8rem, 3vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#1A1A1A",
              lineHeight: 1,
            }}
          >
            {hasData ? formatIndexValue(summary.latest!.value) : "—"}
          </div>
          <div style={{ marginTop: "4px" }}>
            <StatDelta changePct={summary.changePct} />
          </div>
        </div>

        {/* SVG Chart */}
        <div style={{ marginTop: "4px" }}>
          <IndexChart
            history={summary.history}
            volume={summary.volume}
            mode="full"
            positive={positive}
          />
        </div>
      </div>

      {/* ── Details block ────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "20px 28px 28px",
          marginTop: "20px",
          borderTop: "1px solid rgba(26,26,26,0.07)",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#1A1A1A",
            letterSpacing: "-0.02em",
            margin: "0 0 8px",
          }}
        >
          {t("details")}
        </h3>
        <p
          style={{
            fontSize: "13px",
            lineHeight: "1.65",
            color: "#8A8480",
            margin: 0,
            maxWidth: "660px",
          }}
        >
          {t("description", { label })}
        </p>

        {/* Metadata row */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "20px",
          }}
        >
          {[
            {
              label: t("constituents"),
              value: hasData
                ? `${summary.latest!.constituents.toLocaleString(locale)} ${t("items")}`
                : "—",
            },
            { label: t("currency"), value: "EUR" },
            { label: t("updated"), value: t("updatedValue") },
            { label: t("source"), value: t("sourceValue") },
          ].map((m) => (
            <div key={m.label}>
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#B8B2AC",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 3px",
                }}
              >
                {m.label}
              </p>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1A1A1A",
                  margin: 0,
                }}
              >
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
