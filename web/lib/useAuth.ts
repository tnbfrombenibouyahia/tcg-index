"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

// Cookie de présence de session, lu par middleware.ts pour rediriger un
// visiteur anonyme vers /auth avant même de monter une page du Terminal.
// PAS un jeton d'accès (pas l'ID token, pas le refresh token) : le
// middleware ne vérifie que sa présence, jamais sa validité cryptographique
// -- c'est une garde de navigation/UX, pas la frontière de sécurité réelle
// (celle-ci reste require_user côté pricing_api pour toute donnée
// personnelle, cf. middleware.ts pour le détail du raisonnement). 14 jours,
// alignée sur aucune expiration précise côté Firebase -- se resynchronise
// de toute façon à chaque changement d'état ici.
const SESSION_COOKIE = "cq_session";

// Exportée (pas seulement interne à l'effet ci-dessous) : AuthPage.tsx
// l'appelle directement juste après une connexion/inscription réussie, AVANT
// de naviguer vers `next` -- `onAuthStateChanged` est asynchrone et rien ne
// garantit qu'il se soit déjà déclenché au moment du `router.push`, ce qui
// créerait une fenêtre où proxy.ts renvoie encore vers /auth juste après une
// connexion réussie. Rester du côté "toujours resynchroniser" : appeler ceci
// deux fois (ici + le listener plus bas) est sans risque, jamais une seule
// fois par accident.
export function syncSessionCookie(signedIn: boolean) {
  try {
    document.cookie = signedIn
      ? `${SESSION_COOKIE}=1; path=/; max-age=1209600; SameSite=Lax`
      : `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // document indisponible (SSR) -- cet effet ne tourne de toute façon que
    // côté client, garde défensive seulement
  }
}

/** État de connexion en direct (Firebase Auth, Google Sign-In -- cf.
 * components/auth/AuthModal.tsx, components/cardquant/auth/AuthPage.tsx).
 * `loading` reste `true` tant que Firebase n'a pas restauré la session
 * persistée (IndexedDB) au premier rendu -- évite un flash "déconnecté"
 * avant que la vraie session soit connue. Pose également `cq_session` (cf.
 * ci-dessus) à chaque changement d'état -- un seul endroit pour toute
 * l'app, tout composant qui utilise déjà ce hook resynchronise le cookie
 * sans rien faire de plus. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      syncSessionCookie(Boolean(u));
    });
  }, []);

  return { user, loading };
}
