"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { GradingRoiRow } from "@/lib/gradingRoi";
import { GRADED_TIERS, GRADE_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { StatDelta } from "@/components/ui/StatDelta";
import { GradingRoiModal } from "./GradingRoiModal";

// Grade le plus haut connu pour la carte -- c'est le chiffre "gradation
// réussie" le plus lu d'un coup d'œil, PSA10 par défaut mais on retombe sur
// le grade connu le plus proche si PSA10 n'a jamais été scrapé pour cette
// carte (cf. GradingRoiCandidate.gradePrices, souvent partiel).
const TIERS_HIGH_TO_LOW = [...GRADED_TIERS].reverse();

function headlineGrade(row: GradingRoiRow) {
  const grade = TIERS_HIGH_TO_LOW.find((g) => row.gradePrices[g] != null);
  return grade ? { grade, price: row.gradePrices[grade]! } : null;
}

export function GradingRoiTableBody({ rows }: { rows: GradingRoiRow[] }) {
  const tSample = useTranslations("gradingRoi.table.sampleLevels");
  const [selected, setSelected] = useState<GradingRoiRow | null>(null);

  return (
    <>
      <tbody>
        {rows.map((r) => {
          const headline = headlineGrade(r);
          return (
            <tr
              key={r.itemId}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
              onClick={() => setSelected(r)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt={r.name}
                      loading="lazy"
                      className="h-12 w-9 flex-shrink-0 rounded-md object-contain"
                      style={{ aspectRatio: "3/4", background: "var(--surface-alt)" }}
                    />
                  ) : (
                    <div className="h-12 w-9 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="max-w-[220px] truncate font-medium">{r.name}</p>
                    <p className="max-w-[220px] truncate text-xs text-muted-foreground">{r.setCode}</p>
                  </div>
                </div>
              </td>

              <td className="px-4 py-3">
                <LanguageFlag language={r.language} />
              </td>

              <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

              <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{formatUsd(r.ungradedPrice)}</td>

              <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                {headline ? (
                  <>
                    {formatUsd(headline.price)}{" "}
                    <span className="text-[11px] text-muted-foreground">{GRADE_LABELS[headline.grade]}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>

              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <ConfidenceDot level={r.distributionSourceLevel} />
                  {tSample(r.distributionSourceLevel)} · {r.distributionSampleSize}
                </span>
              </td>

              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatUsd(r.defaultResult.netProfit)}</td>

              <td className="px-4 py-3">
                <StatDelta changePct={r.defaultResult.roiPct} />
              </td>
            </tr>
          );
        })}
      </tbody>
      {selected &&
        createPortal(
          <GradingRoiModal key={selected.itemId} row={selected} onClose={() => setSelected(null)} />,
          document.body
        )}
    </>
  );
}

function ConfidenceDot({ level }: { level: GradingRoiRow["distributionSourceLevel"] }) {
  const color =
    level === "card" ? "var(--positive)" : level === "setRarity" || level === "set" ? "#a16207" : "var(--negative)";
  return <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}
