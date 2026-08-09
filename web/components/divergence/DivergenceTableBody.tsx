"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "@/lib/format";
import type { DivergenceRow } from "@/lib/types";
import type { DivergenceWindowDays } from "@/lib/constants";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { StatDelta } from "@/components/ui/StatDelta";
import { DivergenceBadge } from "./DivergenceBadge";
import { DivergenceDetailModal } from "./DivergenceDetailModal";

// Client Component -- même raison qu'UndervaluedTableBody : ouvre la modale
// de détail au clic sur une ligne, ET évite le coût de poids de page constaté
// avant cette itération (drapeaux pixel-art rendus dans un Server Component
// pur, dupliqués dans le payload RSC -- cf. commit précédent).
export function DivergenceTableBody({
  rows,
  windowDays,
}: {
  rows: DivergenceRow[];
  windowDays: DivergenceWindowDays;
}) {
  const [selected, setSelected] = useState<DivergenceRow | null>(null);

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
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{r.setCode ?? r.rarity}</p>
                </div>
              </div>
            </td>

            <td className="px-4 py-3">
              <LanguageFlag language={r.language} />
            </td>

            <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

            <td className="whitespace-nowrap px-4 py-3">
              <div className="tabular-nums">
                {r.volumePrevious} → {r.volumeCurrent}
              </div>
              <StatDelta changePct={r.volumeChangePct} />
            </td>

            <td className="whitespace-nowrap px-4 py-3">
              <div className="tabular-nums">{formatUsd(r.priceCurrent)}</div>
              <StatDelta changePct={r.priceChangePct} />
            </td>

            <td className="whitespace-nowrap px-4 py-3">
              <DivergenceBadge row={r} />
            </td>
          </tr>
        ))}
      </tbody>
      {selected &&
        createPortal(
          <DivergenceDetailModal
            key={selected.itemId}
            row={selected}
            initialWindowDays={windowDays}
            onClose={() => setSelected(null)}
          />,
          document.body
        )}
    </>
  );
}
