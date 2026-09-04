import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase-client";

// Profil CardQuant (Firestore) -- porte les champs du formulaire
// d'inscription qui n'ont pas de place dans Firebase Auth lui-même (nom,
// e-mail, photo restent sur `user` directement) : pseudo public, tag
// réseau, jeu suivi, devise/langue préférées à l'inscription. Cf. mémoire
// projet "cardquant-rebrand", passe Auth -- pas de table Postgres
// équivalente, contrairement à PnL/Watchlist (données transactionnelles) :
// un profil par utilisateur est le cas d'usage natif de Firestore, et
// c'était déjà le plan d'architecture d'origine (tcg-index-handoff.md).

export type TrackedGame = "Pokémon EN" | "Pokémon JP" | "One Piece EN" | "One Piece JP";
export type SocialNetwork = "X" | "Discord" | "Instagram" | "TikTok";

export interface CardQuantProfile {
  handle: string; // pseudo public, sans "@", normalisé en minuscules
  social: string; // tag réseau, sans "@"
  network: SocialNetwork;
  game: TrackedGame;
  currency: "EUR" | "USD";
  lang: "FR" | "EN" | "ES";
}

const HANDLE_PATTERN = /^[a-z0-9._-]{3,24}$/;

/** Normalise un pseudo saisi ("@Lea.Slabs", " lea.slabs ") vers sa forme
 * canonique de stockage ("lea.slabs") -- sans "@", minuscules, espaces
 * retirés. Ne valide PAS le format ici (cf. `HANDLE_PATTERN` dans
 * `createProfile`) : un composant peut vouloir afficher la normalisation en
 * direct (aperçu "cardquant.io/@...") avant que l'utilisateur ait fini de
 * taper un pseudo valide. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** Crée le profil Firestore d'un utilisateur qui vient de s'inscrire.
 * Transaction sur 2 documents : `handles/{handle}` réserve le pseudo public
 * (échoue si déjà pris par un autre uid -- c'est la seule vérification
 * d'unicité, il n'y a pas de contrôle de disponibilité en direct pendant la
 * frappe dans cette passe) et `profiles/{uid}` porte le reste. Les deux
 * s'écrivent ensemble ou pas du tout : jamais un profil sans pseudo réservé,
 * ni un pseudo réservé sans profil derrière. */
export async function createProfile(user: User, fields: CardQuantProfile): Promise<void> {
  const handle = normalizeHandle(fields.handle);
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error("Le pseudo public doit faire 3 à 24 caractères (lettres, chiffres, points, tirets).");
  }

  const handleRef = doc(db, "handles", handle);
  const profileRef = doc(db, "profiles", user.uid);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(handleRef);
    if (existing.exists() && existing.data().uid !== user.uid) {
      throw new Error("Ce pseudo est déjà pris. Essaie une variante.");
    }
    tx.set(handleRef, { uid: user.uid });
    tx.set(profileRef, {
      handle,
      social: fields.social.trim().replace(/^@/, ""),
      network: fields.network,
      game: fields.game,
      currency: fields.currency,
      lang: fields.lang,
      createdAt: serverTimestamp(),
    });
  });
}
