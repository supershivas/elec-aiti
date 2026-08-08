const STORAGE_KEY = "elec-aiti:project";
const MAX_HISTORY = 50;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { components: [] };
    const parsed = JSON.parse(raw);
    return { components: Array.isArray(parsed.components) ? parsed.components : [] };
  } catch {
    return { components: [] };
  }
}

function saveToStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let nextId = 1;
function createId() {
  return `c${Date.now().toString(36)}${(nextId++).toString(36)}`;
}

// Store applicatif minimal : composants posés, avec persistance localStorage et un
// historique d'annulation. L'historique n'est pris qu'au début d'une action logique
// (pose, suppression, début de glissé, rotation) : updateComponent seul (appelé en
// continu pendant un drag) ne prend jamais de snapshot, sinon "Annuler" ne défairait
// qu'un pixel de déplacement à la fois.
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
    this.history.push(JSON.stringify(this.state.components));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const previous = this.history.pop();
    if (previous === undefined) return false;
    this.state.components = JSON.parse(previous);
    this.notify();
    return true;
  }

  getComponentsForFloor(floorId) {
    return this.state.components.filter((component) => component.floorId === floorId);
  }

  addComponent({ type, floorId, x, y, ...rest }) {
    this.snapshot();
    const component = { id: createId(), type, floorId, x, y, rotation: 0, ...rest };
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
    this.notify();
  }

  clearFloor(floorId) {
    this.snapshot();
    this.state.components = this.state.components.filter((c) => c.floorId !== floorId);
    this.notify();
  }
}
