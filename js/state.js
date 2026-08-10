import { defaultFloors } from "./floors.js";

const STORAGE_KEY = "elec-aiti:project";
const MAX_HISTORY = 50;

function seedFloors() {
  return defaultFloors.map((floor) => ({ ...floor }));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { floors: seedFloors(), components: [], liaisons: [], walls: [] };
    const parsed = JSON.parse(raw);
    return {
      floors: Array.isArray(parsed.floors) && parsed.floors.length > 0 ? parsed.floors : seedFloors(),
      components: Array.isArray(parsed.components) ? parsed.components : [],
      liaisons: Array.isArray(parsed.liaisons) ? parsed.liaisons : [],
      walls: Array.isArray(parsed.walls) ? parsed.walls : [],
    };
  } catch {
    return { floors: seedFloors(), components: [], liaisons: [], walls: [] };
  }
}

function saveToStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let nextId = 1;
function createId(prefix) {
  return `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`;
}

// Store applicatif minimal : composants + liaisons posés, avec persistance localStorage
// et un historique d'annulation. L'historique n'est pris qu'au début d'une action
// logique (pose, suppression, début de glissé, rotation) : updateComponent seul
// (appelé en continu pendant un drag) ne prend jamais de snapshot, sinon "Annuler"
// ne défairait qu'un pixel de déplacement à la fois.
export class Store {
  constructor() {
    this.state = loadFromStorage();
    this.listeners = new Set();
    this.history = [];
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    saveToStorage(this.state);
    for (const listener of this.listeners) listener();
  }

  snapshot() {
    this.history.push(
      JSON.stringify({
        floors: this.state.floors,
        components: this.state.components,
        liaisons: this.state.liaisons,
        walls: this.state.walls,
      }),
    );
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const previous = this.history.pop();
    if (previous === undefined) return false;
    const parsed = JSON.parse(previous);
    this.state.floors = parsed.floors;
    this.state.components = parsed.components;
    this.state.liaisons = parsed.liaisons;
    this.state.walls = parsed.walls ?? [];
    this.notify();
    return true;
  }

  getFloors() {
    return this.state.floors;
  }

  getFloorById(id) {
    return this.state.floors.find((floor) => floor.id === id);
  }

  addFloor(label) {
    this.snapshot();
    const floor = { id: createId("f"), label, kind: "drawn" };
    this.state.floors.push(floor);
    this.notify();
    return floor;
  }

  renameFloor(id, label) {
    const floor = this.state.floors.find((f) => f.id === id);
    if (!floor) return;
    this.snapshot();
    floor.label = label;
    this.notify();
  }

  // On garde toujours au moins un étage : un plan sans aucun étage n'a pas de
  // sens dans cette appli (pas d'écran "projet vide").
  removeFloor(id) {
    if (this.state.floors.length <= 1) return false;
    this.snapshot();
    const removedComponentIds = new Set(this.state.components.filter((c) => c.floorId === id).map((c) => c.id));
    this.state.floors = this.state.floors.filter((f) => f.id !== id);
    this.state.components = this.state.components.filter((c) => c.floorId !== id);
    for (const component of this.state.components) {
      if (component.linkedComponentId && removedComponentIds.has(component.linkedComponentId)) {
        component.linkedComponentId = undefined;
      }
    }
    this.state.liaisons = this.state.liaisons.filter((l) => l.floorId !== id);
    this.state.walls = this.state.walls.filter((w) => w.floorId !== id);
    this.notify();
    return true;
  }

  getComponentsForFloor(floorId) {
    return this.state.components.filter((component) => component.floorId === floorId);
  }

  getComponentById(id) {
    return this.state.components.find((component) => component.id === id);
  }

  addComponent({ type, floorId, x, y, ...rest }) {
    this.snapshot();
    const component = { id: createId("c"), type, floorId, x, y, rotation: 0, ...rest };
    this.state.components.push(component);
    this.notify();
    return component;
  }

  updateComponent(id, changes) {
    const component = this.state.components.find((c) => c.id === id);
    if (!component) return;
    Object.assign(component, changes);
    this.notify();
  }

  // Duplique un composant sur le même étage, légèrement décalé pour rester
  // visible à côté de l'original. Le double n'est pas lié à l'original (voir
  // linkToOtherFloor pour le cas "même équipement, autre étage") : ce sont deux
  // éléments indépendants dès la duplication.
  duplicateComponent(id, offset = 20) {
    const component = this.state.components.find((c) => c.id === id);
    if (!component) return null;
    this.snapshot();
    const clone = { ...component, id: createId("c"), x: component.x + offset, y: component.y + offset, linkedComponentId: undefined };
    this.state.components.push(clone);
    this.notify();
    return clone;
  }

  removeComponent(id) {
    this.snapshot();
    const removed = this.state.components.find((c) => c.id === id);
    this.state.components = this.state.components.filter((c) => c.id !== id);
    // Un composant lié sur l'autre étage (même équipement physique) ne doit pas
    // garder une référence vers un id qui n'existe plus.
    if (removed?.linkedComponentId) {
      const linked = this.state.components.find((c) => c.id === removed.linkedComponentId);
      if (linked) linked.linkedComponentId = undefined;
    }
    // Une liaison qui pointe vers un composant supprimé n'a plus de sens
    this.state.liaisons = this.state.liaisons.filter((l) => l.fromComponentId !== id && l.toComponentId !== id);
    this.notify();
  }

  // Un même équipement physique peut être présent sur deux étages (ex: point
  // lumineux de cage d'escalier commandé depuis le RDC et le 1er) : on pose une
  // copie liée sur l'autre étage, avec sa propre position/rotation (le plan
  // diffère d'un étage à l'autre) mais un lien mutuel vers son double.
  linkToOtherFloor(componentId, otherFloorId) {
    const component = this.state.components.find((c) => c.id === componentId);
    if (!component) return null;
    this.snapshot();
    const clone = { ...component, id: createId("c"), floorId: otherFloorId, linkedComponentId: component.id };
    component.linkedComponentId = clone.id;
    this.state.components.push(clone);
    this.notify();
    return clone;
  }

  unlinkComponent(componentId) {
    const component = this.state.components.find((c) => c.id === componentId);
    if (!component?.linkedComponentId) return;
    this.snapshot();
    const linked = this.state.components.find((c) => c.id === component.linkedComponentId);
    component.linkedComponentId = undefined;
    if (linked) linked.linkedComponentId = undefined;
    this.notify();
  }

  getLiaisonsForFloor(floorId) {
    return this.state.liaisons.filter((liaison) => liaison.floorId === floorId);
  }

  addLiaison({ floorId, type, fromComponentId, toComponentId }) {
    this.snapshot();
    const liaison = { id: createId("l"), floorId, type, fromComponentId, toComponentId };
    this.state.liaisons.push(liaison);
    this.notify();
    return liaison;
  }

  updateLiaison(id, changes) {
    const liaison = this.state.liaisons.find((l) => l.id === id);
    if (!liaison) return;
    this.snapshot();
    Object.assign(liaison, changes);
    this.notify();
  }

  removeLiaison(id) {
    this.snapshot();
    this.state.liaisons = this.state.liaisons.filter((l) => l.id !== id);
    this.notify();
  }

  getWallsForFloor(floorId) {
    return this.state.walls.filter((wall) => wall.floorId === floorId);
  }

  getWallById(id) {
    return this.state.walls.find((wall) => wall.id === id);
  }

  // thicknessLeft/thicknessRight sont indépendantes : un mur n'est pas centré sur
  // son segment de référence (x1,y1)-(x2,y2), ce qui permet par exemple un mur
  // extérieur dont toute l'épaisseur part vers l'extérieur (thickness côté
  // intérieur = 0) plutôt qu'une épaisseur symétrique de part et d'autre.
  addWall({ floorId, x1, y1, x2, y2, thicknessLeft = 5, thicknessRight = 5 }) {
    this.snapshot();
    const wall = { id: createId("w"), floorId, x1, y1, x2, y2, thicknessLeft, thicknessRight };
    this.state.walls.push(wall);
    this.notify();
    return wall;
  }

  updateWall(id, changes) {
    const wall = this.state.walls.find((w) => w.id === id);
    if (!wall) return;
    Object.assign(wall, changes);
    this.notify();
  }

  removeWall(id) {
    this.snapshot();
    this.state.walls = this.state.walls.filter((w) => w.id !== id);
    this.notify();
  }

  // Remplace tout le projet (import de fichier .aiti) : toutes les étages, en un
  // seul cran d'annulation.
  loadProject(data) {
    this.snapshot();
    this.state = {
      floors: Array.isArray(data?.floors) && data.floors.length > 0 ? data.floors : seedFloors(),
      components: Array.isArray(data?.components) ? data.components : [],
      liaisons: Array.isArray(data?.liaisons) ? data.liaisons : [],
      walls: Array.isArray(data?.walls) ? data.walls : [],
    };
    this.notify();
  }

  clearFloor(floorId) {
    this.snapshot();
    const removedIds = new Set(
      this.state.components.filter((c) => c.floorId === floorId).map((c) => c.id),
    );
    this.state.components = this.state.components.filter((c) => c.floorId !== floorId);
    for (const component of this.state.components) {
      if (component.linkedComponentId && removedIds.has(component.linkedComponentId)) {
        component.linkedComponentId = undefined;
      }
    }
    this.state.liaisons = this.state.liaisons.filter((l) => l.floorId !== floorId);
    this.state.walls = this.state.walls.filter((w) => w.floorId !== floorId);
    this.notify();
  }
}
