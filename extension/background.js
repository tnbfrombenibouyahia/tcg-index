// Service worker événementiel (MV3, pas de background page persistante --
// cf. tcg-index-handoff.md §09). Deux rôles :
//   1. relayer le clic sur l'icône vers le content script actif (ouvre/
//      ferme le panneau) ;
//   2. appeler pricing_api pour le compte du content script -- un fetch
//      émis depuis la page hôte (ebay.com) serait soumis à la CSP de cette
//      page ; un fetch émis depuis ce service worker ne l'est pas (contexte
//      extension, cf. host_permissions du manifest).
importScripts("lib/config.js");

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "CARDQUANT_TOGGLE_PANEL" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "CARDQUANT_GET_VERDICT") return false;

  fetch(`${PRICING_API_URL}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message.text,
      displayed_price: message.displayedPrice,
      grade: message.grade || "ungraded",
    }),
  })
    .then((res) => res.json())
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true; // réponse asynchrone -- garde le canal de message ouvert
});
