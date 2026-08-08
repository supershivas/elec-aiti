const STORAGE_KEY = "elec-aiti:project";
const MAX_HISTORY = 50;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { components: [], liaisons: [] };
    const parsed = JSON.parse(raw);
    return {
      components: Array.isArray(parsed.components) ? parsed.components : [],
      liaisons: Array.isArray(parsed.liaisons) ? parsed.liaisons : [],
    };
  } catch {
    return { components: [], liaisons: [] };
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
    this.history.push(JSON.stringify({ components: this.state.components, liaisons: this.state.liaisons }));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const previous = this.history.pop();
    if (previous === undefined) return false;
    const parsed = JSON.parse(previous);
    this.state.components = parsed.components;
    this.state.liaisons = parsed.liaisons;
    this.notify();
    return true;
  }

  getComponentsForFloor(floorId) {
    return this.state.components.filter((component) => component.floorId === floorId);
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

  removeComponent(id) {
    this.snapshot();
    this.state.components = this.state.components.filter((c) => c.id !== id);
    // Une liaison qui pointe vers un composant supprimé n'a plus de sens
    this.state.liaisons = this.state.liaisons.filter((l) => l.fromComponentId !== id && l.toComponentId !== id);
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

  removeLiaison(id) {
    this.snapshot();
    this.state.liaisons = this.state.liaisons.filter((l) => l.id !== id);
    this.notify();
  }

  clearFloor(floorId) {
    this.snapshot();
    this.state.components = this.state.components.filter((c) => c.floorId !== floorId);
    this.state.liaisons = this.state.liaisons.filter((l) => l.floorId !== floorId);
    this.notify();
  }
}
