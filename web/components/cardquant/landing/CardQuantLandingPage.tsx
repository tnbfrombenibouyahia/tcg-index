import "@/styles/cardquant/landing-animations.css";
import type { CoverageCard } from "@/lib/queries/landingCoverage";
import { darkOverrideStyle } from "../darkTokenOverride";
import { LandingNav } from "./LandingNav";
import { HeroSection } from "./HeroSection";
import { ThreeDShowcaseSection } from "./ThreeDShowcaseSection";
import { CoverageSection } from "./CoverageSection";
import { TerminalPreviewSection } from "./TerminalPreviewSection";
import { MetricsSection } from "./MetricsSection";
import { ExtensionPitchSection } from "./ExtensionPitchSection";
import { PricingSection } from "./PricingSection";
import { LandingFooter } from "./LandingFooter";

// Racine de la landing CardQuant (cf. mémoire projet "cardquant-rebrand") --
// remplace components/landing/LandingPage.tsx (ancien design "TCG Terminal").
// Les 3 sections reportées lors de la première passe (Scène 3D, Terminal
// showcase, Extension) sont maintenant faites -- cf. leurs fichiers propres
// pour les écarts vs le mockup d'origine (HoloCard/foil.css portés pour la
// Scène 3D ; Terminal showcase simplifié, l'image source du handoff n'a
// jamais été livrée ; bande d'onglets d'Extension générée plutôt que
// recopiée). Même surcharge sombre que DashboardScreen.tsx
// (darkTokenOverride.ts) : le design system est sombre sur les deux
// surfaces produit, pas seulement le Terminal.
export function CardQuantLandingPage({ coverage }: { coverage: CoverageCard[] }) {
  return (
    <div style={darkOverrideStyle({ minHeight: "100vh" })}>
      <LandingNav />
      <HeroSection />
      <ThreeDShowcaseSection />
      <CoverageSection cards={coverage} />
      <TerminalPreviewSection />
      <MetricsSection />
      <ExtensionPitchSection />
      <PricingSection />
      <LandingFooter />
    </div>
  );
}
