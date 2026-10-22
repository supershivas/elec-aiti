import { aabb, roomShape } from './scene.js';

const TOL = 8; // cm

// Plus petit décalage qui amène un des bords sur une des cibles, ou null.
function bestShift(edges, targets) {
  let best = null;
  for (const e of edges) {
    for (const t of targets) {
      const shift = t - e;
      if (Math.abs(shift) < TOL && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, target: t };
    }
  }
  return best;
}

// Aimante un déplacement proposé (`patch` : x, z et/ou elev) sur les sommets du
// contour de la pièce, les bords des autres éléments et les hauteurs usuelles.
// `axes` dit quels axes la vue en cours déplace. Rend le patch corrigé et les
// repères (guides) à afficher.
export function snapMove(it, patch, room, items, axes) {
  const p = { ...it, ...patch };
  const out = { ...patch };
  const guides = [];
  const shape = roomShape(room);
  const others = items.filter((o) => o.id !== it.id);
  const boxes = others.map((o) => ({ o, b: aabb(o) }));

  if (axes.x) {
    const bb = aabb(p);
    const targets = [...shape.points.map((q) => q[0]), ...boxes.flatMap(({ b }) => [b.minX, b.maxX])];
    const hit = bestShift([bb.minX, bb.maxX], targets);
    if (hit) {
      p.x += hit.shift;
      out.x = p.x;
      guides.push({ axis: 'x', v: hit.target });
    }
  }
  if (axes.z) {
    const bb = aabb(p);
    const targets = [...shape.points.map((q) => q[1]), ...boxes.flatMap(({ b }) => [b.minZ, b.maxZ])];
    const hit = bestShift([bb.minZ, bb.maxZ], targets);
    if (hit) {
      p.z += hit.shift;
      out.z = p.z;
      guides.push({ axis: 'z', v: hit.target });
    }
  }
  if (axes.elev) {
    const bb = aabb(p);
    // seuls les éléments situés au-dessus/au-dessous (même emprise) servent de repère
    const targets = [0, shape.H, 85];
    for (const { o, b } of boxes) {
      if (b.minX < bb.maxX && b.maxX > bb.minX && b.minZ < bb.maxZ && b.maxZ > bb.minZ) targets.push(o.elev, o.elev + o.h);
    }
    const hit = bestShift([p.elev, p.elev + p.h], targets);
    if (hit) {
      p.elev = Math.max(0, p.elev + hit.shift);
      out.elev = p.elev;
      guides.push({ axis: 'elev', v: hit.target });
    }
  }
  return { patch: out, guides };
}
