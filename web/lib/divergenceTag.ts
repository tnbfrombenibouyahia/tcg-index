// Classification à 4 états de la divergence volume/prix (demande utilisateur :
// des tags plus clairs qu'un simple "aligné"/"pas aligné"). Vocabulaire
// standard d'analyse technique, adapté à un marché sans vente à découvert :
//
// - Prix ↓ & Volume ↑ = "Accumulation" -- plus d'acheteurs actifs pendant que
//   le prix est encore bas, signal potentiellement précurseur d'une hausse.
// - Prix ↑ & Volume ↓ = "Distribution" -- le prix monte sans être confirmé
//   par une hausse de la demande, risque de retournement.
// - Prix ↑ & Volume ↑ / Prix ↓ & Volume ↓ = mouvement confirmé dans les deux
//   sens ("Alignement"), moins surprenant, donc moins mis en avant visuellement.
export type DivergenceTag = "accumulation" | "distribution" | "alignedUp" | "alignedDown";

export function classifyDivergence(priceChangePct: number, volumeChangePct: number): DivergenceTag {
  const priceUp = priceChangePct >= 0;
  const volumeUp = volumeChangePct >= 0;
  if (priceUp && volumeUp) return "alignedUp";
  if (!priceUp && !volumeUp) return "alignedDown";
  return priceUp ? "distribution" : "accumulation";
}
