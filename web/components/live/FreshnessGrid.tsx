"use client";

import { useLocale, useTranslations } from "next-intl";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { TCGS } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/format";
import { getFreshnessTone, TONE_COLORS } from "@/lib/live";
import type { FreshnessCell, FreshnessSegment } from "@/lib/types";
import { StatusDot } from "./StatusDot";

const SEGMENT_ORDER: FreshnessSegment[] = ["items", "sealed", "single", "grading"];

export function FreshnessGrid({ freshness }: { freshness: FreshnessCell[] }) {
  const t = useTranslations("live");
  const tSegments = useTranslations("live.segments");
  const locale = useLocale();

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", marginBottom: "12px" }}
      >
        {t("freshnessTitle")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {TCGS.map(({ value: tcg, label }) => {
          const cells = SEGMENT_ORDER.map(
            (segment) => freshness.find((c) => c.tcg === tcg && c.segment === segment) ?? null
          );
          return (
            <div key={tcg} className="card-glass" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "14px" }}>
                <TcgIcon tcg={tcg} />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                  {label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {SEGMENT_ORDER.map((segment, i) => {
                  const cell = cells[i];
                  const tone = getFreshnessTone(cell?.lastUpdated ?? null);
                  return (
                    <div
                      key={segment}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 500 }}>
                        {tSegments(segment)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {cell?.constituents ? (
                          <span style={{ fontSize: "11px", color: "var(--foreground-subtle)" }}>
                            {t("tracked", { count: cell.constituents.toLocaleString(locale) })}
                          </span>
                        ) : null}
                        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                          {cell?.lastUpdated ? formatRelativeTime(cell.lastUpdated, locale) : t("noData")}
                        </span>
                        <StatusDot color={TONE_COLORS[tone]} size={7} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
