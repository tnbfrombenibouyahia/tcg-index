import type { CoverageCard } from "@/lib/queries/landingCoverage";
import { SegmentBar } from "../data/SegmentBar";

// Section "Couverture" de la landing CardQuant (cf. mémoire projet
// "cardquant-rebrand"). `cards` vient de
// lib/queries/landingCoverage.ts::getCoverageCards -- remplace les chiffres
// d'exemple du mockup par de vrais comptages, même principe que le bandeau
// de stats déjà en place sur l'ancienne landing (getLandingStats).
const GAME_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };

export function CoverageSection({ cards }: { cards: CoverageCard[] }) {
  return (
    <section id="couverture" style={{ maxWidth: 1600, margin: "0 auto", padding: "80px 24px 0", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 620 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Couverture</span>
          <h2 style={{ margin: 0, fontSize: 38, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)" }}>
            Deux jeux, quatre catalogues, brut et gradé.
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-body)", maxWidth: 340 }}>
          Chaque édition a son propre marché. Les prix japonais ne sont pas les prix anglais convertis — nous les suivons séparément.
        </p>
      </div>

      {cards.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Couverture en cours de chargement.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {cards.map((c) => (
            <section key={`${c.tcg}-${c.language}`} style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px solid var(--border-strong)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-body)" }}>
                  {c.language}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{GAME_LABEL[c.tcg] ?? c.tcg}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-core)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>
                  {c.cardsCount.toLocaleString("fr-FR")}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>cartes</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                  <span>Sets suivis</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-body)" }}>{c.setsCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                  <span>Slabs suivis</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-body)" }}>{c.slabsTracked.toLocaleString("fr-FR")}</span>
                </div>
              </div>
              <div style={{ marginTop: "auto" }}>
                <SegmentBar segments={[{ value: Math.round(c.pricedPct), color: "var(--green-400)" }]} hatchFrom={null} height={8} />
                <span style={{ display: "block", marginTop: 5, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {c.pricedPct.toFixed(0)}% pricées (30j)
                </span>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
