// Liste des étages disponibles et de leur plan de fond associé
export const floors = [
  { id: "rdc", label: "Rez-de-chaussée", planPath: "plans/aiti-elec_RDC.svg" },
  { id: "1er-etage", label: "1er étage", planPath: "plans/aiti-elec_1er étage.svg" },
];

export function getFloorById(floorId) {
  return floors.find((floor) => floor.id === floorId);
}
