// Types de liaison disponibles, avec la couleur (token CSS) associée
export const linkTypes = [
  { type: "simple", label: "Liaison simple", colorVar: "--color-circuit-prise" },
  { type: "va_et_vient", label: "Va-et-vient", colorVar: "--color-circuit-eclairage" },
  { type: "alimentation", label: "Alimentation", colorVar: "--color-circuit-alimentation" },
  { type: "commande", label: "Commande", colorVar: "--color-circuit-commande" },
];

export function getLinkType(type) {
  return linkTypes.find((entry) => entry.type === type) ?? linkTypes[0];
}
