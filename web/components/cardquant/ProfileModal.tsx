"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { multiFactor, updateProfile } from "firebase/auth";
import { fetchFavorites } from "@/lib/watchlistApi";
import { fetchPositions } from "@/lib/portfolioApi";
import { Button } from "./core/Button";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 30, padding: "0 10px", borderRadius: 8,
  border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)",
  fontFamily: "var(--font-mono)", fontSize: 11.5,
};
const sectionTitle: React.CSSProperties = { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" };

function TwoWay({ left, right, value, onChange }: { left: string; right: string; value: string; onChange: (v: string) => void }) {
  const pill = (active: boolean): React.CSSProperties => ({ display: "inline-grid", placeItems: "center", height: 22, padding: "0 10px", borderRadius: 999, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, background: active ? "var(--text-strong)" : "transparent", color: active ? "#000" : "var(--text-muted)" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 999, border: "1px solid var(--border-hairline)", justifySelf: "start" }}>
      <span style={pill(value === left)} onClick={() => onChange(left)}>{left}</span>
      <span style={pill(value === right)} onClick={() => onChange(right)}>{right}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span onClick={() => onChange(!checked)} style={{ display: "block", width: 34, height: 18, borderRadius: 999, cursor: "pointer", position: "relative", background: checked ? "var(--green-400)" : "var(--grey-300)" }}>
      <span style={{ position: "absolute", top: 2, left: 2, width: 14, height: 14, borderRadius: 999, background: "#fff", transform: `translateX(${checked ? 16 : 0}px)`, transition: "transform 140ms ease" }} />
    </span>
  );
}

// Pop-up "Profil / paramètres" du Terminal CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- mélange volontairement assumé de champs réels et
// cosmétiques, chacun signalé dans le code : pas de table user_preferences,
// pas de service de notification, donc pas de persistance possible pour
// tout ce qui n'est pas déjà porté par Firebase Auth ou pricing_api.
export function ProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  // Dérivé directement de `user` à chaque rendu (pas un state) : jamais
  // besoin de le resynchroniser via un effet, contrairement à isPremium
  // (qui vient d'un fetch réseau, cf. plus bas).
  const mfaEnabled = multiFactor(user).enrolledFactors.length > 0;

  // Cosmétique uniquement (pas de user_preferences) -- cf. TopNav.tsx pour
  // la même limite sur EUR/USD et FR/EN du header.
  const [lang, setLang] = useState("FR");
  const [currency, setCurrency] = useState("EUR");
  const [market, setMarket] = useState("Europe");
  const [home, setHome] = useState("Dashboard");
  const [alertPrice, setAlertPrice] = useState(true);
  const [alertWeekly, setAlertWeekly] = useState(false);
  const [alertPop, setAlertPop] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchFavorites().then((res) => {
        if (res.ok) setIsPremium(res.data.isPremium);
      });
    }, 0);
    return () => clearTimeout(id);
  }, [user]);

  async function save() {
    setSaving(true);
    try {
      if (displayName !== (user.displayName ?? "")) await updateProfile(user, { displayName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    const res = await fetchPositions();
    if (!res.ok) return;
    const header = "carte,grade,quantite,prix_achat,devise_achat,date_achat,prix_vente,devise_vente,date_vente,statut\n";
    const rows = res.data
      .map((p) => [p.name, p.grade, p.quantity, p.buyPrice, p.buyCurrency, p.buyDate, p.sellPrice ?? "", p.sellCurrency ?? "", p.sellDate ?? "", p.status].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cardquant-portefeuille.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 88, background: "rgba(0,0,0,.78)", display: "grid", placeItems: "center", padding: 24 }}>
      <section
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(900px, 94vw)", maxHeight: "calc(100dvh - 48px)", background: "var(--surface-page)", border: "1px solid var(--border-hairline)", borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,.6)", padding: 14, display: "flex", flexDirection: "column", gap: 10, boxSizing: "border-box", overflowY: "auto" }}
      >
        <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "row", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ flex: "none", display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: 999, overflow: "hidden", border: "1px solid var(--border-hairline)", background: "var(--green-400)", color: "#000", fontFamily: "var(--font-mono)", fontSize: 18 }}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              (user.displayName ?? user.email ?? "?").slice(0, 2).toUpperCase()
            )}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--text-strong)" }}>{user.displayName ?? "Compte"}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{user.email}</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "right" }}>
            <span style={sectionTitle}>Formule</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-strong)" }}>{isPremium == null ? "…" : isPremium ? "Premium" : "Gratuit"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? "…" : saved ? "Enregistré" : "Enregistrer"}</Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, alignItems: "stretch" }}>
          <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <span style={sectionTitle}>Identité</span>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Nom affiché</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>E-mail</span>
              <input value={user.email ?? ""} disabled style={{ ...inputStyle, opacity: 0.6 }} />
            </label>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Le nom affiché est celui de ton compte Google, modifiable ici (Firebase Auth). L&apos;e-mail ne se change pas depuis cet écran.</span>
          </section>

          <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <span style={sectionTitle}>Préférences d&apos;affichage</span>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Langue de l&apos;interface</span>
              <TwoWay left="FR" right="EN" value={lang} onChange={setLang} />
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Devise préférée</span>
              <TwoWay left="EUR" right="USD" value={currency} onChange={setCurrency} />
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Marché de référence</span>
              <TwoWay left="Europe" right="US" value={market} onChange={setMarket} />
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Écran d&apos;accueil</span>
              <TwoWay left="Dashboard" right="Watchlist" value={home} onChange={setHome} />
            </div>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Non enregistré : ces préférences ne persistent pas encore (aucun profil de préférences côté serveur).</span>
          </section>

          <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <span style={sectionTitle}>Compte</span>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px 12px", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Double authentification</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: mfaEnabled ? "var(--up-600)" : "var(--text-muted)" }}>{mfaEnabled ? "Active" : "Non activée"}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Dernière connexion</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                {user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—"}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Export des données</span>
              <Button variant="secondary" size="sm" onClick={exportCsv}>Exporter en CSV</Button>
            </div>
          </section>

          <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <span style={sectionTitle}>Alertes</span>
            {[
              { label: "Écarts de prix détectés", note: "aucun service de notification branché", value: alertPrice, set: setAlertPrice },
              { label: "Résumé P/V hebdomadaire", note: "aucun service de notification branché", value: alertWeekly, set: setAlertWeekly },
              { label: "Nouvelles populations PSA", note: "aucun service de notification branché", value: alertPop, set: setAlertPop },
            ].map((t) => (
              <div key={t.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 34px", gap: 12, alignItems: "center" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>{t.label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{t.note}</span>
                </span>
                <Toggle checked={t.value} onChange={t.set} />
              </div>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
