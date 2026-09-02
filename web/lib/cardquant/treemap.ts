// ─────────────────────────────────────────────────────────────────────────────
// Treemap minimal pour la heatmap par set du Dashboard CardQuant (cf. mémoire
// projet "cardquant-rebrand"). Le prototype .dc.html livrait des tuiles
// positionnées en dur (t.x/t.y/t.w/t.h) -- ici la taille de chaque tuile doit
// réellement refléter le volume de ventes du set, donc un vrai calcul.
//
// Partition binaire récursive (pas un squarified treemap complet façon
// d3-hierarchy) : à chaque étape, on coupe le rectangle courant en deux au
// point où la somme cumulée des valeurs (triées décroissant en amont par
// l'appelant) atteint ~50%, le long du plus grand côté du rectangle. Moins
// équilibré qu'un squarified treemap sur des distributions extrêmes, mais
// simple, sans dépendance, et largement suffisant pour ~24 tuiles -- à
// remplacer par une vraie lib (ex. d3-hierarchy) si la heatmap doit un jour
// gérer beaucoup plus de sets ou des tailles très disparates.
// ─────────────────────────────────────────────────────────────────────────────

export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function treemapLayout(values: number[], rect: TreemapRect): TreemapRect[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [rect];

  const total = sum(values);
  if (total <= 0) {
    // Valeurs nulles/négatives (ne devrait pas arriver, salesCount > 0
    // toujours côté requête) -- répartition égale plutôt qu'une division par
    // zéro plus bas.
    const w = rect.w / values.length;
    return values.map((_, i) => ({ x: rect.x + i * w, y: rect.y, w, h: rect.h }));
  }

  let acc = 0;
  let splitIndex = 1;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (acc >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.max(1, Math.min(values.length - 1, splitIndex));

  const groupA = values.slice(0, splitIndex);
  const groupB = values.slice(splitIndex);
  const fracA = sum(groupA) / total;

  if (rect.w >= rect.h) {
    const wA = rect.w * fracA;
    return [
      ...treemapLayout(groupA, { x: rect.x, y: rect.y, w: wA, h: rect.h }),
      ...treemapLayout(groupB, { x: rect.x + wA, y: rect.y, w: rect.w - wA, h: rect.h }),
    ];
  }
  const hA = rect.h * fracA;
  return [
    ...treemapLayout(groupA, { x: rect.x, y: rect.y, w: rect.w, h: hA }),
    ...treemapLayout(groupB, { x: rect.x, y: rect.y + hA, w: rect.w, h: rect.h - hA }),
  ];
}
