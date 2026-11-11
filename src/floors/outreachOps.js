import * as THREE from 'three';
import { addLuxMaterials, plaque, LM } from '../world/lux.js';
import { CH } from '../world/screens.js';
import { buildDesks, hallRows, consoleRow, SKIN, HAIR } from './outreachDesks.js';
import { instancedBoxes, chunked } from '../world/geom.js';

// ================================================================= OT-03 — THE OPERATIONS FLOOR (redesign v3, 2026-11-09)
// User-approved: stepped terraces like a mission-control room, in the feel of the user's reference
// image (sci-fi corporate interior): warm wood floors framed by dark metal with blue LED edges;
// chunky light-grey metal wall panels with chamfered corners; heavy layered ceilings with deep beams
// and warm wood-slat light coves; pools of light in a dark space; blue + amber only (sectors are told
// apart by blade signs); lush planters. Arrivals is an airport-style immigration hall; a fake, guarded reception hides the
// operation; through the secure door a landing at the head of the escalators reveals every terrace
// stepping down to the world map. One operation per terrace; glass-fronted rooms are built into each
// 5 m step. Plain names in comments only: the scam call centre.
const F = -15, M1 = -10, M2 = -5, CEIL = 9.75;
const PIT = { x0: -109, x1: -50, z0: -39, z1: 39 };
export const OPS = { F, M1, M2, PIT, MAP_X: -108.4,
  ZONES: [ // desk zones on the floor (step 2), north to south
    { id: 'police', name: 'REGULATORY & BANKING LIAISON', z0: -29, z1: -11 },
    { id: 'romance', name: 'RELATIONSHIP DEVELOPMENT', z0: -9, z1: 9 },
    { id: 'tech', name: 'REMOTE DEVICE ASSISTANCE', z0: 11, z1: 29 },
  ],
  DESK_X: [-101, -62],
};
const BLUE = 0x3fa9ff, AMBER = 0xffb060;

// ---------------------------------------------------------------- materials (registered once)
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function tex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
let ready = false;
export function opsMaterials() { materials(); }
function materials() {
  if (ready) return; ready = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // warm satin wood deck: long planks 0.2 m wide (texture = 4 m)
  const wood = tex(512, 512, (g, w, h) => {
    const r = rng(77), tones = ['#7a4a2a', '#83512e', '#6f4226', '#8a5833', '#764828'];
    for (let row = 0; row < 20; row++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 180 + r() * 220; g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x, row * 25.6, len, 25.6);
        for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(40,20,8,${0.05 + r() * 0.08})`; g.fillRect(x, row * 25.6 + r() * 24, len, 1); }
        g.fillStyle = 'rgba(25,12,4,0.55)'; g.fillRect(x, row * 25.6, 1.5, 25.6); x += len;
      }
      g.fillStyle = 'rgba(25,12,4,0.5)'; g.fillRect(0, row * 25.6, w, 1);
    }
  });
  // vertical wood slats for the light coves (texture = 1 m)
  const slats = tex(256, 64, (g, w, h) => { g.fillStyle = '#2a160a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { const k = 120 + (i * 37) % 40; g.fillStyle = `rgb(${k + 60},${k},${k - 60})`; g.fillRect(i * 16 + 3, 0, 10, h); } });
  // dark ceiling / soffit grille (texture = 1 m)
  const grille = tex(128, 128, (g, w, h) => { g.fillStyle = '#16191d'; g.fillRect(0, 0, w, h); g.fillStyle = '#2c3138'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 16 + 2, w, 9); });
  // soft light pool (additive floor decal)
  const pool = tex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  addLuxMaterials({
    woodDeck: std({ map: wood, roughness: 0.38, metalness: 0, envMapIntensity: 0.7 }),
    woodSlat: std({ map: slats, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: slats, emissiveIntensity: 0.35 }),
    panelGrey: std({ color: 0x969ea7, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.7 }),
    panelMid: std({ color: 0x5c636c, roughness: 0.45, metalness: 0.6 }),
    railSteel: std({ color: 0xb8bec6, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.6 }),
    gunDarkO: std({ color: 0x23272d, roughness: 0.38, metalness: 0.75 }),
    floorPanel: std({ color: 0x1b1f25, roughness: 0.32, metalness: 0.45, envMapIntensity: 0.6 }),
    grilleDark: std({ map: grille, roughness: 0.6, metalness: 0.5 }),
    ledBlue: new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false }),
    ledWhite: new THREE.MeshBasicMaterial({ color: 0xeaf6ff, toneMapped: false }),
    coveWarm: std({ color: 0x2a1a0e, emissive: AMBER, emissiveIntensity: 1.1, roughness: 0.6 }),
    downlightW: std({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 1.6 }),
    leaf: std({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
    soil: std({ color: 0x2a1d14, roughness: 1 }),
    screenDark: std({ color: 0x05080c, roughness: 0.15, metalness: 0.4, emissive: 0x0a1a2c, emissiveIntensity: 0.6 }),
    signBlue: std({ color: 0x1f6fd0, roughness: 0.35, metalness: 0.3, emissive: 0x0d3a80, emissiveIntensity: 0.5 }),
    pool: new THREE.MeshBasicMaterial({ map: pool, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  }, { woodDeck: 4, woodSlat: 1, grilleDark: 1 });
}

// ---------------------------------------------------------------- geometry helpers
// chamfered slab (shape in the XZ plane, extruded up): points [[x, z], ...] in order
function prism(L, pts, y0, y1, mat, color) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
  L.geo(g, mat, color);
}
// chamfered wall panel facing along +n (axis 'x' = panel spans X and faces ±Z; 'z' = spans Z, faces ±X)
function wallPanel(L, axis, a0, a1, y0, y1, face, dir, mat, c = 0.28, depth = 0.14) {
  const w = a1 - a0, h = y1 - y0;
  const s = new THREE.Shape([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]].map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  // shape is in XY, extruded along +Z; place it on the wall
  if (axis === 'x') { if (dir < 0) { g.rotateY(Math.PI); g.translate(w, 0, 0); } g.translate(a0, y0, face + (dir > 0 ? 0 : 0)); }
  else { g.rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2); if (dir > 0) g.translate(0, 0, w); g.translate(face, y0, a0); }
  L.geo(g, mat);
}
function leafPlant(L, x, y, z, size = 1, seed = 1) {
  const r = rng(seed * 97 + 13);
  const n = Math.round(18 * size);
  for (let i = 0; i < n; i++) {
    const len = (0.45 + r() * 0.5) * size, wid = (0.16 + r() * 0.12) * size;
    const g = new THREE.PlaneGeometry(wid, len, 1, 2);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const v = p.getY(k) / len + 0.5; p.setX(k, p.getX(k) * Math.sin(v * Math.PI) * 1.3); p.setZ(k, -0.25 * v * v * len); } // leaf outline + droop
    g.translate(0, len / 2, 0);
    g.rotateX(-0.25 - r() * 0.9); g.rotateY(r() * Math.PI * 2);
    g.translate(x, y + r() * 0.35 * size, z);
    const c = new THREE.Color().setHSL(0.24 + r() * 0.08, 0.55 + r() * 0.2, 0.22 + r() * 0.16);
    L.geo(g, 'leaf', c.getHex());
  }
}
// chamfered metal planter with lush plants
function planter(L, x, z, y, w = 2.4, d = 1.2) {
  const c = 0.3;
  prism(L, [[x - w / 2 + c, z - d / 2], [x + w / 2 - c, z - d / 2], [x + w / 2, z - d / 2 + c], [x + w / 2, z + d / 2 - c], [x + w / 2 - c, z + d / 2], [x - w / 2 + c, z + d / 2], [x - w / 2, z + d / 2 - c], [x - w / 2, z - d / 2 + c]], y, y + 0.7, 'panelMid');
  L.box(x - w / 2 + 0.12, x + w / 2 - 0.12, y + 0.7, y + 0.72, z - d / 2 + 0.12, z + d / 2 - 0.12, 'soil');
  L.box(x - w / 2 + 0.05, x + w / 2 - 0.05, y + 0.05, y + 0.1, z - d / 2 - 0.01, z - d / 2, 'ledBlue');
  L.ctx.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: L.ctx.e + y, y1: L.ctx.e + y + 0.7 });
  for (let i = 0; i < Math.max(1, Math.round(w / 1.1)); i++) leafPlant(L, x - w / 2 + (i + 0.5) * (w / Math.max(1, Math.round(w / 1.1))), y + 0.7, z, 1.3, Math.round(x * 7 + z * 3 + i));
}
// vertical blade sign: rounded blue capsule, white text running top to bottom, hung from the ceiling
function bladeSign(ctx, L, text, sub, x, y, z, yaw, h = 4.2, top = CEIL) {
  const w = 0.95, dpt = 0.22;
  const g = new THREE.CylinderGeometry(w / 2, w / 2, dpt, 24, 1); // rounded ends: two half-discs + box
  g.rotateX(Math.PI / 2);
  for (const dy of [h / 2 - w / 2, -h / 2 + w / 2]) { const e = g.clone(); e.rotateY(yaw); e.translate(x, y + dy, z); L.geo(e, 'signBlue'); }
  const b = new THREE.BoxGeometry(w, h - w, dpt); b.rotateY(yaw); b.translate(x, y, z); L.geo(b, 'signBlue');
  L.box(x - 0.012, x + 0.012, y + h / 2, top, z - 0.012, z + 0.012, 'gunDarkO'); // hanger
  const c = document.createElement('canvas'); c.width = 128; c.height = 640; const q = c.getContext('2d');
  q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle';
  q.save(); q.translate(64, 320); q.rotate(Math.PI / 2);
  let fs = 46; do { q.font = `700 ${fs}px "Segoe UI", sans-serif`; fs -= 1; } while (q.measureText(text).width > 560 && fs > 14);
  q.fillText(text, 0, sub ? -14 : 0);
  if (sub) { q.font = '400 22px "Segoe UI", sans-serif'; q.fillText(sub, 0, 26); }
  q.restore();
  q.fillStyle = '#9fe0ff'; for (const [cx, cy] of [[48, 600], [80, 600]]) { q.beginPath(); q.arc(cx, cy, 9, 0, Math.PI * 2); q.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.92), m);
    pl.position.set(x + Math.sin(yaw) * s * (dpt / 2 + 0.005), ctx.e + y, z + Math.cos(yaw) * s * (dpt / 2 + 0.005)); pl.rotation.y = yaw + (s < 0 ? Math.PI : 0);
    ctx.add(pl, pl.geometry);
  }
  ctx.disposables.push(m, t);
}
function light(ctx, x, y, z, intensity, distance, color = 0xffc890, decay = 1.6) {
  const l = new THREE.PointLight(color, intensity, distance, decay); l.position.set(x, ctx.e + y, z); ctx.add(l); return l;
}
function pool(L, x, y, z, r, color = 0xffd9a8) { const g = new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2); g.translate(x, y + 0.02, z); L.geo(g, 'pool', color); }
// glass balustrade along an axis-aligned edge: frame posts every 1.5 m, steel cap, LED foot line
function balustrade(L, axis, a0, a1, fixed, y, gaps = []) {
  let cur = a0;
  for (const [ga, gb] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[a1, a1]])) {
    if (ga - cur > 0.1) {
      const [b0, b1] = [cur, ga];
      if (axis === 'x') {
        L.box(b0, b1, y + 0.08, y + 1.02, fixed - 0.015, fixed + 0.015, 'glass', { collide: true });
        L.box(b0, b1, y + 1.02, y + 1.1, fixed - 0.05, fixed + 0.05, 'railSteel');
        L.box(b0, b1, y, y + 0.08, fixed - 0.05, fixed + 0.05, 'gunDarkO');
        L.box(b0, b1, y + 0.08, y + 0.1, fixed - 0.06, fixed + 0.06, 'ledBlue');
        for (let a = b0; a <= b1 + 0.01; a += 1.5) { const p = Math.min(a, b1 - 0.05); L.box(p, p + 0.05, y, y + 1.05, fixed - 0.04, fixed + 0.04, 'railSteel'); }
      } else {
        L.box(fixed - 0.015, fixed + 0.015, y + 0.08, y + 1.02, b0, b1, 'glass', { collide: true });
        L.box(fixed - 0.05, fixed + 0.05, y + 1.02, y + 1.1, b0, b1, 'railSteel');
        L.box(fixed - 0.05, fixed + 0.05, y, y + 0.08, b0, b1, 'gunDarkO');
        L.box(fixed - 0.06, fixed + 0.06, y + 0.08, y + 0.1, b0, b1, 'ledBlue');
        for (let a = b0; a <= b1 + 0.01; a += 1.5) { const p = Math.min(a, b1 - 0.05); L.box(fixed - 0.04, fixed + 0.04, y, y + 1.05, p, p + 0.05, 'railSteel'); }
      }
    }
    cur = Math.max(cur, gb);
  }
}
// diagonal glass balustrade (prow edges): visual as rotated boxes, colliders as short pieces
function diagBalustrade(L, [xa, za], [xb, zb], y) {
  const len = Math.hypot(xb - xa, zb - za), yaw = Math.atan2(xb - xa, zb - za);
  const put = (w, h, d, y0, mat, off = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(yaw); g.translate((xa + xb) / 2, y0 + h / 2, (za + zb) / 2 + off); L.geo(g, mat); };
  put(0.03, 0.94, len, y + 0.08, 'glass'); put(0.1, 0.08, len, y + 1.02, 'railSteel'); put(0.1, 0.08, len, y, 'gunDarkO'); put(0.12, 0.02, len, y + 0.08, 'ledBlue');
  const n = Math.ceil(len / 0.5);
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, x = xa + (xb - xa) * u, z = za + (zb - za) * u; L.ctx.colliders.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: L.ctx.e + y, y1: L.ctx.e + y + 1.1 }); }
  for (let i = 0; i <= Math.floor(len / 1.5); i++) { const u = Math.min(1, (i * 1.5) / len), x = xa + (xb - xa) * u, z = za + (zb - za) * u; L.box(x - 0.03, x + 0.03, y, y + 1.05, z - 0.03, z + 0.03, 'railSteel'); }
}
// straight flight: along 'x' or 'z', from a (top) to b (bottom), across band [c0, c1]
// land: length of a top landing beyond a (0 = none); voidSide: 0 -> c0 side, 1 -> c1 side (the landing
// only gets glass on its void side and its free end, so you can step onto it from the gallery)
function flight(L, along, a, b, c0, c1, yTop, drop = 5, land = 0, voidSide = 0) {
  const n = Math.round(drop / 0.25), dir = Math.sign(b - a), run = Math.abs(b - a) / (n - 1);
  if (land > 0) {
    const l0 = Math.min(a, a - dir * land), l1 = Math.max(a, a - dir * land), cv = voidSide ? c1 : c0, ce = a - dir * land;
    if (along === 'x') { L.box(l0, l1, yTop - 0.3, yTop, c0, c1, 'gunDarkO', { collide: true }); L.floor(l0, l1, c0, c1, yTop + 0.004, 'woodDeck', 4);
      L.box(l0, l1, yTop, yTop + 1.1, cv - 0.015, cv + 0.015, 'glass', { collide: true }); L.box(l0, l1, yTop + 1.04, yTop + 1.1, cv - 0.04, cv + 0.04, 'railSteel');
      L.box(ce - 0.015, ce + 0.015, yTop, yTop + 1.1, c0, c1, 'glass', { collide: true }); L.box(ce - 0.04, ce + 0.04, yTop + 1.04, yTop + 1.1, c0, c1, 'railSteel'); }
    else { L.box(c0, c1, yTop - 0.3, yTop, l0, l1, 'gunDarkO', { collide: true }); L.floor(c0, c1, l0, l1, yTop + 0.004, 'woodDeck', 4);
      L.box(cv - 0.015, cv + 0.015, yTop, yTop + 1.1, l0, l1, 'glass', { collide: true }); L.box(cv - 0.04, cv + 0.04, yTop + 1.04, yTop + 1.1, l0, l1, 'railSteel');
      L.box(c0, c1, yTop, yTop + 1.1, ce - 0.015, ce + 0.015, 'glass', { collide: true }); L.box(c0, c1, yTop + 1.04, yTop + 1.1, ce - 0.04, ce + 0.04, 'railSteel'); }
  }
  for (let i = 0; i < n - 1; i++) {
    const top = yTop - (i + 1) * 0.25, s0 = a + dir * i * run, s1 = s0 + dir * run, lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    const nose = dir > 0 ? [lo, lo + 0.04] : [hi - 0.04, hi];
    if (along === 'x') { L.box(lo, hi, top - 0.05, top, c0, c1, 'woodDeck', { collide: true }); L.box(lo, hi, yTop - drop, top - 0.05, c0 + 0.08, c1 - 0.08, 'gunDarkO'); L.box(nose[0], nose[1], top - 0.03, top + 0.003, c0 + 0.1, c1 - 0.1, 'ledWhite'); L.ctx.colliders.push({ x0: lo, x1: hi, z0: c0, z1: c1, y0: L.ctx.e + yTop - drop, y1: L.ctx.e + top }); }
    else { L.box(c0, c1, top - 0.05, top, lo, hi, 'woodDeck', { collide: true }); L.box(c0 + 0.08, c1 - 0.08, yTop - drop, top - 0.05, lo, hi, 'gunDarkO'); L.box(c0 + 0.1, c1 - 0.1, top - 0.03, top + 0.003, nose[0], nose[1], 'ledWhite'); L.ctx.colliders.push({ x0: c0, x1: c1, z0: lo, z1: hi, y0: L.ctx.e + yTop - drop, y1: L.ctx.e + top }); }
  }
  // stringers + glass sides
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (const c of [c0, c1]) {
    if (along === 'x') { L.box(lo, hi, yTop - drop, yTop - drop + 0.3, c - 0.06, c + 0.06, 'gunDarkO'); L.box(lo, hi, yTop - drop + 0.3, yTop + 1.1, c - 0.015, c + 0.015, 'glass', { collide: true }); L.box(lo, hi, yTop + 1.04, yTop + 1.1, c - 0.04, c + 0.04, 'railSteel'); }
    else { L.box(c - 0.06, c + 0.06, yTop - drop, yTop - drop + 0.3, lo, hi, 'gunDarkO'); L.box(c - 0.015, c + 0.015, yTop - drop + 0.3, yTop + 1.1, lo, hi, 'glass', { collide: true }); L.box(c - 0.04, c + 0.04, yTop + 1.04, yTop + 1.1, lo, hi, 'railSteel'); }
  }
}
// mezzanine slab with a chunky chamfered fascia, warm soffit downlights and an LED reveal
function deck(L, x0, x1, z0, z1, y, front) { // front: which edges face the void: subset of 'nsew'
  L.box(x0, x1, y - 0.35, y, z0, z1, 'gunDarkO', { collide: true });
  L.floor(x0, x1, z0, z1, y + 0.004, 'woodDeck', 4);
  L.box(x0, x1, y - 0.36, y - 0.34, z0, z1, 'grilleDark'); // soffit
  for (const e of front) {
    // fascia: vertical band + a chamfer tucked under it, blue reveal between
    const F_ = { n: [x0, x1, z0 - 0.25, z0], s: [x0, x1, z1, z1 + 0.25], w: [x0 - 0.25, x0, z0, z1], e: [x1, x1 + 0.25, z0, z1] }[e];
    L.box(F_[0], F_[1], y - 0.95, y + 0.02, F_[2], F_[3], 'panelGrey');
    const ch = { n: [x0, x1, z0, z0 + 0.35], s: [x0, x1, z1 - 0.35, z1], w: [x0, x0 + 0.35, z0, z1], e: [x1 - 0.35, x1, z0, z1] }[e];
    L.box(ch[0], ch[1], y - 1.15, y - 0.95, ch[2], ch[3], 'panelMid');
    const rv = { n: [x0, x1, z0 - 0.27, z0 - 0.25], s: [x0, x1, z1 + 0.25, z1 + 0.27], w: [x0 - 0.27, x0 - 0.25, z0, z1], e: [x1 + 0.25, x1 + 0.27, z0, z1] }[e];
    L.box(rv[0], rv[1], y - 0.55, y - 0.48, rv[2], rv[3], 'ledBlue');
  }
  // warm downlights in the soffit
  for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) for (let z = z0 + 1.2; z < z1 - 0.5; z += 3) L.cyl(x, z, 0.12, y - 0.38, y - 0.36, 'downlightW', { seg: 10 });
}

// ================================================================= build (v4: terraces + big halls + immigration arrivals, 2026-11-09)
// West from the lift hall (y relative to 52 m):
//   ARRIVALS  lift hall X -50..-30: airport-immigration style (queues, booths, e-gates), no weapon checks
//   T0  fake reception X -60..-50.5, Z ±25, y 0, ceiling 4.5; opaque secure door X -60, Z ±3.5
//   overlook X -65..-60, Z ±36 at y 0: the reveal; 9 m grand stair (centre) + an escalator at each end
//   T1 police / bank   X -74..-60  y -5  ceiling 3.2
//   T2 romance         X -88..-74  y -10 ceiling 0.8
//   T3 tech support    X -109..-88 y -15 ceiling -0.8 to X -100; light well X -109..-100 with the map
// Desk rows (outreachDesks.js): ~650 seats, everyone facing the map.
// The levels continue east under the reception and the lift hall to X -41 (short of the lift shafts),
// so each 5 m step opens onto one BIG hall behind continuous glass:
//   STUDIO HALL     y -5,  X -60..-41 (19 x 78 m) facing T1: the video-call sets
//   CANTEEN         y -10, X -74..-41 (33 x 78 m) facing T2: shift canteen for ~600
//   ENGAGEMENT ARRAY y -15, X -88..-41 (47 x 78 m) facing T3: phone / SIM farm + settlement + servers
// Lower escalators sit off the centre axis (Z ±5.25..6.75) and land ~3.3 m clear of the next step. The north and south
const T = [
  { id: 'T1', x0: -74, x1: -60, y: -5, ceil: 3.2, sector: 'police', name: 'REGULATORY & BANKING LIAISON' },
  { id: 'T2', x0: -88, x1: -74, y: -10, ceil: 0.8, sector: 'romance', name: 'RELATIONSHIP DEVELOPMENT' },
  { id: 'T3', x0: -109, x1: -88, y: -15, ceil: -0.8, sector: 'tech', name: 'REMOTE DEVICE ASSISTANCE' },
];
const BACK = -41; // east end of the dug-out levels (the lift shafts start at X -39)
const HALLS = [
  // the three operation floors (user: desks only in the halls), each faces the terrace in front of it
  { id: 'police', x0: -60, y: -5, rows: 6, name: 'REGULATORY & BANKING LIAISON', floor: 'woodDeck' },
  { id: 'romance', x0: -74, y: -10, rows: 8, name: 'RELATIONSHIP DEVELOPMENT', floor: 'woodDeck' },
  { id: 'tech', x0: -88, y: -15, rows: 9, name: 'REMOTE DEVICE ASSISTANCE', floor: 'woodDeck' },
];
const HALL_H = 4.4, DOORS = [-24, -12, 12, 24];
const WELL_X = -100, REC = { x0: -60, x1: -50.5, z: 25, y: 0, ceil: 4.5 };
const DOOR_Z = 3.5;
// the overlook: one full-width gallery at y 0 in front of the secure door (X -65..-60, Z ±36); a 9 m grand
// stair down the centre axis to terrace 1, and an escalator at each end running along the gallery front
const OVER = { x0: -65, x1: -60, z: 36 }, GRAND_Z = 4.5, SIDE_ESC = { x0: -66.6, x1: -65.1, zTop: 34 };
const ESC_Z = [[-6.75, -5.25], [5.25, 6.75]], SIDE_Z = [35.5, 37.5]; // lower escalators sit off the centre axis
export const TERRACES = T;

// inclined box (escalator skirts, handrails) along axis 'x' or 'z': from (aa, ya) to (ab, yb), across b0..b1
function incline(L, axis, aa, ya, ab, yb, b0, b1, thick, mat) {
  const len = Math.hypot(ab - aa, yb - ya);
  if (axis === 'x') { const g = new THREE.BoxGeometry(len, thick, b1 - b0); g.rotateZ(Math.atan2(yb - ya, ab - aa)); g.translate((aa + ab) / 2, (ya + yb) / 2, (b0 + b1) / 2); L.geo(g, mat); }
  else { const g = new THREE.BoxGeometry(b1 - b0, thick, len); g.rotateX(-Math.atan2(yb - ya, ab - aa)); g.translate((b0 + b1) / 2, (ya + yb) / 2, (aa + ab) / 2); L.geo(g, mat); }
}
// escalator: top comb plate 1 m from aTop (yTop), 30° run down to yTop - drop, 1 m bottom plate.
// axis: the direction it runs along; dir: -1 / +1 = which way is down; c0..c1: its width across
function escalator(L, aTop, c0, c1, yTop, { axis = 'x', dir = -1, drop = 5 } = {}) {
  const n = 20, rise = drop / n, slope = drop / Math.tan(Math.PI / 6), run = slope / n, aB = aTop + dir * (1 + slope), e = L.ctx.e;
  const B = (a0, a1, y0, y1, b0, b1, m, o) => (axis === 'x' ? L.box(a0, a1, y0, y1, b0, b1, m, o) : L.box(b0, b1, y0, y1, a0, a1, m, o));
  const C = (a0, a1, b0, b1, y0, y1) => { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); L.ctx.colliders.push(axis === 'x' ? { x0: lo, x1: hi, z0: b0, z1: b1, y0: e + y0, y1: e + y1 } : { x0: b0, x1: b1, z0: lo, z1: hi, y0: e + y0, y1: e + y1 }); };
  const at = (k) => aTop + dir * k; // distance along the run from the top edge
  B(at(0), at(1), yTop - 0.3, yTop, c0, c1, 'railSteel', { collide: true });
  B(aB, aB + dir, yTop - drop - 0.05, yTop - drop + 0.01, c0, c1, 'railSteel', { collide: true });
  for (let i = 0; i < n - 1; i++) {
    const top = yTop - (i + 1) * rise, sa = at(1 + i * run), sc = at(1 + (i + 1) * run);
    B(sa, sc, top - 0.06, top, c0 + 0.05, c1 - 0.05, 'gunDarkO', { collide: true });
    B(sa, sa + dir * 0.035, top - 0.02, top + 0.002, c0 + 0.08, c1 - 0.08, 'ledWhite');
    C(sa, sc, c0, c1, yTop - drop, top);
  }
  for (const [ba, bb] of [[c0 - 0.12, c0], [c1, c1 + 0.12]]) {
    incline(L, axis, at(1), yTop - 0.5, aB, yTop - drop - 0.5, ba, bb, 1.1, 'panelGrey');
    incline(L, axis, at(1), yTop + 0.5, aB, yTop - drop + 0.5, ba + 0.03, bb - 0.03, 0.9, 'glass');
    incline(L, axis, at(1), yTop + 0.98, aB, yTop - drop + 0.98, ba - 0.02, bb + 0.02, 0.07, 'rubber');
    incline(L, axis, at(1), yTop + 0.03, aB, yTop - drop + 0.03, ba - 0.005, bb + 0.005, 0.03, 'ledBlue');
    for (const [k0, yy] of [[at(0), yTop], [aB, yTop - drop]]) { B(k0, k0 + dir, yy, yy + 1.0, ba + 0.03, bb - 0.03, 'glass'); B(k0, k0 + dir, yy + 0.95, yy + 1.02, ba - 0.02, bb + 0.02, 'rubber'); C(k0, k0 + dir, ba, bb, yy, yy + 1.1); }
    for (let i = 0; i < n; i++) { const ka = at(1 + i * run), kb = at(1 + (i + 1) * run), y = yTop - (i + 0.5) * rise; C(ka, kb, ba, bb, y - 0.5, y + 1.1); }
  }
  incline(L, axis, at(1), yTop - 0.9, aB, yTop - drop - 0.2, c0, c1, 0.6, 'panelMid');
}
// panel cladding on a rectangle of wall
function cladRect(L, axis, a0, a1, y0, y1, face, dir) {
  const bay = 4.6, rows = Math.max(1, Math.round((y1 - y0) / 3.4)), rh = (y1 - y0) / rows;
  let col = 0;
  for (let a = a0; a < a1 - 0.5; a += bay, col++) {
    const b = Math.min(a + bay, a1);
    if (col % 4 === 3) {
      if (axis === 'x') { L.box(a + 0.4, b - 0.4, y0, y1, face, face + dir * 0.03, 'gunDarkO'); L.box((a + b) / 2 - 0.04, (a + b) / 2 + 0.04, y0 + 0.4, y1 - 0.4, face + dir * 0.03, face + dir * 0.06, 'ledBlue'); }
      else { L.box(face, face + dir * 0.03, y0, y1, a + 0.4, b - 0.4, 'gunDarkO'); L.box(face + dir * 0.03, face + dir * 0.06, y0 + 0.4, y1 - 0.4, (a + b) / 2 - 0.04, (a + b) / 2 + 0.04, 'ledBlue'); }
      continue;
    }
    for (let r = 0; r < rows; r++) wallPanel(L, axis, a + 0.05, b - 0.05, y0 + r * rh + 0.05, y0 + (r + 1) * rh - 0.05, face, dir, r === 0 ? 'panelMid' : 'panelGrey');
  }
}
// ceiling over a terrace: slab, beams across with warm wood-slat coves, downlights; bulkhead at its west edge
function terraceCeiling(L, x0, x1, y) {
  L.box(x0, x1, y, y + 0.3, -39, 39, 'grilleDark');
  const n = Math.max(1, Math.round((x1 - x0) / 7)), bw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * bw;
    L.box(Math.max(x0, x - 0.45), Math.min(x1, x + 0.45), y - 0.9, y, -39, 39, 'gunDarkO');
    L.box(Math.max(x0, x - 0.3), Math.min(x1, x + 0.3), y - 1.05, y - 0.9, -39, 39, 'panelMid');
    L.box(Math.max(x0, x - 0.04), Math.min(x1, x + 0.04), y - 1.08, y - 1.05, -38.5, 38.5, 'ledBlue');
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bw;
    L.box(cx - 0.8, cx + 0.8, y - 0.35, y, -38.5, 38.5, 'coveWarm');
    L.box(cx - 0.9, cx + 0.9, y - 0.41, y - 0.35, -38.5, 38.5, 'woodSlat');
    for (let z = -35; z <= 35; z += 5) for (const dx of [-bw / 2 + 1.4, bw / 2 - 1.4]) L.cyl(cx + dx, z, 0.14, y - 0.04, y, 'downlightW', { seg: 10 });
  }
  L.box(x0, x0 + 0.6, y - 0.5, y, -39, 39, 'panelGrey'); // slim edge fascia (a deep bulkhead blocked the view from the overlook)
  L.box(x0 - 0.02, x0, y - 0.32, y - 0.26, -39, 39, 'ledBlue');
  L.box(x0, x0 + 0.6, y - 0.56, y - 0.5, -39, 39, 'coveWarm');
}
// a big hall dug in under the terraces: storefront glass onto the terrace, columns, coves, back wall
function bigHall(ctx, L, h) {
  const x0 = h.x0, x1 = BACK, y = h.y, top = y + HALL_H;
  L.floor(x0, x1, -38.9, 38.9, y + 0.006, h.floor, 4);
  L.box(x1 - 0.3, x1, y, top, -39, 39, 'panelMid', { collide: true });
  cladRect(L, 'z', -38.6, 38.6, y, top, x1 - 0.3, -1);
  for (const [face, dir] of [[-39, 1], [39, -1]]) cladRect(L, 'x', x0 + 0.3, x1 - 0.3, y, top, face, dir);
  // ceiling: dark grille with warm coves along Z every 8 m and downlights between
  L.box(x0, x1, top - 0.12, top, -39, 39, 'grilleDark');
  for (let x = x0 + 4; x < x1 - 1; x += 8) {
    L.box(x - 0.6, x + 0.6, top - 0.36, top - 0.12, -38, 38, 'coveWarm');
    L.box(x - 0.7, x + 0.7, top - 0.42, top - 0.36, -38, 38, 'woodSlat');
    for (let z = -35; z <= 35; z += 5) for (const dx of [-2.6, 2.6]) if (x + dx < x1 - 0.5) L.cyl(x + dx, z, 0.13, top - 0.16, top - 0.12, 'downlightW', { seg: 10 });
  }
  // columns: chamfered, blue LED strip, on an 8 x 9 m grid (kept off the door axes)
  for (let x = x0 + 8; x < x1 - 2; x += 8) for (const z of [-31.5, -22.5, -6.5, 6.5, 22.5, 31.5]) {
    L.cyl(x, z, 0.38, y, top - 0.12, 'panelGrey', { seg: 8, collide: true });
    L.box(x - 0.05, x + 0.05, y + 0.5, top - 0.8, z - 0.4, z - 0.37, 'ledBlue');
  }
  // the storefront: header band with LED + the hall's name, glass with doors, solid at the escalators
  L.box(x0 - 0.25, x0, top - 0.9, top, -39, 39, 'panelGrey');
  L.box(x0 - 0.27, x0 - 0.25, top - 0.9, top - 0.83, -39, 39, 'ledBlue');
  const solid = [[-39, -34.5], [-7.5, 7.5], [34.5, 39]];
  for (const [a, b] of solid) L.box(x0 - 0.25, x0, y, top - 0.9, a, b, 'panelGrey', { collide: true });
  for (const [a, b] of [[-34.5, -7.5], [7.5, 34.5]]) {
    let cur = a;
    for (const d of DOORS.filter((dz) => dz > a && dz < b).concat([b + 99])) {
      const g0 = Math.min(d - 1.3, b), g1 = Math.min(d + 1.3, b);
      if (g0 > cur) { L.box(x0 - 0.04, x0, y, top - 0.9, cur, g0, 'glass', { collide: true }); for (let z = cur; z < g0 - 0.2; z += 3) L.box(x0 - 0.1, x0, y, top - 0.9, z, z + 0.08, 'gunDarkO'); }
      if (d < b) for (const zz of [g0, g1 - 0.12]) L.box(x0 - 0.14, x0, y, top - 0.9, zz, zz + 0.12, 'panelMid');
      cur = g1;
    }
    L.box(x0 - 0.08, x0, y, y + 0.12, a, b, 'gunDarkO');
  }
  for (const z of [-19.5, 19.5]) plaque(ctx, h.name, x0 - 0.28, top - 0.45, z, -Math.PI / 2, { h: 0.42, color: '#e8eef4', font: '600 72px "Segoe UI", sans-serif' });
}
// the arrivals hall: airport-immigration style (lift hall X -50..-30); queues -> booths -> the portal
function arrivals(ctx, L) {
  const BX = -44; // booth row
  const SK = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850];
  const zs = []; for (let z = -31; z <= 31.01; z += 4) if (Math.abs(z) > 6) zs.push(z);
  zs.forEach((z, i) => {
    prism(L, [[BX - 1.2, z - 1.2], [BX + 1.0, z - 1.2], [BX + 1.2, z - 1.0], [BX + 1.2, z + 1.0], [BX + 1.0, z + 1.2], [BX - 1.2, z + 1.2]], 0, 1.05, 'panelGrey');
    ctx.colliders.push({ x0: BX - 1.2, x1: BX + 1.2, z0: z - 1.2, z1: z + 1.2, y0: ctx.e, y1: ctx.e + 2.4 });
    L.box(BX + 1.15, BX + 1.21, 0.2, 0.26, z - 1.0, z + 1.0, 'ledBlue');
    L.box(BX - 1.1, BX + 1.15, 1.05, 2.3, z - 1.15, z - 1.11, 'glass'); L.box(BX - 1.1, BX + 1.15, 1.05, 2.3, z + 1.11, z + 1.15, 'glass');
    L.box(BX + 1.11, BX + 1.15, 1.05, 2.3, z - 1.15, z + 1.15, 'glass');
    L.box(BX - 1.2, BX + 1.2, 2.3, 2.55, z - 1.2, z + 1.2, 'gunDarkO'); // roof
    L.box(BX + 1.18, BX + 1.22, 2.38, 2.48, z - 0.5, z + 0.5, 'ledWhite'); // lane-open light
    L.box(BX + 0.95, BX + 1.18, 1.05, 1.12, z - 0.9, z + 0.4, 'woodDeck'); // counter
    L.box(BX + 0.7, BX + 0.9, 1.12, 1.45, z + 0.2, z + 0.5, 'gunDarkO'); // camera / fingerprint post
    L.person(BX - 0.2, z - 0.1, { yaw: Math.PI / 2, suit: 0x1d2a44, skin: SK[i % 5], hair: 0x111111, sit: true }); // officer
    plaque(ctx, String(i + 1).padStart(2, '0'), BX + 1.23, 2.0, z + 0.75, Math.PI / 2, { h: 0.22, color: '#e8eef4', font: '600 70px "Segoe UI", sans-serif' });
  });
  // e-gates in the middle (senior associates)
  for (let z = -5; z <= 5.01; z += 2) {
    L.box(BX - 1.0, BX + 1.0, 0, 1.05, z - 0.14, z + 0.14, 'panelGrey', { collide: true }); L.box(BX + 1.0, BX + 1.04, 0.6, 0.9, z - 0.1, z + 0.1, 'ledBlue');
    L.box(BX - 0.2, BX + 0.2, 0.4, 1.3, z + 0.14, z + 0.9, 'glass');
  }
  // lane signs (back-lit, hung from the ceiling) and the arrivals board
  for (const [z, t] of [[-19, 'ASSOCIATES'], [0, 'SENIOR ASSOCIATES · E-GATES'], [19, 'PARTNERS & VISITORS']]) {
    L.box(BX - 0.15, BX + 0.15, 3.7, 4.5, z - (z ? 9 : 5), z + (z ? 9 : 5), 'gunDarkO');
    L.box(BX + 0.15, BX + 0.17, 3.75, 4.45, z - (z ? 9 : 5) + 0.1, z + (z ? 9 : 5) - 0.1, 'signBlue');
    plaque(ctx, t, BX + 0.19, 4.1, z, Math.PI / 2, { h: 0.5, color: '#ffffff', font: '600 72px "Segoe UI", sans-serif' });
    L.box(BX - 0.01, BX + 0.01, 4.5, 9.6, z, z + 0.02, 'gunDarkO');
  }
  plaque(ctx, 'ARRIVALS · ASSOCIATE IMMIGRATION', -41.5, 6.6, 0, Math.PI / 2, { h: 0.7, color: '#e8eef4', font: '300 80px "Segoe UI", sans-serif', sub: 'Please have your contract and device ready' });
  // queue lanes: retractable-belt stanchions, serpentine, in front of the booths
  const post = (x, z) => { L.cyl(x, z, 0.04, 0, 0.95, 'railSteel', { seg: 8 }); L.cyl(x, z, 0.16, 0, 0.03, 'gunDarkO', { seg: 10 }); };
  for (const [za, zb] of [[-31.5, -7], [7, 31.5]]) {
    const xs = [-41.5, -40.2, -38.9];
    xs.forEach((x, k) => {
      for (let z = za; z <= zb + 0.01; z += 2.45) post(x, z);
      const g0 = k % 2 ? za + 1.6 : za, g1 = k % 2 ? zb : zb - 1.6; // alternate gaps make the serpentine
      L.box(x - 0.015, x + 0.015, 0.84, 0.9, g0, g1, 'signBlue');
    });
  }
  // floor: blue "wait here" bar before the booths
  L.box(BX + 2.1, BX + 2.2, 0.012, 0.02, -31.5, 31.5, 'ledBlue');
}

// ---------------------------------------------------------------- support areas on the terraces
// T1: glass video-call studio pods (police station, bank, court, customs) · T2: the open canteen ·
// T3: the handset / SIM farm racks in front of the map
const PHONE_MAT = new THREE.MeshBasicMaterial({ toneMapped: false });
const PHONE_C = [0xd8ffe8, 0xbfe0ff, 0xffffff, 0x9ff0c8, 0xffd0e8, 0x2fa36a, 0x3fa9ff];
function terraceSupport(ctx, L) {
  const r = ((sd) => () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; })(77);
  const person = (x, z, y, o = {}) => L.person(x, z, { y, skin: SKIN[Math.floor(r() * 6)], hair: HAIR[Math.floor(r() * 6)], ...o });
  // ---- T1 studios: open-fronted glass pods facing east, each a fake official set with its camera
  const SETS = [['POLICE', 0x1d2f5c], ['PARTNER BANK', 0xd8dde3], ['COURT', 0x5a3a22], ['CUSTOMS', 0x4a5160]];
  const PODS = [[9, 14.5], [15.5, 21], [22.2, 27.6], [28.6, 34]];
  for (const sg of [-1, 1]) PODS.forEach(([a, b], i) => {
    const z0 = sg < 0 ? -b : a, z1 = sg < 0 ? -a : b, zc = (z0 + z1) / 2, [name, col] = SETS[(i + (sg < 0 ? 2 : 0)) % 4], y = -5;
    L.box(-73.7, -69.4, y, y + 0.1, z0, z1, 'floorPanel', { collide: true });
    L.box(-73.7, -73.45, y, y + 3.3, z0, z1, 'satinV', { color: col, collide: true }); // backdrop
    for (const zz of [z0, z1 - 0.05]) L.box(-73.7, -69.4, y, y + 3.3, zz, zz + 0.05, 'glass', { collide: true });
    for (const xt of [-73.55, -69.55]) L.box(xt - 0.05, xt + 0.05, y + 3.3, y + 3.4, z0, z1, 'gunDarkO'); // open top: a light truss, not a roof (the overlook looks down into the sets)
    L.box(-73.6, -69.5, y + 3.3, y + 3.4, zc - 0.05, zc + 0.05, 'gunDarkO');
    L.box(-73.44, -73.4, y + 2.0, y + 2.9, zc - 0.5, zc + 0.5, name === 'COURT' ? 'gold' : 'gunDarkO'); // crest / emblem
    L.box(-72.8, -72.0, y + 0.1, y + 0.85, zc - 1.0, zc + 1.0, name === 'PARTNER BANK' ? 'panelGrey' : 'walnut', { collide: true }); // desk / counter
    person(-73.0, zc, y, { yaw: Math.PI / 2, suit: name === 'POLICE' ? 0x2a3d6b : name === 'CUSTOMS' ? 0x3a4a3a : 0x1f2a44 });
    L.box(-70.4, -70.36, y + 0.1, y + 1.5, zc - 0.02, zc + 0.02, 'gunDarkO'); // tripod
    L.cyl(-70.38, zc, 0.32, y + 1.5, y + 1.56, 'ledWhite', { seg: 18 }); // ring light (seen edge-on)
    person(-69.9, zc + 1.0, y, { yaw: -Math.PI / 2, suit: 0x2b2f38 }); // the operator running the call
    plaque(ctx, `${name} SET`, -73.38, y + 3.05, zc, Math.PI / 2, { h: 0.24, color: '#e8eef4', font: '600 64px "Segoe UI", sans-serif' });
    for (const dz of [-1.2, 1.2]) L.cyl(-71.5, zc + dz, 0.14, y + 3.18, y + 3.3, 'downlightW', { seg: 10 });
  });
  // ---- T2 canteen: long tables with benches, diners, a noodle bar along the south side
  const y2 = -10;
  for (const sg of [-1, 1]) for (let z = 9.5; z <= 31; z += 3.6) for (const xc of [-86.0, -83.0]) {
    const zz = sg * z;
    L.box(xc - 0.45, xc + 0.45, y2, y2 + 0.74, zz - 1.4, zz + 1.4, 'woodDeck', { collide: true });
    for (const bx of [xc - 0.9, xc + 0.9]) L.box(bx - 0.18, bx + 0.18, y2, y2 + 0.45, zz - 1.4, zz + 1.4, 'gunDarkO');
    for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) if (r() < 0.55) person(xc + sd * 0.9, zz - 1.05 + k * 0.7, y2, { yaw: sd > 0 ? -Math.PI / 2 : Math.PI / 2, sit: true, suit: [0x2b2f38, 0x3a3f47, 0x1f2f5a, 0x5a3a2a][Math.floor(r() * 4)] });
    for (let k = 0; k < 4; k++) L.cyl(xc + (k % 2 ? 0.2 : -0.2), zz - 1.05 + k * 0.7, 0.08, y2 + 0.74, y2 + 0.82, 'ledWhite', { seg: 8 }); // noodle bowls
  }
  L.box(-87.6, -80.8, y2, y2 + 1.05, 33.6, 34.4, 'panelGrey', { collide: true }); L.box(-87.6, -80.8, y2 + 1.05, y2 + 1.1, 33.5, 34.5, 'woodDeck');
  L.box(-87.6, -80.8, y2 + 0.2, y2 + 0.26, 33.55, 33.6, 'ledBlue');
  for (let x = -87; x < -81; x += 1.5) person(x, 35.0, y2, { yaw: Math.PI, suit: 0xf0f0f0 }); // kitchen staff
  plaque(ctx, 'ASSOCIATE CANTEEN', -84.2, y2 + 2.4, 34.5, Math.PI, { h: 0.45, color: '#e8eef4', font: '600 72px "Segoe UI", sans-serif', sub: 'Fuel for performance · 24/7' });
  // ---- T3 handset / SIM farm: tall racks, every shelf full of lit phones (facing east)
  const y3 = -15, phones = [];
  for (const xr of [-101.2, -98.6, -96.0]) for (const sg of [-1, 1]) {
    const z0 = sg < 0 ? -34 : 8.5, z1 = sg < 0 ? -8.5 : 34;
    L.box(xr - 0.3, xr + 0.3, y3, y3 + 2.4, z0, z1, 'gunDarkO', { collide: true });
    L.box(xr + 0.3, xr + 0.32, y3 + 0.1, y3 + 0.16, z0, z1, 'ledBlue');
    for (let sh = 0; sh < 6; sh++) {
      const yy = y3 + 0.35 + sh * 0.34;
      L.box(xr + 0.3, xr + 0.36, yy - 0.04, yy, z0, z1, 'railSteel');
      for (let z = z0 + 0.1; z < z1 - 0.05; z += 0.13) if (r() < 0.9) phones.push({ x: xr + 0.34, y: ctx.e + yy + 0.085, z, sx: 0.012, sy: 0.15, sz: 0.075, color: PHONE_C[Math.floor(r() * PHONE_C.length)] });
    }
    for (let z = z0 + 1; z < z1; z += 3) L.box(xr - 0.25, xr + 0.25, y3 + 2.4, y3 + 2.6, z - 0.3, z + 0.3, 'panelMid'); // SIM gateways on top
  }
  for (const m of chunked(phones, 12, (list) => instancedBoxes(list, PHONE_MAT))) ctx.add(m, m.geometry);
  for (const z of [-20, 20]) for (const xa of [-99.9, -97.3]) person(xa, z, y3, { walk: [[xa, Math.sign(z) * 9], [xa, Math.sign(z) * 33]], speed: 0.8, suit: 0x3a3f4a }); // technicians
  plaque(ctx, 'MULTI-CHANNEL ENGAGEMENT ARRAY', -95.6, y3 + 3.2, 0, Math.PI / 2, { h: 0.42, color: '#e8eef4', font: '600 72px "Segoe UI", sans-serif' });
}

export function buildOps(ctx, L) {
  materials();
  L.ctx = ctx;

  // ---------------------------------------------------------------- shell: pit floor, side walls, slabs between the levels
  L.box(PIT.x0, BACK, F - 0.3, F, PIT.z0, PIT.z1, 'gunDarkO', { collide: true });
  for (const [x0, x1, z0, z1] of [[-110, BACK, -40, -39], [-110, BACK, 39, 40], [-110, -109, -39, 39]]) L.box(x0, x1, F, 0, z0, z1, 'gunDarkO', { collide: true });
  L.floor(-109, -88, -39, 39, F + 0.004, 'woodDeck', 4); // T3
  L.box(-88, BACK, -10.6, -10, -39, 39, 'gunDarkO', { collide: true }); L.floor(-88, -74, -39, 39, -9.996, 'woodDeck', 4); // T2 / array ceiling
  L.box(-74, BACK, -5.6, -5, -39, 39, 'gunDarkO', { collide: true }); L.floor(-74, -60, -39, 39, -4.996, 'woodDeck', 4); // T1 / canteen ceiling
  L.box(-60, -50.5, -0.6, 0, -39, 39, 'gunDarkO', { collide: true }); L.box(-50.5, BACK, -0.6, -0.1, -39, 39, 'gunDarkO'); // reception / studio ceiling
  balustrade(L, 'z', -38.9, 38.9, -74, -5, [[-6.95, -5.05], [5.05, 6.95], [-37.6, -35.4], [35.4, 37.6]]);
  balustrade(L, 'z', -38.9, 38.9, -88, -10, [[-6.95, -5.05], [5.05, 6.95], [-37.6, -35.4], [35.4, 37.6]]);

  // ---------------------------------------------------------------- the three big halls
  for (const h of HALLS) bigHall(ctx, L, h);

  // ---------------------------------------------------------------- ceilings (stepped), faces between them, light well + map
  terraceCeiling(L, -74, -60, 3.2);
  terraceCeiling(L, -88, -74, 0.8);
  terraceCeiling(L, WELL_X, -88, -0.8);
  for (const [x, y0, y1] of [[-74, 1.1, 3.2], [-88, -0.5, 0.8], [-60, 3.5, REC.ceil + 0.3]]) { L.box(x - 0.15, x, y0, y1, -39, 39, 'panelGrey'); L.box(x - 0.17, x - 0.15, y0 + 0.4, y0 + 0.47, -39, 39, 'ledBlue'); }
  // (the step faces between ceilings carry the LED ribbon screens: outreachLife.js)
  L.box(WELL_X - 0.15, WELL_X, -0.5, CEIL, -39, 39, 'panelGrey');
  for (let z = -36; z <= 36; z += 6) { L.box(-108.6, WELL_X - 0.6, CEIL - 0.5, CEIL - 0.12, z - 0.7, z + 0.7, 'coveWarm'); L.box(-108.6, WELL_X - 0.6, CEIL - 0.56, CEIL - 0.5, z - 0.8, z + 0.8, 'woodSlat'); }
  L.box(-109, WELL_X, CEIL - 0.12, CEIL, -39, 39, 'grilleDark');
  prism(L, [[-109, -32.6], [-107.6, -32.6], [-107.2, -32.2], [-107.2, 32.2], [-107.6, 32.6], [-109, 32.6]], F + 0.3, CEIL - 0.8, 'gunDarkO');
  L.box(-108.4, -107.25, F + 0.6, CEIL - 1.2, -31.6, 31.6, 'screenDark');
  for (const z of [-31.75, 31.65]) L.box(-107.3, -107.2, F + 0.6, CEIL - 1.2, z, z + 0.1, 'ledBlue');
  for (const y of [CEIL - 1.15, F + 0.5]) L.box(-107.3, -107.2, y, y + 0.08, -31.6, 31.6, 'ledBlue');
  L.box(-109, -105.8, F, F + 0.6, -32.6, 32.6, 'panelMid', { collide: true });

  // ---------------------------------------------------------------- side walls: panelled on every terrace
  for (const [face, dir] of [[-39, 1], [39, -1]]) {
    for (const t of T) {
      const xa = t.id === 'T3' ? WELL_X : t.x0, xb = t.x1;
      cladRect(L, 'x', xa + 0.05, xb - 0.05, t.y, t.ceil, face, dir);
    }
    cladRect(L, 'x', -108.8, WELL_X, F, CEIL - 0.6, face, dir); // the light well's side walls
  }

  // ---------------------------------------------------------------- escalators: each lands on its own terrace
  for (const [z0, z1] of ESC_Z) escalator(L, -74, z0, z1, -5);
  for (const [z0, z1] of ESC_Z) escalator(L, -88, z0, z1, -10);
  for (const s of [-1, 1]) {
    const [c0, c1] = s < 0 ? [-SIDE_Z[1], -SIDE_Z[0]] : SIDE_Z;
    flight(L, 'x', -74, -81, c0, c1, -5);
    flight(L, 'x', -88, -95, c0, c1, -10);
  }

  // ---------------------------------------------------------------- the overlook (the reveal): full-width gallery at y 0
  const O = OVER;
  L.box(O.x0, O.x1, -0.6, 0, -O.z, O.z, 'gunDarkO', { collide: true });
  L.floor(O.x0, O.x1, -O.z, O.z, 0.004, 'woodDeck', 4);
  prism(L, [[-64.2, -26], [-60.8, -26], [-60.8, 26], [-64.2, 26]], 0.004, 0.012, 'floorPanel'); // inlaid walkway panel
  for (const [a0, a1, b0, b1] of [[-64.2, -60.8, -26, -25.94], [-64.2, -60.8, 25.94, 26], [-64.2, -64.14, -26, 26], [-60.86, -60.8, -26, 26]]) L.box(a0, a1, 0.012, 0.018, b0, b1, 'ledBlue');
  // front: one long glass balustrade (gaps: grand stair in the middle, the end escalators' landings)
  balustrade(L, 'z', -O.z, O.z, O.x0, 0, [[-GRAND_Z - 0.05, GRAND_Z + 0.05], [-O.z, -SIDE_ESC.zTop], [SIDE_ESC.zTop, O.z]]);
  L.box(O.x0 - 0.25, O.x0, -1.3, -0.6, -O.z, O.z, 'panelGrey'); L.box(O.x0 - 0.27, O.x0 - 0.25, -1.0, -0.93, -O.z, O.z, 'ledBlue'); // fascia
  for (let x = O.x0 + 1; x < O.x1; x += 2.5) for (let z = -34; z <= 34; z += 3) L.cyl(x, z, 0.12, -0.63, -0.6, 'downlightW', { seg: 10 }); // soffit lights over terrace 1
  for (const s2 of [-1, 1]) balustrade(L, 'x', O.x0, O.x1, s2 * O.z, 0);
  // the gallery's back wall (the reception's west wall) clad in panels either side of the secure door
  for (const [za, zb] of [[-O.z, -DOOR_Z - 0.9], [DOOR_Z + 0.9, O.z]]) cladRect(L, 'z', za, zb, 0, 3.2, -60, -1);
  for (const s2 of [-1, 1]) for (const zz of [8.5, 20]) planter(L, -60.65, s2 * zz, 0, 1.0, 2.4); // against the back wall
  // grand stair: 9 m wide, centre axis, down to terrace 1 (lands 1.8 m short of terrace 1's edge)
  flight(L, 'x', O.x0, -72.2, -GRAND_Z, GRAND_Z, 0);
  // end escalators: one at each end, running along the gallery front towards the centre
  for (const s2 of [-1, 1]) {
    const zt = s2 * SIDE_ESC.zTop, ze = s2 * O.z;
    escalator(L, zt, SIDE_ESC.x0, SIDE_ESC.x1, 0, { axis: 'z', dir: -s2 });
    L.box(SIDE_ESC.x0 - 0.1, O.x0, -0.6, 0, Math.min(zt, ze), Math.max(zt, ze), 'gunDarkO', { collide: true }); // landing beside the gallery
    L.floor(SIDE_ESC.x0 - 0.1, O.x0, Math.min(zt, ze), Math.max(zt, ze), 0.004, 'woodDeck', 4);
    balustrade(L, 'z', Math.min(zt, ze), Math.max(zt, ze), SIDE_ESC.x0 - 0.1, 0);
    balustrade(L, 'x', SIDE_ESC.x0 - 0.1, O.x0, ze, 0);
  }

  // ---------------------------------------------------------------- T0: the fake reception (enclosed, guarded, 50 m wide)
  const R = REC;
  L.floor(R.x0, R.x1, -R.z, R.z, 0.004, 'woodDeck', 4);
  prism(L, [[-58.5, -12], [-53, -12], [-52, -11], [-52, 11], [-53, 12], [-58.5, 12]], 0.004, 0.014, 'floorPanel');
  for (const [a, b] of [[-R.z, -DOOR_Z - 0.9], [DOOR_Z + 0.9, R.z]]) L.box(R.x0, R.x0 + 0.3, 0, R.ceil, a, b, 'panelGrey', { collide: true });
  L.box(R.x0, R.x0 + 0.3, 3.2, R.ceil, -DOOR_Z - 0.9, DOOR_Z + 0.9, 'panelGrey');
  for (const zz of [-R.z - 0.3, R.z]) L.box(R.x0, R.x1, 0, R.ceil, zz, zz + 0.3, 'panelGrey', { collide: true });
  for (const [a, b] of [[-39, -R.z - 0.3], [R.z + 0.3, 39]]) L.box(R.x0, R.x0 + 0.3, 0, 3.5, a, b, 'panelGrey', { collide: true });
  L.box(R.x0, R.x1, R.ceil, R.ceil + 0.25, -R.z, R.z, 'grilleDark');
  for (const x of [-58, -55.25, -52.5]) { L.box(x - 0.7, x + 0.7, R.ceil - 0.3, R.ceil, -R.z + 0.5, R.z - 0.5, 'coveWarm'); L.box(x - 0.8, x + 0.8, R.ceil - 0.36, R.ceil - 0.3, -R.z + 0.5, R.z - 0.5, 'woodSlat'); }
  L.box(-50.5, -50.3, R.ceil, 6.2, -6.6, 6.6, 'panelGrey');
  for (const [face, dir] of [[-R.z, 1], [R.z, -1]]) cladRect(L, 'x', R.x0 + 0.3, R.x1, 0, R.ceil, face, dir);
  // the secure door: chamfered frame, LED reveal (no turnstiles: immigration already checked everyone)
  prism(L, [[-60.4, -DOOR_Z - 0.9], [-59.4, -DOOR_Z - 0.9], [-59.4, DOOR_Z + 0.9], [-60.4, DOOR_Z + 0.9]], 3.2, 4.0, 'gunDarkO');
  for (const s of [-1, 1]) { L.box(-60.4, -59.4, 0, 3.2, s > 0 ? DOOR_Z : -DOOR_Z - 0.9, s > 0 ? DOOR_Z + 0.9 : -DOOR_Z, 'gunDarkO', { collide: true }); L.box(-59.42, -59.38, 0.3, 3.0, s * DOOR_Z, s * DOOR_Z + s * 0.06, 'ledBlue'); }
  L.box(-59.42, -59.38, 3.3, 3.42, -DOOR_Z, DOOR_Z, 'ledBlue');
  {
    const leafGeo = new THREE.BoxGeometry(0.16, 3.2, DOOR_Z), leaves = [];
    for (const s of [-1, 1]) { const m = new THREE.Mesh(leafGeo, LM.panelGrey); m.position.set(-59.9, ctx.e + 1.6, s * DOOR_Z / 2); ctx.add(m); leaves.push([m, s]); }
    const stripGeo = new THREE.BoxGeometry(0.18, 2.6, 0.06);
    for (const [m, s] of leaves) { const st = new THREE.Mesh(stripGeo, LM.ledBlue); st.position.set(0, 0, -s * (DOOR_Z / 2 - 0.08)); m.add(st); }
    ctx.disposables.push(leafGeo, stripGeo);
    let open = 0;
    ctx.colliders.push({ x0: -60.0, x1: -59.8, z0: -DOOR_Z, z1: DOOR_Z, y0: ctx.e, y1: ctx.e + 3.2, openFn: () => open > 0.85 });
    ctx.onUpdate((dt, t, viewer) => {
      const at = (v, ey) => v && Math.abs(ey - ctx.e) < 2 && Math.abs(v.x + 59.9) < 3.2 && Math.abs(v.z) < DOOR_Z + 1;
      const near = (viewer && at(viewer, viewer.y)) || (ctx.doorUsers || []).some((u) => at(u, ctx.e + u.y)); // the player, or the offboarding escort
      open = Math.max(0, Math.min(1, open + (near ? dt : -dt) * 2.2));
      for (const [m, s] of leaves) m.position.z = s * (DOOR_Z / 2 + open * (DOOR_Z - 0.1));
    });
  }
  plaque(ctx, 'AUTHORISED ASSOCIATES ONLY', -59.36, 3.7, 0, Math.PI / 2, { h: 0.28, color: '#e8eef4', font: '600 64px "Segoe UI", sans-serif' });
  // front desk, brand walls, lounges
  prism(L, [[-55.4, -11], [-53.6, -11], [-53.2, -10.4], [-53.2, -5.6], [-53.6, -5], [-55.4, -5]], 0, 1.1, 'panelGrey');
  L.box(-55.5, -53.1, 1.1, 1.16, -11.1, -4.9, 'woodDeck'); L.box(-53.22, -53.18, 0.15, 0.22, -10.4, -5.6, 'ledBlue');
  ctx.colliders.push({ x0: -55.4, x1: -53.2, z0: -11, z1: -5, y0: ctx.e, y1: ctx.e + 1.1 });
  for (const zc of [-16, 16]) { L.box(-59.7, -59.62, 0.6, 3.9, zc - 5, zc + 5, 'woodSlat'); L.box(-59.72, -59.7, 3.9, 3.98, zc - 5, zc + 5, 'coveWarm'); }
  plaque(ctx, 'GLOBAL CLIENT OUTREACH', -59.58, 2.6, 16, Math.PI / 2, { h: 0.55, color: '#f4efe6', font: '300 86px "Segoe UI", sans-serif', sub: 'Building lasting relationships since Q3' });
  plaque(ctx, 'PARTNER RELATIONS', -59.58, 2.6, -16, Math.PI / 2, { h: 0.55, color: '#f4efe6', font: '300 86px "Segoe UI", sans-serif', sub: 'Your trusted gateway to global yield' });
  for (const [x, z] of [[-51.8, -22.5], [-51.8, 22.5], [-58.6, -22.5], [-58.6, 22.5], [-51.8, -8.5], [-51.8, 8.5]]) planter(L, x, z, 0, 2.0, 1.1);
  for (const zc of [-19, 19]) for (let i = 0; i < 3; i++) { L.box(-57.2 + i * 1.4, -56.4 + i * 1.4, 0, 0.45, zc - 0.7, zc + 0.7, 'leather', { collide: true }); L.box(-57.2 + i * 1.4, -56.4 + i * 1.4, 0.45, 0.95, zc + (zc > 0 ? 0.5 : -0.7), zc + (zc > 0 ? 0.7 : -0.5), 'leather'); }

  // ---------------------------------------------------------------- the operation: ~1,200 desks inside the three halls
  const seats = buildDesks(ctx, L, HALLS.map((h) => ({ rows: hallRows(h.x0, h.rows), y: h.y, dir: 1, sector: h.id })));
  for (const h of HALLS) { // supervisors walking the hall aisles and the walkway behind the glass
    for (const z of [0, -12, 12, -24, 24]) L.person(h.x0 + 4 + Math.abs(z) * 0.3, z, { y: h.y, walk: [[h.x0 + 1.4, z], [BACK - 1.5, z]], speed: 0.8, suit: 0xe6e6e6, skin: SKIN[Math.abs(z) % 6], hair: 0x111111 });
    L.person(h.x0 + 1.3, 0, { y: h.y, walk: [[h.x0 + 1.3, -36], [h.x0 + 1.3, 36]], speed: 1.0, suit: 0x111418, skin: SKIN[2], hair: 0x111111 }); // a guard
  }
  // supervisors' consoles on each terrace, facing the hall glass in front of them
  const sup = buildDesks(ctx, L, [
    { rows: consoleRow(-67.3, 8.6, 19.9), y: -5, dir: 1, sector: 'sup', suit: 0xe6e6e6, emptyRate: 0 },
    { rows: consoleRow(-79.3, 8.6, 30), y: -10, dir: 1, sector: 'sup', suit: 0xe6e6e6, emptyRate: 0 },
    { rows: consoleRow(-93.3, 8.6, 30), y: -15, dir: 1, sector: 'sup', suit: 0xe6e6e6, emptyRate: 0 },
  ], 4242);
  terraceSupport(ctx, L);

  // ---------------------------------------------------------------- arrivals (lift hall) + blade signs
  arrivals(ctx, L);
  for (const t of T) for (const z of [-26, 26]) bladeSign(ctx, L, t.name, 'Global Client Outreach', t.id === 'T3' ? -94 : t.id === 'T1' ? -71.5 : (t.x0 + t.x1) / 2, t.y + 4.6, z, Math.PI / 2, 3.4, t.ceil - 0.9); // off the overlook's sightline

  // ---------------------------------------------------------------- lighting: warm pools + a few real lights
  for (const t of T) {
    const xs = t.id === 'T3' ? [-104, -97, -91] : [(t.x0 * 2 + t.x1) / 3, (t.x0 + t.x1 * 2) / 3];
    for (const x of xs) for (const z of [-27, -15, -6, 6, 15, 27]) pool(L, x, t.y, z, 3.6, 0xffc890);
    for (const z of [-20, 20]) light(ctx, t.id === 'T3' ? -94 : t.id === 'T1' ? -72 : (t.x0 + t.x1) / 2, t.ceil - 0.7, z, 50, 30, 0xffc48a); // T1's kept well past the overlook rail (no glare at eye level)
  }
  for (const h of HALLS) for (const z of [-18, 18]) light(ctx, (h.x0 + BACK) / 2, h.y + HALL_H - 0.25, z, 28, 26, 0xffc890); // tucked under the ceiling (no flare at eye level)
  for (const z of [-16, 16]) light(ctx, -104, 0, z, 80, 36, 0x5fb0ff);
  light(ctx, -55, 3.6, 0, 22, 18, 0xffd2a0);
  for (const [x, z] of [[-55, 0], [-55, 9], [-55, -9], [-55, 18], [-55, -18]]) pool(L, x, 0, z, 3, 0xffd6a8);
  return { seats: seats.concat(sup) };
}
