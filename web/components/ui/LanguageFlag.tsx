import { PixelGrid } from "@/components/ui/PixelGrid";

// ─────────────────────────────────────────────────────────────────────────────
// Drapeaux pixel-art par langue -- même technique/DA que TcgIcon (pokéball,
// chapeau de paille) : remplace l'ancien LanguageBadge (pastille texte
// masquée pour 'EN', cf. historique) par une icône toujours visible, plus
// lisible qu'un texte répété sur chaque ligne de Transactions/Scellés
// sous-évalués (demande utilisateur du 2026-08-01). Seules EN et JP existent
// en base aujourd'hui (cf. mémoire projet) -- une langue non reconnue ne
// rend rien plutôt que planter, au cas où une 3e langue arrive côté données
// avant son drapeau côté UI.
// ─────────────────────────────────────────────────────────────────────────────

const EN_COLORS: Record<string, string> = {
  B: "#002868", // bleu du canton
  R: "#BF0A30", // rouge des bandes
  W: "#FFFFFF",
};

const EN_ROWS = [
  "BBBBRRRR",
  "BBBBWWWW",
  "BBBBRRRR",
  "WWWWWWWW",
  "RRRRRRRR",
  "WWWWWWWW",
];

const JP_COLORS: Record<string, string> = {
  W: "#FFFFFF",
  R: "#BC002D", // rouge du hinomaru
};

const JP_ROWS = [
  "WWWWWWWW",
  "WWRRRRWW",
  "WRRRRRRW",
  "WRRRRRRW",
  "WWRRRRWW",
  "WWWWWWWW",
];

const FLAGS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  EN: { rows: EN_ROWS, colors: EN_COLORS },
  JP: { rows: JP_ROWS, colors: JP_COLORS },
};

export function LanguageFlag({ language, size = 16 }: { language: string; size?: number }) {
  const flag = FLAGS[language];
  if (!flag) return null;

  return (
    <span className="inline-flex flex-shrink-0 items-center rounded-[2px] ring-1 ring-black/10">
      <PixelGrid rows={flag.rows} colors={flag.colors} size={size} />
    </span>
  );
}
