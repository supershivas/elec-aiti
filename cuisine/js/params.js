// Dimensions en cm, lues sur le croquis. Tout est éditable dans la page :
// les schémas 2D et la vue 3D sont recalculés à partir de ces valeurs.
export const SCHEMA = [
  { group: 'Pièce', key: 'roomH', label: 'Hauteur sous plafond', v: 247 },
  { group: 'Pièce', key: 'roomD', label: 'Profondeur (côté frigo)', v: 168 },
  { group: 'Pièce', key: 'flatLen', label: 'Mur opposé : tronçon droit', v: 135 },
  { group: 'Pièce', key: 'diagLen', label: 'Mur opposé : tronçon en biais', v: 80 },
  { group: 'Pièce', key: 'diagDrop', label: 'Mur opposé : retrait du biais', v: 32 },
  { group: 'Porte-fenêtre (mur de droite)', key: 'doorW', label: 'Largeur', v: 73 },
  { group: 'Porte-fenêtre (mur de droite)', key: 'doorH', label: 'Hauteur', v: 205.7 },
  { group: 'Porte-fenêtre (mur de droite)', key: 'doorLeaf1', label: 'Premier vantail', v: 36 },
  { group: 'Porte-fenêtre (mur de droite)', key: 'doorPost', label: 'Montant central', v: 7 },
  { group: 'Meubles bas', key: 'gapW', label: 'Espace libre (angle)', v: 61 },
  { group: 'Meubles bas', key: 'unitW', label: 'Meuble 1', v: 60 },
  { group: 'Meubles bas', key: 'llW', label: 'Lave-linge', v: 60 },
  { group: 'Meubles bas', key: 'lvW', label: 'Lave-vaisselle', v: 60 },
  { group: 'Meubles bas', key: 'baseH', label: 'Hauteur plan de travail', v: 85 },
  { group: 'Meubles bas', key: 'baseD', label: 'Profondeur', v: 60 },
  { group: 'Meubles bas', key: 'topThick', label: 'Épaisseur plan de travail', v: 3 },
  { group: 'Colonne four / plaque', key: 'colW', label: 'Largeur', v: 88 },
  { group: 'Colonne four / plaque', key: 'ovenW', label: 'Four : largeur', v: 67 },
  { group: 'Colonne four / plaque', key: 'ovenH', label: 'Four : hauteur', v: 67.5 },
  { group: 'Colonne four / plaque', key: 'ovenBottom', label: 'Four : hauteur du bas', v: 4 },
  { group: 'Colonne four / plaque', key: 'stripH', label: 'Bandeau de commandes', v: 12 },
  { group: 'Colonne four / plaque', key: 'blockH', label: 'Bloc supérieur : hauteur', v: 44 },
  { group: 'Colonne four / plaque', key: 'ceilToBlock', label: 'Plafond → haut du bloc', v: 107 },
  { group: 'Meubles hauts', key: 'upW1', label: 'Largeur 1', v: 80 },
  { group: 'Meubles hauts', key: 'upW2', label: 'Largeur 2', v: 40 },
  { group: 'Meubles hauts', key: 'upH', label: 'Hauteur', v: 72.5 },
  { group: 'Meubles hauts', key: 'upD', label: 'Profondeur', v: 38 },
  { group: 'Meubles hauts', key: 'upCeil', label: 'Écart au plafond', v: 20 },
  { group: 'Tableau (Linky / disjoncteur)', key: 'panelW', label: 'Largeur', v: 42 },
  { group: 'Tableau (Linky / disjoncteur)', key: 'panelH', label: 'Hauteur', v: 80 },
  { group: 'Tableau (Linky / disjoncteur)', key: 'panelBottom', label: 'Hauteur du bas', v: 120 },
  { group: 'Frigo (mur de gauche)', key: 'fridgeW', label: 'Largeur', v: 60 },
  { group: 'Frigo (mur de gauche)', key: 'fridgeD', label: 'Profondeur', v: 70 },
  { group: 'Frigo (mur de gauche)', key: 'fridgeH', label: 'Hauteur', v: 155 },
  { group: 'Frigo (mur de gauche)', key: 'fridgeGap', label: 'Distance à l’angle du fond', v: 8 },
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map((f) => [f.key, f.v]));

const STORAGE_KEY = 'cuisine-aiti:params';

export function loadParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const params = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) params[key] = saved[key];
    }
    return params;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveParams(params) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // stockage indisponible : la page reste utilisable sans mémoire
  }
}

// Valeurs dérivées partagées par les vues 2D et 3D.
export function layout(p) {
  const unitsX = {
    gap: 0,
    unit: p.gapW,
    ll: p.gapW + p.unitW,
    lv: p.gapW + p.unitW + p.llW,
  };
  const colX = p.gapW + p.unitW + p.llW + p.lvW;
  const runW = colX + p.colW;
  const doorLeaf2 = p.doorW - p.doorLeaf1 - p.doorPost;
  const upX = p.gapW + p.unitW;
  const blockTop = p.roomH - p.ceilToBlock;
  const backRightD = p.roomD - p.diagDrop;
  const lastFlat = runW - p.flatLen - p.diagLen;
  // le frigo est contre le mur de gauche, à fridgeGap de l'angle du fond
  const fridgeZ0 = p.roomD - p.fridgeGap - p.fridgeW;
  return { unitsX, colX, runW, doorLeaf2, upX, blockTop, backRightD, lastFlat, fridgeZ0 };
}
