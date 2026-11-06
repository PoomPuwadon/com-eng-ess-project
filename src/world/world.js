import * as THREE from 'three';
import { FLOOR_BY_ID, neighbourFloors, canAccess, visibleWith, ATRIUM, BRIDGE_Y } from '../layout/building.js';
import { buildFloor } from '../floors/index.js';
import { setLandingDoors } from '../floors/base.js';
import { MAT, BoxBatch } from './geom.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LM, Lux } from './lux.js';
import { setScreensActive } from './screens.js';

// ---------------------------------------------------------------- exterior massing
// One box per tower whose faces point outward: from inside they are back faces and
// culled, so they only show from the bridge / outside. Holes where the bridge enters.
let UVS = null; // when set, quads also get world-metre UVs (facade texture)
function quad(pos, nor, col, idx, a, b, c, d, n, color) {
  const base = pos.length / 3;
  for (const v of [a, b, c, d]) {
    pos.push(...v); nor.push(...n); col.push(color.r, color.g, color.b);
    if (UVS) UVS.push(Math.abs(n[0]) > 0.5 ? v[2] / 12 : v[0] / 12, v[1] / 15);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function massing(x0, x1, y0, y1, z0, z1, colorHex, hole = null, { skipSouth = false, material = null } = {}) {
  const pos = [], nor = [], col = [], idx = [];
  UVS = material ? [] : null;
  const c = new THREE.Color(colorHex);
  const shade = (k) => c.clone().multiplyScalar(k);
  // +X face (east), split around hole if hole.side === 'e'
  const faceX = (x, sign, holeRect) => {
    const n = [sign, 0, 0];
    const rects = holeRect ? [
      [z0, z1, y0, holeRect.y0], [z0, z1, holeRect.y1, y1],
      [z0, holeRect.z0, holeRect.y0, holeRect.y1], [holeRect.z1, z1, holeRect.y0, holeRect.y1],
    ] : [[z0, z1, y0, y1]];
    for (const [a0, a1, b0, b1] of rects) {
      if (sign > 0) quad(pos, nor, col, idx, [x, b0, a1], [x, b0, a0], [x, b1, a0], [x, b1, a1], n, shade(0.85));
      else quad(pos, nor, col, idx, [x, b0, a0], [x, b0, a1], [x, b1, a1], [x, b1, a0], n, shade(0.85));
    }
  };
  faceX(x1, 1, hole && hole.side === 'e' ? hole : null);
  faceX(x0, -1, hole && hole.side === 'w' ? hole : null);
  quad(pos, nor, col, idx, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], shade(1));
  if (!skipSouth) quad(pos, nor, col, idx, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], shade(0.75));
  quad(pos, nor, col, idx, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], shade(0.75));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (UVS) g.setAttribute('uv', new THREE.Float32BufferAttribute(UVS, 2));
  g.setIndex(idx);
  UVS = null;
  return new THREE.Mesh(g, material || MAT.solid);
}

// Sky: vertical gradient as the background (screen-aligned, cheap).
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5f8fc4'); grd.addColorStop(0.55, '#a9c8e6'); grd.addColorStop(0.85, '#f1dcc0'); grd.addColorStop(1, '#e8c9a2');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildExterior(scene, renderer) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xd9cbb4, 260, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x777766, 1.6);
  scene.add(hemi);
  // Sun: warm, high in the south-east; casts shadows only in the Phase 1 "lux" view (ground floor).
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(70, 150, 110);
  sun.target.position.set(0, 0, 10);
  scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 20, far: 420 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  // Image-based reflections for the physically based (Phase 1) materials; Lambert ignores it.
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.75;
    pm.dispose();
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x7f8a6c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  scene.add(ground);
  const o = 0.6;
  const A = ATRIUM;
  const lux = new Lux({ e: 0, colliders: [], add: (m, ...d) => scene.add(m), onUpdate: () => {} });
  // atrium: its south face is the Phase 1 entrance facade (built with the plaza), so no massing face there
  scene.add(massing(A.x0 - o, A.x1 + o, 0, A.height, A.z0 - o, A.z1 + o, 0xe6dccb, null, { skipSouth: true }));
  const ot = massing(-110 - o, -30 + o, 15, 75, -40 - o, 40 + o, 0xffffff, { side: 'e', y0: BRIDGE_Y, y1: BRIDGE_Y + 4, z0: -3, z1: 3 }, { material: LM.facade || null });
  const vt = massing(30 - o, 210 + o, 15, 112, -60 - o, 60 + o, 0xffffff, { side: 'w', y0: BRIDGE_Y, y1: BRIDGE_Y + 4, z0: -3, z1: 3 }, { material: LM.facade || null });
  scene.add(ot, vt); // Office Tower, Wellness Tower (curtain-wall facades)
  // tower plinths below 15 m (leaving the lift-core strip open so cars are visible through their doors)
  for (const [x0, x1, z0, z1] of [[-110 - o, -40, -40 - o, 40 + o], [-40, -30 - o, -40 - o, -37.5], [-40, -30 - o, 30.6, 40 + o],
    [40, 210 + o, -60 - o, 60 + o], [30 + o, 40, -60 - o, -37.5], [30 + o, 40, 30.6, 60 + o]]) lux.box(x0, x1, 0, 15, z0, z1, 'stone');
  for (const [x0, x1, z0, z1] of [[-110 - o, -30 - o, 40, 41.4], [30 + o, 210 + o, 60, 61.4]]) lux.box(x0, x1, 14.6, 15.4, z0, z1, 'bronze'); // plinth cornice
  // the street beyond the plaza + a distant skyline
  lux.floor(-400, 400, 64, 80, -0.25, 'asphalt');
  lux.floor(-400, 400, 62, 64, -0.2, 'paving'); lux.floor(-400, 400, 80, 83, -0.2, 'paving');
  for (let x = -396; x < 400; x += 9) lux.box(x, x + 4.5, -0.24, -0.23, 71.85, 72.15, 'paint', { color: 0xeeeeee });
  const r = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, rn = r(4);
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * 0.15 + rn() * Math.PI * 1.7, d = 330 + rn() * 320, w = 30 + rn() * 50, h = 50 + rn() * 190;
    const x = Math.cos(a) * d, z = Math.sin(a) * d + 60;
    if (z < 120 && Math.abs(x) < 260) continue;
    lux.box(x - w / 2, x + w / 2, 0, h, z - w / 2, z + w / 2, 'facade');
  }
  lux.build();
  return { sun, hemi };
}

// ---------------------------------------------------------------- floor streaming
export class FloorManager {
  constructor(scene) {
    this.scene = scene;
    this.loaded = new Map(); // id -> ctx
    this.colliders = [];
    this.shapes = [];
    this.role = 'visitor';
    this.current = null;
  }

  ensureAround(floorId) {
    if (this.current === floorId) return;
    this.current = floorId;
    const want = new Set(neighbourFloors(floorId));
    for (const [id, ctx] of this.loaded) if (!want.has(id)) this.unload(id, ctx);
    for (const id of want) if (!this.loaded.has(id)) this.load(id);
    // Neighbours are preloaded but hidden (no draw cost); only floors you can see render.
    const visible = new Set(visibleWith(floorId));
    for (const [id, ctx] of this.loaded) ctx.group.visible = visible.has(id);
    this.colliders = [...this.loaded.values()].flatMap((c) => c.colliders);
    this.shapes = [...this.loaded.values()].flatMap((c) => c.shapes || []);
    setScreensActive(true);
    this.applyRole(this.role);
  }

  load(id) {
    const t0 = performance.now();
    const ctx = buildFloor(FLOOR_BY_ID[id]);
    this.scene.add(ctx.group);
    this.loaded.set(id, ctx);
    ctx.buildMs = performance.now() - t0;
  }

  unload(id, ctx) {
    this.scene.remove(ctx.group);
    for (const d of ctx.disposables) d && d.dispose && d.dispose();
    ctx.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.loaded.delete(id);
  }

  applyRole(role) {
    this.role = role;
    for (const ctx of this.loaded.values()) for (const b of ctx.barriers) {
      b.mesh.material = canAccess(role, b.area) ? MAT.barrierOpen : MAT.barrierLocked;
    }
  }

  update(dt, t) {
    for (const ctx of this.loaded.values()) {
      for (const fn of ctx.updaters) fn(dt, t);
      if (ctx.landing) setLandingDoors(ctx.landing);
    }
  }
  landingSets() { return [...this.loaded].filter(([, c]) => c.landing).map(([id, c]) => [id, c.landing]); }
  loadedIds() { return [...this.loaded.keys()]; }
  visibleIds() { return [...this.loaded].filter(([, c]) => c.group.visible).map(([id]) => id); }
}
