import { Icon } from "../core/Icon";

// "Extension Chrome" (comparaison "35 onglets vs 1") de la landing CardQuant
// (cf. mémoire projet "cardquant-rebrand") -- même récit illustratif que le
// mockup (aucune prétention de donnée réelle, narration avant/après), mais
// la bande d'onglets "Sans CardQuant" est générée depuis un petit tableau de
// libellés plutôt que recopiée telle quelle (20+ div quasi identiques dans
// le handoff) -- même effet visuel ("trop d'onglets ouverts"), sans le
// volume de code correspondant.
const FAKE_TABS = ["eBay", "Cardmarket", "Cardmarket", "PriceCharting", "PriceCharting", "PSA", "130point", "eBay ventes", "Reddit", "TCGplayer", "Google", "Suivi perso"];

const STEPS = [
  { n: "01", title: "Installer depuis le Chrome Web Store", body: "Aucune configuration, aucune carte bancaire." },
  { n: "02", title: "Ouvrir une annonce", body: "eBay, Vinted, boutiques : la carte est identifiée automatiquement." },
  { n: "03", title: "Lire le verdict", body: "Écart, liquidité, ROI gradation. Puis décider." },
];

export function ExtensionPitchSection() {
  return (
    <section style={{ marginTop: 80, background: "var(--surface-sunken)", position: "relative", overflow: "hidden", borderTop: "1px solid var(--border-hairline)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ position: "absolute", bottom: -300, left: "20%", width: 700, height: 700, borderRadius: 999, background: "radial-gradient(circle, rgba(118,251,145,.16) 0%, rgba(118,251,145,0) 62%)" }} />
      <div style={{ position: "relative", maxWidth: 1600, margin: "0 auto", padding: "80px 24px", display: "flex", flexDirection: "column", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--green-400)" }}>Extension Chrome</span>
          <h2 style={{ margin: 0, fontSize: 42, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.08, color: "var(--text-strong)", maxWidth: 540 }}>
            Trois clics, et plus jamais 35 onglets pour décider d&apos;un achat.
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: "1px solid var(--border-hairline)", borderBottom: i === STEPS.length - 1 ? "1px solid var(--border-hairline)" : undefined }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--green-400)", paddingTop: 3 }}>{s.n}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 15, color: "var(--text-strong)" }}>{s.title}</span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.body}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="#tarifs" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 42, padding: "0 22px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 14, fontWeight: 500 }}>
              Ajouter à Chrome
              <Icon name="arrow-up-right" size={14} color="#000" />
            </a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 20, alignItems: "stretch" }}>
          {/* Sans CardQuant */}
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(255,90,114,.32)", borderRadius: 12, overflow: "hidden", background: "#0A0B0A" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--down-400)" }}>Sans CardQuant</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>35 onglets, 6 sources, aucune conclusion</span>
              </div>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--down-400)", animation: "cq-blink 1.1s ease-in-out infinite" }} />
            </div>
            <div style={{ position: "relative", padding: "8px 8px 0", background: "#060706" }}>
              <div style={{ display: "flex", gap: 2, overflow: "hidden", flexWrap: "wrap" }}>
                {FAKE_TABS.map((label, i) => (
                  <div key={i} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4, height: 22, padding: "0 6px", borderRadius: "5px 5px 0 0", background: "#141614", overflow: "hidden" }}>
                    <span style={{ flex: "0 0 auto", width: 6, height: 6, borderRadius: 2, background: "#3A3F3A" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "#6C726C", whiteSpace: "nowrap" }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, padding: "6px 9px", borderRadius: 6, background: "#141614" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "#6C726C" }}>ebay.fr/itm/…</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px 16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  { k: "PriceCharting · raw", v: "142 €" },
                  { k: "eBay vendus · 10 dern.", v: "118 €" },
                  { k: "Cardmarket · trend", v: "96 €" },
                  { k: "130point · PSA 10", v: "? ? ?", color: "var(--down-400)" },
                ].map((r) => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 9px", border: "1px solid var(--border-hairline)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    <span>{r.k}</span>
                    <span style={{ color: r.color ?? "var(--text-strong)" }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 2 }}>
                {[{ k: "ONGLETS", v: "35" }, { k: "ROI PSA", v: "inconnu", color: "var(--down-400)" }, { k: "LIQUIDITÉ", v: "inconnue", color: "var(--down-400)" }].map((c) => (
                  <div key={c.k} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", border: "1px solid var(--border-hairline)", borderRadius: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--text-muted)" }}>{c.k}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: c.color ?? "var(--text-strong)" }}>{c.v}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--down-400)" }}>7 minutes plus tard : toujours pas de décision.</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, width: 64 }}>
            <div style={{ flex: 1, width: 1, background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, var(--border-hairline) 100%)" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 999, border: "1px solid var(--border-hairline)", background: "var(--surface-card)", fontSize: 17, fontWeight: 500, letterSpacing: "0.04em", color: "var(--text-strong)" }}>VS</div>
            <div style={{ flex: 1, width: 1, background: "linear-gradient(180deg, var(--border-hairline) 0%, rgba(255,255,255,0) 100%)" }} />
          </div>

          {/* Avec CardQuant */}
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(118,251,145,.34)", borderRadius: 12, overflow: "hidden", background: "#0A0B0A", boxShadow: "0 0 0 1px rgba(118,251,145,.06), 0 24px 70px rgba(118,251,145,.09)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--green-400)" }}>Avec CardQuant</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>1 onglet, 4 sources agrégées, un verdict</span>
              </div>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green-400)" }} />
            </div>
            <div style={{ position: "relative", padding: "8px 8px 0", background: "#060706" }}>
              <div style={{ display: "flex", gap: 2 }}>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: "5px 5px 0 0", background: "#141614" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--green-400)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-strong)", whiteSpace: "nowrap" }}>eBay · Zoro alt art</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, padding: "6px 9px", borderRadius: 6, background: "#141614" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "#6C726C" }}>ebay.fr/itm/…</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 999, background: "var(--green-400)", fontFamily: "var(--font-mono)", fontSize: 8, color: "#000" }}>CQ · actif</span>
              </div>
              <div style={{ height: 25 }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: 16, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 46, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--green-400)" }}>−17</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-body)" }}>% sous la référence agrégée</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 9px", border: "1px solid var(--border-hairline)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  <span>Référence agrégée · 4 sources</span>
                  <span style={{ color: "var(--text-strong)" }}>4 688 €</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 9px", border: "1px solid var(--border-hairline)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  <span>Annonce</span>
                  <span style={{ color: "var(--green-400)" }}>3 890 €</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[{ k: "ONGLETS", v: "1" }, { k: "ROI PSA", v: "+48,3%", color: "var(--green-400)" }, { k: "LIQUIDITÉ", v: "62 / 100" }].map((c) => (
                  <div key={c.k} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", border: "1px solid var(--border-hairline)", borderRadius: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--text-muted)" }}>{c.k}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: c.color ?? "var(--text-strong)" }}>{c.v}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--green-400)" }}>15 secondes plus tard : achat validé.</span>
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(118,251,145,0) 0%, rgba(118,251,145,.16) 50%, rgba(118,251,145,0) 100%)", animation: "cq-sweep 9s ease-in-out infinite" }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
