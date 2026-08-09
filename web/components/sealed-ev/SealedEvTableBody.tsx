"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "@/lib/format";
import type { SealedEvMode, SealedEvRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { ReliabilityBars } from "./ReliabilityBars";
import { SealedEvDetailModal } from "./SealedEvDetailModal";

// ─────────────────────────────────────────────────────────────────────────────
// Table body, cliquable -- ouvre SealedEvDetailModal sur la box sélectionnée,
// même pattern que UndervaluedTableBody/GradingRoiTableBody (demande
// utilisateur : lire l'analyse sans quitter la page).
// ─────────────────────────────────────────────────────────────────────────────
export function SealedEvTableBody({ rows, mode }: { rows: SealedEvRow[]; mode: SealedEvMode }) {
  const [selected, setSelected] = useState<SealedEvRow | null>(null);

  return (
    <>
      <tbody>
        {rows.map((r) => {
          const value = mode === "top10" ? r.singlesTop10Value : r.singlesTotalValue;
          const ratio = mode === "top10" ? r.evRatioTop10 : r.evRatioTotal;
          return (
            <tr
              key={r.itemId}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
              onClick={() => setSelected(r)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes inconnus à l'avance, cf. plan §5
                    <img
                      src={r.imageUrl}
                      alt={r.name}
                      loading="lazy"
                      className="h-12 w-12 flex-shrink-0 rounded-md object-contain"
                      style={{ background: "var(--surface-alt)" }}
                    />
                  ) : (
                    <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.setCode}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <LanguageFlag language={r.language} />
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatUsd(r.boxPrice)}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatUsd(value)}</td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.singlesCount}</td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{ratio.toFixed(1)}×</td>
              <td className="whitespace-nowrap px-4 py-3">
                <ReliabilityBars score={r.boxReliabilityScore} salesUsed={r.boxSalesUsed} />
              </td>
            </tr>
          );
        })}
      </tbody>
      {/* Portal : même raison qu'UndervaluedTableBody -- un <div> ne peut pas
          être un frère valide de <tbody> dans un <table>. */}
      {selected &&
        createPortal(
          <SealedEvDetailModal key={selected.itemId} row={selected} onClose={() => setSelected(null)} />,
          document.body
        )}
    </>
  );
}
