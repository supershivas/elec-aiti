// Vrai si l'utilisateur est en train de saisir du texte dans un champ : les
// raccourcis clavier globaux (Suppr, R, Échap...) doivent alors laisser passer
// la frappe, sinon on casse la saisie du nom d'un composant (et ça peut aussi
// déclencher la recherche rapide de Firefox si la touche n'est pas consommée).
export function isEditingText(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
