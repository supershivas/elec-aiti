import { isEditingText } from "./domUtils.js";
import { snapToWallEndpoints } from "./wallSnapping.js";
import { findConnectedEndpoints, groupWallVertices, pointsCoincide } from "./wallJoints.js";

export const SVG_NS = "http://www.w3.org/2000/svg";
const ENDPOINT_HANDLE_SIZE = 10;
const HIT_PADDING = 6; // cm de marge de chaque côté du mur pour faciliter le clic
const CLICK_THRESHOLD_PX = 6;
const ARROW_STEP = 1; // cm par pression de flèche
const ARROW_STEP_SHIFT = 10; // cm avec Maj enfoncée

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

function endpointOf(wall, key) {
  return key === "1" ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
}

// Gère l'affichage, la sélection et l'édition (extrémités/coins, glissé
// entier) des murs dessinés dans l'appli. Suspendu pendant le tracé (WallTool
// actif) ou la mesure, pour ne pas intercepter les clics destinés à ces outils.
//
// Deux murs dont une extrémité coïncide (à VERTEX_EPSILON près, voir
// wallJoints.js) sont traités comme reliés par un même "coin", sans que le
// modèle de données n'ait de notion de sommet partagé : c'est la coïncidence
// des coordonnées qui fait foi. Un patch circulaire (renderJoint) comble le
// vide entre leurs rectangles, et déplacer ce coin (glissé ou flèches) déplace
// ensemble toutes les extrémités qui y coïncident.
export class WallsLayer {
  constructor({ layerEl, stage, store, onSelect }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onSelect = onSelect;
    this.floorId = null;
    this.selectedId = null;
    this.selectedVertex = null; // { x, y } | null, exclusif avec selectedId
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
    this.selectedVertex = null;
    this.render();
  }

  setSuspended(suspended) {
    this.suspended = suspended;
  }

  render() {
    this.layerEl.replaceChildren();
    if (!this.floorId) return;
    const walls = this.store.getWallsForFloor(this.floorId);
    for (const wall of walls) {
      this.layerEl.appendChild(this.renderWall(wall));
    }
    for (const vertex of groupWallVertices(walls)) {
      this.layerEl.appendChild(this.renderJoint(vertex, walls));
    }
    // Les poignées sont ajoutées en dernier, hors des groupes de mur : sinon
    // la zone de clic (large et invisible) d'un mur voisin plus tard dans le
    // DOM passerait au-dessus et intercepterait les clics qui leur sont destinés.
    for (const wall of walls) {
      if (wall.id !== this.selectedId && !this.wallTouchesSelectedVertex(wall)) continue;
      for (const key of ["1", "2"]) {
        this.layerEl.appendChild(this.renderEndpointHandle(wall, walls, key));
      }
    }
    if (this.selectedVertex) {
      this.layerEl.appendChild(this.renderVertexMarker(this.selectedVertex));
    }
  }

  renderEndpointHandle(wall, walls, key) {
    const point = endpointOf(wall, key);
    const handle = document.createElementNS(SVG_NS, "rect");
    handle.classList.add("wall__endpoint-handle");
    handle.setAttribute("x", point.x - ENDPOINT_HANDLE_SIZE / 2);
    handle.setAttribute("y", point.y - ENDPOINT_HANDLE_SIZE / 2);
    handle.setAttribute("width", ENDPOINT_HANDLE_SIZE);
    handle.setAttribute("height", ENDPOINT_HANDLE_SIZE);
    handle.addEventListener("pointerdown", (event) => this.onEndpointPointerDown(event, walls, point));
    return handle;
  }

  // Comble le vide entre les rectangles de deux (ou plus) murs qui se
  // rejoignent : un disque plein, de la même couleur que les murs, dont le
  // rayon couvre l'épaisseur la plus large des murs connectés à ce coin.
  renderJoint(vertex, walls) {
    const radius = Math.max(
      ...vertex.connections.map(({ wallId }) => {
        const wall = walls.find((w) => w.id === wallId);
        return Math.max(wall.thicknessLeft, wall.thicknessRight);
      }),
    );
    const anySelected = vertex.connections.some(({ wallId }) => wallId === this.selectedId);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.classList.add("wall__joint");
    if (anySelected) circle.classList.add("wall__joint--selected");
    circle.setAttribute("cx", vertex.x);
    circle.setAttribute("cy", vertex.y);
    circle.setAttribute("r", radius);
    return circle;
  }

  renderVertexMarker(point) {
    const marker = document.createElementNS(SVG_NS, "circle");
    marker.classList.add("wall__vertex-marker");
    marker.setAttribute("cx", point.x);
    marker.setAttribute("cy", point.y);
    marker.setAttribute("r", ENDPOINT_HANDLE_SIZE / 2 + 2);
    return marker;
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
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "Mur";
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => this.onWallPointerDown(event, wall));
    return group;
  }

  wallTouchesSelectedVertex(wall) {
    if (!this.selectedVertex) return false;
    return pointsCoincide(endpointOf(wall, "1"), this.selectedVertex) || pointsCoincide(endpointOf(wall, "2"), this.selectedVertex);
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

  // Clic sans glissé sur une poignée -> sélectionne le coin (voir onKeyDown
  // pour les flèches, onStagePointerMove pour le glissé). Toutes les
  // extrémités de murs coïncidant avec ce point bougent ensemble.
  onEndpointPointerDown(event, walls, point) {
    if (this.suspended) return;
    event.stopPropagation();
    this.vertexDrag = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      originalPoint: point,
      connections: findConnectedEndpoints(walls, point),
      dragging: false,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  moveVertex(connections, from, to) {
    for (const { wallId, key } of connections) {
      this.store.updateWall(wallId, key === "1" ? { x1: to.x, y1: to.y } : { x2: to.x, y2: to.y });
    }
  }

  onStagePointerMove(event) {
    if (this.vertexDrag && this.vertexDrag.pointerId === event.pointerId) {
      const drag = this.vertexDrag;
      if (!drag.dragging) {
        const movedPx = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
        if (movedPx < CLICK_THRESHOLD_PX) return;
        drag.dragging = true;
        this.store.snapshot();
      }
      const raw = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
      const movedWallIds = new Set(drag.connections.map((c) => c.wallId));
      const others = this.store.getWallsForFloor(this.floorId).filter((w) => !movedWallIds.has(w.id));
      const snapped = snapToWallEndpoints(raw, others);
      this.moveVertex(drag.connections, drag.originalPoint, snapped);
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
    if (this.vertexDrag && this.vertexDrag.pointerId === event.pointerId) {
      const { dragging, originalPoint, connections } = this.vertexDrag;
      this.vertexDrag = null;
      if (!dragging) {
        this.selectVertex(originalPoint);
      } else {
        // Le point a pu se déplacer (glissé + snap) : on retrouve sa position
        // actuelle via l'un des murs déplacés plutôt que de la retraquer à part.
        const wall = this.store.getWallById(connections[0].wallId);
        if (wall) this.selectVertex(endpointOf(wall, connections[0].key), { silent: true });
      }
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
    this.selectedVertex = null;
    this.render();
    this.onSelect?.(id);
  }

  // silent: après un glissé, la sélection ne change pas logiquement (le coin
  // était déjà "actif"), pas besoin de redéclencher onSelect (qui réinitialise
  // par exemple la sélection composants/liaisons dans main.js).
  selectVertex(point, { silent = false } = {}) {
    this.selectedId = null;
    this.selectedVertex = point;
    this.render();
    if (!silent) this.onSelect?.(null);
  }

  clearSelection() {
    if (!this.selectedId && !this.selectedVertex) return;
    this.selectedId = null;
    this.selectedVertex = null;
    this.render();
  }

  getSelectedWall() {
    if (!this.selectedId || !this.floorId) return null;
    return this.store.getWallsForFloor(this.floorId).find((w) => w.id === this.selectedId) ?? null;
  }

  onKeyDown(event) {
    if (isEditingText(event.target)) return;
    if (this.selectedVertex) {
      const arrowDeltas = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const delta = arrowDeltas[event.key];
      if (delta) {
        event.preventDefault();
        const step = event.shiftKey ? ARROW_STEP_SHIFT : ARROW_STEP;
        const walls = this.store.getWallsForFloor(this.floorId);
        const connections = findConnectedEndpoints(walls, this.selectedVertex);
        if (connections.length === 0) return;
        this.store.snapshot();
        const to = { x: this.selectedVertex.x + delta.x * step, y: this.selectedVertex.y + delta.y * step };
        this.moveVertex(connections, this.selectedVertex, to);
        this.selectedVertex = to;
        this.render();
        return;
      }
      if (event.key === "Escape") this.select(null);
      return;
    }
    if (!this.selectedId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeWall(this.selectedId);
      this.selectedId = null;
    } else if (event.key === "Escape") {
      this.select(null);
    }
  }
}
