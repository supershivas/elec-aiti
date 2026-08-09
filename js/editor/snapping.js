import { getCatalogEntry } from "../catalog/components.js";

const SNAP_THRESHOLD = 8; // cm

// Aimante les bords/centres d'un élément à emprise réelle (mobilier,
// électroménager, sanitaire...) sur ceux des autres éléments du même type de
// grandeur pendant un glissé, pour faciliter l'alignement.
export function snapPosition(component, entry, x, y, others) {
  const width = component.width ?? entry.width;
  const height = component.height ?? entry.height;
  if (width === undefined) return { x, y };

  let snappedX = x;
  let snappedY = y;
  let bestDx = SNAP_THRESHOLD;
  let bestDy = SNAP_THRESHOLD;

  for (const other of others) {
    if (other.id === component.id) continue;
    const otherEntry = getCatalogEntry(other.type);
    const otherWidth = other.width ?? otherEntry?.width;
    const otherHeight = other.height ?? otherEntry?.height;
    if (otherWidth === undefined) continue;

    for (const targetX of [other.x - otherWidth / 2, other.x, other.x + otherWidth / 2]) {
      for (const selfOffset of [-width / 2, 0, width / 2]) {
        const candidate = targetX - selfOffset;
        const dx = Math.abs(candidate - x);
        if (dx < bestDx) {
          bestDx = dx;
          snappedX = candidate;
        }
      }
    }

    for (const targetY of [other.y - otherHeight / 2, other.y, other.y + otherHeight / 2]) {
      for (const selfOffset of [-height / 2, 0, height / 2]) {
        const candidate = targetY - selfOffset;
        const dy = Math.abs(candidate - y);
        if (dy < bestDy) {
          bestDy = dy;
          snappedY = candidate;
        }
      }
    }
  }

  return { x: snappedX, y: snappedY };
}
