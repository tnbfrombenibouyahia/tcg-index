import type { User } from "firebase/auth";

// Deux canaux d'installation distincts existent réellement pour CardQuant,
// chacun avec son PROPRE ID d'extension permanent -- viser un seul ID en
// dur (ancienne implémentation) ne peut donc représenter qu'un canal à la
// fois, et casse silencieusement pour l'autre :
//  - Chrome Web Store (jkkonkcdkcadadfffonjlhlonmgcbmbm) : ID assigné par
//    Chrome à la création de la fiche (2026-09-04), permanent, indépendant
//    du manifeste -- c'est le canal de tout utilisateur normal (dont ce
//    n'était PAS encore le cas de ce constat -- cf. incident 2026-09-11 :
//    la fiche est publique depuis le 2026-09-06 mais le site ciblait
//    encore l'ID de dev local jusque-là).
//  - Extension non empaquetée (diipacpliojnijgdhcgjkjhlipednoch) : ID
//    dérivé de la clé publique `key` fixée dans extension/manifest.json
//    (cf. son commentaire) -- stable pour QUICONQUE charge ce même dossier
//    non empaquetée (dev local, zip partagé à un testeur direct), peu
//    importe le chemin sur son disque. Sans `key`, cet ID change à chaque
//    checkout/chemin différent -- c'est ce qui cassait le relais pour tout
//    testeur autre que la personne qui avait codé en dur SON propre ID de
//    l'époque (incident 2026-09-11, avant la restauration de `key`).
// Le relais (et la détection d'installation) essaie les DEUX IDs à chaque
// fois, best-effort sur chacun -- silencieux si aucune extension ne répond
// (immense majorité des visiteurs), fonctionne si l'une OU l'autre est
// installée. Ajouter un futur canal (ex. Edge Add-ons, ID différent) est
// un ajout à la liste, jamais un remplacement.
// Var d'env : NEXT_PUBLIC_CARDQUANT_EXTENSION_IDS (CSV) remplace la liste
// par défaut si définie (Vercel/.env.local) -- utile pour viser un ID de
// dev ponctuel sans toucher au code.
const DEFAULT_EXTENSION_IDS = ["jkkonkcdkcadadfffonjlhlonmgcbmbm", "diipacpliojnijgdhcgjkjhlipednoch"];
const CARDQUANT_EXTENSION_IDS =
  process.env.NEXT_PUBLIC_CARDQUANT_EXTENSION_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) || DEFAULT_EXTENSION_IDS;

type ChromeRuntime = {
  sendMessage: (extensionId: string, message: unknown, callback?: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntime | null {
  // `window.chrome` existe nativement dans tout Chrome, avec ou sans
  // extension installée -- mais `runtime.sendMessage(extensionId, ...)`
  // vers UNE extension précise n'aboutit que si celle-ci déclare ce site
  // dans `externally_connectable`. Aucun risque à tenter l'appel sur les
  // ~100% de visiteurs qui n'ont pas l'extension : silencieux, jamais une
  // erreur bloquante (cf. relaySessionToExtension ci-dessous).
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return w.chrome?.runtime ?? null;
}

/** Relaie la session Firebase vers l'extension CardQuant si elle est
 * installée -- silencieux sinon (la grande majorité des visiteurs du site
 * n'ont pas l'extension, ce n'est jamais une erreur). Essaie CHAQUE ID
 * connu (cf. CARDQUANT_EXTENSION_IDS ci-dessus) : au plus une extension
 * réelle est installée à la fois côté navigateur, les autres tentatives
 * échouent silencieusement (aucune extension à cet ID), sans conséquence.
 * Ne bloque jamais la connexion sur le site : appelée en best-effort après
 * un signInWithPopup réussi (cf. components/auth/AuthModal.tsx), une
 * erreur ici ne doit jamais empêcher l'utilisateur de rester connecté sur
 * le site lui-même. */
export async function relaySessionToExtension(user: User): Promise<void> {
  const runtime = getChromeRuntime();
  if (!runtime) return;

  try {
    const [idToken, tokenResult] = await Promise.all([user.getIdToken(), user.getIdTokenResult()]);
    const payload = {
      type: "CARDQUANT_WEB_SESSION",
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      idToken,
      refreshToken: user.refreshToken,
      expiresAt: new Date(tokenResult.expirationTime).getTime() - 60_000,
    };
    await Promise.all(
      CARDQUANT_EXTENSION_IDS.map(
        (extensionId) =>
          new Promise<void>((resolve) => {
            runtime.sendMessage(extensionId, payload, () => resolve()); // réponse ignorée -- l'absence de l'extension n'est jamais une erreur à traiter
          }),
      ),
    );
  } catch {
    // best-effort : jamais remonté à l'appelant (cf. docstring ci-dessus)
  }
}

/** Détecte si l'extension CardQuant est réellement installée -- utilisé par
 * la page /extension pour afficher un état "déjà installée" honnête plutôt
 * que de deviner. Aucune modification côté extension nécessaire : on envoie
 * un message d'un type que `background.js::onMessageExternal` ne reconnaît
 * pas (il renvoie `false`/ne répond pas pour tout type ≠
 * "CARDQUANT_WEB_SESSION"), et on distingue les deux cas possibles au
 * callback, POUR CHAQUE ID de CARDQUANT_EXTENSION_IDS :
 * - un `chrome.runtime.lastError` est posé UNIQUEMENT quand aucune extension
 *   avec cet ID n'a pu recevoir le message (pas installée, ou mauvais ID) ;
 * - son ABSENCE, même avec une réponse `undefined`, veut dire qu'un
 *   listener existe bel et bien côté extension et a choisi de ne pas
 *   répondre à CE message précis -- l'extension est installée, elle ne gère
 *   simplement pas ce type de message.
 * Installée si AU MOINS UN des IDs répond ainsi. Timeout de secours (800ms)
 * au cas où un callback ne se déclenche jamais. Jamais de promesse rejetée :
 * on résout toujours à `false` par défaut, jamais une erreur qui remonterait
 * jusqu'à l'UI. */
export async function isExtensionInstalled(): Promise<boolean> {
  const runtime = getChromeRuntime();
  if (!runtime) return false;

  const checks = CARDQUANT_EXTENSION_IDS.map(
    (extensionId) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (installed: boolean) => {
          if (settled) return;
          settled = true;
          resolve(installed);
        };
        const timeout = setTimeout(() => finish(false), 800);
        try {
          runtime.sendMessage(extensionId, { type: "CARDQUANT_PING" }, () => {
            clearTimeout(timeout);
            finish(!runtime.lastError);
          });
        } catch {
          clearTimeout(timeout);
          finish(false);
        }
      }),
  );
  const results = await Promise.all(checks);
  return results.some(Boolean);
}
