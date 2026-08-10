const VERTEX_EPSILON = 0.5; // cm : tolérance pour considérer deux extrémités comme le même point

export function pointsCoincide(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < VERTEX_EPSILON;
}

// Toutes les extrémités de murs (parmi `walls`) qui coïncident avec `point` :
// permet de traiter un coin partagé par plusieurs murs comme une seule
// "extrémité logique" à déplacer ensemble, sans changer le modèle de données
// (chaque Wall garde ses propres x1,y1,x2,y2 ; la coïncidence suffit).
export function findConnectedEndpoints(walls, point) {
  const result = [];
  for (const wall of walls) {
    if (pointsCoincide({ x: wall.x1, y: wall.y1 }, point)) result.push({ wallId: wall.id, key: "1" });
    if (pointsCoincide({ x: wall.x2, y: wall.y2 }, point)) result.push({ wallId: wall.id, key: "2" });
  }
  return result;
}

// Regroupe les extrémités coïncidentes de tous les murs d'un étage en
// "sommets" (coins), pour dessiner un patch qui comble le vide entre les
// rectangles de deux murs qui se rejoignent (voir WallsLayer.renderJoint).
// Ignore les extrémités isolées (un seul mur, pas de coin à combler).
export function groupWallVertices(walls) {
  const points = [];
  for (const wall of walls) {
    points.push({ x: wall.x1, y: wall.y1, wallId: wall.id, key: "1" });
    points.push({ x: wall.x2, y: wall.y2, wallId: wall.id, key: "2" });
  }
  const used = new Array(points.length).fill(false);
  const clusters = [];
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    const cluster = [points[i]];
    used[i] = true;
    for (let j = i + 1; j < points.length; j++) {
      if (used[j] || !pointsCoincide(points[i], points[j])) continue;
      cluster.push(points[j]);
      used[j] = true;
    }
    if (cluster.length >= 2) {
      clusters.push({ x: points[i].x, y: points[i].y, connections: cluster.map((p) => ({ wallId: p.wallId, key: p.key })) });
    }
  }
  return clusters;
}
