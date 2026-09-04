"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { syncSessionCookie } from "@/lib/useAuth";
import { relaySessionToExtension } from "@/lib/cardquant-extension";
import { createProfile, normalizeHandle, type SocialNetwork, type TrackedGame } from "@/lib/profileApi";
import { describeError } from "@/lib/authErrors";
import { darkOverrideStyle } from "../darkTokenOverride";
import { Icon } from "../core/Icon";
import { Button } from "../core/Button";

// ─────────────────────────────────────────────────────────────────────────────
// Port de "CardQuant Auth.dc.html" (cf. mémoire projet "cardquant-rebrand",
// passe Auth) -- remplace la modale AuthModal.tsx comme point d'entrée
// d'authentification pour la landing et le Terminal (celle-ci reste en
// place pour ses 2 autres usages non touchés cette passe, cf. plan).
//
// Écarts assumés vs. le mockup (disclosed, pas des oublis) :
// - Pas de bloc "compte de démo" (demo@cardquant.io) : c'était un compte
//   fictif simulé en localStorage dans le prototype, inexistant dans le
//   vrai Firebase Auth du projet -- le porter créerait un chemin qui a
//   l'air de marcher et échoue toujours.
// - "Lien magique" reste désactivé/visuel (sendSignInLinkToEmail + son flux
//   de complétion par lien de retour est un chantier à part, non testable
//   sans vraie boîte mail dans cette session).
// - La carte fétiche est un aperçu LOCAL uniquement (choix de fichier +
//   URL.createObjectURL) -- rien n'est envoyé à Firebase Storage cette
//   passe (pas de bucket/règles/gestion d'erreurs d'upload pour une photo
//   cosmétique, cf. plan). N'affecte ni le profil Firestore ni la photo
//   Firebase Auth (`photoURL`).
// - Google Sign-In (bouton "Continuer avec Google", onglet Connexion
//   uniquement -- comme dans le mockup, pas d'équivalent côté Inscription)
//   ne crée PAS de profil Firestore : un compte Google peut légitimement
//   être un premier compte (Firebase traite connexion/inscription OAuth de
//   façon identique), mais les champs étendus (pseudo, tag réseau, jeu
//   suivi) n'ont pas d'équivalent dans ce flux. ProfileModal ne consomme
//   pas encore ces champs de toute façon (chantier séparé).
// ─────────────────────────────────────────────────────────────────────────────

const GAMES: readonly TrackedGame[] = ["Pokémon EN", "Pokémon JP", "One Piece EN", "One Piece JP"];
const NETWORKS: readonly SocialNetwork[] = ["X", "Discord", "Instagram", "TikTok"];

const PERKS = [
  "Terminal complet : dashboard, population, tape live",
  "Alertes sur écart de prix et sell-through",
  "Historique de tes analyses, synchronisé",
  "Extension Chrome liée au même compte",
];

/** Anti-open-redirect : n'accepte qu'un chemin relatif commençant par
 * exactement un seul "/" (rejette "//evil.com", les URLs absolues, et tout
 * ce qui contient un antislash -- certains navigateurs le traitent comme un
 * "/"). Par défaut, `/dashboard` : l'entrée principale du Terminal. */
function safeNextUrl(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}

const fieldLabel: CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" };
const textInput: CSSProperties = {
  height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border-strong)",
  background: "var(--surface-sunken)", color: "var(--text-strong)", fontSize: 14, fontFamily: "var(--font-core)",
  width: "100%", boxSizing: "border-box",
};
const selectStyle: CSSProperties = {
  height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border-strong)",
  background: "var(--surface-sunken)", color: "var(--text-strong)", fontSize: 13, fontFamily: "var(--font-core)",
  width: "100%", boxSizing: "border-box",
};

function Banner({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  const color = tone === "error" ? "var(--down-500)" : "var(--green-400)";
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, border: `1px solid ${tone === "error" ? "rgba(255,90,114,.34)" : "rgba(118,251,145,.34)"}`, background: tone === "error" ? "rgba(255,90,114,.08)" : "rgba(118,251,145,.08)" }}>
      <Icon name={tone === "error" ? "triangle-alert" : "shield-check"} size={14} color={color} />
      <span style={{ fontSize: 13, color: tone === "error" ? "#FF8A9C" : "var(--green-400)" }}>{children}</span>
    </div>
  );
}

export function AuthPage({ mode: initialMode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Champs partagés entre les deux onglets (comme le mockup : retaper son
  // e-mail en changeant d'onglet serait une régression UX).
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // Connexion
  const [remember, setRemember] = useState(true);

  // Inscription
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [social, setSocial] = useState("");
  const [network, setNetwork] = useState<SocialNetwork>("X");
  const [game, setGame] = useState<TrackedGame>("Pokémon EN");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [lang, setLang] = useState<"FR" | "EN" | "ES">("FR");
  const [agree, setAgree] = useState(false);
  const [favCardFile, setFavCardFile] = useState<File | null>(null);
  // Dérivé, pas un state séparé synchronisé via effet (règle eslint
  // react-hooks/set-state-in-effect) : `useMemo` recalcule l'URL locale
  // quand `favCardFile` change, un effet ne fait QUE le ménage (révoquer
  // l'URL précédente) -- jamais de setState dans son corps.
  const favCardPreview = useMemo(() => (favCardFile ? URL.createObjectURL(favCardFile) : null), [favCardFile]);
  useEffect(() => {
    return () => { if (favCardPreview) URL.revokeObjectURL(favCardPreview); };
  }, [favCardPreview]);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function afterAuthSuccess(user: User) {
    syncSessionCookie(true);
    await relaySessionToExtension(user); // best-effort, ne lève jamais (cf. sa docstring)
    router.push(safeNextUrl(next));
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !pass) return setError("Renseigne ton e-mail et ton mot de passe.");
    setBusy(true);
    setBusyLabel("Authentification…");
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      await afterAuthSuccess(cred.user);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setBusy(true);
    setBusyLabel("Authentification…");
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await afterAuthSuccess(cred.user);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e: MouseEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) return setError("Indique ton e-mail pour recevoir le lien de réinitialisation.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice("E-mail de réinitialisation envoyé — vérifie ta boîte mail.");
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function submitSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const handleClean = normalizeHandle(handle);
    if (!name.trim()) return setError("Indique ton nom complet.");
    if (!/.+@.+\..+/.test(email)) return setError("Adresse e-mail invalide.");
    if (!handleClean) return setError("Choisis un pseudo public (@).");
    if (!social.trim()) return setError("Ajoute ton tag réseau (@) — il sert aux alertes partagées.");
    if (pass.length < 8) return setError("Le mot de passe doit faire 8 caractères minimum.");
    if (!agree) return setError("Il faut accepter les conditions pour créer le compte.");

    setBusy(true);
    setBusyLabel("Création du compte…");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      try {
        await updateProfile(cred.user, { displayName: name.trim() });
        await createProfile(cred.user, { handle: handleClean, social, network, game, currency, lang });
      } catch (profileErr) {
        // Rollback : sans ça un pseudo déjà pris laisserait un compte Firebase
        // Auth orphelin (sans profil) et bloquerait tout nouvel essai avec
        // la même adresse ("email-already-in-use") -- pire que juste
        // réessayer avec un autre pseudo.
        await cred.user.delete().catch(() => {});
        throw profileErr;
      }
      await afterAuthSuccess(cred.user);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  const handleClean = normalizeHandle(handle);
  const strength = pass.length >= 12 ? 3 : pass.length >= 8 ? 2 : pass.length > 0 ? 1 : 0;
  const bar = (filled: boolean, color: string): CSSProperties => ({ flex: 1, height: 3, borderRadius: 999, background: filled ? color : "var(--border-hairline)" });
  const initials = (name.trim() || "CQ").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <header style={{ height: 62, borderBottom: "1px solid var(--border-hairline)", background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", height: 62, padding: "0 24px", display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-strong)" }}>CARDQUANT</Link>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Connexion sécurisée · Firebase Auth
          </span>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text-body)", fontSize: 12 }}>
            Retour au site
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 24px 72px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gap: 44, alignItems: "start" }}>
        {/* ============ COLONNE FORMULAIRE ============ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 620, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--green-400)" }}>
              {isLogin ? "Accès terminal" : "Nouveau compte"}
            </span>
            <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.05, fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
              {isLogin ? "Reprends ta session." : "Crée ton profil de collectionneur."}
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--text-muted)" }}>
              {isLogin
                ? "Un compte authentifié ouvre le terminal, les alertes et l'historique de tes analyses."
                : "Nom, deux identifiants @, carte fétiche : ton profil suit tes analyses sur tous tes appareils."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, border: "1px solid var(--border-hairline)", width: "fit-content" }}>
            <button type="button" onClick={() => switchMode("login")} style={{ height: 30, padding: "0 16px", border: "none", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, background: isLogin ? "#FFFFFF" : "transparent", color: isLogin ? "#000000" : "var(--text-muted)" }}>
              Se connecter
            </button>
            <button type="button" onClick={() => switchMode("signup")} style={{ height: 30, padding: "0 16px", border: "none", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, background: !isLogin ? "#FFFFFF" : "transparent", color: !isLogin ? "#000000" : "var(--text-muted)" }}>
              S&apos;inscrire
            </button>
          </div>

          {error ? <Banner tone="error">{error}</Banner> : null}
          {notice ? <Banner tone="info">{notice}</Banner> : null}

          {isLogin ? (
            <form onSubmit={submitLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={fieldLabel}>Adresse e-mail</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" style={textInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, ...fieldLabel }}>
                  Mot de passe<span style={{ flex: 1 }} />
                  <a href="#" onClick={handleForgotPassword} style={{ letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--green-400)" }}>Oublié ?</a>
                </span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" style={textInput} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-body)", cursor: "pointer" }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#76FB91" }} />
                Rester connecté sur cet appareil
              </label>
              <Button variant="primary" size="lg" block type="submit" disabled={busy}>
                {busy ? busyLabel : "Se connecter au terminal"}
              </Button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, height: 1, background: "var(--border-hairline)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>ou</span>
                <span style={{ flex: 1, height: 1, background: "var(--border-hairline)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <button type="button" onClick={handleGoogle} disabled={busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: 999, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-body)", fontSize: 13, cursor: busy ? "default" : "pointer" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)" }}>G</span>Continuer avec Google
                </button>
                <button type="button" disabled title="Bientôt disponible" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: 999, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "not-allowed", opacity: 0.55 }}>
                  <Icon name="mail" size={14} color="var(--text-muted)" />Lien magique
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitSignup} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Nom complet</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Léa Moreau" style={textInput} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Adresse e-mail</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" style={textInput} />
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={fieldLabel}>Tes deux identifiants @</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", height: 44, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", overflow: "hidden" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 40, height: "100%", fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--green-400)", borderRight: "1px solid var(--border-hairline)" }}>@</span>
                      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="lea.slabs" style={{ flex: 1, height: "100%", padding: "0 12px", border: "none", background: "transparent", color: "var(--text-strong)", fontFamily: "var(--font-mono)", fontSize: 14, boxSizing: "border-box", minWidth: 0 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      Pseudo public sur le terminal. {handleClean ? `cardquant.io/@${handleClean}` : "Disponible dès 3 caractères."}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", height: 44, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", overflow: "hidden" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 40, height: "100%", fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-muted)", borderRight: "1px solid var(--border-hairline)" }}>@</span>
                      <input value={social} onChange={(e) => setSocial(e.target.value)} placeholder="lea_tcg" style={{ flex: 1, height: "100%", padding: "0 12px", border: "none", background: "transparent", color: "var(--text-strong)", fontFamily: "var(--font-mono)", fontSize: 14, boxSizing: "border-box", minWidth: 0 }} />
                      <select value={network} onChange={(e) => setNetwork(e.target.value as SocialNetwork)} style={{ height: "100%", padding: "0 10px", border: "none", borderLeft: "1px solid var(--border-hairline)", background: "var(--grey-100)", color: "var(--text-body)", fontSize: 12 }}>
                        {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Tag réseau, pour les alertes partagées.</span>
                  </div>
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={fieldLabel}>Mot de passe</span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="8 caractères minimum" style={textInput} />
                <div style={{ display: "flex", gap: 4, paddingTop: 2 }}>
                  <span style={bar(strength >= 1, strength === 1 ? "var(--down-500)" : "var(--green-400)")} />
                  <span style={bar(strength >= 2, "var(--green-400)")} />
                  <span style={bar(strength >= 3, "var(--green-400)")} />
                </div>
              </label>

              <div style={{ height: 1, background: "var(--border-hairline)" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={fieldLabel}>Ta carte fétiche</span>
                <div style={{ display: "grid", gridTemplateColumns: "132px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
                  <label style={{ aspectRatio: "3.5 / 4.55", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <input type="file" accept="image/*" onChange={(e) => setFavCardFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                    {favCardPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={favCardPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "center", padding: 10 }}>Photo de ta carte TCG favorite</span>
                    )}
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)" }}>
                      Aperçu local pour l&apos;instant (pas encore sauvegardé). Format vertical, 3,5 × 4,55.
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <span style={fieldLabel}>Jeu suivi en priorité</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {GAMES.map((g) => {
                          const on = game === g;
                          return (
                            <button key={g} type="button" onClick={() => setGame(g)} style={{ height: 30, padding: "0 13px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, background: on ? "rgba(118,251,145,.12)" : "transparent", border: `1px solid ${on ? "#76FB91" : "var(--border-strong)"}`, color: on ? "#76FB91" : "var(--text-body)" }}>
                              {g}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span style={fieldLabel}>Devise</span>
                        <select value={currency} onChange={(e) => setCurrency(e.target.value as "EUR" | "USD")} style={selectStyle}>
                          <option value="EUR">EUR — €</option>
                          <option value="USD">USD — $</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span style={fieldLabel}>Langue</span>
                        <select value={lang} onChange={(e) => setLang(e.target.value as "FR" | "EN" | "ES")} style={selectStyle}>
                          <option value="FR">Français</option>
                          <option value="EN">English</option>
                          <option value="ES">Español</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, accentColor: "#76FB91" }} />
                <span>J&apos;accepte les conditions et la politique de confidentialité. Les prix affichés sont indicatifs, agrégés depuis des sources tierces — ce n&apos;est pas un conseil en investissement.</span>
              </label>

              <Button variant="primary" size="lg" block type="submit" disabled={busy}>
                {busy ? busyLabel : "Créer mon compte"}
              </Button>
            </form>
          )}
        </div>

        {/* ============ COLONNE APERÇU ============ */}
        <aside style={{ position: "sticky", top: 86, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ border: "1px solid var(--border-hairline)", borderRadius: 12, background: "var(--surface-card)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green-400)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Aperçu du profil</span>
            </div>
            <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <div style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", fontSize: 15, letterSpacing: "0.04em", color: "var(--green-400)", overflow: "hidden" }}>
                  {favCardPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={favCardPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : initials}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 15, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name.trim() || "Ton nom"}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--green-400)" }}>@{handleClean || "pseudo"}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{network} @{social.trim().replace(/^@/, "") || "tag"}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Jeu suivi</span><span style={{ color: "var(--text-strong)" }}>{game}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Devise · langue</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{currency} · {lang}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>Rang</span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px solid var(--border-strong)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-body)" }}>Gratuit</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid var(--border-hairline)", borderRadius: 12, background: "var(--surface-card)", padding: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Ce que ton compte débloque</span>
            {PERKS.map((p) => (
              <div key={p} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--text-body)" }}>
                <Icon name="check" size={14} color="var(--green-400)" />
                <span>{p}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "13px 14px", borderRadius: 10, border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)" }}>
            <Icon name="shield-check" size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-muted)" }}>Session gérée par Firebase Auth. Aucun moyen de paiement demandé à l&apos;inscription.</span>
          </div>
        </aside>
      </div>

      {busy ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", background: "rgba(0,0,0,.78)", backdropFilter: "blur(6px)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <span style={{ width: 30, height: 30, borderRadius: 999, border: "2px solid var(--border-strong)", borderTopColor: "var(--green-400)", animation: "cq-auth-spin .7s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-body)" }}>{busyLabel}</span>
          </div>
          <style>{"@keyframes cq-auth-spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      ) : null}
    </div>
  );
}
