// Traduction des codes d'erreur Firebase Auth (format "auth/xxx") en
// messages français affichables tels quels dans AuthPage.tsx -- jamais un
// message générique inventé qui masquerait la vraie cause (mot de passe
// erroné vs compte inexistant vs trop de tentatives ne sont pas la même
// action à recommander à l'utilisateur). Codes limités à ceux réellement
// atteignables par les flux de web/ (email/mot de passe, Google, reset) --
// étendre au fur et à mesure plutôt que de couvrir tout le catalogue
// Firebase d'un coup.
const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "Un compte existe déjà avec cette adresse e-mail. Connecte-toi plutôt, ou réinitialise ton mot de passe.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte pour cette adresse. Crée-en un via l'onglet S'inscrire.",
  "auth/weak-password": "Le mot de passe doit faire 8 caractères minimum.",
  "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
  "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin de la connexion.",
  "auth/network-request-failed": "Problème réseau -- vérifie ta connexion et réessaie.",
};

const DEFAULT_MESSAGE = "Une erreur est survenue. Réessaie dans un instant.";

/** `err` est typiquement une `FirebaseError` (a un champ `code`), mais reste
 * `unknown` ici -- toutes les erreurs qui remontent d'un appel Firebase Auth
 * ne sont pas forcément déjà typées à l'appelant. */
export function mapAuthError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  return MESSAGES[code] ?? DEFAULT_MESSAGE;
}

/** Comme `mapAuthError`, mais couvre aussi les erreurs qui ne viennent PAS
 * de Firebase Auth (ex. `lib/profileApi.ts::createProfile` lève un `Error`
 * simple, sans `code`, pour "pseudo déjà pris") -- utilisé partout où une
 * erreur peut venir de l'un ou l'autre, pour ne jamais retomber sur le
 * message générique alors qu'un message précis existait déjà (`err.message`). */
export function describeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) return mapAuthError(err);
  if (err instanceof Error && err.message) return err.message;
  return DEFAULT_MESSAGE;
}
