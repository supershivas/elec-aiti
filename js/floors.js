// Étages fournis avec le projet, utilisés comme point de départ du Store quand
// aucun projet n'est encore enregistré. Une fois l'appli lancée, la liste des
// étages (y compris ceux-ci) vit dans le Store — voir Store.getFloors — pour
// permettre d'en créer/renommer/supprimer. "kind: imported" = plan de fond
// vectorisé à la main (lecture seule) ; "kind: drawn" = murs dessinés dans
// l'appli (voir WallsLayer), sans planPath.
export const defaultFloors = [
  { id: "rdc", label: "Rez-de-chaussée", kind: "imported", planPath: "plans/aiti-elec_RDC.svg" },
  { id: "1er-etage", label: "1er étage", kind: "imported", planPath: "plans/aiti-elec_1er étage.svg" },
];
