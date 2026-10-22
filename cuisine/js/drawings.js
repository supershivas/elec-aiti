import { roomShape } from './scene.js';

const FS = 5.5; // taille du texte, en cm (le viewBox est en cm)

const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function rect(x, y, w, h, cls) {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

function line(x1, y1, x2, y2, cls) {
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function text(x, y, str, cls = 'lbl', rot = 0) {
  const t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
  return `<text class="${cls}" x="${x}" y="${y}"${t}>${esc(str)}</text>`;
}

// Cote entre deux points, décalée de `off` perpendiculairement. Le texte est
// la longueur réelle mesurée : la valeur affichée ne peut pas contredire le tracé.
function dim(x1, y1, x2, y2, off = 12, label = null, cls = 'dim') {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return '';
  const ux = dx / len;
  const uy = dy / len;
  const nx = uy * Math.sign(off);
  const ny = -ux * Math.sign(off);
  const o = Math.abs(off);
  const ax = x1 + nx * o;
  const ay = y1 + ny * o;
  const bx = x2 + nx * o;
  const by = y2 + ny * o;
  const tick = 2.5;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  const mx = (ax + bx) / 2 + nx * 3.5;
  const my = (ay + by) / 2 + ny * 3.5;
  return `<g class="${cls}">
    ${line(x1 + nx * 1.5, y1 + ny * 1.5, ax + nx * 2, ay + ny * 2, 'dim-ext')}
    ${line(x2 + nx * 1.5, y2 + ny * 1.5, bx + nx * 2, by + ny * 2, 'dim-ext')}
    ${line(ax, ay, bx, by, 'dim-line')}
    ${line(ax - tick * (ux - uy), ay - tick * (uy + ux), ax + tick * (ux - uy), ay + tick * (uy + ux), 'dim-line')}
    ${line(bx - tick * (ux - uy), by - tick * (uy + ux), bx + tick * (ux - uy), by + tick * (uy + ux), 'dim-line')}
    ${text(mx, my, label ?? fmt(len), 'dim-txt', angle)}
  </g>`;
}

function svgWrap(minX, minY, w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="drawing" viewBox="${minX} ${minY} ${w} ${h}" role="img" aria-label="${title}" font-size="${FS}">
  <title>${title}</title>${body}</svg>`;
}

// Un élément cliquable/déplaçable : un rectangle (+ nom) dans le groupe `.item`.
function itemShape(it, x, y, w, h, selected) {
  const rot = h > w * 1.8 ? -90 : 0;
  const showName = it.name && Math.max(w, h) > 18 && Math.min(w, h) > 4;
  return `<g class="item t-${it.type}${selected ? ' selected' : ''}" data-id="${it.id}">
    ${rect(x, y, w, h, 'item-body')}
    ${showName ? text(x + w / 2, y + h / 2, it.name, 'lbl', rot) : ''}
  </g>`;
}

// Vue en élévation : `proj` donne la position horizontale et la largeur de
// chaque élément dans la vue ; l'axe vertical est toujours la hauteur au sol.
function elevation(room, items, selId, { proj, order, width, title, extra = '' }) {
  const { H } = roomShape(room);
  const Y = (h) => H - h;
  let s = rect(0, 0, width, H, 'wall');
  s += line(0, H, width, H, 'floor');
  s += extra;
  for (const it of [...items].sort(order)) {
    const { u, uw } = proj(it);
    s += itemShape(it, u, Y(it.elev + it.h), uw, it.h, it.id === selId);
  }
  s += dim(0, H, width, H, -22);
  s += dim(0, H, 0, 0, 24);

  const sel = items.find((it) => it.id === selId);
  if (sel) {
    const { u, uw } = proj(sel);
    const top = Y(sel.elev + sel.h);
    const bottom = Y(sel.elev);
    s += dim(u, top, u + uw, top, 8, null, 'dim dim-sel');
    s += dim(u + uw, top, u + uw, bottom, -8, null, 'dim dim-sel');
    if (sel.elev > 0.05) s += dim(u, H, u, bottom, 10, null, 'dim dim-sel');
    if (u > 0.05) s += dim(0, (top + bottom) / 2, u, (top + bottom) / 2, 3, null, 'dim dim-sel');
  }
  return svgWrap(-30, -30, width + 60, H + 75, s, title);
}

// Vue de face : on regarde le mur des meubles (z = 0) depuis l'intérieur.
export function faceView(room, items, selId) {
  const { W } = roomShape(room);
  return elevation(room, items, selId, {
    proj: (it) => ({ u: it.x, uw: it.w }),
    order: (a, b) => a.z - b.z,
    width: W,
    title: 'Vue de face des meubles de cuisine',
  });
}

// Mur de gauche (x = 0) vu de l'intérieur : l'angle du fond est à gauche.
export function sideView(room, items, selId) {
  const { D } = roomShape(room);
  return elevation(room, items, selId, {
    proj: (it) => ({ u: D - it.z - it.d, uw: it.d }),
    order: (a, b) => a.x - b.x,
    width: D,
    title: 'Mur de gauche avec le frigo et le Linky',
  });
}

// Vue de dessus : y SVG = profondeur depuis le mur des meubles.
export function planView(room, items, selId) {
  const { W, D, Dr, flat, diagEnd, points } = roomShape(room);
  let s = `<polygon class="room" points="${points.map((q) => q.join(',')).join(' ')}"/>`;
  for (const it of [...items].sort((a, b) => a.elev + a.h - (b.elev + b.h))) {
    s += itemShape(it, it.x, it.z, it.w, it.d, it.id === selId);
  }
  s += dim(0, 0, W, 0, 14);
  s += dim(0, D, flat, D, -10);
  if (diagEnd > flat) s += dim(flat, D, diagEnd, Dr, -10);
  s += dim(diagEnd, Dr, W, Dr, -10);
  s += dim(0, 0, 0, D, -26);
  s += dim(W, 0, W, Dr, 14);

  const sel = items.find((it) => it.id === selId);
  if (sel) {
    const cx = sel.x + sel.w / 2;
    const cz = sel.z + sel.d / 2;
    s += dim(sel.x, sel.z + sel.d, sel.x + sel.w, sel.z + sel.d, -6, null, 'dim dim-sel');
    s += dim(sel.x + sel.w, sel.z, sel.x + sel.w, sel.z + sel.d, 8, null, 'dim dim-sel');
    if (sel.x > 0.05) s += dim(0, cz, sel.x, cz, 3, null, 'dim dim-sel');
    if (sel.z > 0.05) s += dim(cx, 0, cx, sel.z, 3, null, 'dim dim-sel');
  }
  return svgWrap(-45, -45, W + 90, D + 95, s, 'Vue de dessus de la cuisine');
}

// Comment un glissé (dx, dy en cm dans la vue) modifie un élément.
export const DRAG = {
  face: (it, dx, dy) => ({ x: it.x + dx, elev: Math.max(0, it.elev - dy) }),
  fond: (it, dx, dy) => ({ z: it.z - dx, elev: Math.max(0, it.elev - dy) }),
  dessus: (it, dx, dy) => ({ x: it.x + dx, z: it.z + dy }),
};
