import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

// Config publique du projet Firebase cardquant-tcg (apiKey/authDomain/
// projectId) -- même triplet que l'extension navigateur
// (extension/lib/auth.js), pas un secret : destinée à être embarquée
// côté client (doc Firebase "Understand Firebase API keys").
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
};

// getApps()/getApp() : registre interne de Firebase, équivalent au
// garde-fou globalThis de lib/db.ts pour le hot-reload dev -- Firebase
// gère déjà lui-même la réutilisation d'app, pas besoin de dupliquer le
// pattern globalThis ici.
export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(firebaseApp);
// Profil CardQuant (pseudo, tag réseau, jeu suivi...) -- cf. lib/profileApi.ts.
// Pas de Storage ici : la carte fétiche de l'inscription reste un aperçu
// local pour l'instant (cf. mémoire projet "cardquant-rebrand", passe Auth).
export const db: Firestore = getFirestore(firebaseApp);
