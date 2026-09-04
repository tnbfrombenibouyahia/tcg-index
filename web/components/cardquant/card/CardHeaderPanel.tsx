import type { ItemDetail } from "@/lib/types";
import { Badge } from "../core/Badge";
import { Button } from "../core/Button";
import { Delta } from "../data/Delta";
import { GradeChip } from "../market/GradeChip";

// Panneau d'en-tête de la Fiche carte CardQuant (cf. mémoire projet
// "cardquant-rebrand"). Le mockup utilise HoloCard (tilt/glare interactif,
// textures foil) -- porté plus tard avec la Scène 3D de la landing (même
// dépendance, cf. son commentaire) : ici, un cadre statique avec la vraie
// image si l'item en a une (la base en a pour la plupart des singles),
// sinon un repli typographique proche du fallback de HoloCard lui-même.
// "Ajouter à la watchlist" : bouton présent mais inerte -- le backend
// watchlist vit dans pricing_api (Python), pas encore consommé par web/
// (cf. mémoire projet "cardquant-rebrand").
function CardArt({ item }: { item: ItemDetail }) {
  const width = 116;
  const height = Math.round(width * 1.302);
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting)
      <img
        src={item.imageUrl}
        alt={item.name}
        style={{ width, height, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border-hairline)", flex: "none" }}
      />
    );
  }
  return (
    <div
      style={{
        width, height, flex: "none", borderRadius: 10, border: "6px solid var(--ink-600)",
        background: "linear-gradient(160deg, var(--ink-700), var(--ink-900))",
        display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2, padding: "10% 9%", boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: width * 0.09, color: "var(--white)", fontWeight: 400, lineHeight: 1.1 }}>{item.name}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: width * 0.06, color: "var(--green-400)", letterSpacing: "0.06em" }}>{item.setCode ?? "—"}</span>
    </div>
  );
}

const TCG_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };
const CATEGORY_LABEL: Record<string, string> = { sealed: "Scellé", single: "Carte" };
const BEST_GRADED_TIERS = ["psa10", "psa9.5", "psa9", "psa8", "psa7"] as const;

export function CardHeaderPanel({
  item,
  ungradedPrice,
  ungradedDeltaPct,
  bestGradedPrice,
  bestGradedTier,
  bestGradedDeltaPct,
}: {
  item: ItemDetail;
  ungradedPrice: number | null;
  ungradedDeltaPct: number | null;
  bestGradedPrice: number | null;
  bestGradedTier: string | null;
  bestGradedDeltaPct: number | null;
}) {
  const identity: { k: string; v: string }[] = [
    { k: "Jeu", v: TCG_LABEL[item.tcg] ?? item.tcg },
    { k: "Langue", v: item.language },
    { k: "Rareté", v: item.rarity ?? "—" },
    { k: "Set", v: item.setCode ?? "—" },
    { k: "Catégorie", v: CATEGORY_LABEL[item.category] ?? item.category },
    { k: "Numéro", v: item.code ?? "—" },
  ];

  return (
    <section style={{ flex: "1 1 290px", minHeight: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <CardArt item={item} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--text-muted)" }}>{item.setCode ?? item.code ?? "—"}</span>
          <h1 style={{ margin: 0, fontSize: "clamp(19px, 2.8vh, 26px)", fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15 }}>{item.name}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 4 }}>
            <Badge tone="outline" mono>{item.language}</Badge>
            {item.rarity ? <Badge tone="outline">{item.rarity}</Badge> : null}
            {BEST_GRADED_TIERS.filter((g) => item.latestPrices.some((p) => p.grade === g)).map((g) => (
              <GradeChip key={g} grader="PSA" grade={g === "psa9.5" ? "9.5" : g.replace("psa", "")} size="sm" />
            ))}
          </div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingTop: 8 }}>
            {bestGradedPrice != null ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Marché {bestGradedTier === "psa9.5" ? "PSA 9.5" : `PSA ${bestGradedTier?.replace("psa", "")}`}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(16px, 2.3vh, 21px)", color: "var(--text-strong)" }}>${bestGradedPrice.toFixed(2)}</span>
                {bestGradedDeltaPct != null ? <Delta value={Math.round(bestGradedDeltaPct * 10) / 10} size={12} /> : null}
              </div>
            ) : null}
            {ungradedPrice != null ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Brut</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(16px, 2.3vh, 21px)", color: "var(--text-strong)" }}>${ungradedPrice.toFixed(2)}</span>
                {ungradedDeltaPct != null ? <Delta value={Math.round(ungradedDeltaPct * 10) / 10} size={12} /> : null}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button variant="primary" size="sm">Ajouter à la watchlist</Button>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "var(--border-hairline)" }} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, rowGap: 12, flexWrap: "wrap", marginTop: "auto" }}>
        {identity.map((i) => (
          <div key={i.k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{i.k}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)" }}>{i.v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
