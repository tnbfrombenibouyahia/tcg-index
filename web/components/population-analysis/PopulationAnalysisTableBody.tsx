"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { PopulationRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { PopulationDetailModal } from "./PopulationDetailModal";

// ─── Table body, cliquable -- ouvre PopulationDetailModal sur la ligne sélectionnée ──
export function PopulationAnalysisTableBody({ rows }: { rows: PopulationRow[] }) {
  const [selected, setSelected] = useState<PopulationRow | null>(null);

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

            {/* Language */}
            <td className="px-4 py-3">
              <LanguageFlag language={r.language} />
            </td>

            {/* TCG */}
            <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

            {/* Population by grade */}
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
              {r.population.popGrade6.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
              {r.population.popGrade7.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
              {r.population.popGrade8.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
              {r.population.popGrade9.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold">
              {r.population.popGrade10.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium">
              {r.population.popTotal.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
      {/* Portal : cf. UndervaluedTableBody -- un <div> ne peut pas être un
          frère valide de <tbody> à l'intérieur d'un <table>. */}
      {selected &&
        createPortal(
          <PopulationDetailModal key={selected.itemId} row={selected} onClose={() => setSelected(null)} />,
          document.body
        )}
    </>
  );
}
