import Link from "next/link";

// "Le terminal" de la landing CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- très simplifiée vs le mockup : celui-ci
// composait un faux poste double écran en incrustant une capture d'écran
// PNG absente du handoff (`uploads/pasted-....png`, jamais livrée) sous des
// tuiles à 5px de police, impossible à reproduire à l'identique et de toute
// façon peu lisible à l'échelle réelle. Le vrai Dashboard existe désormais
// (cf. app/(cardquant)/dashboard) : ce cadre en donne un aperçu stylisé à une
// échelle lisible, avec un vrai lien vers l'écran réel plutôt qu'une capture
// figée.
const FEATURES = [
  { title: "Catalogue", body: "Le catalogue complet, filtrable par jeu, édition, rareté et état." },
  { title: "Live", body: "La tape des synchronisations et des ventes conclues, avec l'écart au marché." },
  { title: "Population PSA", body: "Distribution des notes, gem rate et croissance de la population gradée." },
  { title: "Watchlist et PnL", body: "Surveille des cartes et suis tes propres transactions au même endroit." },
];

export function TerminalPreviewSection() {
  return (
    <section id="terminal" style={{ maxWidth: 1600, margin: "0 auto", padding: "72px 24px 0", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 660 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Le terminal</span>
          <h2 style={{ margin: 0, fontSize: 38, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)" }}>
            Le poste de travail d&apos;un analyste de marché.
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-body)", maxWidth: 340 }}>
          L&apos;extension répond sur une carte. Le terminal tient le marché entier — chaleur des sets, indice, tape des ventes, populations gradées, watchlist.
        </p>
      </div>

      <div style={{ position: "relative", overflow: "hidden", padding: "18px 22px 22px", background: "#050605", border: "1px solid var(--border-hairline)", borderRadius: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ position: "absolute", left: "50%", top: -180, width: 900, height: 620, marginLeft: -450, borderRadius: 999, background: "radial-gradient(ellipse at center, rgba(118,251,145,.13) 0%, rgba(118,251,145,0) 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: "#FFFFFF" }}>CARDQUANT</span>
          <span style={{ width: 1, height: 14, background: "var(--border-hairline)" }} />
          <span style={{ fontSize: 11.5, color: "#8A918C" }}>Dashboard · Catalogue · Live · Transactions · Population PSA · Watchlist · PnL</span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "#8A918C" }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--up-600)" }} />
            SYNCHRO OK
          </span>
        </div>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {[
            { label: "Ventes Pokémon · S-1", value: "812", note: "+7,2% vs S-2" },
            { label: "Écarts actifs", value: "37", note: "cartes" },
            { label: "ROI gradation moyen", value: "31,4%", note: "SegmentBar" },
            { label: "Sell-through 30j", value: "71,7%", note: "médiane du marché" },
          ].map((k) => (
            <div key={k.label} style={{ background: "#121412", border: "1px solid #242724", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A918C" }}>{k.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "#FFFFFF" }}>{k.value}</span>
              <span style={{ fontSize: 9.5, color: "#6E756F" }}>{k.note}</span>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", display: "flex", justifyContent: "center", paddingTop: 4 }}>
          <Link
            href="/dashboard"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 20px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 13, fontWeight: 500 }}
          >
            Ouvrir le Terminal
          </Link>
        </div>
        <span style={{ position: "relative", textAlign: "center", fontSize: 10.5, color: "#6E756F" }}>Aperçu — valeurs d&apos;exemple, le vrai Dashboard tourne sur des données réelles.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "1px solid var(--border-hairline)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-strong)" }}>{f.title}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--text-body)" }}>{f.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
