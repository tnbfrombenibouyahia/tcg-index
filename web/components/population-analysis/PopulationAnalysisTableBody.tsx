"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { PopulationRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import type { PopulationPriceGrade } from "@/lib/queries/populationAnalysis";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { PopulationDetailModal } from "./PopulationDetailModal";

const PRICE_FIELD: Record<PopulationPriceGrade, "ungradedPrice" | "psa8Price" | "psa9Price" | "psa10Price"> = {
  ungraded: "ungradedPrice",
  psa8: "psa8Price",
  psa9: "psa9Price",
  psa10: "psa10Price",
};

// Heatmap de rareté (demande utilisateur 2026-08-11) -- teinte inversée :
// plus la population est BASSE, plus la cellule est foncée (rampe séquentielle
// --heat-* de globals.css, cf. son commentaire). Volontairement l'inverse de
// la convention "plus de couleur = plus de quantité" -- ici c'est la RARETÉ
// qu'on veut faire ressortir visuellement, pas juste redire le nombre déjà
// affiché en texte à côté. Légende explicite dans PopulationAnalysisTable
// (jamais color-alone, cf. skill dataviz).
//
// Basé sur le RANG PERCENTILE (0..1, cf. PopulationRow.grade10Percentile),
// pas un simple ratio valeur/max -- la distribution de population a une
// queue très longue (quelques cartes à 5 chiffres, l'immense majorité à 1-2
// chiffres) : un ratio linéaire écrasait quasi toute la page au même niveau
// d'intensité (constaté en conditions réelles, toutes les cellules à 56%
// quel que soit le nombre affiché). Le rang percentile reste lisible quelle
// que soit la forme de la distribution. Plancher/plafond d'opacité pour que
// le texte reste lisible même à l'extrême le plus foncé.
function heatStyle(percentile: number): React.CSSProperties {
  const rarity = 1 - percentile;
  const pct = Math.round((0.06 + rarity * 0.5) * 100);
  return { backgroundColor: `color-mix(in srgb, var(--heat-500) ${pct}%, transparent)` };
}

// ─── Table body, cliquable -- ouvre PopulationDetailModal sur la ligne sélectionnée ──
export function PopulationAnalysisTableBody({
  rows,
  priceGrade = "ungraded",
}: {
  rows: PopulationRow[];
  priceGrade?: PopulationPriceGrade;
}) {
  const [selected, setSelected] = useState<PopulationRow | null>(null);
  const priceField = PRICE_FIELD[priceGrade];

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

            {/* Price at the selected price grade (context for the min-price filter) */}
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium">
              {r[priceField] != null ? formatUsd(r[priceField]) : "—"}
            </td>

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
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold" style={heatStyle(r.grade10Percentile)}>
              {r.population.popGrade10.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium" style={heatStyle(r.totalPercentile)}>
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
