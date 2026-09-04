// Service worker événementiel (MV3, pas de background page persistante --
// cf. tcg-index-handoff.md §09). Quatre rôles :
//   1. relayer le clic sur l'icône vers le content script actif (ouvre/
//      ferme le panneau) ;
//   2. ouvrir le site pour s'y connecter (la connexion elle-même -- Google
//      Sign-In -- se fait sur tcgindex.vercel.app, pas dans l'extension,
//      cf. lib/auth.js) ;
//   3. recevoir la session relayée par le site une fois connecté
//      (chrome.runtime.onMessageExternal -- externally_connectable du
//      manifest scope les origines autorisées à envoyer ce message) ;
//   4. appeler pricing_api pour le compte du content script -- un fetch
//      émis depuis la page hôte (ebay.com) serait soumis à la CSP de cette
//      page ; un fetch émis depuis ce service worker ne l'est pas (contexte
//      extension, cf. host_permissions du manifest).
importScripts("lib/config.js", "lib/auth.js", "lib/fx.js");

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "CARDQUANT_TOGGLE_PANEL" });
  }
});

// cf. web/lib/cardquant-extension.ts::relaySessionToExtension -- seules les
// origines listées dans externally_connectable (manifest.json) peuvent
// déclencher ce listener, pas n'importe quelle page.
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CARDQUANT_WEB_SESSION") return false;
  storeExternalSession(message).then(() => sendResponse({ ok: true }));
  return true;
});

// Watchlist (§10 handoff, backend ajouté le 2026-08-29, cf.
// pricing_api/main.py::/favorites) ET portefeuille personnel (bouton
// "Noter l'achat" du panneau CardQuant, cf. pricing_api/main.py::/portfolio)
// -- même pattern d'auth (jeton rafraîchi via getValidIdToken, 401 traduit
// en reason "auth"), factorisé ici puisque les deux fonctionnalités
// partagent exactement la même forme d'appel (Bearer token, JSON, mêmes
// codes d'erreur), contrairement au verdict qui reste seul de son genre
// (conversion FX en plus). Nom générique (pas "favoritesFetch") depuis que
// /portfolio l'utilise aussi -- 402 (plafond gratuit, cf.
// pricing/favorites.py::FREE_FAVORITES_LIMIT) ne concerne que /favorites en
// pratique, mais rien n'empêche /portfolio de s'en servir un jour.
async function pricingApiFetch(path, options = {}) {
  const idToken = await getValidIdToken();
  if (!idToken) return { ok: false, reason: "auth" };
  try {
    const res = await fetch(`${PRICING_API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`, ...(options.headers || {}) },
    });
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (res.status === 402) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: "limit", message: body?.detail || null };
    }
    if (!res.ok) return { ok: false, reason: "network", error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, reason: "network", error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "CARDQUANT_FAVORITE_STATUS":
      pricingApiFetch(`/favorites/${message.itemId}`).then(sendResponse);
      return true;

    case "CARDQUANT_FAVORITE_ADD":
      pricingApiFetch("/favorites", { method: "POST", body: JSON.stringify({ item_id: message.itemId }) }).then(sendResponse);
      return true;

    case "CARDQUANT_FAVORITE_REMOVE":
      pricingApiFetch(`/favorites/${message.itemId}`, { method: "DELETE" }).then(sendResponse);
      return true;

    // Bouton "Noter l'achat" du panneau (cf. content.js) -- ajoute une
    // position au portefeuille personnel (écran PnL du site) directement
    // depuis l'annonce eBay, prix/grade déjà connus (pas de ressaisie).
    // Même endpoint que web/lib/portfolioApi.ts::addPosition -- un seul
    // backend pour les deux surfaces (extension et site).
    case "CARDQUANT_PORTFOLIO_ADD":
      pricingApiFetch("/portfolio", {
        method: "POST",
        body: JSON.stringify({
          item_id: message.itemId, grade: message.grade, quantity: 1,
          buy_price: message.buyPrice, buy_currency: message.buyCurrency, buy_date: message.buyDate,
        }),
      }).then(sendResponse);
      return true;

    case "CARDQUANT_GET_SESSION":
      getSession().then((session) => sendResponse({ ok: true, session }));
      return true;

    case "CARDQUANT_OPEN_SITE_LOGIN":
      chrome.tabs.create({ url: `${SITE_URL}/?cardquant_login=1` }).then(() => sendResponse({ ok: true }));
      return true;

    // "Ouvrir la fiche sur CardQuant" du panneau -- la fiche carte existe
    // désormais réellement sur le site (cf. mémoire projet
    // "cardquant-rebrand", écran Fiche carte / app/(cardquant)/catalog/[id]),
    // retiré le 2026-08-23 faute d'URL fixe à l'époque, réintroduit
    // maintenant que /catalog/{id} est une vraie route.
    case "CARDQUANT_OPEN_CARD":
      chrome.tabs.create({ url: `${SITE_URL}/catalog/${message.itemId}` }).then(() => sendResponse({ ok: true }));
      return true;

    case "CARDQUANT_SIGN_OUT":
      signOut().then(() => sendResponse({ ok: true }));
      return true;

    case "CARDQUANT_GET_VERDICT":
      (async () => {
        try {
          const idToken = await getValidIdToken();
          if (!idToken) {
            // Pas de session (ou refresh token révoqué, cf. lib/auth.js)
            // -- reason "auth" distingue explicitement ce cas d'une panne
            // réseau pour que content.js rebascule sur l'écran de connexion.
            sendResponse({ ok: false, reason: "auth" });
            return;
          }

          let usdPrice;
          try {
            usdPrice = await toUsd(message.displayedPrice, message.currency);
          } catch {
            sendResponse({ ok: false, reason: "fx" });
            return;
          }

          const res = await fetch(`${PRICING_API_URL}/verdict`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({
              text: message.text ?? null,
              // Passage 2 (OCR, cf. content.js::findListingImageUrl) --
              // pricing_api ne l'utilise QUE si `text` est absent (cf.
              // pricing/matching.py::identify_card), jamais les deux à la
              // fois.
              image_url: message.imageUrl ?? null,
              displayed_price: usdPrice,
              grade: message.grade || "ungraded",
              // Carte confirmée via le picker de désambiguïsation (cf.
              // content.js::requestVerdict) -- identify_card() court-
              // circuité côté serveur quand présent.
              selected_card_id: message.selectedCardId ?? null,
            }),
          });
          if (res.status === 401) {
            // Jeton rejeté par pricing_api malgré un refresh local réussi
            // (ex. compte désactivé côté Firebase) -- même traitement que
            // l'absence de session.
            sendResponse({ ok: false, reason: "auth" });
            return;
          }
          const data = await res.json();
          sendResponse({ ok: true, data, convertedFrom: message.currency !== "USD" ? message.currency : null });
        } catch (err) {
          sendResponse({ ok: false, reason: "network", error: String(err) });
        }
      })();
      return true;

    default:
      return false; // message non reconnu -- pas de réponse asynchrone
  }
});
