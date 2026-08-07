"use client";

import { useTranslations } from "next-intl";

// ─────────────────────────────────────────────────────────────────────────────
// Modale connexion/inscription -- visuel uniquement (décision utilisateur du
// 2026-08-07, cf. mémoire projet "project_terminal_redesign") : aucun backend
// d'auth, le formulaire ne crée aucun compte. Composant contrôlé, partagé
// entre l'avatar du dashboard (AuthTrigger.tsx) et les CTA de la landing page
// (header + hero) -- même modale, deux points d'entrée.
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
  /** Appelé en plus de la fermeture quand le formulaire (factice) est soumis --
   *  ex. la landing page enchaîne vers /dashboard plutôt que de juste fermer. */
  onSubmit?: () => void;
}) {
  const t = useTranslations("dashboard.auth");

  if (!open) return null;

  return (
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
            cursor: "pointer",
            marginBottom: "18px",
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
          {t("continueWithGoogle")}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 0 18px" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{ fontSize: "10.5px", color: "var(--foreground-muted)", letterSpacing: "0.5px" }}>{t("or")}</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
            onClose();
          }}
        >
          <label style={fieldLabelStyle}>{t("email")}</label>
          <input type="email" placeholder="vous@exemple.com" style={inputStyle} />
          <label style={fieldLabelStyle}>{t("password")}</label>
          <input type="password" placeholder="••••••••" style={inputStyle} />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "14px",
              textAlign: "center",
              cursor: "pointer",
              border: "none",
              marginTop: "4px",
            }}
          >
            {mode === "signup" ? t("submitSignup") : t("submitLogin")}
          </button>
        </form>

        <p style={{ fontSize: "10.5px", color: "var(--foreground-muted)", textAlign: "center", marginTop: "14px", lineHeight: 1.5 }}>
          {t("disclaimer")}
        </p>
      </div>
    </div>
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
