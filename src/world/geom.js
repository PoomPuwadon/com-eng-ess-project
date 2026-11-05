import * as THREE from 'three';

// ---------------------------------------------------------------- shared materials
// Singletons (threejs-performance skill: never create materials in loops).
export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }),
  seat: new THREE.MeshLambertMaterial({ color: 0x8a1c2b }),
  npc: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  barrierLocked: new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.45, depthWrite: false }),
  barrierOpen: new THREE.MeshBasicMaterial({ color: 0x33dd77, transparent: true, opacity: 0.25, depthWrite: false }),
  elevatorZone: new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthWrite: false }),
  emissive: new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
};

const _c = new THREE.Color();

// ---------------------------------------------------------------- box batch
// Collects axis-aligned boxes and builds ONE merged mesh with vertex colours.
export class BoxBatch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }

  add(x0, x1, y0, y1, z0, z1, color) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    _c.set(color);
    const faces = [
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [n, vs] of faces) {
      // slight shading per face so greybox reads in flat light
      const shade = n[1] === 1 ? 1.0 : n[1] === -1 ? 0.7 : n[0] !== 0 ? 0.88 : 0.8;
      for (const v of vs) {
        this.pos.push(v[0], v[1], v[2]);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(_c.r * shade, _c.g * shade, _c.b * shade);
      }
      const b = this.n;
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.n += 4;
    }
  }

  build(material = MAT.solid) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

// ---------------------------------------------------------------- floor builder context
// Every floor module gets a ctx that records geometry + colliders.
export class FloorCtx {
  constructor(floor) {
    this.floor = floor;
    this.e = floor.elevation;
    this.group = new THREE.Group();
    this.group.name = floor.id;
    this.solid = new BoxBatch();
    this.glass = new BoxBatch();
    this.colliders = [];
    this.barriers = []; // { mesh, area }
    this.disposables = [];
    this.updaters = [];
    this.screens = []; // {x,y,z,yaw,w,h,ch}
    this.npcs = []; // {x,z,color,yaw}
    this.lights = [];
  }

  // Solid box that also blocks/supports the player. y relative to floor elevation.
  box(x0, x1, y0, y1, z0, z1, color, { collide = true, lock = null } = {}) {
    this.solid.add(x0, x1, this.e + y0, this.e + y1, z0, z1, color);
    if (collide) this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0: this.e + y0, y1: this.e + y1, lock });
  }

  deco(x0, x1, y0, y1, z0, z1, color) { this.box(x0, x1, y0, y1, z0, z1, color, { collide: false }); }

  glassBox(x0, x1, y0, y1, z0, z1, color = 0x9fd8ff, collide = true) {
    this.glass.add(x0, x1, this.e + y0, this.e + y1, z0, z1, color);
    if (collide) this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0: this.e + y0, y1: this.e + y1 });
  }

  // Access barrier: solid only for roles without access to `area`.
  barrier(x0, x1, z0, z1, height, area, id) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), height, Math.abs(z1 - z0));
    const m = new THREE.Mesh(g, MAT.barrierLocked);
    m.position.set((x0 + x1) / 2, this.e + height / 2, (z0 + z1) / 2);
    this.group.add(m);
    this.disposables.push(g);
    this.barriers.push({ mesh: m, area, id });
    this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0: this.e, y1: this.e + height, lock: area, id });
  }

  // Wall running along X (constant z band z0..z1) with door gaps [{from,to,top}].
  wallX(x0, x1, z0, z1, h, color, gaps = []) {
    this._wall('x', x0, x1, z0, z1, h, color, gaps);
  }
  wallZ(z0, z1, x0, x1, h, color, gaps = []) {
    this._wall('z', z0, z1, x0, x1, h, color, gaps);
  }
  _wall(axis, a0, a1, b0, b1, h, color, gaps) {
    const sorted = [...gaps].sort((p, q) => p.from - q.from);
    let cur = a0;
    const seg = (s, e, y0, y1) => {
      if (e - s < 0.01 || y1 - y0 < 0.01) return;
      if (axis === 'x') this.box(s, e, y0, y1, b0, b1, color);
      else this.box(b0, b1, y0, y1, s, e, color);
    };
    for (const g of sorted) {
      seg(cur, g.from, 0, h);
      if (g.bottom) seg(g.from, g.to, 0, Math.min(g.bottom, h)); // sill (e.g. bridge opening high up)
      if (g.top != null && g.top < h) seg(g.from, g.to, g.top, h); // lintel
      cur = Math.max(cur, g.to);
    }
    seg(cur, a1, 0, h);
  }

  sign(text, x, y, z, opts = {}) {
    const s = makeSign(text, opts);
    s.position.set(x, this.e + y, z);
    this.group.add(s);
    this.disposables.push(s.material.map, s.material);
  }

  // tilt > 0 leans the top of the screen back, away from the viewer (sloped consoles)
  screen(x, y, z, yaw, w, h, ch, tilt = 0) { this.screens.push({ x, y: this.e + y, z, yaw, w, h, ch, tilt }); }
  npc(x, z, color = 0x2b3a55, yaw = 0, y = 0) { this.npcs.push({ x, z, color, yaw, y }); }
  onUpdate(fn) { this.updaters.push(fn); }
  add(obj, ...disposables) { this.group.add(obj); this.disposables.push(...disposables); }
}

// ---------------------------------------------------------------- floating text signs
export function makeSign(text, { size = 1, color = '#1a1a1a', bg = 'rgba(255,248,225,0.92)', gold = true, sub = null } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 56px Georgia, serif';
  ctx.font = font;
  const w = Math.min(2048, Math.ceil(ctx.measureText(text).width) + 80);
  const hasSub = !!sub;
  c.width = w;
  c.height = hasSub ? 150 : 100;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  if (gold) { ctx.strokeStyle = '#b8902b'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, c.width - 8, c.height - 8); }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, 52);
  if (hasSub) { ctx.font = 'italic 34px Georgia, serif'; ctx.fillStyle = '#6b5420'; ctx.fillText(sub, c.width / 2, 112); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  const hWorld = (hasSub ? 1.5 : 1.0) * size;
  sp.scale.set((c.width / c.height) * hWorld, hWorld, 1);
  sp.renderOrder = 10;
  return sp;
}

// ---------------------------------------------------------------- instancing helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

// Instanced boxes: items [{x,y,z,sx,sy,sz,yaw,color}]  (world coordinates)
export function instancedBoxes(items, material, geometry = new THREE.BoxGeometry(1, 1, 1)) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((it, i) => {
    _q.setFromAxisAngle(_up, it.yaw || 0);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.sx, it.sy, it.sz));
    mesh.setMatrixAt(i, _m);
    if (it.color != null) mesh.setColorAt(i, _c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// Split items into spatial chunks so frustum culling works (skill rule).
export function chunked(items, size, build) {
  const buckets = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }
  return [...buckets.values()].map(build);
}

export function setEuler(yaw) { return _e.set(0, yaw, 0); }

// A view of a FloorCtx that offsets every X it is given by dx. Used so a tower's prop builders
// (written in that tower's own coordinates) follow the tower when the massing moves.
export function shiftedCtx(ctx, dx) {
  if (!dx) return ctx;
  const sx = (o) => ({ ...o, x: o.x + dx });
  const scol = (c) => ({ ...c, x0: c.x0 + dx, x1: c.x1 + dx });
  const sg = (gs = []) => gs.map((g) => ({ ...g, from: g.from + dx, to: g.to + dx }));
  const wrap = {
    box: (x0, x1, ...r) => ctx.box(x0 + dx, x1 + dx, ...r),
    deco: (x0, x1, ...r) => ctx.deco(x0 + dx, x1 + dx, ...r),
    glassBox: (x0, x1, ...r) => ctx.glassBox(x0 + dx, x1 + dx, ...r),
    barrier: (x0, x1, ...r) => ctx.barrier(x0 + dx, x1 + dx, ...r),
    wallX: (x0, x1, z0, z1, h, color, gaps) => ctx.wallX(x0 + dx, x1 + dx, z0, z1, h, color, sg(gaps)),
    wallZ: (z0, z1, x0, x1, h, color, gaps) => ctx.wallZ(z0, z1, x0 + dx, x1 + dx, h, color, gaps),
    sign: (text, x, ...r) => ctx.sign(text, x + dx, ...r),
    screen: (x, ...r) => ctx.screen(x + dx, ...r),
    npc: (x, ...r) => ctx.npc(x + dx, ...r),
    add: (obj, ...d) => { obj.position.x += dx; return ctx.add(obj, ...d); },
    screens: { push: (...items) => ctx.screens.push(...items.map(sx)) },
    colliders: { push: (...items) => ctx.colliders.push(...items.map(scol)) },
  };
  return new Proxy(ctx, {
    get: (t, k) => (k in wrap ? wrap[k] : t[k]),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
