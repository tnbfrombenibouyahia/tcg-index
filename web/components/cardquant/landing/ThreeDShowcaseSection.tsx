import { Icon } from "../core/Icon";
import { LiquidityMeter } from "../market/LiquidityMeter";
import { SegmentBar } from "../data/SegmentBar";
import { HoloCard } from "../market/HoloCard";

// "Scène 3D" (Scène des 14 indicateurs) de la landing CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- exemple illustratif fixe assumé comme tel
// (même carte Zoro/Umbreon que le Hero, mêmes chiffres que le handoff,
// disclaimer "Valeurs d'exemple" en pied de section comme dans le mockup) :
// prolonge le même récit que HeroSection.tsx, pas une deuxième donnée à
// justifier. Seule section de la landing à utiliser HoloCard/foil.css.
type Plate = { label: string; value: React.ReactNode; unit?: React.ReactNode; note: string; extra?: React.ReactNode };

const LEFT_PLATES: Plate[] = [
  {
    label: "Score d'opportunité",
    value: "52", unit: "/ 100 · prix correct",
    note: "",
    extra: (
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ flex: 1, borderRadius: 2, height: i === 5 ? 16 : 10, background: i === 5 ? "var(--green-400)" : i < 6 ? "var(--text-strong)" : "var(--grey-200)" }} />
        ))}
      </div>
    ),
  },
  { label: "Prix de marché", value: "$4,688.32", note: "PriceCharting · synchro 4h" },
  { label: "Moy. 3 dernières ventes", value: "$4,539.40", note: "eBay · 21 derniers jours" },
  { label: "Moy. 10 dernières ventes", value: "$4,704.02", note: "eBay · 90 derniers jours" },
  { label: "Population PSA", value: "1 284", unit: "slabs en PSA 10 · gem 43,6%", note: "" },
  { label: "Verdict ponctuel", value: <span style={{ color: "var(--down-500)" }}>Survendu</span>, unit: <span style={{ color: "var(--text-muted)" }}>seuil 10 %</span>, note: "annonce au-dessus de la référence agrégée" },
  { label: "Divergence prix / volume", value: <span style={{ color: "var(--up-600)" }}>+34 %</span>, unit: <span style={{ color: "var(--text-muted)" }}>volume 30 j</span>, note: "volume en hausse, prix stable sur 30 j" },
];

const RIGHT_PLATES: Plate[] = [
  { label: "Liquidité 90j", value: <LiquidityMeter value={58} steps={12} label="" />, note: "18 ventes · délai médian 11j" },
  { label: "Comparaison par langue", value: <span style={{ color: "var(--down-500)" }}>-22,4 %</span>, unit: <span style={{ color: "var(--text-muted)" }}>JP vs EN</span>, note: "$3,638 · frais d'import exclus" },
  { label: "ROI gradation", value: <span style={{ color: "var(--up-600)" }}>+48,3 %</span>, note: "brut $1,240 · frais PSA $185" },
  { label: "Calculateur d'arbitrage", value: <span style={{ color: "var(--down-500)" }}>+809.04 $</span>, unit: <span style={{ color: "var(--down-500)" }}>+17,3 %</span>, note: "écart de l'annonce vs marché" },
  { label: "Positionnement dans le set", value: "#3", unit: <span style={{ color: "var(--text-muted)" }}>/ 118</span>, note: "sur 118 cartes · Wings of the Captain" },
  { label: "Prime PSA 10 / 9", value: "×2,4", unit: <span style={{ color: "var(--text-muted)" }}>PSA</span>, note: "écart de valorisation entre notes" },
  {
    label: "Sell-through 30 j", value: "71,7 %", unit: <span style={{ color: "var(--text-muted)" }}>médiane</span>, note: "part des annonces vendues sur la période",
    extra: <SegmentBar segments={[{ value: 44, color: "var(--text-strong)" }, { value: 33, color: "var(--green-400)" }]} hatchFrom={78} height={8} />,
  },
];

function PlateCard({ plate, side, index }: { plate: Plate; side: "l" | "r"; index: number }) {
  const delay = 0.35 + index * 0.18;
  return (
    <div
      style={{
        transformStyle: "preserve-3d", animation: `cq-plate-${side} 14s var(--ease-out) infinite`, animationDelay: `${delay}s`,
        background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, padding: "13px 15px",
        display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 20px 44px rgba(0,0,0,.55)",
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{plate.label}</span>
      {typeof plate.value === "string" ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 19, whiteSpace: "nowrap", color: "var(--text-strong)" }}>{plate.value}</span>
          {plate.unit ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{plate.unit}</span> : null}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 19, whiteSpace: "nowrap" }}>{plate.value}{plate.unit}</div>
      )}
      {plate.extra}
      {plate.note ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{plate.note}</span> : null}
    </div>
  );
}

function SearchBarMock({ query, delay = 0 }: { query: string; delay?: number }) {
  return (
    <div style={{ width: "100%", maxWidth: 248, height: 36, padding: "0 13px", transform: "translateZ(70px)", borderRadius: 999, background: "var(--white)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
      <Icon name="search" size={13} color="var(--green-400)" />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", animation: "cq-query 14s steps(27, end) infinite", animationDelay: `${delay}s` }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)" }}>{query}</span>
      </span>
      <span style={{ width: 1.5, height: 14, background: "var(--green-400)", animation: "cq-caret 1s steps(1, end) infinite", flex: "none" }} />
    </div>
  );
}

function ShowcaseCard({ name, set, tag, delay = 0 }: { name: string; set: string; tag: string; delay?: number }) {
  return (
    <div style={{ position: "relative", width: 232, marginBottom: 46, transformStyle: "preserve-3d", animation: "cq-float 14s var(--ease-in-out) infinite", animationDelay: `${delay}s` }}>
      <span style={{ position: "absolute", left: 0, bottom: -22, width: 232, height: 40, borderRadius: 999, background: "radial-gradient(ellipse at center, rgba(118,251,145,.40) 0%, rgba(118,251,145,0) 70%)", filter: "blur(10px)", pointerEvents: "none" }} />
      <HoloCard name={name} set={set} foil="holo" width={232} showcase />
      <span style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}>
        <span style={{ position: "absolute", top: "-30%", left: 0, width: "46%", height: "160%", background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.26) 50%, rgba(255,255,255,0) 100%)", mixBlendMode: "screen", animation: "cq-sheen 14s var(--ease-out) infinite", animationDelay: `${delay}s` }} />
      </span>
      <span style={{ position: "absolute", left: -2, right: -2, top: 0, height: 3, borderRadius: 999, background: "var(--green-400)", boxShadow: "0 0 26px 8px rgba(118,251,145,.55)", pointerEvents: "none", animation: "cq-scan 14s linear infinite", animationDelay: `${delay}s` }} />
      <span style={{ position: "absolute", left: 0, right: 0, bottom: -34, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green-400)", animation: "cq-pulse 1.6s var(--ease-in-out) infinite" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{tag}</span>
      </span>
    </div>
  );
}

export function ThreeDShowcaseSection() {
  return (
    <section style={{ position: "relative", overflow: "hidden", background: "var(--surface-page)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", width: 900, height: 900, margin: "-450px 0 0 -450px", borderRadius: 999, background: "radial-gradient(circle, rgba(118,251,145,.10) 0%, rgba(118,251,145,0) 60%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", maxWidth: 1600, margin: "0 auto", padding: "72px 24px 24px", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--green-400)" }}>L&apos;effet CardQuant</span>
        <h2 style={{ margin: 0, fontSize: 38, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)", maxWidth: 640 }}>
          14 indicateurs sur le même écran, pour décider en quelques secondes.
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-body)", maxWidth: 460 }}>
          Chaque carte identifiée déclenche le même calcul complet : de quoi capter une bonne opportunité en moins de 20 secondes.
        </p>
      </div>

      <div style={{ position: "relative", perspective: 1600, maxWidth: 1600, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) auto minmax(200px, 1fr)", gap: 18, alignItems: "center", transformStyle: "preserve-3d", animation: "cq-rig 24s var(--ease-in-out) infinite" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {LEFT_PLATES.map((p, i) => (
              <PlateCard key={p.label} plate={p} side="l" index={i} />
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 28, paddingTop: 26 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <SearchBarMock query="roronoa zoro alt art psa 10" />
              <ShowcaseCard name="Roronoa Zoro" set="OP06 · 118" tag="ONE PIECE · OP06 · 118" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <SearchBarMock query="umbreon vmax alt art psa 10" />
              <ShowcaseCard name="Umbreon VMAX" set="SWSH7 · 215" tag="POKÉMON · SWSH7 · 215" delay={-1.2} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {RIGHT_PLATES.map((p, i) => (
              <PlateCard key={p.label} plate={p} side="r" index={i} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 56px", display: "flex", justifyContent: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Valeurs d&apos;exemple. Prix indicatifs agrégés de sources tierces — pas un conseil d&apos;investissement.</span>
      </div>
    </section>
  );
}
