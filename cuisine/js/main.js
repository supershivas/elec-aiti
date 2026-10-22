import { TYPES, ROOM_FIELDS, createStore, aabb } from './scene.js';
import { snapMove } from './snap.js';
import { MenuBar } from './menuBar.js';
import { saveScene, openScene, loadFromInput, forgetFile } from './fileIo.js';
import { faceView, sideView, planView, DRAG, snapPointsFor, measureSvg } from './drawings.js';

const ROT_STEP = 15;
const VIEWS = [
  { id: 'face', label: 'Vue de face', render: faceView, file: 'cuisine-face.svg' },
  { id: 'fond', label: 'Mur du frigo', render: sideView, file: 'cuisine-mur-frigo.svg' },
  { id: 'dessus', label: 'Vue de dessus', render: planView, file: 'cuisine-dessus.svg' },
  { id: 'trois-d', label: '3D', file: null },
];

const store = createStore();
let activeId = VIEWS[0].id;
let view3d = null;
let rendering3d = false;
let tool = 'select'; // 'select' | 'measure' | 'comment'
let measure = null; // { view, a, b, pending } en coordonnées du SVG (cm)
let guides = []; // repères d'aimantation, le temps d'un glissé

const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const stageEl = $('stage');
const exportBtn = $('menu-export-svg');
const labelsToggle = $('labels-toggle');
const labelsWrap = $('labels-wrap');

// --- onglets et volets ------------------------------------------------------
const panes = {};
for (const v of VIEWS) {
  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.hidden = v.id !== activeId;
  stageEl.appendChild(pane);
  panes[v.id] = pane;

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tab';
  tab.role = 'tab';
  tab.textContent = v.label;
  tab.dataset.view = v.id;
  tab.addEventListener('click', () => select(v.id));
  tabsEl.appendChild(tab);
}

// Applique un déplacement en l'aimantant (sauf Alt) puis le range dans le store.
function moveItem(id, patch, axes, noSnap) {
  const it = store.items.find((x) => x.id === id);
  if (!it) return;
  let next = patch;
  guides = [];
  if (!noSnap) {
    const res = snapMove(it, patch, store.room, store.items, axes);
    next = res.patch;
    guides = res.guides;
  }
  store.updateItem(id, next);
}

function clearGuides() {
  if (!guides.length) return;
  guides = [];
  drawView();
}

async function ensure3d() {
  if (view3d) return view3d;
  try {
    const { createView3d } = await import('./view3d.js');
    view3d = createView3d(panes['trois-d'], {
      getItem: (id) => store.items.find((it) => it.id === id),
      onSelect: (id) => store.select(id),
      onMove: (id, pos, noSnap) => moveItem(id, pos, { x: true, z: true }, noSnap),
      onPlace: (p) => placeNote({ x: p.x - 4, z: p.z - 4, elev: p.y - 4 }),
      onDragStart: () => store.beginGesture(),
      onDragEnd: () => {
        store.endGesture();
        clearGuides();
      },
    });
  } catch (err) {
    panes['trois-d'].textContent = 'La vue 3D nécessite WebGL, indisponible sur ce navigateur.';
    console.error(err);
  }
  return view3d;
}

async function drawView() {
  const v = VIEWS.find((x) => x.id === activeId);
  if (v.render) {
    panes[v.id].innerHTML = v.render(store.room, store.items, store.selectedId, guides);
    refreshOverlay();
    return;
  }
  if (rendering3d) return;
  rendering3d = true;
  const v3 = await ensure3d();
  rendering3d = false;
  if (v3) {
    v3.resize();
    v3.build(store.room, store.items, store.selectedId);
  }
}

function select(id) {
  activeId = id;
  for (const v of VIEWS) panes[v.id].hidden = v.id !== id;
  for (const tab of tabsEl.children) tab.setAttribute('aria-selected', String(tab.dataset.view === id));
  const current = VIEWS.find((v) => v.id === id);
  exportBtn.disabled = !current.render;
  labelsWrap.hidden = !!current.render;
  measure = null; // une mesure vaut pour la vue où elle a été tracée
  view3d?.clearMeasure();
  drawView();
}

// --- outils de mesure et de commentaire ---------------------------------------
const HINTS = {
  measure: 'Mesure : clique deux points. Alt : sans aimant · Maj : horizontal ou vertical · Échap : annuler.',
  comment: 'Commentaire : clique à l’endroit à commenter. Échap : annuler.',
};

function setTool(name) {
  tool = tool === name ? 'select' : name;
  measure = null;
  stageEl.classList.toggle('measuring', tool !== 'select');
  $('btn-measure').setAttribute('aria-pressed', String(tool === 'measure'));
  $('btn-comment').setAttribute('aria-pressed', String(tool === 'comment'));
  const hint = $('tool-hint');
  hint.hidden = tool === 'select';
  hint.textContent = HINTS[tool] ?? '';
  view3d?.setTool(tool);
  refreshOverlay();
}

// La mesure est ajoutée au <svg> après chaque dessin de la vue (jamais dans les exports).
function refreshOverlay() {
  const svg = panes[activeId].querySelector('svg');
  if (!svg) return;
  svg.querySelector('.measure')?.remove();
  if (measure && measure.view === activeId) svg.insertAdjacentHTML('beforeend', measureSvg(measure));
}

// Point de mesure aimanté au coin le plus proche (rayon de 12 px), sauf Alt ; Maj force l'axe.
function measurePoint(viewId, svg, e) {
  let pt = svgPoint(svg, e);
  if (!e.altKey) {
    const tol = 12 / svg.getScreenCTM().a;
    let best = null;
    for (const [x, y] of snapPointsFor(viewId, store.room, store.items)) {
      const dist = Math.hypot(x - pt.x, y - pt.y);
      if (dist < tol && (!best || dist < best.dist)) best = { dist, x, y };
    }
    if (best) pt = { x: best.x, y: best.y };
  }
  if (e.shiftKey && measure?.pending) {
    if (Math.abs(pt.x - measure.a.x) > Math.abs(pt.y - measure.a.y)) pt = { x: pt.x, y: measure.a.y };
    else pt = { x: measure.a.x, y: pt.y };
  }
  return pt;
}

// Crée un commentaire à l'endroit cliqué ; on y saisit aussitôt le texte.
function placeNote(geo) {
  store.addItem('commentaire', { x: Math.round(geo.x), z: Math.round(geo.z), elev: Math.max(0, Math.round(geo.elev)) });
  setTool('comment');
  const input = $('p-comment');
  input.focus();
}

function toolClick(v, e) {
  const svg = panes[v.id].querySelector('svg');
  if (!svg) return;
  e.preventDefault();
  if (tool === 'measure') {
    const pt = measurePoint(v.id, svg, e);
    measure = measure?.pending && measure.view === v.id
      ? { ...measure, b: pt, pending: false }
      : { view: v.id, a: pt, b: pt, pending: true };
    refreshOverlay();
    return;
  }
  // commentaire : le point cliqué est converti en position réelle selon la vue
  const pt = svgPoint(svg, e);
  const { roomH, roomD } = store.room;
  if (v.id === 'dessus') placeNote({ x: pt.x - 4, z: pt.y - 4, elev: 100 });
  else if (v.id === 'face') placeNote({ x: pt.x - 4, z: 0, elev: roomH - pt.y - 4 });
  else placeNote({ x: 0, z: roomD - pt.x - 4, elev: roomH - pt.y - 4 });
}

for (const v of VIEWS.filter((x) => x.render)) {
  panes[v.id].addEventListener('pointermove', (e) => {
    if (tool !== 'measure' || !measure?.pending || measure.view !== v.id) return;
    const svg = panes[v.id].querySelector('svg');
    if (!svg) return;
    measure.b = measurePoint(v.id, svg, e);
    refreshOverlay();
  });
}

// un clic dans une vue doit sortir d'un champ du panneau (sinon sa valeur périmée s'appliquerait à la nouvelle sélection)
stageEl.addEventListener('pointerdown', () => document.activeElement?.blur?.(), true);

// --- sélection et glissé dans les vues 2D ----------------------------------
function svgPoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

for (const v of VIEWS.filter((x) => x.render)) {
  panes[v.id].addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (tool !== 'select') {
      toolClick(v, e);
      return;
    }
    const svg = panes[v.id].querySelector('svg');
    if (!svg) return;
    // avant select() : la sélection redessine la vue et détache l'ancien <svg>
    const start = svgPoint(svg, e);
    const handle = e.target.closest('.rot-handle');
    const target = e.target.closest('.item');
    const id = handle?.dataset.id ?? target?.dataset.id ?? null;
    store.select(id);
    const it = store.items.find((x) => x.id === id);
    const from = it ? { ...it } : null;
    let moved = false;
    e.preventDefault();

    const onMove = (ev) => {
      if (!from) return;
      const cur = svgPoint(panes[v.id].querySelector('svg'), ev);
      if (handle) {
        if (!moved) store.beginGesture();
        moved = true;
        // rotation autour du centre : le crochet est à 12 cm au-dessus, soit -90°
        const b = aabb(from);
        let angle = (Math.atan2(cur.y - b.cz, cur.x - b.cx) * 180) / Math.PI + 90;
        if (!ev.altKey) angle = Math.round(angle / ROT_STEP) * ROT_STEP;
        store.updateItem(from.id, { rot: angle });
        return;
      }
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      if (!moved) store.beginGesture();
      moved = true;
      let dx = cur.x - start.x;
      let dy = cur.y - start.y;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const def = DRAG[v.id];
      const patch = def.move(from, dx, dy);
      for (const k of Object.keys(patch)) patch[k] = Math.round(patch[k]);
      moveItem(from.id, patch, def.axes, ev.altKey);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      store.endGesture();
      clearGuides();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// --- panneau de droite ------------------------------------------------------
const propsEl = $('props');
const fieldMap = { name: 'p-name', comment: 'p-comment', h: 'p-h', w: 'p-w', d: 'p-d', elev: 'p-elev', x: 'p-x', z: 'p-z', rot: 'p-rot' };

const round1 = (n) => Math.round(n * 10) / 10;

function fillForm() {
  const it = store.selected;
  propsEl.hidden = !it;
  if (!it) return;
  $('p-type').textContent = TYPES[it.type].label;
  $('p-summary').textContent = `H × L × l = ${it.h} × ${it.w} × ${it.d} cm, à ${it.elev} cm du sol`;
  // distances mesurées sur le rectangle englobant, donc justes quelle que soit la rotation
  const b = aabb(it);
  const shown = { ...it, x: round1(b.minX), z: round1(b.minZ) };
  for (const [key, id] of Object.entries(fieldMap)) {
    const input = $(id);
    if (document.activeElement !== input) input.value = shown[key];
  }
}

for (const [key, id] of Object.entries(fieldMap)) {
  $(id).addEventListener('input', (e) => {
    const it = store.selected;
    if (!it) return;
    if (key === 'name' || key === 'comment') {
      store.updateItem(it.id, { [key]: e.target.value });
      return;
    }
    if (e.target.value === '') return;
    let value = Number(e.target.value);
    if (key === 'x') value -= aabb(it).minX - it.x;
    if (key === 'z') value -= aabb(it).minZ - it.z;
    store.updateItem(it.id, { [key]: value });
  });
}

const rotateBy = (deg) => {
  const it = store.selected;
  if (it) store.updateItem(it.id, { rot: (it.rot || 0) + deg });
};
$('p-rot-minus').addEventListener('click', () => rotateBy(-90));
$('p-rot-plus').addEventListener('click', () => rotateBy(90));
$('p-duplicate').addEventListener('click', () => store.selected && store.duplicateItem(store.selectedId));
$('p-delete').addEventListener('click', () => store.selected && store.removeItem(store.selectedId));

const listEl = $('item-list');
function fillList() {
  listEl.replaceChildren();
  for (const it of store.items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-item';
    btn.textContent = it.name || TYPES[it.type].label;
    btn.setAttribute('aria-current', String(it.id === store.selectedId));
    btn.addEventListener('click', () => store.select(it.id));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

const addType = $('add-type');
for (const [key, t] of Object.entries(TYPES)) addType.add(new Option(t.label, key));
$('add-btn').addEventListener('click', () => store.addItem(addType.value));

const roomEl = $('room-fields');
for (const f of ROOM_FIELDS) {
  const label = document.createElement('label');
  label.className = 'field';
  const name = document.createElement('span');
  name.textContent = f.label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.5';
  input.min = '1';
  input.dataset.key = f.key;
  input.addEventListener('input', () => {
    if (input.value !== '') store.updateRoom({ [f.key]: Number(input.value) });
  });
  const unit = document.createElement('em');
  unit.textContent = 'cm';
  label.append(name, input, unit);
  roomEl.appendChild(label);
}
function fillRoom() {
  for (const input of roomEl.querySelectorAll('input')) {
    if (document.activeElement !== input) input.value = store.room[input.dataset.key];
  }
}

exportBtn.addEventListener('export', () => {
  const v = VIEWS.find((x) => x.id === activeId);
  if (exportBtn.disabled) return;
  const style = [...document.styleSheets]
    .filter((s) => s.href && s.href.includes('cuisine.css'))
    .flatMap((s) => [...s.cssRules])
    .map((r) => r.cssText)
    .join('\n');
  const root = getComputedStyle(document.documentElement);
  const vars = [...style.matchAll(/var\((--[\w-]+)\)/g)]
    .map((m) => m[1])
    .filter((n, i, a) => a.indexOf(n) === i)
    .map((n) => `${n}:${root.getPropertyValue(n).trim()}`)
    .join(';');
  // on repart d'un rendu neuf : sans sélection, repères d'aimantation ni mesure
  const svg = v
    .render(store.room, store.items, null, [])
    .replace('<svg ', `<svg style="${vars}" `)
    .replace('>', `><style>${style}</style>`);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = v.file;
  a.click();
  URL.revokeObjectURL(a.href);
});

labelsToggle.addEventListener('change', () => view3d?.setLabels(labelsToggle.checked));
window.addEventListener('resize', () => view3d?.resize());

// --- clavier : flèches = déplacer, Suppr = supprimer, Échap = désélectionner
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 's') {
    e.preventDefault();
    saveScene(store, { saveAs: e.shiftKey });
    return;
  }
  if (mod && key === 'o') {
    e.preventDefault();
    askOpen();
    return;
  }
  // dans un champ de texte, on laisse le navigateur gérer son propre annuler/rétablir
  if (e.target.closest('input, textarea, select')) return;
  if (!mod && (key === 'm' || key === 'c')) {
    e.preventDefault();
    setTool(key === 'm' ? 'measure' : 'comment');
    return;
  }
  if (e.key === 'Escape' && tool !== 'select') {
    if (tool === 'measure' && measure) {
      measure = null;
      view3d?.clearMeasure();
      refreshOverlay();
    } else {
      setTool(tool);
    }
    return;
  }
  if (mod && (key === 'z' || key === 'y')) {
    e.preventDefault();
    if (key === 'y' || e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  const it = store.selected;
  if (!it) return;
  const step = e.shiftKey ? 10 : 1;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrows) {
    e.preventDefault();
    const [ax, ay] = arrows;
    const patch =
      activeId === 'face' ? { x: it.x + ax * step, elev: Math.max(0, it.elev - ay * step) }
      : activeId === 'fond' ? { z: it.z - ax * step, elev: Math.max(0, it.elev - ay * step) }
      : { x: it.x + ax * step, z: it.z + ay * step };
    store.updateItem(it.id, patch);
  } else if (e.key === 'r' || e.key === 'R') {
    rotateBy(e.shiftKey ? -90 : 90);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    store.removeItem(it.id);
  } else if (e.key === 'Escape') {
    store.select(null);
  }
});

// --- menus, fichier, historique ----------------------------------------------
const menu = new MenuBar([
  { triggerId: 'menu-file-trigger', dropdownId: 'menu-file-dropdown' },
  { triggerId: 'menu-edit-trigger', dropdownId: 'menu-edit-dropdown' },
]);

const confirmDiscard = (what) => !store.dirty || window.confirm(`Des modifications ne sont pas enregistrées. ${what}`);

async function askOpen() {
  if (!confirmDiscard('Ouvrir un autre fichier les perdra.')) return;
  try {
    await openScene(store, $('open-input'));
  } catch {
    window.alert('Ce fichier n’est pas une cuisine Aiti (.aiti3d) valide.');
  }
}

menu.onAction('menu-new', () => {
  if (!confirmDiscard('Une nouvelle cuisine les perdra.')) return;
  forgetFile();
  store.newScene();
});
menu.onAction('menu-save', () => saveScene(store));
menu.onAction('menu-save-as', () => saveScene(store, { saveAs: true }));
menu.onAction('menu-open', askOpen);
$('open-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await loadFromInput(store, file);
  } catch {
    window.alert('Ce fichier n’est pas une cuisine Aiti (.aiti3d) valide.');
  }
});
menu.onAction('menu-export-svg', () => exportBtn.dispatchEvent(new Event('export')));
menu.onAction('menu-undo', () => store.undo());
menu.onAction('menu-redo', () => store.redo());
menu.onAction('menu-duplicate', () => store.selected && store.duplicateItem(store.selectedId));
menu.onAction('menu-delete', () => store.selected && store.removeItem(store.selectedId));
$('btn-measure').addEventListener('click', () => setTool('measure'));
$('btn-comment').addEventListener('click', () => setTool('comment'));
menu.onAction('menu-measure', () => setTool('measure'));
menu.onAction('menu-comment', () => setTool('comment'));
$('btn-undo').addEventListener('click', () => store.undo());
$('btn-redo').addEventListener('click', () => store.redo());

function fillChrome() {
  $('menu-undo').disabled = !store.canUndo();
  $('btn-undo').disabled = !store.canUndo();
  $('menu-redo').disabled = !store.canRedo();
  $('btn-redo').disabled = !store.canRedo();
  $('menu-duplicate').disabled = !store.selected;
  $('menu-delete').disabled = !store.selected;
  const name = store.fileName || 'Sans titre';
  $('filename').textContent = `${name}${store.dirty ? ' (modifié)' : ''}`;
  document.title = `${name}${store.dirty ? ' *' : ''} — Cuisine Aiti`;
}

function renderAll() {
  fillChrome();
  drawView();
  fillList();
  fillForm();
  fillRoom();
}
store.subscribe(renderAll);

select(activeId);
fillList();
fillRoom();
fillChrome();
