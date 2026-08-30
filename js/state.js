import { defaultFloors } from "./floors.js";

// Même origine que la version stable (juste un sous-dossier) : une clé
// distincte évite que les expérimentations de la bêta n'écrasent ou ne
// corrompent le projet enregistré côté stable, et inversement.
const STORAGE_KEY = location.pathname.includes("/beta/") ? "elec-aiti:project:beta" : "elec-aiti:project";
const MAX_HISTORY = 50;
const MAX_CHANGE_LOG = 200;

function seedFloors() {
  return defaultFloors.map((floor) => ({ ...floor }));
}

function defaultState() {
  return { floors: seedFloors(), components: [], liaisons: [], walls: [], openings: [], rooms: [], fileName: null, changeLog: [] };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      floors: Array.isArray(parsed.floors) && parsed.floors.length > 0 ? parsed.floors : seedFloors(),
      components: Array.isArray(parsed.components) ? parsed.components : [],
      liaisons: Array.isArray(parsed.liaisons) ? parsed.liaisons : [],
      walls: Array.isArray(parsed.walls) ? parsed.walls : [],
      openings: Array.isArray(parsed.openings) ? parsed.openings : [],
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : null,
      changeLog: Array.isArray(parsed.changeLog) ? parsed.changeLog : [],
    };
  } catch {
    return defaultState();
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
    this.actionListeners = new Set();
    this.history = [];
    this.redoStack = [];
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    saveToStorage(this.state);
    for (const listener of this.listeners) listener();
  }

  // Flux d'actions séparé de onChange (qui ne dit pas CE QUI a changé) : permet
  // un point d'écoute unique (main.js) plutôt que de disperser des appels dans
  // chaque endroit qui peut déclencher une action (raccourci clavier, bouton du
  // panneau de propriétés, menu...). Couvre toute action ponctuelle sur le
  // projet (pose, suppression, duplication, annuler/refaire, cycle de vie du
  // projet) : tout va dans le journal (Store.recordChange), mais main.js
  // choisit lesquelles méritent en plus un toast (les poses restent muettes,
  // trop fréquentes pour ça). Seule l'édition vraiment continue (glisser un
  // composant, redimensionner...) n'émet rien, faute d'un instant précis où
  // "l'action" serait terminée.
  onAction(listener) {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  emitAction(action) {
    for (const listener of this.actionListeners) listener(action);
  }

  snapshot() {
    this.history.push(
      JSON.stringify({
        floors: this.state.floors,
        components: this.state.components,
        liaisons: this.state.liaisons,
        walls: this.state.walls,
        openings: this.state.openings,
        rooms: this.state.rooms,
      }),
    );
    if (this.history.length > MAX_HISTORY) this.history.shift();
    // Toute nouvelle action invalide le futur "rétablir" : on ne peut pas
    // rétablir une branche qu'on vient d'écraser par une action différente.
    this.redoStack = [];
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  currentSnapshotJSON() {
    return JSON.stringify({
      floors: this.state.floors,
      components: this.state.components,
      liaisons: this.state.liaisons,
      walls: this.state.walls,
      openings: this.state.openings,
      rooms: this.state.rooms,
    });
  }

  applySnapshotJSON(json) {
    const parsed = JSON.parse(json);
    this.state.floors = parsed.floors;
    this.state.components = parsed.components;
    this.state.liaisons = parsed.liaisons;
    this.state.walls = parsed.walls ?? [];
    this.state.openings = parsed.openings ?? [];
    this.state.rooms = parsed.rooms ?? [];
  }

  undo() {
    const previous = this.history.pop();
    if (previous === undefined) return false;
    this.redoStack.push(this.currentSnapshotJSON());
    this.applySnapshotJSON(previous);
    this.notify();
    this.emitAction({ type: "undo" });
    return true;
  }

  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.history.push(this.currentSnapshotJSON());
    this.applySnapshotJSON(next);
    this.notify();
    this.emitAction({ type: "redo" });
    return true;
  }

  getFloors() {
    return this.state.floors;
  }

  // Nom du fichier .aiti courant (affiché en bas à droite du plan) : simple
  // métadonnée de présentation, pas un champ du modèle floors/components/...,
  // donc volontairement hors de l'historique d'annulation (snapshot/undo/redo).
  getFileName() {
    return this.state.fileName ?? null;
  }

  setFileName(fileName) {
    this.state.fileName = fileName ?? null;
    this.notify();
  }

  // Journal des modifications, conservé dans le projet (localStorage + .aiti,
  // voir io/projectFile.js) pour survivre au rechargement et à l'ouverture du
  // fichier ailleurs. Alimenté depuis main.js à chaque action décrite pour les
  // toasts (voir Store.onAction). Comme fileName, hors historique d'annulation :
  // annuler une action ne doit pas effacer sa trace dans le journal.
  getChangeLog() {
    return this.state.changeLog;
  }

  recordChange(message, type) {
    this.state.changeLog.unshift({ message, type, timestamp: Date.now() });
    if (this.state.changeLog.length > MAX_CHANGE_LOG) this.state.changeLog.length = MAX_CHANGE_LOG;
    this.notify();
  }

  getFloorById(id) {
    return this.state.floors.find((floor) => floor.id === id);
  }

  addFloor(label) {
    this.snapshot();
    const floor = { id: createId("f"), label, kind: "drawn" };
    this.state.floors.push(floor);
    this.notify();
    this.emitAction({ type: "floor:added", label });
    return floor;
  }

  renameFloor(id, label) {
    const floor = this.state.floors.find((f) => f.id === id);
    if (!floor) return;
    this.snapshot();
    floor.label = label;
    this.notify();
    this.emitAction({ type: "floor:renamed", label });
  }

  // Copie un étage et tout son contenu (composants, liaisons, murs,
  // ouvertures, pièces) sous un nouvel id, pour repartir d'un étage existant
  // plutôt que d'un étage vierge. Les liens multi-étage ne sont pas repris
  // sur la copie (linkedComponentId visait un équipement physique précis,
  // pas pertinent pour un doublon) — même logique que duplicateComponent.
  duplicateFloor(id) {
    const floor = this.state.floors.find((f) => f.id === id);
    if (!floor) return null;
    this.snapshot();

    const newFloor = { ...floor, id: createId("f"), label: `${floor.label} (copie)` };
    this.state.floors.push(newFloor);

    const componentIdMap = new Map();
    const newComponents = this.state.components
      .filter((c) => c.floorId === id)
      .map((c) => {
        const newId = createId("c");
        componentIdMap.set(c.id, newId);
        return { ...c, id: newId, floorId: newFloor.id, linkedComponentId: undefined };
      });
    this.state.components.push(...newComponents);

    const newLiaisons = this.state.liaisons
      .filter((l) => l.floorId === id)
      .map((l) => ({
        ...l,
        id: createId("l"),
        floorId: newFloor.id,
        fromComponentId: componentIdMap.get(l.fromComponentId),
        toComponentId: componentIdMap.get(l.toComponentId),
      }));
    this.state.liaisons.push(...newLiaisons);

    const wallIdMap = new Map();
    const newWalls = this.state.walls
      .filter((w) => w.floorId === id)
      .map((w) => {
        const newId = createId("w");
        wallIdMap.set(w.id, newId);
        return { ...w, id: newId, floorId: newFloor.id };
      });
    this.state.walls.push(...newWalls);

    const newOpenings = this.state.openings
      .filter((o) => o.floorId === id)
      .map((o) => ({ ...o, id: createId("o"), floorId: newFloor.id, wallId: wallIdMap.get(o.wallId) }));
    this.state.openings.push(...newOpenings);

    const newRooms = this.state.rooms
      .filter((r) => r.floorId === id)
      .map((r) => ({ ...r, id: createId("r"), floorId: newFloor.id, points: r.points.map((p) => ({ ...p })) }));
    this.state.rooms.push(...newRooms);

    this.notify();
    this.emitAction({ type: "floor:duplicated", label: newFloor.label });
    return newFloor;
  }

  // On garde toujours au moins un étage : un plan sans aucun étage n'a pas de
  // sens dans cette appli (pas d'écran "projet vide").
  removeFloor(id) {
    if (this.state.floors.length <= 1) return false;
    const floor = this.state.floors.find((f) => f.id === id);
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
    this.state.openings = this.state.openings.filter((o) => o.floorId !== id);
    this.state.rooms = this.state.rooms.filter((r) => r.floorId !== id);
    this.notify();
    this.emitAction({ type: "floor:removed", label: floor?.label });
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
    // Muet (pas de toast, voir main.js/describeAction) : la pose reste un
    // geste immédiat avec son propre retour visuel, mais doit quand même
    // apparaître dans le journal (voir Store.recordChange) pour qu'il reflète
    // vraiment tout ce qui a été fait sur le projet.
    this.emitAction({ type: "component:added", componentType: type, label: rest.label });
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
    this.emitAction({ type: "component:duplicated" });
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
    this.emitAction({ type: "component:removed" });
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
    this.emitAction({ type: "component:linked" });
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
    this.emitAction({ type: "component:unlinked" });
  }

  getLiaisonsForFloor(floorId) {
    return this.state.liaisons.filter((liaison) => liaison.floorId === floorId);
  }

  addLiaison({ floorId, type, fromComponentId, toComponentId }) {
    this.snapshot();
    const liaison = { id: createId("l"), floorId, type, fromComponentId, toComponentId };
    this.state.liaisons.push(liaison);
    this.notify();
    this.emitAction({ type: "liaison:added", linkType: type });
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
    this.emitAction({ type: "liaison:removed" });
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
    this.emitAction({ type: "wall:added" });
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
    // Une ouverture qui découpait ce mur n'a plus de support
    this.state.openings = this.state.openings.filter((o) => o.wallId !== id);
    this.notify();
    this.emitAction({ type: "wall:removed" });
  }

  getOpeningsForFloor(floorId) {
    return this.state.openings.filter((opening) => opening.floorId === floorId);
  }

  getOpeningsForWall(wallId) {
    return this.state.openings.filter((opening) => opening.wallId === wallId);
  }

  getOpeningById(id) {
    return this.state.openings.find((opening) => opening.id === id);
  }

  // offset = distance depuis (x1,y1) du mur porteur ; type détermine le rendu
  // (vantail+arc pour une porte, simple découpe pour une fenêtre).
  addOpening({ floorId, wallId, offset, width = 80, type = "porte" }) {
    this.snapshot();
    const opening = { id: createId("o"), floorId, wallId, offset, width, type };
    this.state.openings.push(opening);
    this.notify();
    this.emitAction({ type: "opening:added", openingType: type });
    return opening;
  }

  updateOpening(id, changes) {
    const opening = this.state.openings.find((o) => o.id === id);
    if (!opening) return;
    this.snapshot();
    Object.assign(opening, changes);
    this.notify();
  }

  removeOpening(id) {
    this.snapshot();
    this.state.openings = this.state.openings.filter((o) => o.id !== id);
    this.notify();
    this.emitAction({ type: "opening:removed" });
  }

  getRoomsForFloor(floorId) {
    return this.state.rooms.filter((room) => room.floorId === floorId);
  }

  getRoomById(id) {
    return this.state.rooms.find((room) => room.id === id);
  }

  // points : polygone fermé tracé à la main, pas de détection automatique de
  // boucle fermée à partir des murs (trop complexe pour la valeur ajoutée en v1).
  addRoom({ floorId, points, label }) {
    this.snapshot();
    const room = { id: createId("r"), floorId, points, label };
    this.state.rooms.push(room);
    this.notify();
    this.emitAction({ type: "room:added" });
    return room;
  }

  updateRoom(id, changes) {
    const room = this.state.rooms.find((r) => r.id === id);
    if (!room) return;
    Object.assign(room, changes);
    this.notify();
  }

  removeRoom(id) {
    this.snapshot();
    this.state.rooms = this.state.rooms.filter((r) => r.id !== id);
    this.notify();
    this.emitAction({ type: "room:removed" });
  }

  // Nouveau projet : repart des étages fournis par défaut, vide tout le reste.
  // Un seul cran d'annulation, comme loadProject, pour pouvoir revenir en
  // arrière en cas de clic accidentel.
  resetProject() {
    this.snapshot();
    this.state = { floors: seedFloors(), components: [], liaisons: [], walls: [], openings: [], rooms: [], fileName: null, changeLog: [] };
    this.notify();
    this.emitAction({ type: "project:new" });
  }

  // Remplace tout le projet (import de fichier .aiti) : toutes les étages, en un
  // seul cran d'annulation. fileName : nom du fichier .aiti ouvert, pour l'affichage
  // (voir getFileName), pas une donnée du projet lui-même. changeLog repris du
  // fichier ouvert s'il en contient un (continuité de l'historique), vide sinon
  // (ex: .aiti enregistré avant l'ajout de cette fonctionnalité).
  loadProject(data, fileName = null) {
    this.snapshot();
    this.state = {
      floors: Array.isArray(data?.floors) && data.floors.length > 0 ? data.floors : seedFloors(),
      components: Array.isArray(data?.components) ? data.components : [],
      liaisons: Array.isArray(data?.liaisons) ? data.liaisons : [],
      walls: Array.isArray(data?.walls) ? data.walls : [],
      openings: Array.isArray(data?.openings) ? data.openings : [],
      rooms: Array.isArray(data?.rooms) ? data.rooms : [],
      fileName,
      changeLog: Array.isArray(data?.changeLog) ? data.changeLog : [],
    };
    this.notify();
    this.emitAction({ type: "project:opened" });
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
    this.state.openings = this.state.openings.filter((o) => o.floorId !== floorId);
    this.state.rooms = this.state.rooms.filter((r) => r.floorId !== floorId);
    this.notify();
    this.emitAction({ type: "floor:cleared" });
  }
}
