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
//
// EN = Union Jack (pas la bannière US) -- généré par grille de distance aux
// diagonales/croix (cf. gen_uk_flag.py, scratchpad du 2026-08-02) pour un
// tracé fidèle plutôt qu'à la main. JP a une résolution 4x plus fine
// (24x16 vs l'ancien 8x6) pour que le hinomaru se lise comme un cercle et
// pas comme un losange (demande utilisateur du 2026-08-02).
// ─────────────────────────────────────────────────────────────────────────────

const EN_COLORS: Record<string, string> = {
  B: "#012169", // bleu Union Jack
  R: "#C8102E", // rouge Union Jack
  W: "#FFFFFF",
};

const EN_ROWS = [
  "RRRWWWBBBBBBWRRRRWBBBBBBWWWRRR",
  "RRRRWWWBBBBBWRRRRWBBBBBWWWRRRR",
  "WWRRRRWWWBBBWRRRRWBBBWWWRRRRWW",
  "WWWRRRRRWWWBWRRRRWBWWWRRRRRWWW",
  "BBWWWRRRRRWWWRRRRWWWRRRRRWWWBB",
  "BBBBWWWRRRRWWRRRRWWRRRRWWWBBBB",
  "WWWWWWWWWWWWWRRRRWWWWWWWWWWWWW",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "WWWWWWWWWWWWWRRRRWWWWWWWWWWWWW",
  "BBBBWWWRRRRWWRRRRWWRRRRWWWBBBB",
  "BBWWWRRRRRWWWRRRRWWWRRRRRWWWBB",
  "WWWRRRRRWWWBWRRRRWBWWWRRRRRWWW",
  "WWRRRRWWWBBBWRRRRWBBBWWWRRRRWW",
  "RRRRWWWBBBBBWRRRRWBBBBBWWWRRRR",
  "RRRWWWBBBBBBWRRRRWBBBBBBWWWRRR",
];

const JP_COLORS: Record<string, string> = {
  W: "#FFFFFF",
  R: "#BC002D", // rouge du hinomaru
};

const JP_ROWS = [
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWRRRRWWWWWWWWWW",
  "WWWWWWWWWRRRRRRWWWWWWWWW",
  "WWWWWWWWRRRRRRRRWWWWWWWW",
  "WWWWWWWRRRRRRRRRRWWWWWWW",
  "WWWWWWWRRRRRRRRRRWWWWWWW",
  "WWWWWWWRRRRRRRRRRWWWWWWW",
  "WWWWWWWRRRRRRRRRRWWWWWWW",
  "WWWWWWWWRRRRRRRRWWWWWWWW",
  "WWWWWWWWWRRRRRRWWWWWWWWW",
  "WWWWWWWWWWRRRRWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
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
