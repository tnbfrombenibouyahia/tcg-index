"use client";

import { useState } from "react";
import { Icon } from "../core/Icon";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";

// Nav de la landing CardQuant (cf. mémoire projet "cardquant-rebrand").
// FR/EN/ES cosmétique -- même limite assumée que TopNav.tsx (pas de
// changement de langue réel, cf. son commentaire). "Se connecter" ouvre la
// modale d'auth existante plutôt que de suivre l'ancre "#tarifs" du mockup
// (qui n'avait pas de sens pour ce lien précis). "Installer l'extension"
// pointe vers #tarifs comme dans le mockup : l'extension n'est pas encore
// publiée sur le Chrome Web Store, il n'y a pas d'URL réelle à donner.
export function LandingNav() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, height: 62, background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", height: 62, padding: "0 24px", display: "flex", alignItems: "center", gap: 28 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-strong)" }}>CARDQUANT</span>
        <nav style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 13 }}>
          <a href="#couverture" style={{ color: "var(--text-body)" }}>Couverture</a>
          <a href="#metriques" style={{ color: "var(--text-body)" }}>Métriques</a>
          <a href="#tarifs" style={{ color: "var(--text-body)" }}>Tarifs</a>
        </nav>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: 3, borderRadius: 999, border: "1px solid var(--border-hairline)" }}>
          <span style={{ display: "inline-grid", placeItems: "center", height: 22, padding: "0 9px", borderRadius: 999, background: "var(--text-strong)", color: "#000", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>FR</span>
          <span style={{ display: "inline-grid", placeItems: "center", height: 22, padding: "0 9px", borderRadius: 999, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, cursor: "pointer" }}>EN</span>
          <span style={{ display: "inline-grid", placeItems: "center", height: 22, padding: "0 9px", borderRadius: 999, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, cursor: "pointer" }}>ES</span>
        </div>
        <button
          type="button"
          onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
          style={{ font: "inherit", fontSize: 13, color: "var(--text-body)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Se connecter
        </button>
        <a href="#tarifs" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 30, padding: "0 14px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 12, fontWeight: 500 }}>
          Installer l&apos;extension
          <Icon name="arrow-up-right" size={14} color="#000" />
        </a>
      </div>
      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} onModeChange={setAuthMode} />
    </header>
  );
}
