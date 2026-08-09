"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { LiquidityRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { LiquidityModal } from "./LiquidityModal";

// ─── Sell-through badge -- mêmes seuils visuels que ScoreBadge (Undervalued) :
// ≥20% = s'écoule vite (vert), 5-20% = correct (ambre), <5% = lent (gris) ──
function SellThroughBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>;
  const pct = rate * 100;
  const isStrong = pct >= 20;
  const isMedium = pct >= 5 && pct < 20;

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 8px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    background: isStrong ? "rgba(21, 128, 61, 0.1)" : isMedium ? "rgba(180, 120, 20, 0.1)" : "var(--tint-neutral)",
    color: isStrong ? "#15803d" : isMedium ? "#a16207" : "var(--foreground-muted)",
  };

  return <span style={style}>{pct.toFixed(0)}%</span>;
}

export function LiquidityTableBody({ rows }: { rows: LiquidityRow[] }) {
  const [selected, setSelected] = useState<LiquidityRow | null>(null);

  return (
    <>
      <tbody>
        {rows.map((r) => (
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
                  <p className="font-medium truncate max-w-[220px]">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{r.setCode}</p>
                </div>
              </div>
            </td>

            <td className="px-4 py-3">
              <LanguageFlag language={r.language} />
            </td>

            <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{r.listingCount}</td>

            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{r.salesCount30d}</td>

            <td className="px-4 py-3">
              <SellThroughBadge rate={r.sellThroughRate30d} />
            </td>
          </tr>
        ))}
      </tbody>
      {selected &&
        createPortal(
          <LiquidityModal key={selected.itemId} row={selected} onClose={() => setSelected(null)} />,
          document.body
        )}
    </>
  );
}
