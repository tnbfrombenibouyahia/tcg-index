"use client";

import { useTranslations } from "next-intl";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { TCGS } from "@/lib/constants";
import type { DataCoverageRow } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Recap de couverture -- demande utilisateur 2026-08-09 : "% de données qu'on
// a par TCG en fonction des langues, quel type de cartes" + usage debug
// direct ("pourquoi cette carte n'a pas de prix ?"). Une carte par TCG (même
// pattern que FreshnessGrid), une ligne par langue × catégorie.
//
// "Précision" (trackedWithPrice/trackedItems) plutôt que "prix/TOUT le
// catalogue" -- suite à discussion utilisateur le même jour ("comment on
// améliore ces scores... je ne veux pas mentir à l'utilisateur final, base
// notre pourcentage sur notre choix de se focus uniquement sur les cartes
// d'intérêt"). Un ratio sur le catalogue entier noyait un vrai 91-100% de
// précision sous un choix de scope délibéré (seules les cartes avec
// interest_tier -- SIR/IR/FA/Secret/chase -- sont pricées pour les singles
// Pokémon, pas les commons, pour contenir le stockage, cf.
// [[project_price_sync_scope]]). Le scope lui-même reste expliqué en clair,
// juste via `InfoTooltip` (pastille "i") plutôt qu'un paragraphe toujours
// affiché -- demande utilisateur 2026-08-09 : le texte permanent prenait
// trop de place verticale ("même sur un écran 27 pouces je dois scroller").
// `trackedItems` reste montré comme contexte sous le total (colonne Items),
// pas comme un deuxième pourcentage qui ferait doublon.
// ─────────────────────────────────────────────────────────────────────────────

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function toneColor(p: number): string {
  if (p >= 70) return "var(--positive)";
  if (p >= 30) return "#d97706";
  return "var(--negative)";
}

function CoverageCell({ n, total, naWhenSealed }: { n: number; total: number; naWhenSealed?: boolean }) {
  if (naWhenSealed) {
    return <span style={{ fontSize: "12px", color: "var(--foreground-subtle)" }}>—</span>;
  }
  const p = pct(n, total);
  const color = toneColor(p);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "64px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
        <span style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "12.5px", fontWeight: 700, color }}>
          {p}%
        </span>
        <span style={{ fontSize: "10px", color: "var(--foreground-subtle)" }}>
          {n.toLocaleString()}/{total.toLocaleString()}
        </span>
      </div>
      <div style={{ height: "3px", borderRadius: "999px", background: "var(--tint-neutral-strong)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(p, 2)}%`, background: color, borderRadius: "999px" }} />
      </div>
    </div>
  );
}

export function DataCoverageSection({ rows }: { rows: DataCoverageRow[] }) {
  const t = useTranslations("live");
  const tSegments = useTranslations("live.segments");

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase"
        style={{
          color: "var(--foreground-muted)",
          letterSpacing: "0.10em",
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {t("coverageTitle")}
        <InfoTooltip text={t("coverageDescription")} />
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TCGS.map(({ value: tcg, label }) => {
          const tcgRows = rows.filter((r) => r.tcg === tcg);
          if (tcgRows.length === 0) return null;
          const tcgHasScope = tcgRows.some((r) => r.trackedItems < r.totalItems);
          return (
            <div key={tcg} className="card-glass" style={{ padding: "14px 18px", overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <TcgIcon tcg={tcg} />
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                  {label}
                </span>
                {tcgHasScope ? <InfoTooltip text={t("coverageScopeNote")} /> : null}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "620px" }}>
                <thead>
                  <tr>
                    {["colSegment", "colItems", "colRarity", "colPrecision", "colPriceRecent", "colImage"].map((k) => (
                      <th
                        key={k}
                        title={k === "colPrecision" ? t("colPrecisionHint") : undefined}
                        style={{
                          textAlign: "left",
                          fontSize: "10.5px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--foreground-subtle)",
                          padding: "0 12px 6px 0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tcgRows.map((row) => {
                    const scoped = row.trackedItems < row.totalItems;
                    return (
                      <tr key={`${row.language}-${row.category}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 12px 7px 0", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <LanguageFlag language={row.language} size={14} />
                            <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>{tSegments(row.category)}</span>
                          </span>
                        </td>
                        <td style={{ padding: "7px 12px 7px 0" }}>
                          <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "13px", color: "var(--foreground)" }}>
                            {row.totalItems.toLocaleString()}
                          </div>
                          {scoped ? (
                            <div style={{ fontSize: "10.5px", color: "var(--foreground-subtle)", whiteSpace: "nowrap" }}>
                              {t("colItemsTracked", { count: row.trackedItems.toLocaleString() })}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: "7px 12px 7px 0" }}>
                          <CoverageCell n={row.withRarity} total={row.totalItems} naWhenSealed={row.category === "sealed"} />
                        </td>
                        <td style={{ padding: "7px 12px 7px 0" }}>
                          <CoverageCell n={row.trackedWithPrice} total={row.trackedItems} />
                        </td>
                        <td style={{ padding: "7px 12px 7px 0" }}>
                          <CoverageCell n={row.trackedWithRecentPrice} total={row.trackedItems} />
                        </td>
                        <td style={{ padding: "7px 0" }}>
                          <CoverageCell n={row.withImage} total={row.totalItems} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
