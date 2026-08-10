import { snapToWallEndpoints, snapAngle } from "./wallSnapping.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CLICK_THRESHOLD_PX = 6;
const DEFAULT_THICKNESS = 5; // cm de chaque côté (10cm de mur au total), éditable après coup

// Outil de tracé de murs : clic-clic en chaîne (comme une polyligne), chaque
// clic pose un nouveau mur depuis le point précédent et continue la chaîne
// depuis ce nouveau point. Échap ou double-clic termine la chaîne sans poser
// de segment supplémentaire. Snap aux extrémités des murs existants et aux
// angles de 45°.
export class WallTool {
  constructor({ layerEl, stage, store }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.active = false;
    this.floorId = null;
    this.chainPoint = null;
    this.pointerDownAt = null;
    this.previewLine = null;

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
    this.chainPoint = null;
    this.pointerDownAt = null;
    this.previewLine?.remove();
    this.previewLine = null;
  }

  resolvePoint(rawPoint) {
    const others = this.store.getWallsForFloor(this.floorId);
    let point = snapToWallEndpoints(rawPoint, others);
    if (this.chainPoint) point = snapAngle(this.chainPoint, point);
    return point;
  }

  onPointerDown(event) {
    if (!this.active) return;
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    if (!this.active || !this.pointerDownAt) return;
    const movedPx = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
    this.pointerDownAt = null;
    if (movedPx >= CLICK_THRESHOLD_PX) return; // glissé = pan, pas un point du mur

    const rawPoint = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);

    if (!this.chainPoint) {
      this.chainPoint = this.resolvePoint(rawPoint);
      return;
    }

    const point = this.resolvePoint(rawPoint);
    const distance = Math.hypot(point.x - this.chainPoint.x, point.y - this.chainPoint.y);
    if (distance < 1) {
      // Reclic quasi au même endroit : on termine la chaîne sans mur nul.
      this.reset();
      return;
    }

    this.store.addWall({
      floorId: this.floorId,
      x1: this.chainPoint.x,
      y1: this.chainPoint.y,
      x2: point.x,
      y2: point.y,
      thicknessLeft: DEFAULT_THICKNESS,
      thicknessRight: DEFAULT_THICKNESS,
    });
    this.chainPoint = point;
  }

  onPointerMove(event) {
    if (!this.active || !this.chainPoint) return;
    const rawPoint = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const point = this.resolvePoint(rawPoint);
    this.updatePreview(point);
  }

  updatePreview(to) {
    if (!this.previewLine) {
      this.previewLine = document.createElementNS(SVG_NS, "line");
      this.previewLine.classList.add("wall-preview");
      this.layerEl.appendChild(this.previewLine);
    }
    this.previewLine.setAttribute("x1", this.chainPoint.x);
    this.previewLine.setAttribute("y1", this.chainPoint.y);
    this.previewLine.setAttribute("x2", to.x);
    this.previewLine.setAttribute("y2", to.y);
  }

  onKeyDown(event) {
    if (!this.active || event.key !== "Escape") return;
    this.reset();
  }
}
