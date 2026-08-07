import sql from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Compteurs pour le bandeau de stats de la landing page (demande utilisateur :
// remplacer les chiffres inventés du mockup par de vraies données). Deux
// COUNT(*) simples -- pas besoin d'un index dédié, ces requêtes ne tournent
// qu'une fois par chargement de la page publique, pas dans une boucle de
// filtrage comme lib/queries/sales.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface LandingStats {
  itemCount: number;
  saleCount: number;
}

export async function getLandingStats(): Promise<LandingStats> {
  const [[items], [sales]] = await Promise.all([
    sql<{ count: number }[]>`SELECT COUNT(*)::int4 AS count FROM items`,
    sql<{ count: number }[]>`SELECT COUNT(*)::int4 AS count FROM sales`,
  ]);
  return { itemCount: items?.count ?? 0, saleCount: sales?.count ?? 0 };
}
