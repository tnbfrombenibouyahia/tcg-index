import { AuthPage } from "@/components/cardquant/auth/AuthPage";

// ─────────────────────────────────────────────────────────────────────────────
// Route /auth (port de "CardQuant Auth.dc.html", cf. mémoire projet
// "cardquant-rebrand", passe Auth) -- seul point d'entrée d'authentification
// pour le Terminal désormais gardé (cf. proxy.ts). Hors du groupe
// (cardquant) : pas de TopNav ici, comme chaque écran migré, cette page pose
// son propre header minimal (dans AuthPage.tsx).
//
// `searchParams` lu côté serveur (pattern déjà utilisé par
// app/(cardquant)/catalog/page.tsx) plutôt que `useSearchParams()` côté
// client : évite un flash "mode par défaut" avant hydratation quand on
// arrive avec `?mode=signup` (ex. depuis LandingNav.tsx) ou `?next=...`
// (ex. depuis proxy.ts).
// ─────────────────────────────────────────────────────────────────────────────

export default async function AuthRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const get = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const mode = get("mode") === "signup" ? "signup" : "login";
  const next = get("next");

  return <AuthPage mode={mode} next={next} />;
}
