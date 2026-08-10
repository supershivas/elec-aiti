import { wallGeometry } from "./wallsLayer.js";

const DEFAULT_WIDTH = 80; // cm, largeur de porte standard

// Trouve le mur le plus proche d'un point (dans la limite d'une marge), et la
// distance paramétrique le long de ce mur la plus proche du point cliqué.
function findWallAtPoint(walls, point, margin = 20) {
  let best = null;
  for (const wall of walls) {
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1;
    const { ux, uy } = wallGeometry(wall);
    const t = Math.max(0, Math.min(length, (point.x - wall.x1) * ux + (point.y - wall.y1) * uy));
    const closest = { x: wall.x1 + ux * t, y: wall.y1 + uy * t };
    const distance = Math.hypot(point.x - closest.x, point.y - closest.y);
    const threshold = (wall.thicknessLeft + wall.thicknessRight) / 2 + margin;
    if (distance > threshold) continue;
    if (!best || distance < best.distance) best = { wall, t, length, distance };
  }
  return best;
}

// Outil de pose d'ouverture (porte/fenêtre) : un clic sur un mur y ajoute une
// ouverture centrée sur le point cliqué, avec le type choisi dans la barre
// d'outils. La largeur/le type restent modifiables ensuite dans les propriétés.
export class OpeningTool {
  constructor({ stage, store }) {
    this.stage = stage;
    this.store = store;
    this.active = false;
    this.floorId = null;
    this.type = "porte";
    this.pointerDownAt = null;

    this.stage.svgEl.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.stage.svgEl.addEventListener("pointerup", (event) => this.onPointerUp(event));
  }

  setFloor(floorId) {
    this.floorId = floorId;
  }

  setType(type) {
    this.type = type;
  }

  setActive(active) {
    this.active = active;
    this.pointerDownAt = null;
  }

  onPointerDown(event) {
    if (!this.active) return;
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    if (!this.active || !this.pointerDownAt) return;
    const movedPx = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
    this.pointerDownAt = null;
    if (movedPx >= 6) return; // glissé = pan, pas une pose

    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const walls = this.store.getWallsForFloor(this.floorId);
    const hit = findWallAtPoint(walls, point);
    if (!hit) return;

    const width = Math.min(DEFAULT_WIDTH, hit.length);
    const offset = Math.max(0, Math.min(hit.length - width, hit.t - width / 2));
    this.store.addOpening({ floorId: this.floorId, wallId: hit.wall.id, offset, width, type: this.type });
  }
}
