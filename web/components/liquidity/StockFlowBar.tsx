"use client";

import { useTranslations } from "next-intl";

// ─────────────────────────────────────────────────────────────────────────────
// Réponse directe à "à quel point ça part vite" (demande utilisateur,
// exemple Pikachu : des centaines de ventes/jour ET des milliers
// d'annonces -- liquide, mais pas ultra-liquide). Le pourcentage seul
// (sellThroughRate) noie cette nuance -- ce bloc ajoute deux choses :
// 1. une barre de proportion vendu/encore-en-vente (la composition réelle,
//    pas juste un ratio abstrait)
// 2. "jours pour écouler au rythme actuel" = stock / (ventes_30j / 30) --
//    normalise l'échelle ET le rythme en une seule unité de temps
//    intuitive, ce qu'aucun des deux chiffres bruts ne fait seul.
// Pas de graphique temporel du stock (active_listings n'a qu'UN
// instantané pour l'instant, cf. LiquidityModal) -- cette barre ne
// nécessite qu'un point dans le temps, donc affichable dès aujourd'hui.
// ─────────────────────────────────────────────────────────────────────────────

const STRONG = "#15803d";
const MEDIUM = "#a16207";
const WEAK = "var(--foreground-muted)";

export function StockFlowBar({ listingCount, salesCount30d }: { listingCount: number; salesCount30d: number }) {
  const t = useTranslations("liquidity.modal");

  const total = listingCount + salesCount30d;
  const pct = total > 0 ? (salesCount30d / total) * 100 : 0;
  const soldColor = pct >= 20 ? STRONG : pct >= 5 ? MEDIUM : WEAK;

  const daysToClear = salesCount30d > 0 ? Math.round((listingCount / salesCount30d) * 30) : null;

  return (
    <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("sellThrough")}</span>
        <span className="text-base font-bold tabular-nums" style={{ color: soldColor }}>
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--tint-neutral-strong)" }}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${total > 0 ? Math.max(pct, 2) : 0}%`, background: soldColor }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{t("sold30dLabel", { count: salesCount30d })}</span>
        <span>{t("stillListedLabel", { count: listingCount })}</span>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {daysToClear != null ? t("daysToClear", { days: daysToClear }) : t("noRecentSales")}
      </p>
    </div>
  );
}
