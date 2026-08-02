"use client";

import { useTranslations } from "next-intl";
import type { DivergenceRow } from "@/lib/types";
import { classifyDivergence } from "@/lib/divergenceTag";

// Badge partagé entre le tableau et la modale de détail -- réutilise le ton
// ambre déjà utilisé par ScoreBadge (Undervalued) pour "notable" plutôt
// qu'inventer une nouvelle couleur. Accumulation/Distribution (les deux cas
// où prix et volume divergent) sont mis en avant ; les deux cas alignés sont
// neutres (mouvement confirmé, moins surprenant).
export function DivergenceBadge({ row }: { row: DivergenceRow }) {
  const t = useTranslations("divergence.table.badges");
  const tag = classifyDivergence(row.priceChangePct, row.volumeChangePct);
  const opposite = tag === "accumulation" || tag === "distribution";
  const strong = opposite && Math.abs(row.divergenceScore) >= 30;

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: strong ? "rgba(180, 120, 20, 0.1)" : "rgba(26, 26, 26, 0.06)",
        color: strong ? "#a16207" : "#8A8480",
      }}
    >
      {t(tag)}
    </span>
  );
}
