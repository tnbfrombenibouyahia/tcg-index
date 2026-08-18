// CardQuant -- authentification Google, "compte requis avant toute
// utilisation" (cf. tcg-index-handoff.md §01/§09). Chargé uniquement dans
// le service worker (cf. background.js::importScripts) -- chrome.identity
// n'est pas exposé aux content scripts.
//
// Pourquoi chrome.identity.launchWebAuthFlow et pas getAuthToken :
// getAuthToken exige un client OAuth de type "Chrome Extension" créé dans
// la Console pour l'ID EXACT de cette extension, id qui change à nouveau à
// la publication sur le Store (cf. extension/README.md) -- et il ne
// renvoie qu'un access_token, jamais un id_token, insuffisant pour obtenir
// un firebase_uid stable. launchWebAuthFlow réutilise directement le
// client OAuth "Web" déjà provisionné par Firebase Auth (Google Sign-In,
// §05) en lui demandant un id_token, échangé ensuite via l'API REST
// Identity Toolkit (accounts:signInWithIdp) -- même résultat qu'un vrai
// sign-in Firebase, sans charger le SDK JS complet (aucun outil de build
// dans ce dossier, cf. §README "Développement local").
//
// Étape manuelle restante (cf. README) : enregistrer l'URI de redirection
// de cette extension (chrome.identity.getRedirectURL()) dans la liste des
// "Authorized redirect URIs" du client OAuth ci-dessous, Google Cloud
// Console > APIs & Services > Identifiants -- aucune API publique pour ça.
const GOOGLE_OAUTH_CLIENT_ID = "606137510344-03e55c2usplh7urnvslctfiu83rul4si.apps.googleusercontent.com";
// apiKey public du projet Firebase (cardquant-tcg, app Web "CardQuant
// Extension") -- pas un secret : c'est la clé destinée à être embarquée
// côté client, cf. doc Firebase "Understand Firebase API keys".
const FIREBASE_WEB_API_KEY = "AIzaSyByhIlQs35sa6L8YL5-KfgPqg-7y200mmY";
const SESSION_STORAGE_KEY = "cardquant_session";

function buildAuthUrl(redirectUri, nonce) {
  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    response_type: "id_token",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    nonce,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "Connexion annulée."));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

async function signIn() {
  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = crypto.randomUUID();
  const resultUrl = await launchWebAuthFlow(buildAuthUrl(redirectUri, nonce));

  // response_type=id_token renvoie le jeton dans le FRAGMENT (#), pas la
  // query string -- on le transforme en URL "?" exploitable par URLSearchParams.
  const idToken = new URL(resultUrl.replace("#", "?")).searchParams.get("id_token");
  if (!idToken) throw new Error("Aucun id_token reçu de Google.");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&providerId=google.com`,
        requestUri: redirectUri,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Échec de l'échange Firebase.");

  const session = {
    uid: data.localId,
    email: data.email,
    displayName: data.displayName || null,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    // Marge de 60s : jamais tenter d'appeler pricing_api avec un jeton sur
    // le point d'expirer pile pendant l'aller-retour réseau.
    expiresAt: Date.now() + Number(data.expiresIn) * 1000 - 60_000,
  };
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
  return session;
}

async function getSession() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  return stored[SESSION_STORAGE_KEY] || null;
}

async function signOut() {
  await chrome.storage.local.remove(SESSION_STORAGE_KEY);
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
    // il faut se reconnecter.
    await signOut();
    return null;
  }
  // securetoken.googleapis.com répond en snake_case, contrairement à
  // accounts:signInWithIdp (camelCase) -- deux API Identity Toolkit
  // distinctes, deux conventions de nommage différentes.
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
