import Link from "next/link";
import type { DivergenceRow } from "@/lib/types";
import { classifyDivergence, type DivergenceTag } from "@/lib/divergenceTag";

const TAG_LABEL: Record<DivergenceTag, string> = {
  accumulation: "Accumulation",
  distribution: "Distribution",
  alignedUp: "Aligné ↑",
  alignedDown: "Aligné ↓",
};
const TAG_COLOR: Record<DivergenceTag, string> = {
  accumulation: "var(--up-600)",
  distribution: "var(--down-500)",
  alignedUp: "var(--text-muted)",
  alignedDown: "var(--text-muted)",
};

// "Divergence prix / volume" de l'écran Sous-évalué CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- réutilise lib/queries/divergence.ts::getDivergence
// + lib/divergenceTag.ts::classifyDivergence tels quels (déjà en prod sur
// /divergence), réel.
export function PriceVolumeDivergencePanel({ rows }: { rows: DivergenceRow[] }) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Divergence prix / volume</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>accumulation (prix↓, volume↑) vs distribution (prix↑, volume↓)</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 58px 54px 54px 92px", gap: 8, alignItems: "center", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5 }}>
        <span>Carte</span>
        <span style={{ textAlign: "right" }}>Prix</span>
        <span style={{ textAlign: "right" }}>Δ prix</span>
        <span style={{ textAlign: "right" }}>Δ vol.</span>
        <span style={{ textAlign: "right" }}>Signal</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Aucune divergence marquante en ce moment.</span>
        ) : (
          rows.map((r) => {
            const tag = classifyDivergence(r.priceChangePct, r.volumeChangePct);
            return (
              <Link key={r.itemId} href={`/catalog/${r.itemId}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) 58px 54px 54px 92px", gap: 8, alignItems: "center", color: "inherit" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setCode ?? "—"}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>${r.priceCurrent.toFixed(2)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: r.priceChangePct >= 0 ? "var(--up-600)" : "var(--down-500)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.priceChangePct >= 0 ? "+" : ""}
                  {r.priceChangePct.toFixed(0)}%
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: r.volumeChangePct >= 0 ? "var(--up-600)" : "var(--down-500)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.volumeChangePct >= 0 ? "+" : ""}
                  {r.volumeChangePct.toFixed(0)}%
                </span>
                <span style={{ justifySelf: "end", padding: "3px 10px", borderRadius: 999, border: `1px solid ${TAG_COLOR[tag]}`, color: TAG_COLOR[tag], fontSize: 10.5, whiteSpace: "nowrap" }}>{TAG_LABEL[tag]}</span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
