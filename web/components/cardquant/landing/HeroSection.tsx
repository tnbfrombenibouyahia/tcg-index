import { Icon } from "../core/Icon";
import { Badge } from "../core/Badge";
import { InstallExtensionCta } from "./InstallExtensionCta";

// Hero de la landing CardQuant (cf. mémoire projet "cardquant-rebrand") : le
// panneau "avant/après" est un exemple illustratif fixe (même carte, mêmes
// chiffres que dans le handoff), pas une donnée live -- cohérent avec la
// mention "Valeurs d'exemple" du mockup plus bas sur la page. La photo
// d'annonce est un simple placeholder gris : pas de vraie image à afficher
// ici (cf. handoff, section Assets), pas une image inventée.
function ListingPhotoPlaceholder() {
  return (
    <span style={{ display: "block", width: "100%", height: 92, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)" }} />
  );
}

function BrowserBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
      <span style={{ display: "flex", gap: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--grey-300)" }} />
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--grey-300)" }} />
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--grey-300)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        marketplace.com/itm/zoro-alt-art-psa10
      </span>
    </div>
  );
}

const ANALYSES: { label: string; value: string; color?: string }[] = [
  { label: "Score d'opportunité", value: "52 / 100" },
  { label: "Population PSA 10", value: "418 · gem 32,6 %" },
  { label: "Liquidité 90 j", value: "18 ventes · 11 j" },
  { label: "Arbitrage inter-langue", value: "JP −22,4 %", color: "var(--down-500)" },
  { label: "ROI gradation", value: "+48,3 %", color: "var(--up-600)" },
  { label: "Divergence prix / volume", value: "volume +34 %", color: "var(--up-600)" },
  { label: "Positionnement dans le set", value: "#3 / 118" },
];

export function HeroSection() {
  return (
    <section style={{ position: "relative", background: "var(--surface-page)", overflow: "hidden", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ position: "absolute", top: -220, right: -120, width: 760, height: 760, borderRadius: 999, background: "radial-gradient(circle, rgba(118,251,145,.20) 0%, rgba(118,251,145,0) 62%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", maxWidth: 1600, margin: "0 auto", padding: "88px 24px 96px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 56, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 620 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--green-400)" }}>Extension Chrome · Pokémon &amp; One Piece</span>
          <h1 style={{ margin: 0, maxWidth: 620, fontSize: 62, lineHeight: 1.02, fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
            Le prix réel d&apos;une carte, avant de cliquer sur acheter.
          </h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: "var(--text-body)", maxWidth: 520 }}>
            CardQuant lit l&apos;annonce ouverte dans ton navigateur, agrège quatre sources de prix — brut et gradé — et affiche l&apos;écart au marché en un panneau. Sans quitter la page.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <InstallExtensionCta style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 42, padding: "0 22px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 14, fontWeight: 500 }}>
              Installer l&apos;extension — gratuit
              <Icon name="arrow-up-right" size={14} color="#000" />
            </InstallExtensionCta>
            <a href="#metriques" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 42, padding: "0 20px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 14 }}>
              Voir les métriques
            </a>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, paddingTop: 8, borderTop: "1px solid var(--border-hairline)" }}>
            {[
              { value: "4", label: "sources agrégées" },
              { value: "EN + JP", label: "éditions couvertes" },
              { value: "PSA · CGC", label: "POP et prix gradés" },
              { value: "24h", label: "cycle de synchro" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 14 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 19, whiteSpace: "nowrap", color: "var(--text-strong)" }}>{s.value}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* avant / après */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>Avant</span>
            <div style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, opacity: 0.72 }}>
              <BrowserBar />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ListingPhotoPlaceholder />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-strong)", lineHeight: 1.3 }}>Roronoa Zoro alt art PSA 10</div>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>slab_house_jp · 98 %</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Livraison suivie</span>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--text-strong)" }}>$5,497.36</div>
              <div style={{ height: 1, background: "var(--border-hairline)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Est-ce cher ?</span>
                <span style={{ fontSize: 15, color: "var(--text-muted)" }}>Aucune référence</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--green-400)" }}>Avec CardQuant</span>
            <div style={{ background: "var(--white)", border: "1px solid var(--green-400)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, boxShadow: "var(--shadow-accent-glow)" }}>
              <BrowserBar />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ListingPhotoPlaceholder />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-strong)", lineHeight: 1.3 }}>Roronoa Zoro alt art PSA 10</div>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>slab_house_jp · 98 %</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Livraison suivie</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--text-strong)" }}>$5,497.36</span>
                <Badge tone="down">Survendu</Badge>
              </div>
              <div style={{ height: 1, background: "var(--border-hairline)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-body)" }}>Prix de marché</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-strong)" }}>$4,688.32</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-body)" }}>Moy. 3 ventes</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-strong)" }}>$4,539.40</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-strong)", fontWeight: 500 }}>Écart vs marché</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--down-500)" }}>+17.3%</span>
                </div>
              </div>

              <div style={{ height: 1, background: "var(--border-hairline)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {ANALYSES.map((a) => (
                  <div key={a.label} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{a.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, whiteSpace: "nowrap", color: a.color ?? "var(--text-strong)" }}>{a.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
                <a href="#tarifs" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 12, fontWeight: 500 }}>Suivre</a>
                <a href="#tarifs" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 12 }}>Noter l&apos;achat</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
