import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Garde du Terminal CardQuant (cf. mémoire projet "cardquant-rebrand", passe
// Auth). `middleware.ts` est déprécié depuis Next.js 16 en faveur de
// `proxy.ts` (export nommé `proxy`, cf. node_modules/next/dist/docs/.../
// proxy.md -- toujours vérifier ce fichier avant de toucher au routing bas
// niveau, cf. AGENTS.md) -- ce fichier N'EST PAS un `middleware.ts` renommé
// à la légère, c'est la bonne convention pour cette version.
//
// IMPORTANT -- ceci est une garde de NAVIGATION/UX, PAS la frontière de
// sécurité réelle : on vérifie seulement la PRÉSENCE du cookie `cq_session`
// (posé par lib/useAuth.ts à chaque connexion/déconnexion réelle), jamais sa
// validité cryptographique -- un cookie falsifié laisserait passer un
// visiteur non authentifié jusqu'au Terminal. Ce n'est jamais un problème de
// sécurité des données : la vraie frontière est déjà `require_user` côté
// pricing_api, qui vérifie le vrai ID token Firebase à CHAQUE appel pour
// toute donnée personnelle (favoris, portefeuille, cf. pricing_api/main.py).
// web/ elle-même ne sert que des données publiques (catalogue, prix) --
// aucune n'a besoin d'être protégée par cette garde. Le rôle de ce fichier
// est uniquement d'éviter qu'un visiteur anonyme atterrisse sur un écran du
// Terminal qui suppose une session (avatar, PnL, Watchlist...) sans passer
// par /auth d'abord.
//
// Périmètre : seulement les routes déjà migrées au design CardQuant/Slabline
// (celles listées dans components/cardquant/TopNav.tsx::ROUTES). L'ancien
// groupe (app) (divergence, grading-roi, liquidity, sealed-ev) reste public,
// hors périmètre de cette passe -- toujours en cours de migration.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = "cq_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = url.pathname + url.search;
  url.pathname = "/auth";
  url.search = "";
  url.searchParams.set("mode", "login");
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard",
    "/catalog/:path*",
    "/live",
    "/transactions",
    "/set-analysis",
    "/undervalued",
    "/population-analysis",
    "/pnl",
    "/watchlist",
  ],
};
