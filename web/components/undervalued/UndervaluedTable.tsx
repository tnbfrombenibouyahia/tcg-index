import { getTranslations } from "next-intl/server";
import { formatUsd } from "@/lib/format";
import type { UndervaluedRow } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { SortHeader } from "@/components/ui/SortHeader";

// ─── Score badge ──────────────────────────────────────────────────────────────
// Couleur et label selon le ratio undervalued_score :
// ≥ 5× = signal fort (vert profond), 2-5× = intéressant (ambre), < 2× = faible (gris)
function ScoreBadge({ score }: { score: number }) {
  const isStrong = score >= 5;
  const isMedium = score >= 2 && score < 5;

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 8px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    background: isStrong
      ? "rgba(21, 128, 61, 0.1)"
      : isMedium
      ? "rgba(180, 120, 20, 0.1)"
      : "rgba(26, 26, 26, 0.06)",
    color: isStrong ? "#15803d" : isMedium ? "#a16207" : "#8A8480",
  };

  return (
    <span style={style}>
      {score.toFixed(1)}×
    </span>
  );
}

// ─── Pull rate visual ─────────────────────────────────────────────────────────
// Affiche le pull rate sous forme "1 / N" plutôt qu'un décimal abscons
function PullRateDisplay({ pullRate }: { pullRate: number | null }) {
  if (!pullRate || pullRate <= 0) return <span className="text-muted-foreground">—</span>;
  const n = Math.round(1 / pullRate);
  return (
    <span className="tabular-nums text-muted-foreground text-xs">
      1/{n}
    </span>
  );
}

// ─── Main table component ─────────────────────────────────────────────────────
export async function UndervaluedTable({
  rows,
  sort = "",
  searchParams = new URLSearchParams(),
}: {
  rows: UndervaluedRow[];
  sort?: string;
  searchParams?: URLSearchParams;
}) {
  const t = await getTranslations("undervalued.table");

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
                basePath="/undervalued"
              />
            </th>
            <th className="px-4 py-3">{t("tcg")}</th>
            <th className="px-4 py-3">{t("rarity")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("marketPrice")}
                ascValue="market_asc"
                descValue="market_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/undervalued"
              />
            </th>
            <th className="px-4 py-3">{t("pullCost")}</th>
            <th className="px-4 py-3">{t("pullRate")}</th>
            <th className="px-4 py-3">
              <SortHeader
                label={t("score")}
                ascValue="score_asc"
                descValue="score_desc"
                currentSort={sort}
                searchParams={searchParams}
                basePath="/undervalued"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.itemId}
              className="border-b border-border last:border-0 hover:bg-muted/50"
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
                      className="h-12 w-9 flex-shrink-0 rounded-md object-contain bg-white"
                      style={{ aspectRatio: "3/4" }}
                    />
                  ) : (
                    <div className="h-12 w-9 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[220px]">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {r.setCode}
                    </p>
                  </div>
                </div>
              </td>

              {/* Language */}
              <td className="px-4 py-3">
                <LanguageFlag language={r.language} />
              </td>

              {/* TCG */}
              <td className="px-4 py-3 capitalize text-muted-foreground">{r.tcg}</td>

              {/* Rarity */}
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {r.rarity ?? "—"}
              </td>

              {/* Market price */}
              <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">
                {formatUsd(r.marketPrice)}
              </td>

              {/* Pull cost */}
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                {r.pullCost != null ? formatUsd(r.pullCost) : "—"}
              </td>

              {/* Pull rate */}
              <td className="px-4 py-3">
                <PullRateDisplay pullRate={r.pullRate} />
              </td>

              {/* Score */}
              <td className="px-4 py-3">
                <ScoreBadge score={r.undervaluedScore} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
