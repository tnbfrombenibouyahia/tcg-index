"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "@/lib/format";
import type { UndervaluedRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { CardDetailModal } from "./CardDetailModal";

// ─── Score badge ──────────────────────────────────────────────────────────────
// Couleur et label selon le ratio undervalued_score :
// ≥ 5× = signal fort (vert profond), 2-5× = intéressant (ambre), < 2× = faible (gris)
function ScoreBadge({ score }: { score: number }) {
  const isStrong = score >= 5;
  const isMedium = score >= 2 && score < 5;

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 8px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    background: isStrong
      ? "rgba(21, 128, 61, 0.1)"
      : isMedium
      ? "rgba(180, 120, 20, 0.1)"
      : "rgba(26, 26, 26, 0.06)",
    color: isStrong ? "#15803d" : isMedium ? "#a16207" : "#8A8480",
  };

  return <span style={style}>{score.toFixed(1)}×</span>;
}

// ─── Pull rate visual ─────────────────────────────────────────────────────────
function PullRateDisplay({ pullRate }: { pullRate: number | null }) {
  if (!pullRate || pullRate <= 0) return <span className="text-muted-foreground">—</span>;
  const n = Math.round(1 / pullRate);
  return <span className="tabular-nums text-muted-foreground text-xs">1/{n}</span>;
}

// ─── Table body, cliquable -- ouvre CardDetailModal sur la ligne sélectionnée ──
export function UndervaluedTableBody({ rows }: { rows: UndervaluedRow[] }) {
  const [selected, setSelected] = useState<UndervaluedRow | null>(null);

  return (
    <>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.itemId}
            className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
            onClick={() => setSelected(r)}
          >
            {/* Card name + image */}
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt={r.name}
                    loading="lazy"
                    className="h-12 w-9 flex-shrink-0 rounded-md object-contain bg-white"
                    style={{ aspectRatio: "3/4" }}
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

            {/* Language */}
            <td className="px-4 py-3">
              <LanguageFlag language={r.language} />
            </td>

            {/* TCG */}
            <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

            {/* Rarity */}
            <td className="px-4 py-3 text-xs text-muted-foreground">{r.rarity ?? "—"}</td>

            {/* Market price */}
            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{formatUsd(r.marketPrice)}</td>

            {/* Pull cost */}
            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
              {r.pullCost != null ? formatUsd(r.pullCost) : "—"}
            </td>

            {/* Pull rate */}
            <td className="px-4 py-3">
              <PullRateDisplay pullRate={r.pullRate} />
            </td>

            {/* Score */}
            <td className="px-4 py-3">
              <ScoreBadge score={r.undervaluedScore} />
            </td>
          </tr>
        ))}
      </tbody>
      {/* Portal : un <div> ne peut pas être un frère valide de <tbody> à
          l'intérieur d'un <table> (HTML le réordonne / React s'en plaint en
          hydratation) -- on rend la modale dans document.body à la place. */}
      {selected &&
        createPortal(
          <CardDetailModal key={selected.itemId} row={selected} onClose={() => setSelected(null)} />,
          document.body
        )}
    </>
  );
}
