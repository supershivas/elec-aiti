// Modèle de la scène : une pièce (murs) et une liste d'éléments (boîtes).
// Repère en cm : x le long du mur des meubles (depuis le mur de gauche), z vers
// l'intérieur de la pièce (depuis le mur des meubles), elev = hauteur du bas de
// l'élément par rapport au sol. w = longueur (axe x), d = largeur (axe z), h = hauteur.

export const TYPES = {
  'meuble-bas': { label: 'Meuble bas', color: 0xb8c4d0, w: 60, d: 60, h: 82, elev: 0, wall: true },
  'meuble-haut': { label: 'Meuble haut', color: 0xcbd5df, w: 60, d: 38, h: 72.5, elev: 154.5, wall: true },
  'plan-travail': { label: 'Plan de travail', color: 0x6b7680, w: 60, d: 62, h: 3, elev: 82, wall: true },
  electromenager: { label: 'Électroménager', color: 0xf5f7f9, w: 60, d: 60, h: 82, elev: 0, wall: true },
  evier: { label: 'Cuve d’évier', color: 0x2b3238, w: 67, d: 40, h: 1, elev: 85, wall: true },
  credence: { label: 'Crédence', color: 0xe5d9c3, w: 88, d: 2, h: 55, elev: 85, wall: true },
  frigo: { label: 'Frigo', color: 0xf5f7f9, w: 60, d: 70, h: 155, elev: 0, wall: false },
  mural: { label: 'Linky / tableau', color: 0xe8edf2, w: 20, d: 26, h: 80, elev: 149, wall: false },
  'porte-fenetre': { label: 'Porte-fenêtre', color: 0x93c5fd, w: 108, d: 5, h: 205.7, elev: 0, wall: true },
  libre: { label: 'Élément libre', color: 0xd7dde3, w: 50, d: 50, h: 50, elev: 0, wall: false },
};

export const ROOM_FIELDS = [
  { key: 'roomH', label: 'Hauteur sous plafond' },
  { key: 'roomW', label: 'Longueur du mur des meubles' },
  { key: 'roomD', label: 'Profondeur à gauche (côté frigo)' },
  { key: 'roomD2', label: 'Profondeur à droite' },
  { key: 'flatLen', label: 'Mur du fond : tronçon droit à gauche' },
  { key: 'flatEnd', label: 'Mur du fond : tronçon droit à droite' },
  { key: 'alcoveStart', label: 'Alcôve : distance au mur des meubles' },
  { key: 'alcoveLen', label: 'Alcôve : longueur' },
  { key: 'alcoveDepth', label: 'Alcôve : profondeur' },
];

// Plan de dessus du croquis : biais entre les deux tronçons du fond (80 de long),
// alcôve de 73 × 108 sur le mur de droite.
const DEFAULT_ROOM = {
  roomH: 247, roomW: 329, roomD: 168, roomD2: 198, flatLen: 135, flatEnd: 120,
  alcoveStart: 73, alcoveLen: 108, alcoveDepth: 73,
};

// [type, nom, géométrie] relevés sur le croquis et les précisions données ensuite
const DEFAULT_ITEMS = [
  ['mural', 'Linky / disjoncteur', { x: 0, z: 5, w: 20, d: 26, h: 80, elev: 149 }],
  ['frigo', 'Frigo', { x: 0, z: 100, w: 70, d: 60, h: 155 }],
  ['meuble-bas', 'Meuble bas', { x: 61, z: 0, w: 60, d: 60, h: 82 }],
  ['electromenager', 'Lave-linge', { x: 121, z: 0, w: 60, d: 60, h: 82 }],
  ['electromenager', 'Lave-vaisselle', { x: 181, z: 0, w: 60, d: 60, h: 82 }],
  ['meuble-bas', 'Meuble sous évier', { x: 241, z: 0, w: 88, d: 60, h: 82 }],
  ['plan-travail', 'Plan de travail', { x: 61, z: 0, w: 268, d: 62, h: 3, elev: 82 }],
  ['evier', 'Cuve d’évier', { x: 252, z: 10, w: 67, d: 40, h: 1, elev: 85 }],
  ['credence', 'Crédence', { x: 241, z: 0, w: 88, d: 2, h: 55, elev: 85 }],
  ['meuble-haut', 'Meuble haut 1 (2 portes de 40)', { x: 41, z: 0, w: 80, d: 38, h: 72.5, elev: 154.5 }],
  ['meuble-haut', 'Meuble haut 2 (2 portes de 40)', { x: 121, z: 0, w: 80, d: 38, h: 72.5, elev: 154.5 }],
  ['meuble-haut', 'Meuble haut 3', { x: 201, z: 0, w: 40, d: 38, h: 72.5, elev: 154.5 }],
  ['porte-fenetre', 'Porte-fenêtre', { x: 397, z: 73, w: 5, d: 108, h: 205.7 }],
];

const STORAGE_KEY = 'cuisine-aiti:scene:v3';
const MIN_SIZE = 0.5;
const HISTORY_MAX = 100;
const COALESCE_MS = 1200;
export const FILE_FORMAT = 'aiti3d';

function makeItem(id, type, name, geo) {
  const t = TYPES[type];
  return {
    id,
    type,
    name,
    comment: '',
    x: geo.x ?? 0,
    z: geo.z ?? 0,
    w: geo.w ?? t.w,
    d: geo.d ?? t.d,
    h: geo.h ?? t.h,
    elev: geo.elev ?? t.elev,
    rot: 0,
  };
}

function defaultState() {
  return {
    room: { ...DEFAULT_ROOM },
    items: DEFAULT_ITEMS.map(([type, name, geo], i) => makeItem(`i${i + 1}`, type, name, geo)),
  };
}

const normAngle = (a) => Math.round((((a % 360) + 360) % 360) * 10) / 10;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return null;
  const room = { ...DEFAULT_ROOM };
  for (const k of Object.keys(room)) if (num(raw.room?.[k]) && raw.room[k] > 0) room[k] = raw.room[k];
  const items = [];
  const seen = new Set();
  for (const it of raw.items) {
    if (!it || !TYPES[it.type] || !num(it.x) || !num(it.z)) continue;
    if (![it.w, it.d, it.h].every((n) => num(n) && n > 0)) continue;
    let id = typeof it.id === 'string' && it.id ? it.id : `i${items.length + 1}`;
    while (seen.has(id)) id += 'b';
    seen.add(id);
    items.push({
      id,
      type: it.type,
      name: typeof it.name === 'string' ? it.name : '',
      comment: typeof it.comment === 'string' ? it.comment : '',
      x: it.x,
      z: it.z,
      w: it.w,
      d: it.d,
      h: it.h,
      elev: num(it.elev) ? Math.max(0, it.elev) : 0,
      rot: num(it.rot) ? normAngle(it.rot) : 0,
    });
  }
  return { room, items };
}

const snapshotOf = (state) => JSON.stringify({ room: state.room, items: state.items });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const parsed = sanitize(raw);
    if (parsed) {
      return {
        state: parsed,
        fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
        saved: typeof raw.saved === 'string' ? raw.saved : null,
      };
    }
  } catch {
    // stockage absent ou corrompu : on repart du croquis
  }
  return { state: defaultState(), fileName: '', saved: null };
}

export function createStore() {
  const loaded = load();
  let state = loaded.state;
  let fileName = loaded.fileName;
  let savedSnap = loaded.saved ?? snapshotOf(state);
  let selectedId = null;
  let undoStack = [];
  let redoStack = [];
  let gesture = false; // glissé en cours : un seul point d'annulation pour tout le geste
  let gestureRecorded = false;
  let lastKey = null;
  let lastTime = 0;
  const subs = new Set();

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, fileName, saved: savedSnap }));
    } catch {
      // la page reste utilisable sans mémoire
    }
  };
  const emit = (save = true) => {
    if (save) persist();
    subs.forEach((fn) => fn());
  };
  const find = (id) => state.items.find((it) => it.id === id);
  const nextId = () => {
    let n = state.items.length + 1;
    while (find(`i${n}`)) n += 1;
    return `i${n}`;
  };
  const clearHistory = () => {
    undoStack = [];
    redoStack = [];
    lastKey = null;
  };

  // Mémorise l'état d'avant une modification. Pendant un glissé, un seul point pour
  // tout le geste ; sinon les saisies successives d'un même champ sont regroupées.
  function record(before, key) {
    if (gesture) {
      if (gestureRecorded) return;
      gestureRecorded = true;
    } else {
      const now = Date.now();
      const merge = key && key === lastKey && now - lastTime < COALESCE_MS;
      lastKey = key;
      lastTime = now;
      if (merge) return;
    }
    undoStack.push(before);
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack = [];
  }

  // Applique `change`, et ne garde une trace (historique, enregistrement) que si l'état a bougé.
  function mutate(change, key = null) {
    const before = snapshotOf(state);
    change();
    if (snapshotOf(state) === before) return;
    record(before, key);
    emit();
  }

  function restore(snap) {
    const parsed = sanitize(JSON.parse(snap));
    state = parsed;
    if (selectedId && !find(selectedId)) selectedId = null;
    lastKey = null;
  }

  return {
    get room() { return state.room; },
    get items() { return state.items; },
    get selectedId() { return selectedId; },
    get selected() { return find(selectedId) ?? null; },
    get fileName() { return fileName; },
    get dirty() { return snapshotOf(state) !== savedSnap; },
    subscribe(fn) { subs.add(fn); },

    select(id) {
      const next = id && find(id) ? id : null;
      if (next === selectedId) return;
      selectedId = next;
      emit(false);
    },

    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },
    undo() {
      if (!undoStack.length) return false;
      redoStack.push(snapshotOf(state));
      restore(undoStack.pop());
      emit();
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(snapshotOf(state));
      restore(redoStack.pop());
      emit();
      return true;
    },
    beginGesture() {
      gesture = true;
      gestureRecorded = false;
    },
    endGesture() {
      gesture = false;
      gestureRecorded = false;
      lastKey = null;
    },

    updateItem(id, patch) {
      mutate(() => {
        const it = find(id);
        if (!it) return;
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'name' || k === 'comment') it[k] = String(v);
          else if (!num(v)) continue;
          else if (k === 'w' || k === 'd' || k === 'h') it[k] = Math.max(MIN_SIZE, v);
          else if (k === 'elev') it[k] = Math.max(0, v);
          else if (k === 'rot') it[k] = normAngle(v);
          else if (k === 'x' || k === 'z') it[k] = v;
        }
      }, `${id}:${Object.keys(patch).sort().join(',')}`);
    },

    updateRoom(patch) {
      mutate(() => {
        for (const [k, v] of Object.entries(patch)) if (k in state.room && num(v) && v > 0) state.room[k] = v;
      }, `room:${Object.keys(patch).join(',')}`);
    },

    addItem(type) {
      const t = TYPES[type];
      if (!t) return;
      mutate(() => {
        const n = state.items.length;
        const it = makeItem(nextId(), type, t.label, {
          x: 80 + (n % 6) * 12,
          z: t.wall ? 0 : Math.max(0, state.room.roomD / 2 - t.d / 2),
        });
        state.items.push(it);
        selectedId = it.id;
      });
    },

    duplicateItem(id) {
      mutate(() => {
        const src = find(id);
        if (!src) return;
        const copy = { ...src, id: nextId(), name: `${src.name} (copie)`, x: src.x + 10, z: src.z + 10 };
        state.items.push(copy);
        selectedId = copy.id;
      });
    },

    removeItem(id) {
      mutate(() => {
        state.items = state.items.filter((it) => it.id !== id);
        if (selectedId === id) selectedId = null;
      });
    },

    // Nouvelle cuisine : on repart du croquis d'origine, avec un historique vide.
    newScene() {
      state = defaultState();
      fileName = '';
      selectedId = null;
      savedSnap = snapshotOf(state);
      clearHistory();
      emit();
    },

    // Contenu du fichier .aiti3d (JSON renommé, comme le .aiti de l'éditeur de schémas).
    toFile() {
      return { format: FILE_FORMAT, version: 1, room: state.room, items: state.items };
    },

    loadFile(text, name = '') {
      const raw = JSON.parse(text);
      if (raw?.format !== FILE_FORMAT) throw new Error('Fichier non reconnu');
      const parsed = sanitize(raw);
      if (!parsed) throw new Error('Fichier non reconnu');
      state = parsed;
      fileName = name;
      selectedId = null;
      savedSnap = snapshotOf(state);
      clearHistory();
      emit();
    },

    markSaved(name) {
      fileName = name;
      savedSnap = snapshotOf(state);
      emit();
    },
  };
}

// Contour de la pièce (x le long du mur des meubles, z vers l'intérieur), dans le
// sens qui oriente les murs vers l'intérieur : le biais relie le fond de gauche
// (profondeur roomD) au fond de droite (roomD2).
export function roomShape(room) {
  const W = room.roomW;
  const D = room.roomD;
  const D2 = Math.max(room.roomD2, 0);
  const flat = Math.min(room.flatLen, W);
  const diagEnd = Math.max(flat, W - room.flatEnd);
  const aDepth = room.alcoveDepth;
  const aStart = Math.min(room.alcoveStart, D2);
  const aEnd = Math.min(aStart + room.alcoveLen, D2);
  const points = [[0, 0], [W, 0]];
  if (aDepth > 0 && aEnd > aStart) points.push([W, aStart], [W + aDepth, aStart], [W + aDepth, aEnd], [W, aEnd]);
  points.push([W, D2], [diagEnd, D2], [flat, D], [0, D]);
  return {
    W, D, D2, H: room.roomH, flat, diagEnd, aStart, aEnd, aDepth,
    maxX: aDepth > 0 && aEnd > aStart ? W + aDepth : W,
    maxD: Math.max(D, D2),
    points,
  };
}

// Rectangle englobant (dans le plan) d'un élément, rotation comprise.
export function aabb(it) {
  const r = ((it.rot || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const sn = Math.abs(Math.sin(r));
  const hx = (it.w * c + it.d * sn) / 2;
  const hz = (it.w * sn + it.d * c) / 2;
  const cx = it.x + it.w / 2;
  const cz = it.z + it.d / 2;
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, cx, cz };
}
