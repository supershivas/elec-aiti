import { SCHEMA, DEFAULTS, loadParams, saveParams } from './params.js';
import { frontView, backWallView, planView } from './drawings.js';

const VIEWS = [
  { id: 'face', label: 'Vue de face', render: frontView, file: 'cuisine-face.svg' },
  { id: 'fond', label: 'Mur du frigo', render: backWallView, file: 'cuisine-mur-frigo.svg' },
  { id: 'dessus', label: 'Vue de dessus', render: planView, file: 'cuisine-dessus.svg' },
  { id: 'trois-d', label: '3D', file: null },
];

const params = loadParams();
let activeId = VIEWS[0].id;
let view3d = null;

const tabsEl = document.getElementById('tabs');
const stageEl = document.getElementById('stage');
const fieldsEl = document.getElementById('fields');
const exportBtn = document.getElementById('export-svg');
const labelsToggle = document.getElementById('labels-toggle');
const labelsWrap = document.getElementById('labels-wrap');

const panes = {};
for (const v of VIEWS) {
  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.id = `pane-${v.id}`;
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
    view3d = createView3d(panes['trois-d']);
  } catch (err) {
    panes['trois-d'].textContent = 'La vue 3D nécessite WebGL, indisponible sur ce navigateur.';
    console.error(err);
    return null;
  }
  return view3d;
}

async function draw() {
  for (const v of VIEWS) {
    if (v.render) panes[v.id].innerHTML = v.render(params);
  }
  if (activeId === 'trois-d') {
    const v3 = await ensure3d();
    if (v3) {
      v3.resize();
      v3.build(params);
    }
  }
}

function select(id) {
  activeId = id;
  for (const v of VIEWS) panes[v.id].hidden = v.id !== id;
  for (const tab of tabsEl.children) {
    const on = tab.dataset.view === id;
    tab.setAttribute('aria-selected', String(on));
  }
  const current = VIEWS.find((v) => v.id === id);
  exportBtn.hidden = !current.render;
  labelsWrap.hidden = !!current.render;
  draw();
}

function buildFields() {
  let currentGroup = null;
  let fieldset = null;
  for (const f of SCHEMA) {
    if (f.group !== currentGroup) {
      currentGroup = f.group;
      fieldset = document.createElement('details');
      fieldset.className = 'group';
      fieldset.open = true;
      const summary = document.createElement('summary');
      summary.textContent = f.group;
      fieldset.appendChild(summary);
      fieldsEl.appendChild(fieldset);
    }
    const label = document.createElement('label');
    label.className = 'field';
    const name = document.createElement('span');
    name.textContent = f.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.5';
    input.min = '0';
    input.inputMode = 'decimal';
    input.dataset.key = f.key;
    input.value = params[f.key];
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (input.value === '' || !Number.isFinite(n) || n < 0) return;
      params[f.key] = n;
      saveParams(params);
      draw();
    });
    const unit = document.createElement('em');
    unit.textContent = 'cm';
    label.append(name, input, unit);
    fieldset.appendChild(label);
  }
}

document.getElementById('reset').addEventListener('click', () => {
  Object.assign(params, DEFAULTS);
  saveParams(params);
  for (const input of fieldsEl.querySelectorAll('input')) input.value = params[input.dataset.key];
  draw();
});

exportBtn.addEventListener('click', () => {
  const v = VIEWS.find((x) => x.id === activeId);
  const style = [...document.styleSheets]
    .filter((s) => s.href && s.href.includes('cuisine.css'))
    .flatMap((s) => [...s.cssRules])
    .filter((r) => r.selectorText && /\.(wall|obj|cab|appl|free|glass|frame|floor|room|dim|lbl)/.test(r.selectorText))
    .map((r) => r.cssText)
    .join('\n');
  const root = getComputedStyle(document.documentElement);
  const vars = ['--color-plan-stroke', '--color-text', '--color-text-muted', '--color-measure', '--color-room-fill']
    .map((n) => `${n}:${root.getPropertyValue(n).trim()}`)
    .join(';');
  const svg = panes[v.id].innerHTML.replace('<svg ', `<svg style="${vars}" `).replace('>', `><style>${style}</style>`);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = v.file;
  a.click();
  URL.revokeObjectURL(a.href);
});

labelsToggle.addEventListener('change', () => view3d?.setLabels(labelsToggle.checked));
window.addEventListener('resize', () => view3d?.resize());

buildFields();
select(activeId);
