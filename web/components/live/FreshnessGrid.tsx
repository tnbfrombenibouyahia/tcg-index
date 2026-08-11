"use client";

import { useLocale, useTranslations } from "next-intl";
import { TcgIcon } from "@/components/homepage/TcgIcon";
import { TCGS } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/format";
import { getFreshnessTone, TONE_COLORS } from "@/lib/live";
import type { FreshnessCell, FreshnessSegment } from "@/lib/types";
import { StatusDot } from "./StatusDot";

const SEGMENT_ORDER: FreshnessSegment[] = ["items", "sealed", "single", "grading"];

// Depuis le 2026-08-11 (demande utilisateur : "supprime l'historique
// quotidien... remplie la page... fraîcheur des données par TCG à la
// place"), ce composant occupe SEUL toute la colonne gauche de /live (plus
// de DailyHealthTracker en dessous, cf. LiveDashboard) : les cartes
// s'étirent en `flex: 1` (une par TCG, empilées verticalement -- `flex`
// colonne plutôt que l'ancienne grille `auto-fit` qui les mettait côte à
// côte, pour qu'elles se partagent toute la hauteur disponible au lieu de
// se tasser en haut) et leurs 4 lignes internes se répartissent l'espace
// via `justify-content: space-evenly` plutôt que de rester collées en haut
// de la carte -- padding et tailles de police augmentés en conséquence
// (carte plus grande = contenu plus grand, pas juste plus de vide).
export function FreshnessGrid({ freshness }: { freshness: FreshnessCell[] }) {
  const t = useTranslations("live");
  const tSegments = useTranslations("live.segments");
  const locale = useLocale();

  return (
    <section style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <h2
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em", marginBottom: "10px", flexShrink: 0 }}
      >
        {t("freshnessTitle")}
      </h2>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        {TCGS.map(({ value: tcg, label }) => {
          const cells = SEGMENT_ORDER.map(
            (segment) => freshness.find((c) => c.tcg === tcg && c.segment === segment) ?? null
          );
          return (
            <div
              key={tcg}
              className="card-glass"
              style={{ flex: 1, minHeight: 0, padding: "22px 28px", display: "flex", flexDirection: "column" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexShrink: 0 }}>
                <TcgIcon tcg={tcg} />
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                  {label}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
                {SEGMENT_ORDER.map((segment, i) => {
                  const cell = cells[i];
                  const tone = getFreshnessTone(cell?.lastUpdated ?? null);
                  return (
                    <div
                      key={segment}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "14.5px", color: "var(--foreground)", fontWeight: 500 }}>
                        {tSegments(segment)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {cell?.constituents ? (
                          <span style={{ fontSize: "12px", color: "var(--foreground-subtle)" }}>
                            {t("tracked", { count: cell.constituents.toLocaleString(locale) })}
                          </span>
                        ) : null}
                        <span style={{ fontSize: "13px", color: "var(--foreground-muted)" }}>
                          {cell?.lastUpdated ? formatRelativeTime(cell.lastUpdated, locale) : t("noData")}
                        </span>
                        <StatusDot color={TONE_COLORS[tone]} size={8} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
