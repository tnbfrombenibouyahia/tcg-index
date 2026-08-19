// CardQuant -- authentification, "compte requis avant toute utilisation"
// (cf. tcg-index-handoff.md §01/§09). Chargé uniquement dans le service
// worker (cf. background.js::importScripts).
//
// La connexion elle-même se fait sur le site (tcgindex.vercel.app,
// signInWithPopup + Firebase Auth JS SDK, cf. web/components/auth/AuthModal.tsx)
// -- pas ici. "Se connecter" dans le panneau (content/content.js) ouvre un
// onglet vers le site (background.js::CARDQUANT_OPEN_SITE_LOGIN) ; une fois
// connecté là-bas, le site relaie la session à l'extension via
// chrome.runtime.sendMessage (web/lib/cardquant-extension.ts), reçue ici par
// chrome.runtime.onMessageExternal (cf. background.js) -> storeExternalSession.
//
// Pourquoi pas chrome.identity côté extension (ancienne implémentation,
// jusqu'au 2026-08-19) : dupliquait la logique de connexion (déjà réelle et
// nécessaire sur le site pour le dashboard) dans l'extension, deux chemins
// de connexion à maintenir pour un seul compte utilisateur. Un seul chemin
// (le site), l'extension ne fait plus que le recevoir et le rafraîchir.
const FIREBASE_WEB_API_KEY = "AIzaSyByhIlQs35sa6L8YL5-KfgPqg-7y200mmY";
const SESSION_STORAGE_KEY = "cardquant_session";

async function getSession() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  return stored[SESSION_STORAGE_KEY] || null;
}

async function signOut() {
  await chrome.storage.local.remove(SESSION_STORAGE_KEY);
}

/** Stocke une session reçue du site (cf. background.js::onMessageExternal).
 * Même forme que la session locale utilisée par getValidIdToken/refreshIdToken
 * ci-dessous -- le site calcule déjà expiresAt (cf. cardquant-extension.ts),
 * pas de recalcul ici. */
async function storeExternalSession(payload) {
  const session = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName || null,
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
  };
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
  return session;
}

async function refreshIdToken(session) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  if (!res.ok) {
    // Refresh token révoqué/expiré (cf. doc Firebase -- rare mais possible
    // après une longue inactivité) : la session n'est plus récupérable,
    // il faut se reconnecter (sur le site, cf. commentaire en tête de fichier).
    await signOut();
    return null;
  }
  // securetoken.googleapis.com répond en snake_case, contrairement au reste
  // de l'API Identity Toolkit (camelCase) -- deux API distinctes, deux
  // conventions de nommage différentes.
  const data = await res.json();
  const updated = {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000 - 60_000,
  };
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: updated });
  return updated.idToken;
}

/** Jeton prêt à l'emploi pour Authorization: Bearer <token> sur
 * pricing_api, rafraîchi automatiquement s'il est expiré/proche de
 * l'être. null si aucune session (jamais connecté, ou refresh token
 * révoqué -- signOut() déjà appelé dans ce cas par refreshIdToken). */
async function getValidIdToken() {
  const session = await getSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt) return session.idToken;
  return refreshIdToken(session);
}
