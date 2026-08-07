"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { UndervaluedRow } from "@/lib/types";
import { formatPct, formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// Widget Sous-évalué -- top scores undervalued_score (lib/queries/
// undervalued.ts, même source que /undervalued), univers actif.
//
// Le mockup distingue "Scellé"/"Carte" -- undervalued_scores n'a pas cette
// dimension (c'est structurellement du pull-cost de pack, cf. commentaire
// lib/queries/undervalued.ts), donc pas de filtre inventé ici : le drapeau
// langue remplace le badge de type, c'est le champ réel disponible.

export function UndervaluedWidget({ rows }: { rows: UndervaluedRow[] }) {
  const t = useTranslations("dashboard.undervalued");

  return (
    <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1 }}>
      {rows.length === 0 && (
        <p style={{ fontSize: "12px", color: "var(--foreground-subtle)", padding: "10px 0" }}>{t("empty")}</p>
      )}
      {rows.map((r) => {
        const gapPct = r.marketPrice > 0 ? ((r.theoreticalValue - r.marketPrice) / r.marketPrice) * 100 : 0;
        return (
          <Link
            key={r.itemId}
            href={`/catalog/${r.itemId}`}
            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border)" }}
          >
            <LanguageFlag language={r.language} size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.name}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--foreground-muted)" }}>
                {t("colCurrent")} {formatUsd(r.marketPrice)} · {t("colFair")} {formatUsd(r.theoreticalValue)}
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: "12px",
                fontWeight: 700,
                color: gapPct >= 0 ? "var(--positive)" : "var(--negative)",
                minWidth: "56px",
                textAlign: "right",
              }}
            >
              {formatPct(gapPct)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
