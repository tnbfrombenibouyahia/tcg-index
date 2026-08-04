// Miroir de index/methodology.py::INDEX_DEFINITIONS (Python, côté ingestion) --
// les 6 codes ne changent pas souvent, pas la peine d'aller les lire en base
// à chaque requête. Si un nouveau sous-indice est ajouté côté Python, ce
// fichier doit être mis à jour en miroir.
export type Tcg = "pokemon" | "one-piece";
export type IndexKind = "global" | "sealed" | "single";

export interface IndexDefinition {
  code: string;
  tcg: Tcg;
  kind: IndexKind;
  label: string;
}

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  { code: "PKM_GLOBAL", tcg: "pokemon", kind: "global", label: "Pokémon" },
  { code: "PKM_SEALED", tcg: "pokemon", kind: "sealed", label: "Pokémon — Scellé" },
  { code: "PKM_SINGLES", tcg: "pokemon", kind: "single", label: "Pokémon — Cartes" },
  { code: "OP_GLOBAL", tcg: "one-piece", kind: "global", label: "One Piece" },
  { code: "OP_SEALED", tcg: "one-piece", kind: "sealed", label: "One Piece — Scellé" },
  { code: "OP_SINGLES", tcg: "one-piece", kind: "single", label: "One Piece — Cartes" },
];

export const INDEX_CODES = INDEX_DEFINITIONS.map((d) => d.code);

// Même vocabulaire que price_snapshots.grade / sales.grade côté Python
// (cf. mémoire projet "grading_tiers") -- PSA uniquement, pas CGC/BGS/SGC/...
export const GRADES = ["ungraded", "psa7", "psa8", "psa9", "psa9.5", "psa10"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  ungraded: "Ungraded",
  psa7: "PSA 7",
  psa8: "PSA 8",
  psa9: "PSA 9",
  "psa9.5": "PSA 9.5",
  psa10: "PSA 10",
};

export const TCGS: { value: Tcg; label: string }[] = [
  { value: "pokemon", label: "Pokémon" },
  { value: "one-piece", label: "One Piece" },
];

// Fenêtres de temps du détecteur de divergence volume/prix (cf.
// lib/queries/divergence.ts). Vivent ici (fichier de constantes pures, sans
// import serveur) et non dans divergence.ts car des Client Components
// (DivergenceDetailModal, PriceVolumeChart...) en ont besoin -- importer une
// valeur runtime (pas juste un type) depuis un module qui importe `sql`
// (postgres -> fs) casse le bundle navigateur, même via un ré-export.
export const DIVERGENCE_WINDOWS = [7, 15, 30, 90, 180] as const;
export type DivergenceWindowDays = (typeof DIVERGENCE_WINDOWS)[number];

// Le volume de ventes (`sales`, agrégé dans index_volume) n'arrive jamais
// "en temps réel" : chaque carte n'est rescannée que sur le rythme de son
// palier (hot = quotidien, recent = 3x/semaine, established = hebdo,
// vintage/jp_singles = 1 tranche/semaine soit une rotation complète toutes
// les 8-12 semaines, cf. ingestion/orchestrator.py TIERS). Une vente datée
// d'il y a quelques jours peut donc n'être détectée que bien plus tard,
// quand la carte concernée retombe dans une tranche scannée -- vérifié
// empiriquement le 2026-08-03 : le total de ventes d'une journée continue
// de grimper sensiblement même après 40+ jours (cf. mémoire projet
// "sales_volume_tracking"). 14 jours ne rend donc pas les chiffres
// définitifs, mais couvre plusieurs cycles hot/recent (les paliers les plus
// actifs) -- assez pour que la tendance récente cesse d'être dominée par le
// bruit de scan plutôt que par une vraie variation de marché.
export const VOLUME_STABILIZATION_DAYS = 14;
