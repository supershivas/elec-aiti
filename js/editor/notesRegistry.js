import { getCatalogEntry } from "../catalog/components.js";
import { getLinkType } from "../catalog/linkTypes.js";

// Numérotation partagée des notes (commentaires) d'un étage : composants
// commentés puis liaisons commentées puis groupes commentés, dans l'ordre du
// Store. Même liste consommée par ComponentsLayer et LinksLayer (pastilles
// affichées en direct sur le plan) et par io/exportPlan.js (liste "Notes"
// sous la légende), pour qu'un même élément commenté porte toujours le même
// numéro partout — un commentaire reste sinon un simple <title> au survol,
// invisible dans un export statique.
export function getNotedItems(store, floorId) {
  const items = [];
  for (const component of store.getComponentsForFloor(floorId)) {
    if (!component.comment || !component.comment.trim()) continue;
    const entry = getCatalogEntry(component.type);
    items.push({
      kind: "component",
      id: component.id,
      label: component.label || entry?.label || component.type,
      comment: component.comment,
    });
  }
  for (const liaison of store.getLiaisonsForFloor(floorId)) {
    if (!liaison.comment || !liaison.comment.trim()) continue;
    items.push({
      kind: "liaison",
      id: liaison.id,
      label: getLinkType(liaison.type)?.label || liaison.type,
      comment: liaison.comment,
    });
  }
  for (const group of store.getGroupsForFloor(floorId)) {
    if (!group.comment || !group.comment.trim()) continue;
    items.push({
      kind: "group",
      id: group.id,
      label: "Groupe d'interrupteurs",
      comment: group.comment,
    });
  }
  return items.map((item, i) => ({ ...item, number: i + 1 }));
}

// Map id -> numéro de note, pour un seul type d'élément (voir
// ComponentsLayer.render / LinksLayer.render).
export function noteNumbersByKind(notedItems, kind) {
  const map = new Map();
  for (const item of notedItems) {
    if (item.kind === kind) map.set(item.id, item.number);
  }
  return map;
}
