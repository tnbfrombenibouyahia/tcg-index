"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { SaleRow } from "@/lib/types";
import { formatDate, formatUsd } from "@/lib/format";

// Widget Transactions -- dernières ventes constatées (lib/queries/sales.ts,
// même source que /transactions), triées date desc, univers actif.

export function TransactionsWidget({ sales }: { sales: SaleRow[] }) {
  const t = useTranslations("dashboard.transactions");
  const locale = useLocale();

  return (
    <>
      <div style={headStyle}>
        <span style={{ flex: 2 }}>{t("colName")}</span>
        <span style={{ flex: 1 }}>{t("colPlatform")}</span>
        <span style={{ flex: 1 }}>{t("colGrade")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colPrice")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("colDate")}</span>
      </div>
      {sales.length === 0 && <p style={emptyStyle}>{t("empty")}</p>}
      {sales.map((s) => (
        <Link key={s.id} href={`/catalog/${s.item.id}`} style={rowStyle}>
          <span style={{ flex: 2, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.item.name}
          </span>
          <span style={{ flex: 1, color: "var(--foreground-muted)", textTransform: "capitalize" }}>{s.marketplace}</span>
          <span style={{ flex: 1, color: "var(--foreground-muted)" }}>{s.grade}</span>
          <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-ibm-plex-mono), monospace", color: "var(--foreground)" }}>
            {formatUsd(s.price)}
          </span>
          <span style={{ flex: 1, textAlign: "right", color: "var(--foreground-muted)", fontSize: "11.5px" }}>
            {formatDate(s.saleDate, locale)}
          </span>
        </Link>
      ))}
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

const emptyStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--foreground-subtle)",
  padding: "10px 0",
};
