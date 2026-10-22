import { layout } from './params.js';

const FS = 5.5; // taille du texte, en cm (le viewBox est en cm)

const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

function rect(x, y, w, h, cls = 'obj') {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

function line(x1, y1, x2, y2, cls = 'obj') {
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function text(x, y, str, cls = 'lbl', rot = 0) {
  const t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
  return `<text class="${cls}" x="${x}" y="${y}"${t}>${str}</text>`;
}

// Cote entre deux points, décalée de `off` perpendiculairement. Le texte est
// la longueur réelle mesurée : la valeur affichée ne peut pas contredire le tracé.
function dim(x1, y1, x2, y2, off = 12, label = null) {
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
  const ext = 2;
  const tick = 2.5;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  const mx = (ax + bx) / 2 + nx * 3.5;
  const my = (ay + by) / 2 + ny * 3.5;
  return `<g class="dim">
    ${line(x1 + nx * 1.5, y1 + ny * 1.5, ax + nx * ext, ay + ny * ext, 'dim-ext')}
    ${line(x2 + nx * 1.5, y2 + ny * 1.5, bx + nx * ext, by + ny * ext, 'dim-ext')}
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

// --- Vue de face du mur des meubles (y SVG = H - hauteur) -----------------
export function frontView(p) {
  const L = layout(p);
  const H = p.roomH;
  const Y = (h) => H - h;
  const totalW = L.runW + p.doorW;
  let s = '';

  s += rect(0, 0, L.runW, H, 'wall');
  // mur de droite rabattu : porte-fenêtre dans le prolongement, en pointillé
  s += rect(L.runW, 0, p.doorW, H, 'wall wall-unfolded');
  s += rect(L.runW, Y(p.doorH), p.doorW, p.doorH, 'glass');
  const leaf2X = L.runW + p.doorLeaf1 + p.doorPost;
  s += rect(L.runW + p.doorLeaf1, Y(p.doorH), p.doorPost, p.doorH, 'frame');
  s += text(L.runW + p.doorW / 2, Y(p.doorH / 2), 'porte-fenêtre', 'lbl', -90);
  s += line(0, H, totalW, H, 'floor');

  // tableau Linky / disjoncteur
  s += rect(0, Y(p.panelBottom + p.panelH), p.panelW, p.panelH, 'appl');
  s += text(p.panelW / 2, Y(p.panelBottom + p.panelH / 2), 'Linky / disj.', 'lbl', -90);

  // meubles hauts
  const upTop = Y(H - p.upCeil);
  s += rect(L.upX, upTop, p.upW1, p.upH, 'cab');
  s += rect(L.upX + p.upW1, upTop, p.upW2, p.upH, 'cab');
  s += text(L.upX + p.upW1 / 2, upTop + p.upH / 2, 'haut', 'lbl');
  s += text(L.upX + p.upW1 + p.upW2 / 2, upTop + p.upH / 2, 'haut', 'lbl');

  // meubles bas
  const baseTop = Y(p.baseH);
  s += rect(L.unitsX.gap, baseTop, p.gapW, p.baseH, 'free');
  s += text(p.gapW / 2, baseTop + p.baseH / 2, 'libre', 'lbl');
  s += rect(L.unitsX.unit, baseTop, p.unitW, p.baseH, 'cab');
  s += text(L.unitsX.unit + p.unitW / 2, baseTop + p.baseH / 2, 'meuble', 'lbl');
  s += rect(L.unitsX.ll, baseTop, p.llW, p.baseH, 'appl');
  s += text(L.unitsX.ll + p.llW / 2, baseTop + p.baseH / 2, 'lave-linge', 'lbl');
  s += rect(L.unitsX.lv, baseTop, p.lvW, p.baseH, 'appl');
  s += text(L.unitsX.lv + p.lvW / 2, baseTop + p.baseH / 2, 'lave-vaisselle', 'lbl');

  // colonne four / plaque
  const innerW = p.colW - 3;
  s += rect(L.colX, baseTop, p.colW, p.baseH, 'cab');
  const ovenX = L.colX + (p.colW - p.ovenW) / 2;
  s += rect(ovenX, Y(p.ovenBottom + p.ovenH), p.ovenW, p.ovenH, 'appl');
  s += text(ovenX + p.ovenW / 2, Y(p.ovenBottom + p.ovenH / 2), 'four', 'lbl');
  s += rect(L.colX + 1.5, Y(p.baseH + p.stripH), innerW, p.stripH, 'appl');
  s += rect(L.colX + 1.5, Y(L.blockTop), innerW, p.blockH, 'cab');
  s += text(L.colX + p.colW / 2, Y(L.blockTop - p.blockH / 2), 'bloc', 'lbl');

  // cotes horizontales (bas)
  s += dim(0, H, L.runW, H, -22);
  for (const [x, w] of [
    [L.unitsX.gap, p.gapW],
    [L.unitsX.unit, p.unitW],
    [L.unitsX.ll, p.llW],
    [L.unitsX.lv, p.lvW],
    [L.colX, p.colW],
  ]) {
    s += dim(x, H, x + w, H, -8);
  }
  s += dim(L.runW, H, totalW, H, -8);
  s += dim(L.runW + p.doorLeaf1, H, L.runW + p.doorLeaf1 + p.doorPost, H, -18);
  // cotes horizontales (haut)
  s += dim(L.upX, upTop, L.upX + p.upW1, upTop, 8);
  s += dim(L.upX + p.upW1, upTop, L.upX + p.upW1 + p.upW2, upTop, 8);
  s += dim(0, Y(p.panelBottom + p.panelH), p.panelW, Y(p.panelBottom + p.panelH), 8);

  // cotes verticales (gauche)
  s += dim(0, H, 0, 0, 24);
  s += dim(0, H, 0, Y(p.baseH), 10);
  s += dim(p.panelW, Y(p.panelBottom), p.panelW, Y(p.panelBottom + p.panelH), -8);
  s += dim(p.panelW, H, p.panelW, Y(p.panelBottom), -8);
  // cotes verticales (droite)
  const rx = totalW;
  s += dim(rx, H, rx, Y(p.doorH), -8);
  s += dim(L.runW, Y(L.blockTop), L.runW, 0, -8);
  s += dim(L.colX + p.colW - 1.5, Y(L.blockTop), L.colX + p.colW - 1.5, Y(L.blockTop - p.blockH), 8);
  s += dim(L.upX, upTop, L.upX, upTop + p.upH, 10);
  s += dim(L.upX, 0, L.upX, upTop, 10);

  return svgWrap(-30, -30, totalW + 60, H + 75, s, 'Vue de face des meubles de cuisine');
}

// --- Mur de gauche (frigo), vu de l'intérieur : angle du fond à gauche ----
export function backWallView(p) {
  const D = p.roomD;
  const H = p.roomH;
  const Y = (h) => H - h;
  let s = '';
  s += rect(0, 0, D, H, 'wall');
  s += line(0, H, D, H, 'floor');
  const fx = p.fridgeGap;
  s += rect(fx, Y(p.fridgeH), p.fridgeW, p.fridgeH, 'appl');
  // séparation congélateur / réfrigérateur : ligne au tiers haut du frigo
  s += line(fx, Y(p.fridgeH * 0.7), fx + p.fridgeW, Y(p.fridgeH * 0.7), 'obj');
  s += text(fx + p.fridgeW / 2, Y(p.fridgeH / 2), `frigo (prof. ${fmt(p.fridgeD)})`, 'lbl', -90);

  s += dim(0, H, D, H, -22);
  s += dim(0, H, fx, H, -8);
  s += dim(fx, H, fx + p.fridgeW, H, -8);
  s += dim(fx + p.fridgeW, H, D, H, -8);
  s += dim(0, H, 0, 0, 14);
  s += dim(fx + p.fridgeW, H, fx + p.fridgeW, Y(p.fridgeH), -8);
  return svgWrap(-30, -30, D + 60, H + 75, s, 'Mur de gauche avec le frigo');
}

// --- Vue de dessus (y SVG = profondeur depuis le mur des meubles) ---------
export function planView(p) {
  const L = layout(p);
  const W = L.runW;
  const D = p.roomD;
  const Dr = L.backRightD;
  let s = '';
  const poly = [
    [0, 0],
    [W, 0],
    [W, Dr],
    [p.flatLen + p.diagLen, Dr],
    [p.flatLen, D],
    [0, D],
  ];
  s += `<polygon class="room" points="${poly.map((q) => q.join(',')).join(' ')}"/>`;

  // mur de droite : on ouvre la porte-fenêtre à partir de l'angle
  s += rect(W - 1, 0, 2, p.doorW, 'glass');
  s += rect(W - 2.5, p.doorLeaf1, 5, p.doorPost, 'frame');
  s += text(W - 8, p.doorW / 2, 'porte-fenêtre', 'lbl', -90);

  // meubles bas, colonne, hauts
  s += rect(L.unitsX.unit, 0, p.unitW, p.baseD, 'cab');
  s += rect(L.unitsX.ll, 0, p.llW, p.baseD, 'appl');
  s += rect(L.unitsX.lv, 0, p.lvW, p.baseD, 'appl');
  s += rect(L.colX, 0, p.colW, p.baseD, 'cab');
  s += rect(0, 0, p.gapW, p.baseD, 'free');
  s += rect(L.upX, 0, p.upW1 + p.upW2, p.upD, 'cab cab-up');
  s += text(L.upX + (p.upW1 + p.upW2) / 2, p.upD / 2 + 2, `meubles hauts (prof. ${fmt(p.upD)})`, 'lbl');
  s += text(L.unitsX.ll + p.llW / 2, p.baseD + 8, `meubles bas (prof. ${fmt(p.baseD)})`, 'lbl');

  // frigo contre le mur de gauche
  s += rect(0, L.fridgeZ0, p.fridgeD, p.fridgeW, 'appl');
  s += text(p.fridgeD / 2, L.fridgeZ0 + p.fridgeW / 2 + 2, 'frigo', 'lbl');

  // cotes
  s += dim(0, 0, W, 0, 14);
  s += dim(0, D, p.flatLen, D, -10);
  s += dim(p.flatLen, D, p.flatLen + p.diagLen, Dr, -10, fmt(p.diagLen));
  s += dim(p.flatLen + p.diagLen, Dr, W, Dr, -10);
  s += dim(0, 0, 0, D, -26);
  s += dim(0, 0, 0, L.fridgeZ0, -8);
  s += dim(0, L.fridgeZ0, 0, L.fridgeZ0 + p.fridgeW, -8);
  s += dim(0, L.fridgeZ0 + p.fridgeW, 0, D, -8);
  s += dim(0, L.fridgeZ0, p.fridgeD, L.fridgeZ0, 8);
  s += dim(W, 0, W, Dr, 26);
  s += dim(W, 0, W, p.doorW, 10);

  return svgWrap(-40, -40, W + 80, D + 85, s, 'Vue de dessus de la cuisine');
}
