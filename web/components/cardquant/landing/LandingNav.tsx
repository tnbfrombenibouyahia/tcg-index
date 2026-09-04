"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "../core/Icon";
import { useAuth } from "@/lib/useAuth";
import { InstallExtensionCta } from "./InstallExtensionCta";

// Clé localStorage isolée à ce prompt -- juste un "déjà vu une fois", pas de
// donnée métier (cf. TerminalDashboard.tsx pour le même pattern try/catch).
const AUTH_PROMPT_SEEN_KEY = "cardquant-landing-auth-prompt-seen";

// Nav de la landing CardQuant (cf. mémoire projet "cardquant-rebrand").
// FR/EN/ES cosmétique -- même limite assumée que TopNav.tsx (pas de
// changement de langue réel, cf. son commentaire). "Se connecter" mène
// désormais à la vraie page /auth (cf. components/cardquant/auth/AuthPage.tsx,
// passe Auth) plutôt qu'à la modale AuthModal.tsx (Google uniquement, pas
// d'inscription complète) -- celle-ci reste utilisée ailleurs (cf. plan),
// juste plus ici. "Installer l'extension" passe par InstallExtensionCta
// (compte requis avant le Chrome Web Store, cf. ce fichier) depuis le
// 2026-09-02, non touché cette passe.
export function LandingNav() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Redirection automatique vers l'inscription à la toute première visite
  // de la landing (demande utilisateur 2026-09-02, remplacée le 2026-09-03
  // par une redirection directe -- décision utilisateur -- au lieu d'ouvrir
  // une modale, maintenant que /auth est une vraie page). Dès que la
  // session Firebase est résolue (`loading` passe à false) : si personne
  // n'est connecté et que ce navigateur n'a jamais vu l'invite, on quitte
  // la landing pour /auth?mode=signup. Le flag est posé avant la
  // navigation : peu importe comment l'utilisateur revient ensuite
  // (navigateur précédent, lien direct...), ça ne doit plus jamais se
  // redéclencher sur ce navigateur.
  useEffect(() => {
    if (loading || user) return;
    try {
      if (window.localStorage.getItem(AUTH_PROMPT_SEEN_KEY)) return;
      window.localStorage.setItem(AUTH_PROMPT_SEEN_KEY, "1");
    } catch {
      // localStorage indisponible (mode privé strict) -- tant pis, on
      // redirige quand même cette fois plutôt que de bloquer le prompt
    }
    router.push("/auth?mode=signup");
  }, [loading, user, router]);

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
        <Link
          href="/auth?mode=login"
          style={{ font: "inherit", fontSize: 13, color: "var(--text-body)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Se connecter
        </Link>
        <InstallExtensionCta style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 30, padding: "0 14px", borderRadius: 999, background: "var(--green-400)", color: "#000", fontSize: 12, fontWeight: 500 }}>
          Installer l&apos;extension
          <Icon name="arrow-up-right" size={14} color="#000" />
        </InstallExtensionCta>
      </div>
    </header>
  );
}
