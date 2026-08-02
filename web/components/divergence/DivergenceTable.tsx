import { getTranslations } from "next-intl/server";
import { formatUsd } from "@/lib/format";
import type { DivergenceRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SortHeader } from "@/components/ui/SortHeader";
import { StatDelta } from "@/components/ui/StatDelta";

// ─── Badge de direction ────────────────────────────────────────────────────────
// Le score seul (écart en points de %) ne dit pas grand-chose sans direction --
// ce badge traduit la combinaison prix/volume en 3 lectures : les deux
// mouvements opposés (les cas "intéressants" pour ce détecteur) ou alignés
// (mouvement confirmé, moins notable). Réutilise le ton ambre déjà utilisé par
// ScoreBadge (Undervalued) pour "notable mais pas critique", plutôt
// qu'inventer une nouvelle couleur.
function DivergenceBadge({
  row,
  labels,
}: {
  row: DivergenceRow;
  labels: { aligned: string; priceUpVolumeDown: string; priceDownVolumeUp: string };
}) {
  const priceUp = row.priceChangePct >= 0;
  const volumeUp = row.volumeChangePct >= 0;
  const opposite = priceUp !== volumeUp;
  const label = !opposite ? labels.aligned : priceUp ? labels.priceUpVolumeDown : labels.priceDownVolumeUp;
  const strong = opposite && Math.abs(row.divergenceScore) >= 30;

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: strong ? "rgba(180, 120, 20, 0.1)" : "rgba(26, 26, 26, 0.06)",
        color: strong ? "#a16207" : "#8A8480",
      }}
    >
      {label}
    </span>
  );
}

export async function DivergenceTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: DivergenceRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("divergence.table");
  const labels = {
    aligned: t("badges.aligned"),
    priceUpVolumeDown: t("badges.priceUpVolumeDown"),
    priceDownVolumeUp: t("badges.priceDownVolumeUp"),
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">{t("card")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("language")}
                ascValue="language_asc"
                descValue="language_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("volume")}
                ascValue="volume_delta_asc"
                descValue="volume_delta_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("price")}
                ascValue="price_delta_asc"
                descValue="price_delta_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("divergence")}
                ascValue="divergence_asc"
                descValue="divergence_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/divergence"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes inconnus à l'avance, cf. plan §5
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
                <DivergenceBadge row={r} labels={labels} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
