// CardQuant -- conversion de devise côté extension. pricing_api ne convertit
// rien (prix de référence PriceCharting exclusivement en USD, cf.
// shared/verdict.py) -- même principe que le reste du repo ("toute source
// non-USD convertit une fois, jamais à la lecture", cf.
// tcg-index-handoff.md §07) : on convertit ici, une fois, avant d'appeler
// l'API, qui continue de ne raisonner qu'en USD.
//
// Frankfurter (api.frankfurter.dev) : taux BCE, gratuit, sans clé -- pas un
// secret de plus à gérer pour une conversion best-effort. Si l'appel échoue
// (réseau, devise non couverte), CARDQUANT_GET_VERDICT répond
// reason: "fx" plutôt que d'afficher un verdict avec un montant faux.
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h -- taux BCE mis à jour ~1x/jour, pas besoin de plus frais

async function getUsdRate(currency) {
  const cacheKey = `cardquant_fx_${currency}_USD`;
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < FX_CACHE_TTL_MS) return cached.rate;

  const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${currency}&to=USD`);
  if (!res.ok) throw new Error("fx_unavailable");
  const data = await res.json();
  const rate = data.rates && data.rates.USD;
  if (!rate) throw new Error("fx_unavailable");

  await chrome.storage.local.set({ [cacheKey]: { rate, fetchedAt: Date.now() } });
  return rate;
}

/** Montant en USD. `currency` null/"USD" -> renvoyé tel quel (aucun appel
 * réseau). Lève si la conversion échoue -- à l'appelant de décider quoi
 * afficher, jamais un verdict silencieusement faux ici. */
async function toUsd(amount, currency) {
  if (!currency || currency === "USD") return amount;
  const rate = await getUsdRate(currency);
  return amount * rate;
}
