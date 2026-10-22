import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { layout } from './params.js';

// Repère : x le long du mur des meubles, y la hauteur, z la profondeur de la pièce
// (mur des meubles en z=0). 1 unité = 1 cm, comme dans les schémas 2D.
const COLORS = {
  wall: 0xe8edf2,
  floor: 0xd7dde3,
  cab: 0xb8c4d0,
  cabUp: 0xcbd5df,
  appl: 0xf5f7f9,
  dark: 0x2b3238,
  top: 0x6b7680,
  glass: 0x93c5fd,
  frame: 0x4a5561,
  free: 0xffffff,
};

function textSprite(str) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = '#232a30';
  ctx.fillText(str, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(40, 10, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createView3d(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(200, 400, 500);
  scene.add(sun);

  let content = null;
  let labelsOn = true;
  let hasFramed = false;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  function mat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });
  }

  function box(group, x, y, z, w, h, d, color, name = null) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x4a5561 }),
    );
    mesh.add(edges);
    group.add(mesh);
    if (name) {
      const label = textSprite(name);
      label.position.set(x + w / 2, y + h / 2, z + d + 2);
      label.userData.isLabel = true;
      label.visible = labelsOn;
      group.add(label);
    }
    return mesh;
  }

  // Panneau vertical visible uniquement de l'intérieur de la pièce : l'ordre
  // des sommets (A→B) fixe la face avant, donc la pièce reste visible de l'extérieur.
  function wallQuad(group, ax, az, bx, bz, y0, y1, color = COLORS.wall) {
    const v = new Float32Array([
      ax, y0, az, bx, y0, bz, bx, y1, bz,
      ax, y0, az, bx, y1, bz, ax, y1, az,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.FrontSide })));
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x4a5561 }),
    );
    group.add(outline);
  }

  function build(p) {
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
    const L = layout(p);
    const W = L.runW;
    const D = p.roomD;
    const Dr = L.backRightD;
    const H = p.roomH;
    const g = new THREE.Group();

    // sol
    const shape = new THREE.Shape();
    const pts = [[0, 0], [W, 0], [W, Dr], [p.flatLen + p.diagLen, Dr], [p.flatLen, D], [0, D]];
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(COLORS.floor, { side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);

    // murs (parcours dans le sens qui oriente les faces vers l'intérieur)
    wallQuad(g, 0, 0, W, 0, 0, H);
    wallQuad(g, W, 0, W, p.doorW, p.doorH, H); // linteau de la porte-fenêtre
    wallQuad(g, W, p.doorW, W, Dr, 0, H);
    wallQuad(g, W, Dr, p.flatLen + p.diagLen, Dr, 0, H);
    wallQuad(g, p.flatLen + p.diagLen, Dr, p.flatLen, D, 0, H);
    wallQuad(g, p.flatLen, D, 0, D, 0, H);
    wallQuad(g, 0, D, 0, 0, 0, H);

    // porte-fenêtre : vitrage, montant central, cadre
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(p.doorW, p.doorH),
      new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(W - 1, p.doorH / 2, p.doorW / 2);
    g.add(glass);
    box(g, W - 4, 0, p.doorLeaf1, 4, p.doorH, p.doorPost, COLORS.frame);
    box(g, W - 4, p.doorH - 4, 0, 4, 4, p.doorW, COLORS.frame);
    box(g, W - 4, 0, 0, 4, p.doorH, 3, COLORS.frame);
    box(g, W - 4, 0, p.doorW - 3, 4, p.doorH, 3, COLORS.frame);
    const doorLabel = textSprite('porte-fenêtre');
    doorLabel.position.set(W - 6, p.doorH + 10, p.doorW / 2);
    doorLabel.userData.isLabel = true;
    doorLabel.visible = labelsOn;
    g.add(doorLabel);

    // meubles bas : caisson sous le plan de travail, plan de travail continu
    const caseH = p.baseH - p.topThick;
    box(g, L.unitsX.unit, 0, 0, p.unitW, caseH, p.baseD, COLORS.cab, 'meuble');
    box(g, L.unitsX.ll, 0, 0, p.llW, caseH, p.baseD, COLORS.appl, 'lave-linge');
    box(g, L.unitsX.lv, 0, 0, p.lvW, caseH, p.baseD, COLORS.appl, 'lave-vaisselle');
    box(g, L.unitsX.unit, caseH, 0, p.unitW + p.llW + p.lvW, p.topThick, p.baseD + 2, COLORS.top);

    // colonne four / plaque
    const innerW = p.colW - 3;
    box(g, L.colX, 0, 0, p.colW, p.baseH, p.baseD, COLORS.cab);
    box(g, L.colX + (p.colW - p.ovenW) / 2, p.ovenBottom, p.baseD, p.ovenW, p.ovenH, 1, COLORS.dark, 'four');
    box(g, L.colX + 1.5, p.baseH, 0, innerW, p.stripH, p.baseD, COLORS.appl);
    box(g, L.colX + 1.5, L.blockTop - p.blockH, 0, innerW, p.blockH, p.baseD, COLORS.cab, 'bloc');

    // meubles hauts
    const upY = H - p.upCeil - p.upH;
    box(g, L.upX, upY, 0, p.upW1, p.upH, p.upD, COLORS.cabUp);
    box(g, L.upX + p.upW1, upY, 0, p.upW2, p.upH, p.upD, COLORS.cabUp);

    // tableau Linky / disjoncteur
    box(g, 0, p.panelBottom, 0, p.panelW, p.panelH, 12, COLORS.appl, 'Linky');

    // frigo : contre le mur de gauche
    box(g, 0, 0, L.fridgeZ0, p.fridgeD, p.fridgeH, p.fridgeW, COLORS.appl, 'frigo');
    box(g, p.fridgeD, p.fridgeH * 0.7 - 0.5, L.fridgeZ0 + 1, 0.6, 1, p.fridgeW - 2, COLORS.dark);

    scene.add(g);
    content = g;

    if (!hasFramed) {
      hasFramed = true;
      controls.target.set(W / 2, H * 0.4, D / 2);
      camera.position.set(W * 0.5, H * 0.85, D + 330);
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

  return { build, resize, setLabels };
}
