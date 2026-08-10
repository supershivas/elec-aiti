import { snapToWallEndpoints } from "./wallSnapping.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CLICK_THRESHOLD_PX = 6;
const CLOSE_DISTANCE = 20; // cm, distance au premier point pour refermer le polygone

// Outil de tracé de pièce : clic-clic pour poser les sommets d'un polygone
// (aimanté aux extrémités des murs existants), reclic à proximité du premier
// sommet (ou Entrée) pour refermer et poser la pièce, Échap pour annuler le
// tracé en cours. Rien n'est enregistré tant que le polygone n'est pas fermé.
export class RoomTool {
  constructor({ layerEl, stage, store }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.active = false;
    this.floorId = null;
    this.points = [];
    this.pointerDownAt = null;
    this.previewGroup = null;

    this.stage.svgEl.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.stage.svgEl.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.stage.svgEl.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  setFloor(floorId) {
    this.floorId = floorId;
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.reset();
  }

  reset() {
    this.points = [];
    this.pointerDownAt = null;
    this.previewGroup?.remove();
    this.previewGroup = null;
  }

  resolvePoint(rawPoint) {
    const walls = this.store.getWallsForFloor(this.floorId);
    return snapToWallEndpoints(rawPoint, walls);
  }

  onPointerDown(event) {
    if (!this.active) return;
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    if (!this.active || !this.pointerDownAt) return;
    const movedPx = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
    this.pointerDownAt = null;
    if (movedPx >= CLICK_THRESHOLD_PX) return; // glissé = pan, pas un sommet

    const point = this.resolvePoint(this.stage.clientToViewBoxPoint(event.clientX, event.clientY));

    if (this.points.length >= 3) {
      const first = this.points[0];
      if (Math.hypot(point.x - first.x, point.y - first.y) < CLOSE_DISTANCE) {
        this.commit();
        return;
      }
    }
    this.points.push(point);
    this.updatePreview(point);
  }

  onPointerMove(event) {
    if (!this.active || this.points.length === 0) return;
    const point = this.resolvePoint(this.stage.clientToViewBoxPoint(event.clientX, event.clientY));
    this.updatePreview(point);
  }

  updatePreview(cursor) {
    this.previewGroup?.remove();
    this.previewGroup = document.createElementNS(SVG_NS, "g");
    this.previewGroup.classList.add("room-preview");

    const line = document.createElementNS(SVG_NS, "polyline");
    line.classList.add("room-preview__line");
    line.setAttribute("points", [...this.points, cursor].map((p) => `${p.x},${p.y}`).join(" "));
    this.previewGroup.appendChild(line);

    for (const point of this.points) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.classList.add("room-preview__point");
      dot.setAttribute("cx", point.x);
      dot.setAttribute("cy", point.y);
      dot.setAttribute("r", 4);
      this.previewGroup.appendChild(dot);
    }

    this.layerEl.appendChild(this.previewGroup);
  }

  commit() {
    if (this.points.length >= 3) {
      this.store.addRoom({ floorId: this.floorId, points: this.points });
    }
    this.reset();
  }

  onKeyDown(event) {
    if (!this.active) return;
    if (event.key === "Escape") {
      this.reset();
    } else if (event.key === "Enter" && this.points.length >= 3) {
      this.commit();
    }
  }
}
