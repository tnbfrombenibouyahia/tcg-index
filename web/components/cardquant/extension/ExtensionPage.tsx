"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { isExtensionInstalled } from "@/lib/cardquant-extension";
import { InstallExtensionCta } from "@/components/cardquant/landing/InstallExtensionCta";
import { darkOverrideStyle } from "../darkTokenOverride";
import { Icon } from "../core/Icon";
import { Button } from "../core/Button";

// ─────────────────────────────────────────────────────────────────────────────
// Port de "CardQuant Extension.dc.html" (cf. mémoire projet
// "cardquant-rebrand") -- avec un écart de réalité central assumé (décision
// utilisateur, cf. session du 2026-09-04) : l'extension n'est PAS publiée
// sur le Chrome Web Store (checklist "pas fait" de extension/README.md --
// compte développeur payé depuis, mais pas encore de fiche live). En
// conséquence :
// - Le bouton "Ajouter à Chrome" réutilise InstallExtensionCta.tsx tel quel
//   (même lien pas-encore-actif que sur la landing, même garde de connexion)
//   plutôt que de dupliquer cette logique une 3e fois.
// - L'état "installing" animé du mockup a été DROPPÉ (pas juste pas fait) :
//   une page web n'a structurellement aucun moyen de savoir que Chrome est
//   en train d'installer une extension (ça se passe dans un popup natif
//   hors de portée du JS de la page) -- l'animer aurait toujours été une
//   fiction, jamais un "pas encore fait".
// - En échange, un vrai état "déjà installée" est détecté (lib/cardquant-
//   extension.ts::isExtensionInstalled, aucune modification du code de
//   l'extension nécessaire) -- utile dès maintenant pour quiconque l'a
//   chargée en mode développeur.
// - Le bloc "Pas encore sur le Store" donne le seul chemin d'installation
//   réel aujourd'hui (mode développeur), plutôt que de laisser croire que
//   le bouton marche.
// - Les 4 statistiques inventées du mockup (18 400 installations, note 4,8...)
//   sont remplacées par des faits réels et vérifiables (couverture jeux/
//   langues/marketplace) -- aucune fabriquée, cf. mêmes principes déjà
//   appliqués partout ailleurs dans ce redesign.
// ─────────────────────────────────────────────────────────────────────────────

const STATS: { value: string; label: string }[] = [
  { value: "eBay", label: "Marketplace" },
  { value: "Pokémon · One Piece", label: "Jeux couverts" },
  { value: "EN · JP", label: "Langues" },
  { value: "PSA · CGC", label: "Gradation" },
];

const FACTS: { k: string; v: string }[] = [
  { k: "Version", v: "0.2.0" },
  { k: "Taille", v: "≈ 160 Ko" },
  { k: "Navigateurs", v: "Chrome · Edge · Brave" },
  { k: "Domaines eBay", v: "14 pays" },
];

const PERMS: { t: string; d: string }[] = [
  { t: "Lecture de la page active", d: "Uniquement sur les pages d'annonce eBay (14 domaines pays), au moment où tu ouvres le panneau." },
  { t: "Stockage local", d: "Ta session de connexion, pour éviter de te reconnecter à chaque page." },
  { t: "Aucun suivi publicitaire", d: "Pas de revente de données, pas de pixel tiers." },
];

const STEPS: { n: string; t: string; d: string }[] = [
  { n: "01", t: "Épingler l'icône", d: "Le panneau s'ouvre depuis la barre d'outils sur n'importe quelle annonce eBay." },
  { n: "02", t: "Connecter ton compte", d: "Alertes, historique et carte fétiche suivent ton profil." },
  { n: "03", t: "Ouvrir le terminal", d: "L'analyse complète — population, tape live, ROI gradation — reste sur le web." },
];

const panelStyle: CSSProperties = { border: "1px solid var(--border-hairline)", borderRadius: 12, background: "var(--surface-card)", padding: 20, display: "flex", flexDirection: "column", gap: 14 };
const eyebrowStyle: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" };

// Vraies captures (2026-09-04, cf. mémoire projet "cardquant-rebrand") --
// prises sur une vraie annonce eBay avec l'extension chargée en mode
// développeur et un compte de test connecté, pas des maquettes. Bandeau
// eBay "Bonjour <prénom> !" recadré (identité du compte eBay utilisé pour
// la capture, sans rapport avec CardQuant).
function ScreenshotSlot({ src, label }: { src: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ aspectRatio: "16 / 10", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{label}</span>
    </div>
  );
}

export function ExtensionPage() {
  const router = useRouter();
  const { user } = useAuth();
  // `null` = vérification en cours (évite un flash "pas installée" avant
  // d'avoir vraiment demandé à l'extension, cf. isExtensionInstalled).
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isExtensionInstalled().then((v) => { if (!cancelled) setInstalled(v); });
    return () => { cancelled = true; };
  }, []);

  function openTerminal() {
    router.push(user ? "/dashboard" : "/auth?next=/dashboard");
  }

  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <header style={{ height: 62, borderBottom: "1px solid var(--border-hairline)", background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", height: 62, padding: "0 24px", display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-strong)" }}>CARDQUANT</Link>
          <span style={{ flex: 1 }} />
          {!user ? <Link href="/auth?mode=login" style={{ fontSize: 13, color: "var(--text-body)" }}>Se connecter</Link> : null}
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 12 }}>
            Retour au site
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 24px 72px", display: "flex", flexDirection: "column", gap: 36 }}>
        {/* ============ CARTE STORE ============ */}
        <section style={{ border: "1px solid var(--border-hairline)", borderRadius: 12, background: "var(--surface-card)", padding: 28, display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 300px", gap: 28, alignItems: "start" }}>
          <div style={{ width: 96, height: 96, borderRadius: 20, border: "1px solid rgba(118,251,145,.32)", overflow: "hidden", background: "var(--surface-sunken)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cardquant/extension-icon.png" alt="Icône CardQuant" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.06, fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
                CardQuant — prix réel des cartes TCG
              </h1>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>cardquant.io · Extension navigateur</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 22, paddingTop: 4 }}>
              {STATS.map((s) => (
                <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--text-strong)" }}>{s.value}</span>
                  <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{s.label}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--text-body)", maxWidth: 560 }}>
              L&apos;extension lit l&apos;annonce eBay ouverte, identifie la carte, puis affiche l&apos;écart au marché agrégé (prix catalogue de référence et ventes récentes), brut et gradé. Prix indicatifs, agrégés depuis des sources tierces.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {installed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 12, border: "1px solid var(--green-400)", background: "rgba(118,251,145,.07)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Icon name="check" size={15} color="var(--green-400)" />
                  <span style={{ fontSize: 13.5, color: "var(--text-strong)" }}>Extension détectée</span>
                </div>
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-body)" }}>
                  Épingle CardQuant dans ta barre d&apos;outils, puis connecte ton compte pour synchroniser tes alertes.
                </span>
                <Button variant="accent" size="md" block onClick={openTerminal}>
                  {user ? "Ouvrir le terminal" : "Se connecter et ouvrir le terminal"}
                </Button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <InstallExtensionCta style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 46, borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 14.5, fontWeight: 500, boxSizing: "border-box" }}>
                    Ajouter à Chrome
                  </InstallExtensionCta>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "center", color: "var(--text-muted)" }}>v0.2.0 · ≈ 160 Ko</span>
                </div>
                <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "13px 14px", borderRadius: 10, border: "1px dashed var(--border-strong)", background: "var(--surface-sunken)" }}>
                  <Icon name="triangle-alert" size={14} color="var(--text-muted)" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-body)" }}>Pas encore sur le Chrome Web Store</span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-muted)" }}>
                      Installable dès maintenant en mode développeur : <code style={{ fontFamily: "var(--font-mono)" }}>chrome://extensions</code> → activer le mode développeur → &quot;Charger l&apos;extension non empaquetée&quot;.
                    </span>
                  </div>
                </div>
              </>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 12, border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)" }}>
              {FACTS.map((f) => (
                <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>{f.k}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)", textAlign: "right" }}>{f.v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ APERÇUS ============ */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={eyebrowStyle}>Aperçus</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <ScreenshotSlot src="/cardquant/extension-shot-1.jpg" label="Verdict, score et population sur une vraie annonce eBay" />
            <ScreenshotSlot src="/cardquant/extension-shot-2.jpg" label="Liquidité, ROI gradation et positionnement dans le set" />
            <ScreenshotSlot src="/cardquant/extension-shot-3.jpg" label="Arbitrage inter-langue EN / JP" />
          </div>
        </section>

        {/* ============ AUTORISATIONS + ÉTAPES ============ */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <div style={panelStyle}>
            <span style={eyebrowStyle}>Autorisations</span>
            {PERMS.map((p, i) => (
              <div key={p.t} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingBottom: 12, borderBottom: i < PERMS.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
                <Icon name="shield-check" size={14} color="var(--green-400)" />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{p.t}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)" }}>{p.d}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={panelStyle}>
            <span style={eyebrowStyle}>Après l&apos;installation</span>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: 12, borderBottom: i < STEPS.length - 1 ? "1px solid var(--border-hairline)" : "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--green-400)", paddingTop: 3 }}>{s.n}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{s.t}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)" }}>{s.d}</span>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
              <Link href="/auth?mode=signup" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 40, padding: "0 18px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 13 }}>
                Créer un compte
              </Link>
              <Link href="/#tarifs" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 40, padding: "0 18px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 13 }}>
                Voir les rangs
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
