import { isEditingText } from "./domUtils.js";
import { snapToWallEndpoints } from "./wallSnapping.js";

export const SVG_NS = "http://www.w3.org/2000/svg";
const ENDPOINT_HANDLE_SIZE = 10;
const HIT_PADDING = 6; // cm de marge de chaque côté du mur pour faciliter le clic
const CLICK_THRESHOLD_PX = 6;

// Un mur est un segment de référence (x1,y1)-(x2,y2) avec une épaisseur
// indépendante de chaque côté (thicknessLeft/thicknessRight) : le segment
// n'est pas forcément le centre du mur, ce qui permet par exemple un mur
// extérieur dont toute l'épaisseur part vers l'extérieur.
function wallGeometry(wall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normale unitaire "côté 1" (voir Store.addWall) : rotation -90° du vecteur direction.
  const nx = -uy;
  const ny = ux;
  return { ux, uy, nx, ny };
}

function wallPolygonPoints(wall) {
  const { nx, ny } = wallGeometry(wall);
  const l = wall.thicknessLeft;
  const r = wall.thicknessRight;
  const p1a = { x: wall.x1 + nx * l, y: wall.y1 + ny * l };
  const p2a = { x: wall.x2 + nx * l, y: wall.y2 + ny * l };
  const p2b = { x: wall.x2 - nx * r, y: wall.y2 - ny * r };
  const p1b = { x: wall.x1 - nx * r, y: wall.y1 - ny * r };
  return [p1a, p2a, p2b, p1b];
}

// Gère l'affichage, la sélection et l'édition (extrémités, glissé entier) des
// murs dessinés dans l'appli. Suspendu pendant le tracé (WallTool actif) ou
// la mesure, pour ne pas intercepter les clics destinés à ces outils.
export class WallsLayer {
  constructor({ layerEl, stage, store, onSelect }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onSelect = onSelect;
    this.floorId = null;
    this.selectedId = null;
    this.suspended = false;
    this.pendingDrag = null;
    this.endpointDrag = null;

    this.stage.svgEl.addEventListener("pointermove", (event) => this.onStagePointerMove(event));
    this.stage.svgEl.addEventListener("pointerup", (event) => this.onStagePointerUp(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  setFloor(floorId) {
    this.floorId = floorId;
    this.selectedId = null;
    this.render();
  }

  setSuspended(suspended) {
    this.suspended = suspended;
  }

  render() {
    this.layerEl.replaceChildren();
    if (!this.floorId) return;
    for (const wall of this.store.getWallsForFloor(this.floorId)) {
      this.layerEl.appendChild(this.renderWall(wall));
    }
  }

  renderWall(wall) {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("wall");
    if (wall.id === this.selectedId) group.classList.add("wall--selected");
    group.dataset.wallId = wall.id;

    const { nx, ny } = wallGeometry(wall);
    const centerOffset = (wall.thicknessLeft - wall.thicknessRight) / 2;
    const hit = document.createElementNS(SVG_NS, "line");
    hit.classList.add("wall__hit");
    hit.setAttribute("x1", wall.x1 + nx * centerOffset);
    hit.setAttribute("y1", wall.y1 + ny * centerOffset);
    hit.setAttribute("x2", wall.x2 + nx * centerOffset);
    hit.setAttribute("y2", wall.y2 + ny * centerOffset);
    hit.setAttribute("stroke-width", wall.thicknessLeft + wall.thicknessRight + HIT_PADDING * 2);
    group.appendChild(hit);

    const shape = document.createElementNS(SVG_NS, "polygon");
    shape.classList.add("wall__shape");
    shape.setAttribute("points", wallPolygonPoints(wall).map((p) => `${p.x},${p.y}`).join(" "));
    group.appendChild(shape);

    // Petit repère perpendiculaire du côté 1, uniquement sur le mur
    // sélectionné : sans lui, impossible de savoir visuellement à quelle face
    // correspond "Épaisseur côté 1" dans le panneau de propriétés.
    if (wall.id === this.selectedId) {
      const midX = (wall.x1 + wall.x2) / 2;
      const midY = (wall.y1 + wall.y2) / 2;
      const tick = document.createElementNS(SVG_NS, "line");
      tick.classList.add("wall__side-marker");
      tick.setAttribute("x1", midX);
      tick.setAttribute("y1", midY);
      tick.setAttribute("x2", midX + nx * (wall.thicknessLeft + 15));
      tick.setAttribute("y2", midY + ny * (wall.thicknessLeft + 15));
      group.appendChild(tick);

      for (const [key, point] of [
        ["1", { x: wall.x1, y: wall.y1 }],
        ["2", { x: wall.x2, y: wall.y2 }],
      ]) {
        const handle = document.createElementNS(SVG_NS, "rect");
        handle.classList.add("wall__endpoint-handle");
        handle.setAttribute("x", point.x - ENDPOINT_HANDLE_SIZE / 2);
        handle.setAttribute("y", point.y - ENDPOINT_HANDLE_SIZE / 2);
        handle.setAttribute("width", ENDPOINT_HANDLE_SIZE);
        handle.setAttribute("height", ENDPOINT_HANDLE_SIZE);
        handle.addEventListener("pointerdown", (event) => this.onEndpointPointerDown(event, wall, key));
        group.appendChild(handle);
      }
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "Mur";
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => this.onWallPointerDown(event, wall));
    return group;
  }

  onWallPointerDown(event, wall) {
    if (this.suspended) return;
    event.stopPropagation();
    this.pendingDrag = {
      pointerId: event.pointerId,
      wallId: wall.id,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      start: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
      dragging: false,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onEndpointPointerDown(event, wall, endpointKey) {
    if (this.suspended) return;
    event.stopPropagation();
    this.store.snapshot();
    this.endpointDrag = { pointerId: event.pointerId, wallId: wall.id, endpointKey };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onStagePointerMove(event) {
    if (this.endpointDrag && this.endpointDrag.pointerId === event.pointerId) {
      const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
      const others = this.store.getWallsForFloor(this.floorId).filter((w) => w.id !== this.endpointDrag.wallId);
      const snapped = snapToWallEndpoints(point, others);
      const changes = this.endpointDrag.endpointKey === "1" ? { x1: snapped.x, y1: snapped.y } : { x2: snapped.x, y2: snapped.y };
      this.store.updateWall(this.endpointDrag.wallId, changes);
      return;
    }
    if (!this.pendingDrag || this.pendingDrag.pointerId !== event.pointerId) return;
    const drag = this.pendingDrag;
    if (!drag.dragging) {
      const movedPx = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
      if (movedPx < CLICK_THRESHOLD_PX) return;
      drag.dragging = true;
      this.store.snapshot();
    }
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    this.store.updateWall(drag.wallId, {
      x1: drag.start.x1 + dx,
      y1: drag.start.y1 + dy,
      x2: drag.start.x2 + dx,
      y2: drag.start.y2 + dy,
    });
  }

  onStagePointerUp(event) {
    if (this.endpointDrag && this.endpointDrag.pointerId === event.pointerId) {
      this.endpointDrag = null;
      return;
    }
    if (this.pendingDrag && this.pendingDrag.pointerId === event.pointerId) {
      const { dragging, wallId } = this.pendingDrag;
      this.pendingDrag = null;
      if (!dragging) this.select(wallId);
    }
  }

  select(id) {
    this.selectedId = id;
    this.render();
    this.onSelect?.(id);
  }

  clearSelection() {
    if (!this.selectedId) return;
    this.selectedId = null;
    this.render();
  }

  getSelectedWall() {
    if (!this.selectedId || !this.floorId) return null;
    return this.store.getWallsForFloor(this.floorId).find((w) => w.id === this.selectedId) ?? null;
  }

  onKeyDown(event) {
    if (!this.selectedId || isEditingText(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeWall(this.selectedId);
      this.selectedId = null;
    } else if (event.key === "Escape") {
      this.select(null);
    }
  }
}
