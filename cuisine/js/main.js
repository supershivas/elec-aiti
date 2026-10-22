import { TYPES, ROOM_FIELDS, createStore } from './scene.js';
import { faceView, sideView, planView, DRAG } from './drawings.js';

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

const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const stageEl = $('stage');
const exportBtn = $('export-svg');
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

async function ensure3d() {
  if (view3d) return view3d;
  try {
    const { createView3d } = await import('./view3d.js');
    view3d = createView3d(panes['trois-d'], {
      getItem: (id) => store.items.find((it) => it.id === id),
      onSelect: (id) => store.select(id),
      onMove: (id, pos) => store.updateItem(id, pos),
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
    panes[v.id].innerHTML = v.render(store.room, store.items, store.selectedId);
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
  exportBtn.hidden = !current.render;
  labelsWrap.hidden = !!current.render;
  drawView();
}

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
    const svg = panes[v.id].querySelector('svg');
    if (!svg) return;
    const target = e.target.closest('.item');
    const id = target?.dataset.id ?? null;
    // avant select() : la sélection redessine la vue et détache l'ancien <svg>
    const start = svgPoint(svg, e);
    store.select(id);
    const it = store.items.find((x) => x.id === id);
    const from = it ? { ...it } : null;
    let moved = false;
    e.preventDefault();

    const onMove = (ev) => {
      if (!from) return;
      const cur = svgPoint(panes[v.id].querySelector('svg'), ev);
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      moved = true;
      let dx = cur.x - start.x;
      let dy = cur.y - start.y;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const patch = DRAG[v.id](from, dx, dy);
      for (const k of Object.keys(patch)) patch[k] = Math.round(patch[k]);
      store.updateItem(from.id, patch);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// --- panneau de droite ------------------------------------------------------
const propsEl = $('props');
const fieldMap = { name: 'p-name', comment: 'p-comment', h: 'p-h', w: 'p-w', d: 'p-d', elev: 'p-elev', x: 'p-x', z: 'p-z' };

function fillForm() {
  const it = store.selected;
  propsEl.hidden = !it;
  if (!it) return;
  $('p-type').textContent = TYPES[it.type].label;
  $('p-summary').textContent = `H × L × l = ${it.h} × ${it.w} × ${it.d} cm, à ${it.elev} cm du sol`;
  for (const [key, id] of Object.entries(fieldMap)) {
    const input = $(id);
    if (document.activeElement !== input) input.value = it[key];
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
    store.updateItem(it.id, { [key]: Number(e.target.value) });
  });
}

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

$('reset').addEventListener('click', () => {
  if (window.confirm('Revenir au croquis d’origine ? Les modifications seront perdues.')) store.reset();
});

$('export-json').addEventListener('click', () => {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cuisine-aiti.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    store.importJSON(await file.text());
  } catch {
    window.alert('Ce fichier n’est pas une cuisine Aiti valide.');
  }
});

exportBtn.addEventListener('click', () => {
  const v = VIEWS.find((x) => x.id === activeId);
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
  const svg = panes[v.id].innerHTML
    .replace('<svg ', `<svg style="${vars}" `)
    .replace('>', `><style>${style}</style>`)
    .replace(/ selected/g, '');
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
  if (e.target.closest('input, textarea, select')) return;
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
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    store.removeItem(it.id);
  } else if (e.key === 'Escape') {
    store.select(null);
  }
});

function renderAll() {
  drawView();
  fillList();
  fillForm();
  fillRoom();
}
store.subscribe(renderAll);

select(activeId);
fillList();
fillRoom();
