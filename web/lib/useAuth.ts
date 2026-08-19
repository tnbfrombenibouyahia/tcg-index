"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

/** État de connexion en direct (Firebase Auth, Google Sign-In -- cf.
 * components/auth/AuthModal.tsx). `loading` reste `true` tant que Firebase
 * n'a pas restauré la session persistée (IndexedDB) au premier rendu --
 * évite un flash "déconnecté" avant que la vraie session soit connue. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
