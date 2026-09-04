import { CardQuantLandingPage } from "@/components/cardquant/landing/CardQuantLandingPage";
import { getCoverageCards } from "@/lib/queries/landingCoverage";

// ─────────────────────────────────────────────────────────────────────────────
// Landing page = racine "/" (décision utilisateur du 2026-08-07, cf. mémoire
// projet "project_terminal_redesign"). Design remplacé le 2026-08-31 par le
// redesign CardQuant/Slabline (cf. mémoire projet "cardquant-rebrand") --
// remplace components/landing/LandingPage.tsx (ancien design "TCG Terminal",
// toujours dans le repo mais plus référencé). Le dashboard applicatif reste
// sur /dashboard (cf. app/(cardquant)/dashboard/page.tsx, même redesign,
// écran pilote).
//
// Périmètre de cette passe : Nav, Hero, Couverture, Métriques, Tarifs,
// Footer -- cf. commentaire de CardQuantLandingPage.tsx pour ce qui reste
// à faire (Scène 3D, Terminal showcase, Extension).
// ─────────────────────────────────────────────────────────────────────────────

export default async function LandingRoute() {
  const coverage = await getCoverageCards();
  return <CardQuantLandingPage coverage={coverage} />;
}
