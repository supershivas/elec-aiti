import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { TYPES, roomShape } from './scene.js';

// Repère : x le long du mur des meubles, y la hauteur, z la profondeur de la pièce
// (mur des meubles en z=0). 1 unité = 1 cm, comme dans les schémas 2D.
const WALL = 0xe8edf2;
const FLOOR = 0xd7dde3;
const EDGE = 0x4a5561;
const SELECTED = 0x2563eb;
const CLICK_PX = 4;

function textSprite(str) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let label = str;
  while (label.length > 1 && ctx.measureText(label).width > 240) label = `${label.slice(0, -2)}…`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = '#232a30';
  ctx.fillText(label, 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(44, 11, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// hooks : { onSelect(id|null), onMove(id, {x, z}, noSnap), onDragStart(), onDragEnd(), onPlace({x,y,z}), getItem(id) }
export function createView3d(container, hooks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 6000);
  const controls = new OrbitControls(camera, canvas);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(200, 400, 500);
  scene.add(sun);

  let content = null;
  let surfaces = []; // sol et murs : cibles de l'outil de mesure et de commentaire
  let roomCorners = [];
  let tool = 'select';
  let measure = null; // { a, b, pending }
  let toolDown = null;
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);
  let pickables = [];
  let labelsOn = true;
  let hasFramed = false;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  const matOf = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

  // Panneau visible seulement de l'intérieur : l'ordre des sommets (A→B) fixe la
  // face avant, donc la pièce reste visible de l'extérieur.
  function wallQuad(group, ax, az, bx, bz, y0, y1) {
    const v = new Float32Array([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, matOf(WALL, { roughness: 1, side: THREE.FrontSide }));
    group.add(wall);
    surfaces.push(wall);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: EDGE })));
  }

  function addItem(group, it, selected) {
    const t = TYPES[it.type];
    const { w, d, z } = it;
    const geo = it.type === 'commentaire' ? new THREE.SphereGeometry(w / 2, 16, 12) : new THREE.BoxGeometry(w, it.h, d);
    const glass = it.type === 'porte-fenetre';
    const mat = matOf(t.color, glass ? { transparent: true, opacity: 0.4 } : {});
    if (selected) {
      mat.emissive = new THREE.Color(SELECTED);
      mat.emissiveIntensity = 0.45;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(it.x + w / 2, it.elev + it.h / 2, z + d / 2);
    // angle du plan (sens horaire vu de dessus) : l'axe y de three.js tourne en sens inverse
    mesh.rotation.y = (-(it.rot || 0) * Math.PI) / 180;
    mesh.userData.id = it.id;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: selected ? SELECTED : EDGE })));
    group.add(mesh);
    pickables.push(mesh);
    if (it.name) {
      const label = textSprite(it.name);
      label.position.set(it.x + w / 2, it.elev + it.h + 8, z + d / 2);
      label.userData.isLabel = true;
      label.visible = labelsOn;
      group.add(label);
    }
  }

  function build(room, items, selId) {
    if (content) {
      scene.remove(content);
      content.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    }
    pickables = [];
    surfaces = [];
    const { W, D, H, points } = roomShape(room);
    const g = new THREE.Group();

    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), matOf(FLOOR, { side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    surfaces.push(floor);
    roomCorners = points.flatMap(([x, z]) => [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, H, z)]);

    // murs, parcourus dans le sens qui oriente les faces vers l'intérieur
    for (let i = 0; i < points.length; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[(i + 1) % points.length];
      if (ax !== bx || az !== bz) wallQuad(g, ax, az, bx, bz, 0, H);
    }

    for (const it of items) addItem(g, it, it.id === selId);
    scene.add(g);
    content = g;

    if (!hasFramed) {
      hasFramed = true;
      controls.target.set(Math.min(W, 380) * 0.5, H * 0.4, D / 2);
      camera.position.set(Math.min(W, 380) * 0.5, H * 0.85, D + 330);
      controls.update();
    }
    render();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function setLabels(on) {
    labelsOn = on;
    content?.traverse((o) => {
      if (o.userData.isLabel) o.visible = on;
    });
    render();
  }

  // --- outils de mesure et de commentaire --------------------------------------
  const fmtCm = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

  function measureSprite(main, sub) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, 384, 112);
    ctx.fillStyle = '#0891b2';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(main, 192, 52);
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillText(sub, 192, 92);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.scale.set(66, 19, 1);
    sprite.renderOrder = 12;
    return sprite;
  }

  function drawMeasure() {
    for (const child of [...measureGroup.children]) {
      measureGroup.remove(child);
      child.geometry?.dispose();
      child.material?.map?.dispose();
      child.material?.dispose();
    }
    if (measure) {
      const { a, b } = measure;
      const lineMat = new THREE.LineBasicMaterial({ color: 0x0891b2, depthTest: false });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat);
      line.renderOrder = 11;
      measureGroup.add(line);
      for (const p of [a, b]) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0x0891b2, depthTest: false }));
        dot.position.copy(p);
        dot.renderOrder = 11;
        measureGroup.add(dot);
      }
      const len = a.distanceTo(b);
      if (len > 0.05) {
        const label = measureSprite(`${fmtCm(len)} cm`, `${fmtCm(Math.abs(b.x - a.x))} × ${fmtCm(Math.abs(b.y - a.y))} × ${fmtCm(Math.abs(b.z - a.z))}`);
        label.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 8, 0));
        measureGroup.add(label);
      }
    }
    render();
  }

  function boxCorners(mesh) {
    const p = mesh.geometry.parameters;
    if (!p?.width) return [];
    mesh.updateMatrixWorld();
    const out = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      out.push(mesh.localToWorld(new THREE.Vector3((sx * p.width) / 2, (sy * p.height) / 2, (sz * p.depth) / 2)));
    }
    return out;
  }

  // Point de la surface sous le curseur ; pour la mesure, aimanté au coin le plus proche (sauf Alt).
  function surfacePoint(e, snap) {
    setRay(e);
    const hit = raycaster.intersectObjects([...pickables, ...surfaces], false)[0];
    if (!hit) return null;
    let p = hit.point.clone();
    if (snap && !e.altKey) {
      let best = null;
      for (const c of [...pickables.flatMap(boxCorners), ...roomCorners]) {
        const dist = c.distanceTo(p);
        if (dist < 10 && (!best || dist < best.dist)) best = { dist, c };
      }
      if (best) p = best.c.clone();
    }
    return p;
  }

  function setTool(next) {
    tool = next;
    measure = null;
    drawMeasure();
  }

  // --- sélection et déplacement à la souris -------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setRay = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };

  let drag = null; // glissé d'un élément
  let emptyDown = null; // clic dans le vide (désélection si pas de glissé caméra)

  // en phase de capture : sans cela OrbitControls démarrerait une rotation
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      if (tool !== 'select') {
        // pas de sélection ni de glissé d'élément : la caméra reste libre, le clic (sans glissé) pose le point
        toolDown = { x: e.clientX, y: e.clientY };
        return;
      }
      setRay(e);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (!hit) {
        emptyDown = { x: e.clientX, y: e.clientY };
        return;
      }
      e.stopImmediatePropagation();
      const id = hit.object.userData.id;
      const it = hooks.getItem(id);
      hooks.onSelect(id);
      if (!it) return;
      drag = {
        id,
        plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y),
        start: hit.point.clone(),
        x: it.x,
        z: it.z,
        px: e.clientX,
        py: e.clientY,
        moved: false,
      };
    },
    { capture: true },
  );

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.px, e.clientY - drag.py) < CLICK_PX) return;
    if (!drag.moved) hooks.onDragStart();
    drag.moved = true;
    setRay(e);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(drag.plane, p)) return;
    hooks.onMove(
      drag.id,
      { x: Math.round(drag.x + p.x - drag.start.x), z: Math.round(drag.z + p.z - drag.start.z) },
      e.altKey,
    );
  });

  canvas.addEventListener('pointermove', (e) => {
    if (tool !== 'measure' || !measure?.pending) return;
    const p = surfacePoint(e, true);
    if (p) {
      measure.b = p;
      drawMeasure();
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (toolDown) {
      const click = Math.hypot(e.clientX - toolDown.x, e.clientY - toolDown.y) < CLICK_PX;
      toolDown = null;
      if (click) {
        const p = surfacePoint(e, tool === 'measure');
        if (p && tool === 'measure') {
          measure = measure?.pending ? { ...measure, b: p, pending: false } : { a: p, b: p.clone(), pending: true };
          drawMeasure();
        } else if (p && tool === 'comment') {
          hooks.onPlace(p);
        }
      }
      return;
    }
    if (drag) hooks.onDragEnd();
    drag = null;
    if (emptyDown && Math.hypot(e.clientX - emptyDown.x, e.clientY - emptyDown.y) < CLICK_PX) hooks.onSelect(null);
    emptyDown = null;
  });

  return { build, resize, setLabels, setTool, clearMeasure: () => setTool(tool) };
}
