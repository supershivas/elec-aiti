const STORAGE_KEY = "elec-aiti:project";

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

// Store applicatif minimal : composants posés, avec persistance localStorage
export class Store {
  constructor() {
    this.state = loadFromStorage();
    this.listeners = new Set();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    saveToStorage(this.state);
    for (const listener of this.listeners) listener();
  }

  getComponentsForFloor(floorId) {
    return this.state.components.filter((component) => component.floorId === floorId);
  }

  addComponent({ type, floorId, x, y, ...rest }) {
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
    this.state.components = this.state.components.filter((c) => c.id !== id);
    this.notify();
  }
}
