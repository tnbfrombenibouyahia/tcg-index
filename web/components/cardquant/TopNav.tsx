"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { Input } from "./core/Input";
import { IconButton } from "./core/IconButton";
import { PillTabs } from "./core/PillTabs";
import { NewsPopup } from "./NewsPopup";
import { ProfileModal } from "./ProfileModal";

// ─────────────────────────────────────────────────────────────────────────────
// Chrome partagé du Terminal CardQuant (header + nav), port du bandeau du
// handoff .dc.html (cf. mémoire projet "cardquant-rebrand"). Les onglets qui
// pointent vers un écran pas encore reskinné restent cliquables (ils
// affichent l'ancien design "TCG Index" le temps de la migration) ; ceux qui
// n'ont PAS d'écran du tout aujourd'hui (Fiche carte -- pas de route dédiée
// côté web/, une fiche carte n'a pas d'URL fixe) sont désactivés plutôt que
// de pointer vers une page inexistante.
//
// EUR/USD et FR/EN : pastilles fidèles au design, mais PAS branchées --
// changer de devise ne convertit aucun montant affiché (la conversion réelle
// est un chantier à part, cf. lib/currency à créer) et changer de langue ne
// change pas le cookie "locale" du site (ce dashboard n'est pas encore
// traduit via next-intl, tout son texte est en dur comme le prototype
// d'origine). Purement visuel pour l'instant -- ne pas lire l'état actif de
// ces pastilles comme une préférence persistée.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_HOME: readonly string[] = ["Dashboard"];
const NAV_ANALYTICS: readonly string[] = ["Catalogue", "Fiche carte", "Live", "Transactions", "Analyse set", "Sous-évalué", "Population PSA"];
const NAV_PERSONAL: readonly string[] = ["PnL", "Watchlist"];

// Correspondance onglet -> route existante. Les entrées absentes de cette
// map n'ont pas d'écran dédié dans web/ aujourd'hui -- cf. commentaire ci-dessus.
const ROUTES: Record<string, string> = {
  Dashboard: "/dashboard",
  Catalogue: "/catalog",
  Live: "/live",
  Transactions: "/transactions",
  "Analyse set": "/set-analysis",
  "Sous-évalué": "/undervalued",
  "Population PSA": "/population-analysis",
  PnL: "/pnl",
  Watchlist: "/watchlist",
};

const DISABLED_ITEMS = [...NAV_ANALYTICS, ...NAV_PERSONAL].filter((label) => !ROUTES[label]);

function activeLabelFor(pathname: string): string | undefined {
  return Object.entries(ROUTES).find(([, href]) => href === pathname)?.[0];
}

function TwoWayPill({ left, right, value, onChange }: { left: string; right: string; value: string; onChange: (v: string) => void }) {
  const pillStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    height: 22,
    padding: "0 8px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    background: active ? "var(--text-strong)" : "transparent",
    color: active ? "#000" : "var(--text-muted)",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 999, border: "1px solid var(--border-hairline)" }}>
      <span style={pillStyle(value === left)} onClick={() => onChange(left)}>{left}</span>
      <span style={pillStyle(value === right)} onClick={() => onChange(right)}>{right}</span>
    </div>
  );
}

export function TopNav({ syncLabel }: { syncLabel: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [currency, setCurrency] = useState("EUR");
  const [lang, setLang] = useState("FR");
  const [newsOpen, setNewsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const activeLabel = activeLabelFor(pathname) ?? "Dashboard";

  function goTo(label: string) {
    const href = ROUTES[label];
    if (href) router.push(href);
  }

  // Avatar : ouvre le vrai profil si connecté (ProfileModal, données
  // Firebase/pricing_api réelles), sinon renvoie vers /auth (cf.
  // components/cardquant/auth/AuthPage.tsx, passe Auth) -- ce chemin ne
  // devrait quasiment plus jamais être emprunté maintenant que le Terminal
  // est gardé (proxy.ts renvoie déjà un visiteur anonyme vers /auth avant
  // même que cet écran ne monte), sauf pendant la fenêtre où la session
  // n'a pas encore été restaurée côté client -- filet de sécurité, pas le
  // chemin principal.
  function onAvatarClick() {
    if (user) setProfileOpen(true);
    else router.push(`/auth?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--white)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ height: 62, padding: "0 20px", display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-strong)" }}>CARDQUANT</span>
        <span style={{ width: 1, height: 24, background: "var(--border-hairline)" }} />
        <div style={{ width: 320 }}>
          {/* Recherche cosmétique pour l'instant -- pas encore branchée sur
              lib/queries/items.ts::searchItems (cf. commentaire de tête). */}
          <Input placeholder="Rechercher une carte, un set, un code…" icon="search" size="sm" />
        </div>
        <span style={{ flex: 1 }} />
        {syncLabel ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--up-600)" }} />
            <span style={{ fontFamily: "var(--font-mono)" }}>{syncLabel}</span>
          </span>
        ) : null}
        <TwoWayPill left="EUR" right="USD" value={currency} onChange={setCurrency} />
        <TwoWayPill left="FR" right="EN" value={lang} onChange={setLang} />
        <IconButton icon="bell" onClick={() => setNewsOpen((v) => !v)} />
        <span
          onClick={onAvatarClick}
          title={user ? "Profil et paramètres" : "Se connecter"}
          style={{
            width: 30, height: 30, borderRadius: 999, overflow: "hidden", cursor: "pointer",
            display: "grid", placeItems: "center", background: "var(--green-400)", color: "#000",
            fontFamily: "var(--font-mono)", fontSize: 11,
          }}
        >
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : user ? (
            <span>{(user.displayName ?? user.email ?? "?").slice(0, 2).toUpperCase()}</span>
          ) : (
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          )}
        </span>
      </div>
      <div style={{ padding: "3px 12px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "auto hidden" }}>
          <PillTabs items={[...NAV_HOME]} value={activeLabel} onChange={goTo} size="sm" />
          <span style={{ flex: "none", width: 1, height: 18, background: "var(--border-hairline)" }} />
          <PillTabs items={[...NAV_ANALYTICS]} value={activeLabel} onChange={goTo} size="sm" disabledItems={DISABLED_ITEMS} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none", whiteSpace: "nowrap" }}>
          <span style={{ flex: "none", width: 1, height: 18, background: "var(--border-hairline)" }} />
          <PillTabs items={[...NAV_PERSONAL]} value={activeLabel} onChange={goTo} size="sm" disabledItems={DISABLED_ITEMS} />
        </div>
      </div>

      {newsOpen ? (
        <>
          <div onClick={() => setNewsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <NewsPopup onClose={() => setNewsOpen(false)} />
        </>
      ) : null}

      {profileOpen && user ? <ProfileModal user={user} onClose={() => setProfileOpen(false)} /> : null}
    </header>
  );
}
