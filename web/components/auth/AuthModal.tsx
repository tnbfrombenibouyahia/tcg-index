"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { relaySessionToExtension } from "@/lib/cardquant-extension";

// ─────────────────────────────────────────────────────────────────────────────
// Modale connexion/inscription -- Google Sign-In réel depuis le 2026-08-19
// (Firebase Authentication, cf. tcg-index-handoff.md §05). Email/mot de
// passe reste visuel pour l'instant (décision utilisateur du 2026-08-07,
// cf. mémoire projet "project_terminal_redesign") -- formulaire désactivé
// plutôt que factice, pour ne pas laisser un chemin qui a l'air de marcher
// à côté d'un chemin Google qui marche vraiment. Composant contrôlé,
// partagé entre l'avatar du dashboard (AuthTrigger.tsx) et les CTA de la
// landing page (header, hero, tarifs, extension) -- même modale, plusieurs
// points d'entrée.
//
// createPortal vers document.body (2026-09-02, bug constaté en vérifiant
// visuellement le popup auto de LandingNav.tsx) : LandingNav rend cette
// modale À L'INTÉRIEUR de son <header>, qui a un backdropFilter -- un
// backdrop-filter (comme un filter/transform) sur un ancêtre crée un nouveau
// containing block pour tout descendant en position:fixed, donc l'overlay
// "inset:0" se retrouvait confiné aux 62px de hauteur du header au lieu de
// couvrir tout le viewport (modale visuellement coupée/écrasée). Portal
// plutôt que retirer le backdropFilter du header (effet verre dépoli voulu)
// ou plutôt qu'un correctif local à LandingNav seul : n'importe quel futur
// appelant imbriqué sous un ancêtre filtré/transformé aurait le même bug,
// un portail au niveau de la modale elle-même le règle une fois pour toutes.
// ─────────────────────────────────────────────────────────────────────────────

export type AuthMode = "login" | "signup";

export function AuthModal({
  open,
  mode,
  onClose,
  onModeChange,
  onSubmit,
}: {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  /** Appelé en plus de la fermeture après une connexion Google réussie --
   *  ex. la landing page enchaîne vers /dashboard plutôt que de juste fermer. */
  onSubmit?: () => void;
}) {
  const t = useTranslations("dashboard.auth");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      // Best-effort, ne bloque jamais la connexion sur le site elle-même
      // si l'extension n'est pas installée ou que le relais échoue (cf.
      // lib/cardquant-extension.ts).
      await relaySessionToExtension(result.user);
      onSubmit?.();
      onClose();
    } catch {
      setError(t("signInError"));
    } finally {
      setSigningIn(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="widget-glass"
        style={{ width: "380px", maxWidth: "calc(100vw - 32px)", padding: "30px", position: "relative" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          style={{
            position: "absolute",
            top: "16px",
            right: "18px",
            color: "var(--foreground-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          ✕
        </button>

        <div style={{ display: "flex", gap: "4px", background: "var(--surface-alt)", borderRadius: "10px", padding: "4px", marginBottom: "22px" }}>
          <button type="button" onClick={() => onModeChange("login")} style={tabStyle(mode === "login")}>
            {t("login")}
          </button>
          <button type="button" onClick={() => onModeChange("signup")} style={tabStyle(mode === "signup")}>
            {t("signup")}
          </button>
        </div>

        <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px", color: "var(--foreground)" }}>
          {mode === "signup" ? t("signupHeading") : t("loginHeading")}
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            width: "100%",
            padding: "11px",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            fontSize: "13.5px",
            fontWeight: 700,
            cursor: signingIn ? "default" : "pointer",
            opacity: signingIn ? 0.7 : 1,
            marginBottom: "10px",
            background: "var(--surface-alt)",
            color: "var(--foreground)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "conic-gradient(#4285F4 0deg 90deg, #34A853 90deg 180deg, #FBBC05 180deg 270deg, #EA4335 270deg 360deg)",
            }}
          />
          {signingIn ? t("signingIn") : t("continueWithGoogle")}
        </button>

        {error && (
          <p style={{ fontSize: "12px", color: "#ef4444", textAlign: "center", marginBottom: "10px" }}>{error}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "8px 0 18px" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{ fontSize: "10.5px", color: "var(--foreground-muted)", letterSpacing: "0.5px" }}>{t("or")}</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>

        {/* Email/mot de passe : désactivé plutôt que factice (cf. commentaire
            en tête de fichier) -- pas de backend pour ce chemin-là encore. */}
        <fieldset disabled style={{ border: "none", padding: 0, margin: 0, opacity: 0.5 }}>
          <label style={fieldLabelStyle}>{t("email")}</label>
          <input type="email" placeholder="vous@exemple.com" style={inputStyle} />
          <label style={fieldLabelStyle}>{t("password")}</label>
          <input type="password" placeholder="••••••••" style={inputStyle} />
          <button
            type="button"
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "14px",
              textAlign: "center",
              cursor: "not-allowed",
              border: "none",
              marginTop: "4px",
            }}
          >
            {mode === "signup" ? t("submitSignup") : t("submitLogin")}
          </button>
        </fieldset>
        <p style={{ fontSize: "10.5px", color: "var(--foreground-muted)", textAlign: "center", marginTop: "10px", lineHeight: 1.5 }}>
          {t("emailComingSoon")}
        </p>

        <p style={{ fontSize: "10.5px", color: "var(--foreground-muted)", textAlign: "center", marginTop: "14px", lineHeight: 1.5 }}>
          {t("disclaimer")}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    textAlign: "center",
    padding: "8px 0",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--foreground-muted)",
  };
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  color: "var(--foreground-muted)",
  marginBottom: "7px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 13px",
  borderRadius: "9px",
  border: "1px solid var(--border)",
  background: "var(--surface-alt)",
  color: "var(--foreground)",
  fontSize: "14px",
  marginBottom: "16px",
  outline: "none",
};
