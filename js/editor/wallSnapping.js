const ENDPOINT_SNAP_THRESHOLD = 15; // cm
const ANGLE_SNAP_STEP = 45; // degrés
const ANGLE_SNAP_THRESHOLD = 6; // degrés

// Aimante un point aux extrémités des murs existants (pour reconnecter deux
// murs facilement, ex: fermer un angle de pièce), sinon renvoie le point tel quel.
export function snapToWallEndpoints(point, walls) {
  let best = point;
  let bestDistance = ENDPOINT_SNAP_THRESHOLD;
  for (const wall of walls) {
    for (const candidate of [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return best;
}

// Aimante l'angle du segment from->to au multiple de 45° le plus proche
// (murs orthogonaux ou à 45°) si l'écart est sous le seuil, en gardant la
// même distance ; sinon l'angle reste libre.
export function snapAngle(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return to;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const nearest = Math.round(angle / ANGLE_SNAP_STEP) * ANGLE_SNAP_STEP;
  if (Math.abs(angle - nearest) > ANGLE_SNAP_THRESHOLD) return to;
  const rad = (nearest * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * distance, y: from.y + Math.sin(rad) * distance };
}
