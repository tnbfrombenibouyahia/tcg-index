import { getTranslations } from "next-intl/server";
import type { PopulationPriceOnlyRow } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// ─────────────────────────────────────────────────────────────────────────────
// Repli de recherche (demande utilisateur 2026-08-12, cf.
// [[project_population_analysis]]) : rendu UNIQUEMENT par page.tsx quand une
// recherche texte ne renvoie aucune carte côté population
// (`priceOnlyFallback` de getPopulationRanking, jamais dans le listing par
// défaut). Volontairement une liste simple, pas une table -- pas de colonnes
// PSA6-10/Total à afficher puisque la population est justement inconnue ici,
// juste carte + prix connu(s) + lien de sortie vers PriceCharting pour que
// l'utilisateur puisse vérifier lui-même (le cas qui a motivé cette
// fonctionnalité : Zoro/Nami "Manga" One Piece, où PriceCharting lui-même
// n'a aucune population publiée pour ces tirages précis -- le lien mène donc
// parfois vers une fiche produit qui confirme "rien à afficher", ce qui est
// le point : atteignable plutôt que silencieusement absent).
// ─────────────────────────────────────────────────────────────────────────────

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 2H14v4.5M14 2 7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export async function PopulationPriceOnlyFallback({ rows }: { rows: PopulationPriceOnlyRow[] }) {
  const t = await getTranslations("populationAnalysis");

  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4">
      <p className="mb-1 text-sm font-semibold text-foreground">{t("fallbackTitle")}</p>
      <p className="mb-4 text-xs text-muted-foreground">{t("fallbackDescription")}</p>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.itemId} className="flex items-center gap-3 py-2.5">
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

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <LanguageFlag language={r.language} />
                <p className="truncate font-medium">{r.name}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground capitalize">
                {r.tcg} · {r.setCode}
              </p>
            </div>

            <div className="flex-shrink-0 whitespace-nowrap text-right text-sm tabular-nums">
              {r.ungradedPrice != null && (
                <p className="font-medium">{formatUsd(r.ungradedPrice)}</p>
              )}
              {r.psa10Price != null && (
                <p className="text-xs text-muted-foreground">{t("table.grade10")} {formatUsd(r.psa10Price)}</p>
              )}
            </div>

            <a
              href={r.priceChartingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("fallbackViewLink")}
              <ExternalLinkIcon />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
