import { getTranslations } from "next-intl/server";

// ─────────────────────────────────────────────────────────────────────────────
// Petit badge de provenance ("d'où vient la donnée de cette page/ligne" --
// demande utilisateur). Texte + pastille de couleur, PAS de logo réel (juste
// une attribution factuelle, comme une citation de source -- pas une
// prétention à représenter la marque). Deux niveaux d'usage :
// - `SourceBadges` : ligne "Source : X, Y" sous le titre d'une page --
//   provenance globale de l'analyse (ex. Liquidité = eBay + PriceCharting).
// - `SourceBadge` seul : réutilisé aussi par ligne de tableau quand la vraie
//   place de marché varie d'une ligne à l'autre (Transactions -- sales.marketplace
//   est déjà eBay/TCGPlayer/Goldin/Heritage/PWCC selon la vente, cf.
//   lib/queries/sales.ts).
//
// Couverture des clés réellement présentes en base (vérifié 2026-08-07) :
// price_snapshots.source ∈ {justtcg, pricecharting}, sales.marketplace ∈
// {ebay, tcgplayer, goldin, heritage, pwcc}, items.source ∈ {apitcg,
// pricecharting}, active_listings.marketplace = {ebay}.
// ─────────────────────────────────────────────────────────────────────────────

interface SourceInfo {
  label: string;
  color: string;
  bg: string;
}

const SOURCE_INFO: Record<string, SourceInfo> = {
  ebay: { label: "eBay", color: "#1a56b3", bg: "rgba(26, 86, 179, 0.1)" },
  pricecharting: { label: "PriceCharting", color: "#0f766e", bg: "rgba(15, 118, 110, 0.1)" },
  tcgplayer: { label: "TCGPlayer", color: "#7e22ce", bg: "rgba(126, 34, 206, 0.1)" },
  apitcg: { label: "API TCG", color: "#57534e", bg: "rgba(87, 83, 78, 0.1)" },
  justtcg: { label: "JustTCG", color: "#78716c", bg: "rgba(120, 113, 108, 0.1)" },
  goldin: { label: "Goldin", color: "#78716c", bg: "rgba(120, 113, 108, 0.1)" },
  heritage: { label: "Heritage", color: "#78716c", bg: "rgba(120, 113, 108, 0.1)" },
  pwcc: { label: "PWCC", color: "#78716c", bg: "rgba(120, 113, 108, 0.1)" },
};

function infoFor(source: string): SourceInfo {
  return SOURCE_INFO[source.toLowerCase()] ?? { label: source, color: "var(--foreground-muted)", bg: "var(--tint-neutral)" };
}

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const info = infoFor(source);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${className ?? ""}`}
      style={{ color: info.color, background: info.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {info.label}
    </span>
  );
}

// Ligne "Source : X, Y" -- placée sous le titre/description de chaque page
// d'analyse, avant le pavé méthodologie quand il existe. Server Component
// (comme les pages qui l'utilisent) : `getTranslations` server-side, pas le
// hook client -- `SourceBadge` seul ne traduit rien (noms propres) donc reste
// utilisable tel quel côté client (ex. TransactionsTable, lui aussi async
// Server Component).
export async function SourceBadges({ sources }: { sources: string[] }) {
  const t = await getTranslations("common");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t("sourceLabel")}</span>
      {sources.map((s) => (
        <SourceBadge key={s} source={s} />
      ))}
    </div>
  );
}
