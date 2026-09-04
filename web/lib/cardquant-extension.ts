import type { User } from "firebase/auth";

// ID de l'extension CardQuant (cf. extension/manifest.json `key`) -- stable
// en dev grâce à la clé figée dans le manifest, mais CHANGERA à la
// publication sur le Chrome Web Store (Chrome assigne un ID définitif à la
// création de la fiche). À mettre à jour ici ET dans
// extension/manifest.json (`externally_connectable`) le jour venu -- les
// deux doivent rester synchronisés, cf. extension/README.md.
const CARDQUANT_EXTENSION_ID = "diipacpliojnijgdhcgjkjhlipednoch";

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
 * n'ont pas l'extension, ce n'est jamais une erreur). Ne bloque jamais la
 * connexion sur le site : appelée en best-effort après un signInWithPopup
 * réussi (cf. components/auth/AuthModal.tsx), une erreur ici ne doit
 * jamais empêcher l'utilisateur de rester connecté sur le site lui-même. */
export async function relaySessionToExtension(user: User): Promise<void> {
  const runtime = getChromeRuntime();
  if (!runtime) return;

  try {
    const [idToken, tokenResult] = await Promise.all([user.getIdToken(), user.getIdTokenResult()]);
    await new Promise<void>((resolve) => {
      runtime.sendMessage(
        CARDQUANT_EXTENSION_ID,
        {
          type: "CARDQUANT_WEB_SESSION",
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          idToken,
          refreshToken: user.refreshToken,
          expiresAt: new Date(tokenResult.expirationTime).getTime() - 60_000,
        },
        () => resolve(), // réponse ignorée -- l'absence de l'extension n'est jamais une erreur à traiter
      );
    });
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
 * callback :
 * - un `chrome.runtime.lastError` est posé UNIQUEMENT quand aucune extension
 *   avec cet ID n'a pu recevoir le message (pas installée, ou mauvais ID) ;
 * - son ABSENCE, même avec une réponse `undefined`, veut dire qu'un
 *   listener existe bel et bien côté extension et a choisi de ne pas
 *   répondre à CE message précis -- l'extension est installée, elle ne gère
 *   simplement pas ce type de message.
 * Timeout de secours (800ms) au cas où le callback ne se déclenche jamais.
 * Jamais de promesse rejetée : on résout toujours à `false` par défaut,
 * jamais une erreur qui remonterait jusqu'à l'UI. */
export async function isExtensionInstalled(): Promise<boolean> {
  const runtime = getChromeRuntime();
  if (!runtime) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (installed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(installed);
    };
    const timeout = setTimeout(() => finish(false), 800);
    try {
      runtime.sendMessage(CARDQUANT_EXTENSION_ID, { type: "CARDQUANT_PING" }, () => {
        clearTimeout(timeout);
        finish(!runtime.lastError);
      });
    } catch {
      clearTimeout(timeout);
      finish(false);
    }
  });
}
