"use client";

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";

// URL de la fiche Chrome Web Store -- l'extension n'est PAS encore publiée
// (cf. extension/README.md, section "Pas fait (hors scope de ce scaffold)" :
// compte développeur, politique de confidentialité, review Google, tout
// reste à faire). Remplacer cette constante par la vraie URL une fois la
// fiche approuvée -- jamais avant, un lien mort casserait plus la confiance
// qu'une ancre #tarifs assumée comme telle (cf. git blame de ce fichier
// pour l'ancien comportement).
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/cardquant"; // TODO: URL réelle une fois la fiche publiée

/** CTA "Installer l'extension" partagé par les 4 emplacements de la landing
 * (nav, hero, tarifs, section extension chrome) -- demande utilisateur
 * (2026-09-02) : exiger un compte CardQuant avant d'envoyer vers le Chrome
 * Web Store, cohérent avec "compte requis avant toute utilisation" (§01/§09
 * handoff, déjà appliqué côté panneau extension) plutôt qu'un lien direct.
 *
 * Déjà connecté -> ouvre le Store directement, aucune friction. Pas connecté
 * -> ouvre la même modale d'auth que "Se connecter" (Google Sign-In réel,
 * cf. AuthModal -- login/signup sont la MÊME action Google derrière, le
 * tabs ne change que le libellé), puis ouvre le Store une fois le compte
 * confirmé (onSubmit). `loading` (session pas encore restaurée depuis
 * IndexedDB au premier rendu) traité comme "pas connecté" : mieux vaut
 * redemander une fois de trop qu'ouvrir le Store avant confirmation, la
 * connexion réelle ne prend qu'un clic Google de toute façon.
 *
 * `<a href>` réel (pas juste un `<button>`) : navigation directe encore
 * possible sans JS ou via clic milieu/ouvrir-dans-un-nouvel-onglet -- cette
 * porte n'est pas une barrière de sécurité, seulement une invitation à créer
 * un compte avant d'installer, jamais bloquante à tout prix. */
export function InstallExtensionCta({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  function openStore() {
    window.open(CHROME_WEB_STORE_URL, "_blank", "noopener,noreferrer");
  }

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (user && !loading) {
      openStore();
    } else {
      setAuthOpen(true);
    }
  }

  return (
    <>
      <a href={CHROME_WEB_STORE_URL} onClick={handleClick} style={style} className={className}>
        {children}
      </a>
      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
        onSubmit={() => { setAuthOpen(false); openStore(); }}
      />
    </>
  );
}
