import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Phase 1 "luxury" kit: physically based materials, procedural textures, a geometry builder that
// merges everything per material (few draw calls), and instanced low-poly people.
// Used by floors marked `lux: true` (Phase 1 floors); greybox floors keep the Lambert look.

// ---------------------------------------------------------------- procedural textures (cached)
const texCache = new Map();
function canvasTex(key, size, draw, { repeat = true, srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = Array.isArray(size) ? size[0] : size; c.height = Array.isArray(size) ? size[1] : size;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// polished white marble: soft grey veins, faint tile joints (texture = 2.4 m of floor)
export const marbleTex = () => canvasTex('marble', 1024, (g, w, h) => {
  const r = rng(7);
  g.fillStyle = '#e2dccf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${200 + r() * 40},${195 + r() * 40},${185 + r() * 40},0.12)`; g.fillRect(r() * w, r() * h, 6 + r() * 30, 6 + r() * 30); }
  for (let v = 0; v < 14; v++) {
    let x = r() * w, y = r() * h; const ang = r() * Math.PI;
    g.strokeStyle = `rgba(120,115,110,${0.18 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 18; s++) { x += Math.cos(ang + (r() - 0.5) * 1.6) * 40; y += Math.sin(ang + (r() - 0.5) * 1.6) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(160,150,140,0.35)'; g.lineWidth = 2; // tile joints (1.2 m tiles)
  for (const p of [0, w / 2]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
});
export const graniteTex = (key = 'granite', base = '#1b1b1d', fleck = [70, 70, 75]) => canvasTex(key, 512, (g, w, h) => {
  const r = rng(11); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const k = r(); g.fillStyle = `rgba(${fleck[0] + k * 90},${fleck[1] + k * 80},${fleck[2] + k * 70},${0.25 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
});
export const walnutTex = () => canvasTex('walnut', 512, (g, w, h) => {
  const r = rng(3);
  for (let p = 0; p < 4; p++) { // 4 vertical planks per texture (texture = 2.4 m)
    const base = 40 + r() * 14; g.fillStyle = `rgb(${base + 26},${base + 10},${base - 6})`; g.fillRect((p * w) / 4, 0, w / 4, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(20,10,4,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.6; const x = (p * w) / 4 + r() * (w / 4); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 12, h / 3, x + (r() - 0.5) * 12, (2 * h) / 3, x + (r() - 0.5) * 8, h); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect((p * w) / 4, 0, 2, h);
  }
});
export const pavingTex = () => canvasTex('paving', 512, (g, w, h) => { // grey granite slabs, 2 m (texture = 4 m)
  const r = rng(5);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const k = 150 + r() * 25; g.fillStyle = `rgb(${k},${k - 3},${k - 8})`; g.fillRect((i * w) / 2, (j * h) / 2, w / 2, h / 2);
  }
  for (let i = 0; i < 7000; i++) { const k = r(); g.fillStyle = `rgba(${90 + k * 120},${90 + k * 115},${90 + k * 110},0.35)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  g.strokeStyle = 'rgba(60,58,55,0.8)'; g.lineWidth = 3;
  for (const p of [0, w / 2]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
});
export const asphaltTex = () => canvasTex('asphalt', 256, (g, w, h) => {
  const r = rng(9); g.fillStyle = '#2b2c2f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { const k = r() * 60; g.fillStyle = `rgba(${40 + k},${40 + k},${42 + k},0.5)`; g.fillRect(r() * w, r() * h, 1, 1); }
});
// tower curtain wall: dark glass panes 1.5 x 3.75 m, bronze mullions, some offices lit (texture = 12 x 15 m)
export const facadeTex = () => canvasTex('facade', 512, (g, w, h) => {
  const r = rng(13); g.fillStyle = '#6d5a3e'; g.fillRect(0, 0, w, h);
  const cols = 8, rows = 4, pw = w / cols, ph = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lit = r() < 0.28;
    const grd = g.createLinearGradient(0, j * ph, 0, (j + 1) * ph);
    grd.addColorStop(0, lit ? '#e9d3a2' : '#3c5266'); grd.addColorStop(1, lit ? '#b8955c' : '#1b2633');
    g.fillStyle = grd; g.fillRect(i * pw + 3, j * ph + 3, pw - 6, ph - 10);
  }
  g.fillStyle = 'rgba(30,24,16,0.9)'; for (let j = 0; j < rows; j++) g.fillRect(0, (j + 1) * ph - 7, w, 7); // floor slabs
}, { repeat: true });
export const rippleTex = () => canvasTex('ripple', 256, (g, w, h) => {
  const r = rng(17); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(160,220,255,${0.08 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 3 + r() * 8, r() * Math.PI, 0, Math.PI * 2); g.stroke(); }
});
export const onyxTex = () => canvasTex('onyx', 512, (g, w, h) => { // back-lit onyx feature wall
  const r = rng(21); const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#ffcf7a'); grd.addColorStop(1, '#e08a2e'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${120 + r() * 80},${60 + r() * 40},10,${0.15 + r() * 0.3})`; g.lineWidth = 2 + r() * 10; g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y); for (let s = 0; s < 10; s++) { x += (r() - 0.5) * 120; y += h / 10; g.lineTo(x, y); } g.stroke(); }
});
export const rugTex = (key, a, b, c) => canvasTex(key, 512, (g, w, h) => { // patterned lounge rug
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.strokeStyle = b; g.lineWidth = 18; g.strokeRect(24, 24, w - 48, h - 48);
  g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(56, 56, w - 112, h - 112);
  g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.strokeRect(-110, -110, 220, 220); g.restore();
  g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, 26, 0, Math.PI * 2); g.fill();
}, { repeat: false });

// ---------------------------------------------------------------- materials (singletons)
const std = (o) => new THREE.MeshStandardMaterial(o);
export const LM = {};
export function luxMaterials() { initMaterials(); return LM; }
function initMaterials() {
  if (LM.marble) return;
  Object.assign(LM, {
    marble: std({ map: marbleTex(), roughness: 0.16, metalness: 0, envMapIntensity: 0.9 }),
    granite: std({ map: graniteTex(), roughness: 0.22, metalness: 0.05 }),
    stone: std({ map: graniteTex('stoneLight', '#cfc6b8', [150, 140, 125]), roughness: 0.55 }),
    walnut: std({ map: walnutTex(), roughness: 0.42, metalness: 0 }),
    bronze: std({ color: 0xb4894e, roughness: 0.3, metalness: 0.95 }),
    gold: std({ color: 0xd9b25c, roughness: 0.22, metalness: 1 }),
    steel: std({ color: 0xc4c8cd, roughness: 0.3, metalness: 0.9 }),
    blackMetal: std({ color: 0x1c1d20, roughness: 0.45, metalness: 0.7 }),
    leather: std({ color: 0x4a2c1c, roughness: 0.5, metalness: 0 }),
    paint: std({ vertexColors: true, roughness: 0.6, metalness: 0 }),
    fabric: std({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    foliage: std({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true }),
    glass: std({ color: 0x9fb6c0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 0.5 }),
    facadeGlass: std({ color: 0x24313d, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.FrontSide }),
    lampWarm: std({ color: 0xfff3dc, emissive: 0xffd49a, emissiveIntensity: 1.8, roughness: 0.6 }),
    crystal: std({ color: 0xffffff, emissive: 0xfff0d2, emissiveIntensity: 1.05, roughness: 0.15, metalness: 0.1 }),
    downlight: std({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 }),
    ledStrip: std({ color: 0x3a2c1e, emissive: 0xffc98a, emissiveIntensity: 0.7, roughness: 0.6 }),
    onyx: std({ map: onyxTex(), emissive: 0xffffff, emissiveMap: onyxTex(), emissiveIntensity: 0.62, roughness: 0.3 }),
    water: std({ color: 0x0f3b4a, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.9, emissive: 0x6fd0ff, emissiveMap: rippleTex(), emissiveIntensity: 0.55 }),
    paving: std({ map: pavingTex(), roughness: 0.7 }),
    asphalt: std({ map: asphaltTex(), roughness: 0.9 }),
    facade: std({ map: facadeTex(), roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveMap: facadeTex(), emissiveIntensity: 0.08 }),
    people: std({ roughness: 0.7, metalness: 0 }),
    rubber: std({ color: 0x111111, roughness: 0.6 }),
    carPaint: std({ vertexColors: true, roughness: 0.22, metalness: 0.65 }),
    jet: std({ color: 0xeaf8ff, emissive: 0xbfe9ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.1 }),
    rug: std({ vertexColors: true, roughness: 1 }),
    mirror: std({ color: 0xd8dde2, roughness: 0.04, metalness: 1, envMapIntensity: 1.1 }),
    brushedBronze: std({ color: 0xa47c48, roughness: 0.38, metalness: 0.9 }),
  });
}

// ---------------------------------------------------------------- geometry builder
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
// Box UVs in world metres (so textures tile at a constant scale on any size of box).
function worldUV(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y);
    if (ay > 0.5) uv.setXY(i, _v.x / tile, _v.z / tile);
    else if (ax > 0.5) uv.setXY(i, _v.z / tile, _v.y / tile);
    else uv.setXY(i, _v.x / tile, _v.y / tile);
  }
}
export const TILE = { marble: 2.4, granite: 2, stone: 3, walnut: 2.4, paving: 4, asphalt: 6, facade: 12 };
// register floor-specific materials (and their world-UV tile size) into the shared kit
export function addLuxMaterials(mats, tiles = {}) { initMaterials(); for (const [k, m] of Object.entries(mats)) if (!LM[k]) LM[k] = m; Object.assign(TILE, tiles); return LM; }

export class Lux {
  constructor(ctx) { initMaterials(); this.ctx = ctx; this.parts = new Map(); this.people = []; this.noShadow = new Set(['glass', 'facadeGlass', 'water', 'lampWarm', 'crystal', 'downlight', 'jet', 'rug', 'ledStrip']); }
  // add a geometry already in floor-local coordinates (y relative to the slab)
  geo(geo, mat, color = 0xffffff) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  box(x0, x1, y0, y1, z0, z1, mat, { collide = false, color, round = 0 } = {}) {
    [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (TILE[mat]) worldUV(g, TILE[mat]);
    this.geo(g, mat, color);
    if (collide) this.ctx.colliders.push({ x0, x1, z0, z1, y0: this.ctx.e + y0, y1: this.ctx.e + y1 });
    return this;
  }
  cyl(x, z, r, y0, y1, mat, { seg = 16, rTop = r, collide = false, color, open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop, r, y1 - y0, seg, 1, open);
    g.translate(x, (y0 + y1) / 2, z);
    this.geo(g, mat, color);
    if (collide) this.ctx.colliders.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: this.ctx.e + y0, y1: this.ctx.e + y1 });
    return this;
  }
  // plane facing +y (floors) or a given direction; uv repeat in metres per texture
  floor(x0, x1, z0, z1, y, mat, tile = TILE[mat] || 1) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    worldUV(g, tile);
    return this.geo(g, mat);
  }
  // walk: loop of [x, z] points; fidget: 0..1 (standing people turn and bounce on the spot)
  // sit: seated pose (hips at 0.48 m, knees forward along the facing direction)
  person(x, z, { yaw = 0, suit = 0x1f2a44, skin = 0xd8a47f, hair = 0x2a1a10, y = 0, walk = null, fidget = 0, speed = 1.25, sit = false } = {}) {
    this.people.push({ x, z, yaw, suit, skin, hair, y, walk, fidget, speed, sit });
    return this;
  }
  build() {
    const ctx = this.ctx;
    for (const [key, list] of this.parts) {
      const geo = mergeGeometries(list);
      const mesh = new THREE.Mesh(geo, LM[key]);
      mesh.position.y = ctx.e;
      const transparent = LM[key].transparent;
      mesh.castShadow = !this.noShadow.has(key);
      mesh.receiveShadow = !transparent;
      if (transparent) mesh.renderOrder = 5;
      ctx.add(mesh, geo);
    }
    const sitting = this.people.filter((o) => o.sit), standing = this.people.filter((o) => !o.sit);
    if (standing.length) buildPeople(ctx, standing);
    if (sitting.length) buildPeople(ctx, sitting, true);
  }
}

// ---------------------------------------------------------------- low-poly people (3 instanced meshes)
const PEOPLE_GEO = {};
function peopleGeo(sit = false) {
  const key = sit ? 'sit' : 'stand';
  if (PEOPLE_GEO[key]) return PEOPLE_GEO[key];
  const dy = sit ? -0.42 : 0; // seated: the upper body drops by the thigh length
  const part = (g, x, y, z) => { g.translate(x, y, z); const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const legs = sit
    ? [part(new THREE.BoxGeometry(0.15, 0.16, 0.46), -0.1, 0.48, 0.2), part(new THREE.BoxGeometry(0.15, 0.16, 0.46), 0.1, 0.48, 0.2), // thighs
      part(new THREE.BoxGeometry(0.14, 0.44, 0.15), -0.1, 0.24, 0.4), part(new THREE.BoxGeometry(0.14, 0.44, 0.15), 0.1, 0.24, 0.4)] // shins
    : [part(new THREE.BoxGeometry(0.15, 0.84, 0.17), -0.1, 0.5, 0), part(new THREE.BoxGeometry(0.15, 0.84, 0.17), 0.1, 0.5, 0)];
  const body = mergeGeometries([
    ...legs,
    part(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 6), 0, 1.22 + dy, 0), // torso
    part(new THREE.CylinderGeometry(0.235, 0.2, 0.12, 6), 0, 1.5 + dy, 0), // shoulders
    // arms (seated: reaching forward to the desk)
    ...(sit ? [part(new THREE.BoxGeometry(0.1, 0.12, 0.42), -0.27, 1.06 + dy + 0.05, 0.16), part(new THREE.BoxGeometry(0.1, 0.12, 0.42), 0.27, 1.06 + dy + 0.05, 0.16),
      part(new THREE.BoxGeometry(0.1, 0.32, 0.12), -0.27, 1.32 + dy, 0), part(new THREE.BoxGeometry(0.1, 0.32, 0.12), 0.27, 1.32 + dy, 0)]
      : [part(new THREE.BoxGeometry(0.1, 0.6, 0.12), -0.27, 1.18, 0), part(new THREE.BoxGeometry(0.1, 0.6, 0.12), 0.27, 1.18, 0)]),
  ]);
  const skin = mergeGeometries([
    part(new THREE.IcosahedronGeometry(0.115, 1), 0, 1.69 + dy, 0), part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6), 0, 1.57 + dy, 0),
    ...(sit ? [part(new THREE.BoxGeometry(0.08, 0.08, 0.1), -0.27, 1.11 + dy, 0.42), part(new THREE.BoxGeometry(0.08, 0.08, 0.1), 0.27, 1.11 + dy, 0.42)]
      : [part(new THREE.BoxGeometry(0.08, 0.1, 0.09), -0.27, 0.84, 0), part(new THREE.BoxGeometry(0.08, 0.1, 0.09), 0.27, 0.84, 0)]),
  ]);
  const dark = mergeGeometries([
    part(new THREE.SphereGeometry(0.122, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 1.72 + dy, -0.01), // hair
    part(new THREE.BoxGeometry(0.16, 0.08, 0.27), -0.1, 0.04, sit ? 0.48 : 0.04), part(new THREE.BoxGeometry(0.16, 0.08, 0.27), 0.1, 0.04, sit ? 0.48 : 0.04), // shoes
  ]);
  PEOPLE_GEO[key] = { body, skin, dark };
  return PEOPLE_GEO[key];
}

// Low-poly people driven by capsule-style matrices (centre at +0.85 m), for floors that animate
// their own figures. set(i, m4) takes the matrix a 1.7 m capsule would have.
export function peopleInstanced(ctx, n) {
  initMaterials();
  const G = peopleGeo(), off = new THREE.Matrix4().makeTranslation(0, -0.85, 0), t = new THREE.Matrix4(), c = new THREE.Color();
  const meshes = ['body', 'skin', 'dark'].map((k) => { const m = new THREE.InstancedMesh(G[k], LM.people, n); m.frustumCulled = false; m.castShadow = true; ctx.add(m); return m; });
  return {
    meshes,
    color(i, suit, skin = 0xc68c62, hair = 0x1a1410) { [suit, skin, hair].forEach((col, k) => meshes[k].setColorAt(i, c.set(col))); },
    set(i, m4) { t.multiplyMatrices(m4, off); for (const m of meshes) m.setMatrixAt(i, t); },
    commit() { for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } },
  };
}
function buildPeople(ctx, list, sit = false) {
  const G = peopleGeo(sit), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  const meshes = [['body', 'suit'], ['skin', 'skin'], ['dark', 'hair']].map(([k, col]) => {
    const m = new THREE.InstancedMesh(G[k], LM.people, list.length);
    list.forEach((o, i) => m.setColorAt(i, c.set(o[col])));
    m.castShadow = true; m.receiveShadow = true;
    ctx.add(m);
    return m;
  });
  const place = (o, i, bob = 0) => {
    q.setFromAxisAngle(up, o.yaw);
    m4.compose(p.set(o.x, ctx.e + o.y + bob, o.z), q, s);
    for (const m of meshes) m.setMatrixAt(i, m4);
  };
  list.forEach((o, i) => place(o, i));
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  // walkers: loop along their path at a steady pace
  const walkers = list.map((o, i) => [o, i]).filter(([o]) => o.walk);
  const fidgeters = list.map((o, i) => [o, i]).filter(([o]) => !o.walk && o.fidget > 0);
  for (const [o] of fidgeters) { o.yaw0 = o.yaw; o.ph = Math.random() * 100; o.rate = 0.6 + Math.random() * 1.4; o.hop = 1.6 + Math.random() * 1.6; }
  if (walkers.length || fidgeters.length) {
    for (const [o] of walkers) { o.seg = Math.floor(Math.random() * o.walk.length); o.t = Math.random(); }
    let clock = 0;
    ctx.onUpdate((dt) => {
      if (!ctx.group.visible) return;
      clock += dt;
      for (const [o, i] of fidgeters) { // turn to shout at a neighbour, bounce while shouting
        o.yaw = o.yaw0 + Math.sin(clock * o.rate + o.ph) * 0.45 * o.fidget;
        const shout = Math.max(0, Math.sin(clock * 0.7 + o.ph * 1.3));
        place(o, i, Math.abs(Math.sin(clock * o.hop * Math.PI + o.ph)) * 0.07 * o.fidget * shout);
      }
      for (const [o, i] of walkers) {
        const pts = o.walk, a = pts[o.seg % pts.length], b = pts[(o.seg + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        o.t += (dt * o.speed) / len;
        if (o.t >= 1) { o.t = 0; o.seg = (o.seg + 1) % pts.length; continue; }
        o.x = a[0] + (b[0] - a[0]) * o.t; o.z = a[1] + (b[1] - a[1]) * o.t;
        o.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        place(o, i, Math.abs(Math.sin(o.t * len * 3.2)) * 0.03);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    });
  }
}

// Wall-mounted sign as a real plane (not a floating sprite): gold letters on a dark or clear ground.
export function plaque(ctx, text, x, y, z, yaw, { h = 0.8, color = '#e3c27a', bg = null, font = '600 72px Georgia, serif', sub = null } = {}) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = font; const tw = Math.ceil(g.measureText(text).width);
  c.width = Math.min(4096, tw + 80); c.height = sub ? 170 : 110;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,200,120,0.6)'; g.shadowBlur = 8;
  g.fillText(text, c.width / 2, 58);
  if (sub) { g.font = 'italic 40px Georgia, serif'; g.fillText(sub, c.width / 2, 132); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: !bg, roughness: 0.3, metalness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 });
  const hh = h * (sub ? 1.55 : 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((c.width / c.height) * hh, hh), m);
  mesh.position.set(x, ctx.e + y, z); mesh.rotation.y = yaw; mesh.renderOrder = 6;
  ctx.add(mesh, mesh.geometry, m, t);
  return mesh;
}
