// Catalogue des types de composants disponibles dans la palette (data-driven)
export const catalog = [
  { type: "prise", label: "Prise simple", category: "Prises", symbolId: "prise" },
  { type: "prise_double", label: "Prise double", category: "Prises", symbolId: "prise-double" },
  { type: "prise_etanche", label: "Prise étanche", category: "Prises", symbolId: "prise-etanche" },

  { type: "point_lumineux", label: "Plafonnier", category: "Éclairage", symbolId: "plafonnier" },
  { type: "point_lumineux_applique", label: "Applique murale", category: "Éclairage", symbolId: "applique" },
  { type: "point_lumineux_spot", label: "Spot", category: "Éclairage", symbolId: "spot" },

  { type: "interrupteur_simple", label: "Interrupteur simple", category: "Commandes", symbolId: "interrupteur" },
  { type: "va_et_vient", label: "Va-et-vient", category: "Commandes", symbolId: "va-et-vient" },
  { type: "poussoir", label: "Poussoir", category: "Commandes", symbolId: "poussoir" },
  { type: "variateur", label: "Variateur", category: "Commandes", symbolId: "variateur" },

  { type: "tableau_electrique", label: "Tableau électrique", category: "Tableau", symbolId: "tableau" },

  { type: "electromenager_four", label: "Four", category: "Électroménager", symbolId: "electromenager", abbr: "F" },
  { type: "electromenager_plaque", label: "Plaque de cuisson", category: "Électroménager", symbolId: "electromenager", abbr: "PL" },
  { type: "electromenager_lave_linge", label: "Lave-linge", category: "Électroménager", symbolId: "electromenager", abbr: "LL" },
  { type: "electromenager_lave_vaisselle", label: "Lave-vaisselle", category: "Électroménager", symbolId: "electromenager", abbr: "LV" },
  { type: "electromenager_chauffe_eau", label: "Chauffe-eau", category: "Électroménager", symbolId: "electromenager", abbr: "CE" },
  { type: "vmc", label: "VMC", category: "Électroménager", symbolId: "vmc" },
];

export function getCatalogEntry(type) {
  return catalog.find((entry) => entry.type === type);
}

export function getCategories() {
  return [...new Set(catalog.map((entry) => entry.category))];
}
