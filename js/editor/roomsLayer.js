import { isEditingText } from "./domUtils.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const VERTEX_HANDLE_SIZE = 10;
const CLICK_THRESHOLD_PX = 6;

function centroid(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Gère l'affichage, la sélection et l'édition (sommets, glissé entier) des
// pièces (polygones fermés tracés à la main, voir RoomTool). Rendu avant le
// calque des murs (plus loin dans le DOM) : les murs restent peints par-dessus
// le remplissage à leurs frontières, et prennent la priorité de clic.
export class RoomsLayer {
  constructor({ layerEl, stage, store, onSelect }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onSelect = onSelect;
    this.floorId = null;
    this.selectedId = null;
    this.suspended = false;
    this.pendingDrag = null;
    this.vertexDrag = null;

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
    for (const room of this.store.getRoomsForFloor(this.floorId)) {
      this.layerEl.appendChild(this.renderRoom(room));
    }
    // Poignées de sommet ajoutées en dernier, hors du groupe : cohérent avec
    // le même choix fait pour les murs (voir WallsLayer).
    if (this.selectedId) {
      const room = this.store.getRoomsForFloor(this.floorId).find((r) => r.id === this.selectedId);
      if (room) {
        room.points.forEach((point, index) => {
          this.layerEl.appendChild(this.renderVertexHandle(room, index, point));
        });
      }
    }
  }

  renderRoom(room) {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("room");
    if (room.id === this.selectedId) group.classList.add("room--selected");
    group.dataset.roomId = room.id;

    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.classList.add("room__shape");
    polygon.setAttribute("points", room.points.map((p) => `${p.x},${p.y}`).join(" "));
    group.appendChild(polygon);

    if (room.label) {
      const c = centroid(room.points);
      const text = document.createElementNS(SVG_NS, "text");
      text.classList.add("room__label");
      text.setAttribute("x", c.x);
      text.setAttribute("y", c.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.textContent = room.label;
      group.appendChild(text);
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = room.label || "Pièce";
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => this.onRoomPointerDown(event, room));
    return group;
  }

  renderVertexHandle(room, index, point) {
    const handle = document.createElementNS(SVG_NS, "rect");
    handle.classList.add("room__vertex-handle");
    handle.setAttribute("x", point.x - VERTEX_HANDLE_SIZE / 2);
    handle.setAttribute("y", point.y - VERTEX_HANDLE_SIZE / 2);
    handle.setAttribute("width", VERTEX_HANDLE_SIZE);
    handle.setAttribute("height", VERTEX_HANDLE_SIZE);
    handle.addEventListener("pointerdown", (event) => this.onVertexPointerDown(event, room, index));
    return handle;
  }

  onRoomPointerDown(event, room) {
    if (this.suspended) return;
    event.stopPropagation();
    this.pendingDrag = {
      pointerId: event.pointerId,
      roomId: room.id,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      startPoints: room.points.map((p) => ({ ...p })),
      dragging: false,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onVertexPointerDown(event, room, index) {
    if (this.suspended) return;
    event.stopPropagation();
    this.store.snapshot();
    this.vertexDrag = { pointerId: event.pointerId, roomId: room.id, index };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onStagePointerMove(event) {
    if (this.vertexDrag && this.vertexDrag.pointerId === event.pointerId) {
      const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
      const room = this.store.getRoomById(this.vertexDrag.roomId);
      if (!room) return;
      const points = room.points.map((p, i) => (i === this.vertexDrag.index ? point : p));
      this.store.updateRoom(room.id, { points });
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
    const points = drag.startPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    this.store.updateRoom(drag.roomId, { points });
  }

  onStagePointerUp(event) {
    if (this.vertexDrag && this.vertexDrag.pointerId === event.pointerId) {
      this.vertexDrag = null;
      return;
    }
    if (this.pendingDrag && this.pendingDrag.pointerId === event.pointerId) {
      const { dragging, roomId } = this.pendingDrag;
      this.pendingDrag = null;
      if (!dragging) this.select(roomId);
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

  getSelectedRoom() {
    if (!this.selectedId || !this.floorId) return null;
    return this.store.getRoomsForFloor(this.floorId).find((r) => r.id === this.selectedId) ?? null;
  }

  onKeyDown(event) {
    if (!this.selectedId || isEditingText(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeRoom(this.selectedId);
      this.selectedId = null;
    } else if (event.key === "Escape") {
      this.select(null);
    }
  }
}
