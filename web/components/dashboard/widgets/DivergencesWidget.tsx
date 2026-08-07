"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DivergenceRow } from "@/lib/types";
import { formatPct } from "@/lib/format";

// Widget Divergences -- écart prix/volume le plus extrême (lib/queries/
// divergence.ts, ungraded, fenêtre 30j -- même défaut que /divergence),
// univers actif.

export function DivergencesWidget({ rows }: { rows: DivergenceRow[] }) {
  const t = useTranslations("dashboard.divergences");

  return (
    <>
      <div style={headStyle}>
        <span style={{ flex: 2 }}>{t("colName")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colPriceChg")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colVolChg")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colDivergence")}</span>
      </div>
      {rows.length === 0 && <p style={{ fontSize: "12px", color: "var(--foreground-subtle)", padding: "10px 0" }}>{t("empty")}</p>}
      {rows.map((d) => (
        <Link key={d.itemId} href={`/catalog/${d.itemId}`} style={rowStyle}>
          <span style={{ flex: 2, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.name}
          </span>
          <span
            style={{
              flex: 1,
              textAlign: "right",
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              color: d.priceChangePct >= 0 ? "var(--positive)" : "var(--negative)",
            }}
          >
            {formatPct(d.priceChangePct)}
          </span>
          <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-ibm-plex-mono), monospace", color: "var(--foreground-muted)" }}>
            {formatPct(d.volumeChangePct)}
          </span>
          <span
            style={{
              flex: 1,
              textAlign: "right",
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontWeight: 700,
              color: Math.abs(d.divergenceScore) >= 15 ? "var(--accent)" : "var(--foreground-muted)",
            }}
          >
            {formatPct(d.divergenceScore)}
          </span>
        </Link>
      ))}
      <p style={{ fontSize: "10.5px", color: "var(--foreground-subtle)", lineHeight: 1.5, margin: "4px 0 0" }}>
        {t("footnote")}
      </p>
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
