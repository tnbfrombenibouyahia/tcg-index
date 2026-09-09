import { PnlScreen } from "@/components/cardquant/pnl/PnlScreen";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// PnL "CardQuant" (cf. mémoire projet "cardquant-rebrand") -- écran neuf,
// backend neuf : aucune table de portefeuille personnel n'existait avant
// cette passe (cf. db/schema.sql::portfolio_positions, pricing/portfolio.py,
// pricing_api/main.py::/portfolio). web/ n'a que du SELECT sur Postgres
// (lib/db.ts), donc aucune donnée personnelle n'est chargée ici
// côté serveur -- seul le badge de synchro (public) l'est ; le reste de
// l'écran (PnlApp, cf. son commentaire) appelle pricing_api directement
// depuis le navigateur, authentifié par Firebase.
//
// Pour que ça fonctionne réellement en prod, il reste à : (1) appliquer la
// migration de schéma (portfolio_positions) sur la base réelle, (2)
// redéployer pricing_api (Cloud Run) avec les nouveaux endpoints, (3)
// vérifier que PRICING_API_CORS_ORIGINS inclut bien l'origine de production
// de web/. Rien de tout ça n'a été fait depuis cette session -- code écrit,
// pas déployé.
// ─────────────────────────────────────────────────────────────────────────────

// force-dynamic : sans ça, `next build` tente de pré-rendre cette page --
// aucun appel à cookies()/headers() ici pour le faire bifurquer tout seul
// vers du dynamique (contrairement à /dashboard, dont le premier appel
// getUniverse() lit un cookie et court-circuite le reste avant les
// requêtes DB). Résultat : buildSyncLabel() s'exécute pour de vrai pendant
// le build, depuis une machine de build US (iad1) vers Cloud SQL en
// europe-west3 -- la latence transatlantique dépasse le budget de 60s/page
// de Next (constaté le 2026-09-09 sur /live, /pnl, /transactions,
// /undervalued, /watchlist -- même symptôme que l'incident du 2026-09-07,
// mais qui passait alors sous le radar grâce à un bug TLS qui faisait
// échouer ces mêmes requêtes instantanément plutôt que lentement). Cette
// page n'a de toute façon aucune raison d'être statique : le badge de
// synchro doit être frais à chaque visite.
export const dynamic = "force-dynamic";

export default async function CardQuantPnlPage() {
  const syncLabel = await buildSyncLabel();
  return <PnlScreen syncLabel={syncLabel} />;
}
