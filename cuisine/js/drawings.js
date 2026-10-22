import { roomShape, aabb } from './scene.js';

const WALL_TOL = 10; // cm : au-delà, un élément n'est plus « contre » le mur d'une vue
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
// `rot` ne sert qu'en vue de dessus, où l'on voit la vraie forme tournée.
function itemShape(it, x, y, w, h, selected, rot = 0, faint = false) {
  const turn = rot ? ` transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"` : '';
  const tall = h > w * 1.8 && !rot;
  const showName = it.name && !faint && Math.max(w, h) > 18 && Math.min(w, h) > 4;
  return `<g class="item t-${it.type}${selected ? ' selected' : ''}${faint ? ' faint' : ''}" data-id="${it.id}">
    <rect class="item-body" x="${x}" y="${y}" width="${w}" height="${h}"${turn}/>
    ${showName ? text(x + w / 2, y + h / 2, it.name, 'lbl', tall ? -90 : 0) : ''}
  </g>`;
}

// Repères d'aimantation : traits pointillés où l'élément déplacé vient de s'accrocher.
function guideLines(guides, toLine) {
  return guides.map((g) => toLine(g)).join('');
}

// Vue en élévation : `proj` donne la position horizontale et la largeur de
// chaque élément dans la vue ; l'axe vertical est toujours la hauteur au sol.
function elevation(room, items, selId, guides, { proj, order, onWall, solid, full, title, guideX }) {
  const { H } = roomShape(room);
  const Y = (h) => H - h;
  let s = '';
  if (full[0] < solid[0] || full[1] > solid[1]) s += rect(full[0], 0, full[1] - full[0], H, 'wall wall-ext');
  s += rect(solid[0], 0, solid[1] - solid[0], H, 'wall');
  s += line(full[0], H, full[1], H, 'floor');
  // les éléments qui ne touchent pas le mur regardé passent en filigrane, derrière les autres
  const faintOf = (it) => !onWall(it) && it.id !== selId;
  const sorted = [...items].sort((a, b) => faintOf(b) - faintOf(a) || order(a, b));
  for (const it of sorted) {
    const { u, uw } = proj(it);
    s += itemShape(it, u, Y(it.elev + it.h), uw, it.h, it.id === selId, 0, faintOf(it));
  }
  s += guideLines(guides, (g) => {
    if (g.axis === 'elev') return line(full[0] - 10, Y(g.v), full[1] + 10, Y(g.v), 'guide');
    const u = guideX(g);
    return u === null ? '' : line(u, -10, u, H + 10, 'guide');
  });
  s += dim(solid[0], H, solid[1], H, -22);
  s += dim(solid[0], H, solid[0], 0, 24);

  const sel = items.find((it) => it.id === selId);
  if (sel) {
    const { u, uw } = proj(sel);
    const top = Y(sel.elev + sel.h);
    const bottom = Y(sel.elev);
    s += dim(u, top, u + uw, top, 8, null, 'dim dim-sel');
    s += dim(u + uw, top, u + uw, bottom, -8, null, 'dim dim-sel');
    if (sel.elev > 0.05) s += dim(u, H, u, bottom, 10, null, 'dim dim-sel');
    if (u - solid[0] > 0.05) s += dim(solid[0], (top + bottom) / 2, u, (top + bottom) / 2, 3, null, 'dim dim-sel');
  }
  return svgWrap(full[0] - 30, -30, full[1] - full[0] + 60, H + 75, s, title);
}

// Vue de face : on regarde le mur des meubles (z = 0) depuis l'intérieur ;
// l'alcôve (à droite du mur) est en pointillé.
export function faceView(room, items, selId, guides = []) {
  const { W, maxX } = roomShape(room);
  return elevation(room, items, selId, guides, {
    proj: (it) => {
      const b = aabb(it);
      return { u: b.minX, uw: b.maxX - b.minX };
    },
    order: (a, b) => a.z - b.z,
    onWall: (it) => aabb(it).minZ <= WALL_TOL,
    solid: [0, W],
    full: [0, maxX],
    guideX: (g) => (g.axis === 'x' ? g.v : null),
    title: 'Vue de face des meubles de cuisine',
  });
}

// Mur de gauche (x = 0) vu de l'intérieur : l'angle du fond est à gauche. Le fond
// plus profond à droite du plan déborde à gauche de la vue, en pointillé.
export function sideView(room, items, selId, guides = []) {
  const { D, maxD } = roomShape(room);
  return elevation(room, items, selId, guides, {
    proj: (it) => {
      const b = aabb(it);
      return { u: D - b.maxZ, uw: b.maxZ - b.minZ };
    },
    order: (a, b) => a.x - b.x,
    onWall: (it) => aabb(it).minX <= WALL_TOL,
    solid: [0, D],
    full: [D - maxD, D],
    guideX: (g) => (g.axis === 'z' ? D - g.v : null),
    title: 'Mur de gauche avec le frigo et le Linky',
  });
}

// Vue de dessus : y SVG = profondeur depuis le mur des meubles.
export function planView(room, items, selId, guides = []) {
  const { W, D, D2, flat, diagEnd, aStart, aEnd, aDepth, maxX, maxD, points } = roomShape(room);
  let s = `<polygon class="room" points="${points.map((q) => q.join(',')).join(' ')}"/>`;
  for (const it of [...items].sort((a, b) => a.elev + a.h - (b.elev + b.h))) {
    s += itemShape(it, it.x, it.z, it.w, it.d, it.id === selId, it.rot || 0);
  }
  s += guideLines(guides, (g) =>
    g.axis === 'x' ? line(g.v, -12, g.v, maxD + 12, 'guide') : g.axis === 'z' ? line(-12, g.v, maxX + 12, g.v, 'guide') : '');

  // cotes de la pièce
  s += dim(0, 0, W, 0, 14);
  s += dim(0, 0, 0, D, -26);
  s += dim(0, D, flat, D, -10);
  s += dim(flat, D, diagEnd, D2, -10);
  s += dim(diagEnd, D2, W, D2, -10);
  if (aDepth > 0 && aEnd > aStart) {
    s += dim(W, 0, W, aStart, 8);
    s += dim(W, aStart, W + aDepth, aStart, 8);
    s += dim(W + aDepth, aStart, W + aDepth, aEnd, 8);
    s += dim(W, aEnd, W, D2, 8);
  }
  s += dim(W, 0, W, D2, aDepth + 30);

  const sel = items.find((it) => it.id === selId);
  if (sel) {
    const b = aabb(sel);
    s += dim(sel.x, sel.z + sel.d, sel.x + sel.w, sel.z + sel.d, -6, null, 'dim dim-sel');
    s += dim(sel.x + sel.w, sel.z, sel.x + sel.w, sel.z + sel.d, 8, null, 'dim dim-sel');
    if (b.minX > 0.05) s += dim(0, b.cz, b.minX, b.cz, 3, null, 'dim dim-sel');
    if (b.minZ > 0.05) s += dim(b.cx, 0, b.cx, b.minZ, 3, null, 'dim dim-sel');
    // poignée de rotation : au-dessus de l'élément, dans son repère tourné
    const turn = `rotate(${sel.rot || 0} ${b.cx} ${b.cz})`;
    s += `<g class="rot-handle" data-id="${sel.id}" transform="${turn}">
      ${line(b.cx, sel.z, b.cx, sel.z - 12, 'dim-line')}
      <circle class="rot-dot" cx="${b.cx}" cy="${sel.z - 12}" r="4"/>
    </g>`;
  }
  return svgWrap(-45, -45, maxX + 90 + 40, maxD + 95, s, 'Vue de dessus de la cuisine');
}

// Comment un glissé (dx, dy en cm dans la vue) modifie un élément, et quels axes
// l'aimantation peut corriger.
export const DRAG = {
  face: { move: (it, dx, dy) => ({ x: it.x + dx, elev: Math.max(0, it.elev - dy) }), axes: { x: true, elev: true } },
  fond: { move: (it, dx, dy) => ({ z: it.z - dx, elev: Math.max(0, it.elev - dy) }), axes: { z: true, elev: true } },
  dessus: { move: (it, dx, dy) => ({ x: it.x + dx, z: it.z + dy }), axes: { x: true, z: true } },
};
