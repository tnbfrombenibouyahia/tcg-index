"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { GRADE_LABELS, type Grade } from "@/lib/constants";
import { formatDate, formatUsd } from "@/lib/format";
import type { ItemSummary, SaleRow } from "@/lib/types";
import { InterestTierBadge } from "@/components/ui/InterestTierBadge";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ItemDetailModal } from "@/components/catalog/ItemDetailModal";

// ─────────────────────────────────────────────────────────────────────────────
// Table body, cliquable -- ouvre ItemDetailModal (même popup verre que le
// catalogue) sur la carte de la ligne sélectionnée, même pattern que
// UndervaluedTableBody/SealedEvTableBody (demande utilisateur : rebondir sur
// l'analyse complète d'une carte depuis son historique de ventes).
// `sale.title` (titre brut de l'annonce PriceCharting, QA du matching, cf.
// schema.sql) affiché via InfoTooltip quand présent -- beaucoup de ventes
// plus anciennes n'ont pas ce champ, pas d'icône dans ce cas.
// ─────────────────────────────────────────────────────────────────────────────
export function TransactionsTableBody({ sales }: { sales: SaleRow[] }) {
  const t = useTranslations("transactions.table");
  const locale = useLocale();
  const [selected, setSelected] = useState<ItemSummary | null>(null);

  return (
    <>
      <tbody>
        {sales.map((sale) => (
          <tr
            key={sale.id}
            className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
            onClick={() => setSelected(sale.item)}
          >
            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(sale.saleDate, locale)}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                {sale.item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes inconnus à l'avance, cf. plan §5
                  <img
                    src={sale.item.imageUrl}
                    alt={sale.item.name}
                    loading="lazy"
                    className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 flex-shrink-0 rounded-md bg-muted" />
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium">{sale.item.name}</p>
                    {sale.title && <InfoTooltip text={t("listingTitleTooltip", { title: sale.title })} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sale.item.setCode}
                    {sale.item.code ? ` · ${sale.item.code}` : ""}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <LanguageFlag language={sale.item.language} />
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {GRADE_LABELS[sale.grade as Grade] ?? sale.grade}
              </span>
            </td>
            <td className="px-4 py-3">
              {sale.item.rarity ? (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {sale.item.rarity}
                  </span>
                  <InterestTierBadge tier={sale.item.interestTier} />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </td>
            <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{formatUsd(sale.price)}</td>
            <td className="whitespace-nowrap px-4 py-3">
              <SourceBadge source={sale.marketplace} />
            </td>
          </tr>
        ))}
      </tbody>
      {/* Portal : même raison que les autres TableBody -- un <div> ne peut
          pas être un frère valide de <tbody> dans un <table>. */}
      {selected &&
        createPortal(<ItemDetailModal key={selected.id} item={selected} onClose={() => setSelected(null)} />, document.body)}
    </>
  );
}
