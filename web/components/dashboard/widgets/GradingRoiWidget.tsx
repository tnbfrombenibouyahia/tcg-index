"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { bestGradedPrice, type GradingRoiRow } from "@/lib/gradingRoi";
import { formatPct, formatUsd } from "@/lib/format";

// Widget ROI Gradation -- meilleur ROI net par défaut (lib/queries/
// gradingRoi.ts, hypothèses par défaut DEFAULT_GRADING_ROI_ASSUMPTIONS, même
// source que /grading-roi), univers actif. "PSA 10" du mockup remplacé par
// le meilleur prix gradé réellement connu pour la carte (souvent < psa10,
// gradePrices est partiel) -- cf. bestGradedPrice, même logique que
// GradingRoiTableBody et le hero de la landing page.

export function GradingRoiWidget({ rows }: { rows: GradingRoiRow[] }) {
  const t = useTranslations("dashboard.gradingRoi");

  return (
    <>
      <div style={headStyle}>
        <span style={{ flex: 2 }}>{t("colName")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colRaw")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colBestGraded")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colRoi")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colVerdict")}</span>
      </div>
      {rows.length === 0 && <p style={{ fontSize: "12px", color: "var(--foreground-subtle)", padding: "10px 0" }}>{t("empty")}</p>}
      {rows.map((r) => {
        const graded = bestGradedPrice(r);
        const roi = r.defaultResult.roiPct;
        const worthIt = roi >= 30;
        return (
          <Link key={r.itemId} href={`/catalog/${r.itemId}`} style={rowStyle}>
            <span style={{ flex: 2, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}
            </span>
            <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-ibm-plex-mono), monospace", color: "var(--foreground)" }}>
              {formatUsd(r.ungradedPrice)}
            </span>
            <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-ibm-plex-mono), monospace", color: "var(--foreground)" }}>
              {graded != null ? formatUsd(graded) : "—"}
            </span>
            <span
              style={{
                flex: 1,
                textAlign: "right",
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                color: roi >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {formatPct(roi)}
            </span>
            <span style={{ flex: 1, textAlign: "right" }}>
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "5px",
                  background: worthIt ? "color-mix(in srgb, var(--positive) 15%, transparent)" : "var(--tint-neutral)",
                  color: worthIt ? "var(--positive)" : "var(--foreground-muted)",
                }}
              >
                {worthIt ? t("verdictGrade") : t("verdictWait")}
              </span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

const headStyle: React.CSSProperties = {
  display: "flex",
  fontSize: "10.5px",
  fontWeight: 700,
  color: "var(--foreground-muted)",
  letterSpacing: "0.4px",
  paddingBottom: "6px",
  borderBottom: "1px solid var(--border)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  fontSize: "12.5px",
  padding: "9px 0",
  borderBottom: "1px solid var(--border)",
  alignItems: "center",
};
