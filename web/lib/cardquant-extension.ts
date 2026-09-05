import type { User } from "firebase/auth";

// ID Chrome Web Store définitif (créé 2026-09-04) -- valeur à restaurer
// UNE FOIS L'EXTENSION RÉELLEMENT PUBLIÉE (elle ne l'est pas encore, cf.
// extension/STORE_LISTING.md) : "jkkonkcdkcadadfffonjlhlonmgcbmbm".
// D'ici là, aucune extension installée nulle part n'a cet ID -- le pointer
// vers l'ID de dev local (chrome://extensions -> CardQuant, dérivé du
// chemin du dossier depuis le retrait de `key` du manifeste, cf.
// extension/README.md) permet au relais ci-dessous d'atteindre la seule
// extension qui existe réellement pour l'instant (celle de test local).
// Var d'env plutôt qu'une valeur figée : NEXT_PUBLIC_CARDQUANT_EXTENSION_ID
// prend le dessus si définie (Vercel/​.env.local), pour ne plus jamais avoir
// à rééditer ce fichier à chaque changement d'ID local -- seul le défaut
// ci-dessous doit repasser à l'ID Store au moment de la publication.
const CARDQUANT_EXTENSION_ID = process.env.NEXT_PUBLIC_CARDQUANT_EXTENSION_ID || "pmdembnghhboeceipedchpgiffmclaja";

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
