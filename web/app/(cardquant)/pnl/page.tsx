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

export default async function CardQuantPnlPage() {
  const syncLabel = await buildSyncLabel();
  return <PnlScreen syncLabel={syncLabel} />;
}
