// Fenêtre de cache partagée pour les requêtes de lecture derrière les pages
// les plus fréquentées (dashboard en premier, cf. mémoire projet
// "cardquant-rebrand") -- la donnée sous-jacente ne bouge qu'au rythme des
// jobs de sync (heures, cf. syncLabel.ts "Synchro OK · Xh"), donc 5 minutes
// de cache sont invisibles pour l'utilisateur tout en supprimant l'essentiel
// des requêtes répétées vers Cloud SQL (tier db-f1-micro, pool à 3
// connexions par instance -- cf. lib/db.ts, incident d'épuisement de
// connexions du 2026-09-06). Sans ce cache, le trafic tape directement la DB
// à chaque navigation : ça ne scale pas avec le nombre d'utilisateurs, ça
// scale avec le nombre de clics.
//
// Constantes partagées plutôt que dupliquées à chaque `unstable_cache(...)`
// pour ne régler qu'un seul endroit si la fenêtre doit changer, et pour
// pouvoir un jour brancher `revalidateTag(SYNC_DATA_TAG)` en fin de run
// d'ingestion (invalidation immédiate plutôt que d'attendre le TTL) sans
// toucher chaque site d'appel.
export const SYNC_DATA_REVALIDATE_SECONDS = 300;
export const SYNC_DATA_TAG = "sync-data";
