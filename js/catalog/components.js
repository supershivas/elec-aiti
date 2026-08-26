// Catalogue des types de composants disponibles dans la palette (data-driven)
// Le plan de fond est à l'échelle 1px = 1cm : les composants qui représentent un
// vrai appareil (électroménager, tableau) sont dimensionnés en cm réels via
// width/height. Les symboles de position (prises, interrupteurs, points lumineux)
// restent des pictogrammes conventionnels de taille fixe (non mis à l'échelle).
//
// shape: 'symbol' -> <use> vers un <symbol> défini dans index.html
//        'box'     -> rectangle + abréviation texte (pas de pictogramme dédié)
//        'door'    -> vantail + arc de débattement pointillé, comme sur le plan de fond
export const catalog = [
  { type: "prise", label: "Prise simple", category: "Prises", shape: "symbol", symbolId: "prise", width: 24, height: 24 },
  { type: "prise_double", label: "Prise double", category: "Prises", shape: "symbol", symbolId: "prise-double", width: 24, height: 24 },
  { type: "prise_etanche", label: "Prise étanche", category: "Prises", shape: "symbol", symbolId: "prise-etanche", width: 24, height: 24 },
  { type: "prise_specialisee_plaque", label: "Prise spécialisée plaque de cuisson", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "PL", width: 24, height: 24 },
  { type: "prise_specialisee_four", label: "Prise spécialisée four", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "F", width: 24, height: 24 },
  { type: "prise_specialisee_lave_linge", label: "Prise spécialisée lave-linge", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "LL", width: 24, height: 24 },
  { type: "prise_specialisee_lave_vaisselle", label: "Prise spécialisée lave-vaisselle", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "LV", width: 24, height: 24 },
  { type: "prise_specialisee_convecteur", label: "Prise spécialisée convecteur", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "CV", width: 24, height: 24 },
  { type: "prise_specialisee_chauffe_eau", label: "Prise spécialisée chauffe-eau", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "CE", width: 24, height: 24 },
  { type: "prise_specialisee_seche_serviette", label: "Prise spécialisée sèche-serviette", category: "Prises", shape: "symbol", symbolId: "prise-specialisee", abbr: "SS", width: 24, height: 24 },

  { type: "point_lumineux", label: "Plafonnier", category: "Éclairage", shape: "symbol", symbolId: "plafonnier" },
  { type: "point_lumineux_applique", label: "Applique murale", category: "Éclairage", shape: "symbol", symbolId: "applique" },
  { type: "point_lumineux_spot", label: "Spot", category: "Éclairage", shape: "symbol", symbolId: "spot" },

  // gangable : peut être posé en plusieurs postes (double, triple...) sur le
  // même appareillage — component.gang (2 à gangMax) répète le pictogramme
  // plutôt que d'ajouter une entrée de catalogue par variante.
  { type: "interrupteur_simple", label: "Interrupteur simple", category: "Commandes", shape: "symbol", symbolId: "interrupteur", gangable: true, gangMax: 4 },
  { type: "va_et_vient", label: "Va-et-vient", category: "Commandes", shape: "symbol", symbolId: "va-et-vient", width: 67, height: 67 },
  { type: "poussoir", label: "Poussoir", category: "Commandes", shape: "symbol", symbolId: "poussoir" },
  { type: "variateur", label: "Variateur", category: "Commandes", shape: "symbol", symbolId: "variateur" },

  { type: "tableau_electrique", label: "Tableau électrique", category: "Tableau", shape: "symbol", symbolId: "tableau", width: 60, height: 40 },

  { type: "electromenager_four", label: "Four", category: "Électroménager", shape: "box", abbr: "F", width: 60, height: 60 },
  { type: "electromenager_plaque", label: "Plaque de cuisson", category: "Électroménager", shape: "box", abbr: "PL", width: 60, height: 60 },
  { type: "electromenager_lave_linge", label: "Lave-linge", category: "Électroménager", shape: "box", abbr: "LL", width: 60, height: 60 },
  { type: "electromenager_lave_vaisselle", label: "Lave-vaisselle", category: "Électroménager", shape: "box", abbr: "LV", width: 60, height: 60 },
  { type: "electromenager_chauffe_eau", label: "Chauffe-eau (cumulus)", category: "Électroménager", shape: "box", abbr: "CE", width: 50, height: 50 },
  { type: "electromenager_convecteur", label: "Convecteur électrique", category: "Électroménager", shape: "box", abbr: "CV", width: 60, height: 15 },
  { type: "electromenager_seche_serviette", label: "Sèche-serviette", category: "Électroménager", shape: "box", abbr: "SS", width: 50, height: 100 },
  { type: "electromenager_frigo", label: "Réfrigérateur", category: "Électroménager", shape: "box", abbr: "FR", width: 60, height: 60 },
  { type: "vmc", label: "VMC", category: "Électroménager", shape: "symbol", symbolId: "vmc" },

  // Pas électriques, mais utiles comme repères sur le plan (encombrement réel)
  { type: "sanitaire_wc", label: "Toilettes (WC)", category: "Sanitaire", shape: "box", abbr: "WC", width: 40, height: 60 },
  { type: "sanitaire_lavabo", label: "Lavabo", category: "Sanitaire", shape: "box", abbr: "LB", width: 55, height: 45 },

  // Rectangle libre : taille et nom demandés à la pose (voir ComponentsLayer.placeComponent).
  // "electrical: optional" -> case à cocher "Électrifié" dans la modale, par défaut non.
  { type: "meuble_personnalise", label: "Meuble personnalisé", category: "Mobilier", shape: "box", customizable: true, electrical: "optional", width: 60, height: 60 },

  // Repère d'ouverture, pas électrique : largeur = largeur de porte standard,
  // orientation via rotation (90° par 90°) + inversion du sens d'ouverture.
  { type: "porte", label: "Porte", category: "Structure", shape: "door", mirrorable: true, electrical: false, width: 80, height: 80 },
  // Cloison ajoutée au plan : taille libre comme le meuble personnalisé, jamais électrifiée.
  { type: "cloison", label: "Cloison", category: "Structure", shape: "box", customizable: true, electrical: false, width: 100, height: 10 },
];

export function getCatalogEntry(type) {
  return catalog.find((entry) => entry.type === type);
}

export function getCategories() {
  return [...new Set(catalog.map((entry) => entry.category))];
}

// Une liaison électrique n'a de sens qu'entre éléments électrifiés : les portes
// et cloisons ne le sont jamais, le meuble personnalisé seulement si la case
// "Électrifié" a été cochée à la pose (défaut : non).
export function isElectrifiable(component, entry) {
  if (!entry) return false;
  if (entry.electrical === false) return false;
  if (entry.electrical === "optional") return component.electrified === true;
  return true;
}
