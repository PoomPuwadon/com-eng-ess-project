import * as THREE from 'three';
import { FLOOR_BY_ID, neighbourFloors, canAccess, visibleWith, ATRIUM, BRIDGE_Y } from '../layout/building.js';
import { buildFloor } from '../floors/index.js';
import { setLandingDoors } from '../floors/base.js';
import { MAT, BoxBatch } from './geom.js';
import { setScreensActive } from './screens.js';

// ---------------------------------------------------------------- exterior massing
// One box per tower whose faces point outward: from inside they are back faces and
// culled, so they only show from the bridge / outside. Holes where the bridge enters.
function quad(pos, nor, col, idx, a, b, c, d, n, color) {
  const base = pos.length / 3;
  for (const v of [a, b, c, d]) { pos.push(...v); nor.push(...n); col.push(color.r, color.g, color.b); }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function massing(x0, x1, y0, y1, z0, z1, colorHex, hole = null) {
  const pos = [], nor = [], col = [], idx = [];
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
  quad(pos, nor, col, idx, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], shade(0.75));
  quad(pos, nor, col, idx, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], shade(0.75));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, MAT.solid);
}

export function buildExterior(scene) {
  scene.background = new THREE.Color(0xbfd9f2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777766, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 200, 120);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0x8e9a7e }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  scene.add(ground);
  const o = 0.6;
  const A = ATRIUM;
  scene.add(massing(A.x0 - o, A.x1 + o, 0, A.height, A.z0 - o, A.z1 + o, 0xe6dccb)); // atrium lobby
  scene.add(massing(-110 - o, -30 + o, 15, 55, -40 - o, 40 + o, 0x8f9bb0, { side: 'e', y0: BRIDGE_Y, y1: BRIDGE_Y + 4, z0: -3, z1: 3 })); // Office Tower
  scene.add(massing(30 - o, 210 + o, 15, 112, -60 - o, 60 + o, 0xc8ad86, { side: 'w', y0: BRIDGE_Y, y1: BRIDGE_Y + 4, z0: -3, z1: 3 })); // Visitors' Tower
  // tower plinths below 15 m (leaving the lift-core strip open so cars are visible through their doors)
  const plinths = new BoxBatch();
  plinths.add(-110 - o, -40, 0, 15, -40 - o, 40 + o, 0xb8b0a0);
  plinths.add(-40, -30 - o, 0, 15, -40 - o, -37.5, 0xb8b0a0);
  plinths.add(-40, -30 - o, 0, 15, 30.6, 40 + o, 0xb8b0a0);
  plinths.add(40, 210 + o, 0, 15, -60 - o, 60 + o, 0xb8b0a0);
  plinths.add(30 + o, 40, 0, 15, -60 - o, -37.5, 0xb8b0a0);
  plinths.add(30 + o, 40, 0, 15, 30.6, 60 + o, 0xb8b0a0);
  scene.add(plinths.build());
  // rooftop name boards
  return { sun };
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
