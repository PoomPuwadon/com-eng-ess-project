import * as THREE from 'three';
import { CH } from '../world/screens.js';
import { Lux, LM, plaque, rugTex } from '../world/lux.js';
import { CARS, BANKS, FLOOR_BY_ID } from '../layout/building.js';
import { LIFT } from '../elevators.js';
import { marketBoard, lobbyDashboard, liftIndicator, miniMonitor } from '../world/lobbyScreens.js';

// ================================================================= PHASE 1 — GROUND FLOOR
// Grand Lobby (L0) and Entrance Plaza, rebuilt in the stylised-luxury look (warm white marble,
// dark walnut panelling, bronze, glass; cube-crystal chandeliers; warm lamps). Layout follows the
// approved greybox: plaza → revolving doors → 2-lane security → open hall (lounges, pool) →
// reception under a mezzanine → lift banks behind glass (staff turnstiles west, guest gates east).
// Atrium: X -30..30, Z -40..30, 48 m glass roof; inner wall faces at X ±29, Z -39 / 29.
// The Link crosses at 15 m (Z ±3) — nothing tall is placed on that line.

const MEZZ = { z0: -39, z1: -33, y: 6.5 }; // mezzanine deck (Members' Mezzanine)
const ESC = { x0: -14.4, x1: -10.4, zTop: -33, zBot: -19.5, steps: 22 }; // escalators (west) / stairs (east, mirrored)
const DESK = { cx: 0, cz: -31, r0: 6.0, r1: 7.0, a0: 0.42, a1: Math.PI - 0.42 }; // curved reception desk
const WARM = 0xffd9a8;

// ---------------------------------------------------------------- reusable furniture
function sofa(L, x, z, yaw, len = 2.4, col = 0x4a2c1c, y = 0) {
  // built along +x, then rotated: seat + back + arms + cushions (leather)
  const g = [];
  const add = (w, h, d, ox, oy, oz) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(ox, oy, oz); g.push(b); };
  add(len, 0.42, 0.95, 0, 0.21, 0); add(len, 0.5, 0.24, 0, 0.62, -0.36); add(0.22, 0.62, 0.95, -len / 2 + 0.11, 0.31, 0); add(0.22, 0.62, 0.95, len / 2 - 0.11, 0.31, 0);
  for (let i = 0; i < Math.round(len / 0.8); i++) add(len / Math.round(len / 0.8) - 0.06, 0.12, 0.7, -len / 2 + (i + 0.5) * (len / Math.round(len / 0.8)), 0.48, 0.08);
  for (const b of g) { b.rotateY(yaw); b.translate(x, y, z); L.geo(b, 'paint', col); }
  const hw = Math.abs(Math.cos(yaw)) * len / 2 + Math.abs(Math.sin(yaw)) * 0.48, hd = Math.abs(Math.sin(yaw)) * len / 2 + Math.abs(Math.cos(yaw)) * 0.48;
  L.ctx.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: L.ctx.e + y, y1: L.ctx.e + y + 0.8 });
}
const armchair = (L, x, z, yaw, col) => sofa(L, x, z, yaw, 1.05, col);
function lamp(L, x, z, y0 = 0, tall = false) {
  if (tall) { L.cyl(x, z, 0.18, y0, y0 + 0.04, 'bronze'); L.cyl(x, z, 0.025, y0, y0 + 1.55, 'bronze', { seg: 6 }); L.cyl(x, z, 0.26, y0 + 1.45, y0 + 1.8, 'lampWarm', { rTop: 0.17, seg: 12, open: false }); }
  else { L.cyl(x, z, 0.08, y0, y0 + 0.32, 'bronze', { seg: 8, rTop: 0.05 }); L.cyl(x, z, 0.2, y0 + 0.3, y0 + 0.55, 'lampWarm', { rTop: 0.13, seg: 12 }); }
}
function plant(L, x, z, s = 1, y0 = 0) {
  L.cyl(x, z, 0.32 * s, y0, y0 + 0.62 * s, 'granite', { rTop: 0.38 * s, seg: 10, collide: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = 0.22 * s;
    const leaf = new THREE.ConeGeometry(0.16 * s, 0.9 * s, 4); leaf.rotateZ(0.5); leaf.rotateY(-a);
    leaf.translate(x + Math.cos(a) * r, y0 + 0.62 * s + 0.4 * s, z + Math.sin(a) * r);
    L.geo(leaf, 'foliage', i % 2 ? 0x3f7a3a : 0x4e8f45);
  }
  const top = new THREE.IcosahedronGeometry(0.34 * s, 0); top.translate(x, y0 + 1.25 * s, z); L.geo(top, 'foliage', 0x3a6f35);
}
function tree(L, x, z, h = 6) {
  L.cyl(x, z, 0.16, 0, h * 0.55, 'paint', { seg: 6, rTop: 0.11, color: 0x5a4030 });
  for (const [dy, r, ox] of [[0.62, 1.5, 0], [0.8, 1.15, 0.35], [0.95, 0.75, -0.2]]) {
    const c = new THREE.IcosahedronGeometry(r * h / 6, 0); c.translate(x + ox, h * dy, z + ox * 0.5); L.geo(c, 'foliage', dy > 0.9 ? 0x5a9a4a : 0x3f7d3a);
  }
}
function sconce(L, x, y, z, nx, nz) { // wall light: bronze plate + glowing glass
  L.box(x - (nz ? 0.18 : 0.03), x + (nz ? 0.18 : 0.03), y - 0.35, y + 0.35, z - (nx ? 0.18 : 0.03), z + (nx ? 0.18 : 0.03), 'bronze');
  L.box(x + nx * 0.08 - (nz ? 0.1 : 0.06), x + nx * 0.08 + (nz ? 0.1 : 0.06), y - 0.25, y + 0.25, z + nz * 0.08 - (nx ? 0.1 : 0.06), z + nz * 0.08 + (nx ? 0.1 : 0.06), 'lampWarm');
}
// cube-crystal chandelier (as in the reference): tiers of glowing cubes on bronze rings
function chandelier(L, ctx, x, z, yTop, scale = 1) {
  const cubes = [];
  for (let k = 0; k < 6; k++) {
    const r = (2.7 - k * 0.42) * scale, y = yTop - k * 0.62 * scale, n = Math.max(1, Math.round(14 - k * 2.2));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * 0.4; cubes.push([x + Math.cos(a) * r, y - (i % 2) * 0.2, z + Math.sin(a) * r, a]); }
    const ring = new THREE.TorusGeometry(r, 0.035, 4, 28); ring.rotateX(Math.PI / 2); ring.translate(x, y + 0.28 * scale, z); L.geo(ring, 'bronze');
  }
  L.cyl(x, z, 0.04, yTop + 0.3, 47.6, 'blackMetal', { seg: 5 });
  const geo = new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.42 * scale);
  const mesh = new THREE.InstancedMesh(geo, LM.crystal, cubes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  cubes.forEach(([cx, cy, cz, a], i) => { q.setFromEuler(e.set(0.35, a, 0.6)); mesh.setMatrixAt(i, m4.compose(p.set(cx, ctx.e + cy, cz), q, s)); });
  mesh.computeBoundingSphere();
  ctx.add(mesh, geo);
}
function pointLight(ctx, x, y, z, intensity, distance, decay = 1.7, color = WARM) {
  const l = new THREE.PointLight(color, intensity, distance, decay);
  l.position.set(x, ctx.e + y, z); ctx.add(l);
  return l;
}

// Lift landing portals on the lobby side walls: a complete, closed assembly per door —
//  * a dark shaft enclosure behind the wall (the tower plinths leave the lift strip open below 15 m)
//  * bronze reveal liners through the wall thickness (car face to cladding face), so no gaps show
//  * a bronze sill bridging car and landing, a granite architrave, a live floor indicator, call buttons
function liftPortals(L, ctx, sx, cars) {
  const front = sx * 28.8; // liner front, 4 cm proud of the cladding face
  for (const { c, zc, hw } of cars) {
    const dw = c.doorW, dh = c.doorH, carFace = sx < 0 ? c.x1 - 0.25 : c.x0 + 0.25;
    const X = (a, b) => [Math.min(a, b), Math.max(a, b)];
    // shaft enclosure (y 0..15; the tower floors build their own shaft walls above)
    L.box(...X(sx < 0 ? c.x0 : c.x1 - 0.2, sx < 0 ? c.x0 + 0.2 : c.x1), -0.2, 15, c.z0, c.z1, 'blackMetal');
    for (const zz of [c.z0, c.z1 - 0.2]) L.box(c.x0, c.x1, -0.2, 15, zz, zz + 0.2, 'blackMetal');
    // reveal liners (jambs + head) and sill
    L.box(...X(carFace + sx * 0.01, front), 0, dh + 0.85, zc - hw, zc - dw / 2 - 0.02, 'bronze');
    L.box(...X(carFace + sx * 0.01, front), 0, dh + 0.85, zc + dw / 2 + 0.02, zc + hw, 'bronze');
    L.box(...X(carFace + sx * 0.01, front), dh - 0.02, dh + 0.85, zc - dw / 2 - 0.02, zc + dw / 2 + 0.02, 'bronze');
    L.box(...X(carFace + sx * 0.01, front), -0.02, 0.03, zc - dw / 2 - 0.02, zc + dw / 2 + 0.02, 'brushedBronze');
    // granite architrave standing proud of the wall
    L.box(...X(front, front + sx * 0.08), 0, dh + 1.1, zc - hw - 0.26, zc - hw, 'granite');
    L.box(...X(front, front + sx * 0.08), 0, dh + 1.1, zc + hw, zc + hw + 0.26, 'granite');
    L.box(...X(front, front + sx * 0.08), dh + 0.85, dh + 1.1, zc - hw, zc + hw, 'granite');
    // call buttons on the right-hand architrave
    L.box(...X(front + sx * 0.08, front + sx * 0.1), 1.05, 1.45, zc + hw + 0.05, zc + hw + 0.21, 'bronze');
    for (const y of [1.15, 1.33]) L.box(...X(front + sx * 0.1, front + sx * 0.115), y - 0.04, y + 0.04, zc + hw + 0.09, zc + hw + 0.17, 'lampWarm');
    // live floor indicator above the door
    liftIndicator(ctx, front + sx * 0.09, dh + 1.42, zc, sx < 0 ? Math.PI / 2 : -Math.PI / 2, () => liftState(c.id));
  }
}
const FLOOR_SHORT = (id) => (id === 'L0' ? 'L' : id === 'B1' ? 'B1' : id.slice(-1));
function liftState(id) {
  const sys = LIFT.sys; if (!sys) return null;
  const c = sys.byId[id]; if (!c) return null;
  const stops = BANKS[c.bank].stops;
  const near = stops.reduce((a, b) => (Math.abs(FLOOR_BY_ID[b].elevation - c.y) < Math.abs(FLOOR_BY_ID[a].elevation - c.y) ? b : a));
  const next = c.queue[0];
  const dir = next ? (FLOOR_BY_ID[next].elevation > c.y + 0.05 ? '▲' : FLOOR_BY_ID[next].elevation < c.y - 0.05 ? '▼' : '') : '';
  return { label: c.label, floor: FLOOR_SHORT(c.at || near), dir };
}

// ================================================================= L0 GRAND LOBBY
export function lobby(ctx) {
  const L = new Lux(ctx);

  // ---- floor: polished marble with bronze inlay borders and a star medallion
  L.floor(-29, 29, -39, 29, 0.012, 'marble');
  for (const [x0, x1, z0, z1] of [[-27.5, 27.5, -31.5, -31.35], [-27.5, 27.5, 21.6, 21.75], [-27.6, -27.45, -31.5, 21.75], [27.45, 27.6, -31.5, 21.75]]) L.box(x0, x1, 0.012, 0.02, z0, z1, 'bronze');
  for (let i = 0; i < 8; i++) { // compass-star inlay in front of security
    const b = new THREE.BoxGeometry(0.16, 0.01, i % 2 ? 2.2 : 3.6); b.rotateY((i / 8) * Math.PI); b.translate(0, 0.02, 15.5); L.geo(b, 'bronze');
  }
  { const r = new THREE.RingGeometry(1.9, 2.05, 48).rotateX(-Math.PI / 2); r.translate(0, 0.021, 15.5); L.geo(r, 'bronze'); }

  // ---- walls (0..15 m): walnut panelling, bronze reveals, granite skirting, bronze bands, sconces
  // Cladding stands 4 cm clear of the structural wall (no shared surfaces, so nothing flickers).
  // West / east walls: every lift landing gets a complete portal (see liftPortals).
  const landingCars = (sx) => CARS.filter((c) => BANKS[c.bank].stops.includes('L0') && (sx < 0 ? c.x1 <= -29.9 : c.x0 >= 29.9))
    .map((c) => ({ c, zc: (c.z0 + c.z1) / 2, hw: c.doorW / 2 + 0.4 })).sort((p, q) => p.zc - q.zc);
  for (const sx of [-1, 1]) {
    const x = sx * 28.9, cars = landingCars(sx);
    const spans = [];
    let z = -39; for (const { zc, hw } of cars) { spans.push([z, zc - hw - 0.26]); z = zc + hw + 0.26; } spans.push([z, 29]);
    for (const [za, zb] of spans) if (zb - za > 0.05) {
      L.box(x - 0.06, x + 0.06, 0.25, 4.6, za, zb, 'walnut'); L.box(x - 0.08, x + 0.08, 0, 0.25, za, zb, 'granite');
    }
    L.box(x - 0.06, x + 0.06, 4.6, 15, -39, 29, 'walnut');
    for (const y of [6.6, 14.7]) L.box(x - 0.1, x + 0.1, y - 0.06, y + 0.06, -39, 29, 'bronze');
    for (let zz = -36.6; zz < 29; zz += 2.4) L.box(x - 0.09, x + 0.09, 4.66, 14.64, zz - 0.02, zz + 0.02, 'bronze');
    L.box(x - 0.1, x + 0.1, 4.54, 4.66, -39, 29, 'bronze');
    liftPortals(L, ctx, sx, cars);
    for (const zz of [-2, 10, 22]) sconce(L, x - sx * 0.08, 2.6, zz, -sx, 0);
  }
  for (const sz of [-1, 1]) { // north / south walls
    const z = sz < 0 ? -38.9 : 28.9, top = sz < 0 ? 14 : 15;
    const runs = sz > 0 ? [[-29, -5.3], [5.3, 29]] : [[-29, 29]];
    for (const [xa, xb] of runs) { L.box(xa, xb, 0.25, sz > 0 ? 6.6 : top, z - 0.06, z + 0.06, 'walnut'); L.box(xa, xb, 0, 0.25, z - 0.08, z + 0.08, 'granite'); }
    if (sz > 0) L.box(-29, 29, 6.6, 15, z - 0.06, z + 0.06, 'walnut');
    for (const y of [3.3, 6.6, top - 0.3]) for (const [xa, xb] of (sz > 0 && y < 6.6 ? runs : [[-29, 29]])) L.box(xa, xb, y - 0.06, y + 0.06, z - 0.1, z + 0.1, 'bronze');
    for (let xx = -26.4; xx < 29; xx += 2.4) if (!(sz > 0 && Math.abs(xx) < 5.6)) L.box(xx - 0.02, xx + 0.02, 0.3, top - 0.3, z - 0.09, z + 0.09, 'bronze');
    if (sz > 0) for (const xx of [-24, -16, 16, 24]) sconce(L, xx, 3.0, z - 0.08, 0, -1);
  }
  // gold geometric art panels either side of the entrance (inside)
  for (const sx of [-1, 1]) for (const [xx, y, s] of [[sx * 12, 9.6, 2.2], [sx * 19, 10.6, 3.0]]) {
    const f = new THREE.BoxGeometry(s, s, 0.08); f.rotateZ(Math.PI / 4); f.translate(xx, y, 28.85); L.geo(f, 'walnut');
    for (const k of [0.8, 0.55, 0.3]) { const g = new THREE.TorusGeometry(s * k * 0.7, 0.04, 3, 4); g.rotateZ(Math.PI / 4); g.translate(xx, y, 28.78); L.geo(g, 'gold'); }
  }
  // side walls above 15 m: walnut panelling to the roof (no glass — the towers stand right behind),
  // with tall bronze reveals; openings left for The Link (Y 15..19, Z ±3)
  for (const sx of [-1, 1]) {
    const x = sx * 28.9;
    for (const [za, zb] of [[-39, -3.2], [3.2, 29]]) L.box(x - 0.06, x + 0.06, 15, 47.6, za, zb, 'walnut');
    L.box(x - 0.06, x + 0.06, 19.2, 47.6, -3.2, 3.2, 'walnut');
    for (let zz = -36; zz <= 28; zz += 4) if (Math.abs(zz) > 4) L.box(x - 0.1, x + 0.1, 15, 47.6, zz - 0.05, zz + 0.05, 'bronze');
    for (const y of [24, 33, 42]) L.box(x - 0.1, x + 0.1, y - 0.06, y + 0.06, -39, 29, 'bronze');
    L.box(x - sx * 0.05 - 0.1, x - sx * 0.05 + 0.1, 19.2, 19.5, -3.4, 3.4, 'bronze'); // bridge portal lintel
  }
  for (let xx = -28; xx <= 28; xx += 4) L.box(xx - 0.06, xx + 0.06, 15, 47.6, 28.85, 28.97, 'bronze');

  // ---- the massive screen (north wall) in a bronze frame, firm name below it
  lobbyDashboard(ctx, 0, 30.25, -38.62, 0, 56, 31.5); // sharp 1920 x 1080 market dashboard
  L.box(-28.6, 28.6, 13.9, 14.25, -38.84, -38.5, 'bronze'); L.box(-28.6, 28.6, 46.25, 46.6, -38.84, -38.5, 'bronze');
  for (const xx of [-28.6, 28.25]) L.box(xx, xx + 0.35, 13.9, 46.6, -38.84, -38.5, 'bronze');
  plaque(ctx, '{FIRM NAME}', 0, 10.6, -38.8, 0, { h: 2.0, sub: 'Excellence. Discretion. Liquidity.' });

  // ---- columns (4, full height): marble shafts, bronze bases and capitals
  for (const x of [-16, 16]) for (const z of [-16, 20]) {
    L.cyl(x, z, 0.95, 0, 47.6, 'marble', { seg: 16, collide: true });
    L.cyl(x, z, 1.15, 0, 0.5, 'bronze', { seg: 16 }); L.cyl(x, z, 1.1, 14.4, 15, 'bronze', { seg: 16 }); L.cyl(x, z, 1.05, 6.4, 6.6, 'bronze', { seg: 16 });
  }

  // ---- chandeliers (cube crystal), clear of The Link and the screen sightline, + their light
  for (const [x, z] of [[-22, 14], [22, 14], [-22, -15], [22, -15]]) { chandelier(L, ctx, x, z, 21); pointLight(ctx, x, 18, z, 220, 50, 1.6); }

  // ---- security: revolving doors → 2 lanes (walk-through arches + bag x-ray) → hall
  for (const sx of [-1, 1]) { // glass channel from the doors to the scanners (bronze-framed)
    L.box(sx * 4.8 - 0.06, sx * 4.8 + 0.06, 0, 2.6, 24.1, 28.6, 'glass');
    ctx.colliders.push({ x0: sx * 4.8 - 0.1, x1: sx * 4.8 + 0.1, z0: 24.1, z1: 28.6, y0: 0, y1: 3 });
    L.box(sx * 4.8 - 0.09, sx * 4.8 + 0.09, 2.6, 2.75, 24.1, 28.6, 'bronze');
    for (const zz of [24.1, 26.35, 28.6]) L.box(sx * 4.8 - 0.08, sx * 4.8 + 0.08, 0, 2.75, zz - 0.06, zz + 0.06, 'bronze');
  }
  for (const sx of [-1, 1]) {
    const ax = sx * 2.5; // walk-through arch, in line with the revolving-door drums
    for (const px of [ax - 0.76, ax + 0.6]) L.box(px, px + 0.16, 0, 2.3, 24.7, 25.3, 'steel', { collide: true }); // passage 1.2 m
    L.box(ax - 0.76, ax + 0.76, 2.3, 2.55, 24.7, 25.3, 'steel'); L.box(ax - 0.6, ax + 0.6, 2.4, 2.46, 24.68, 25.32, 'downlight');
    L.box(ax - 0.77, ax - 0.75, 0.8, 2.0, 24.8, 25.2, 'lampWarm');
    const xx = sx * 4.05; // bag x-ray machine with roller conveyors
    L.box(xx - 0.42, xx + 0.42, 0.6, 1.75, 24.0, 26.0, 'paint', { collide: true, color: 0xd9dcdf, round: 0.08 });
    L.box(xx - 0.5, xx + 0.5, 0.6, 1.2, 23.98, 26.02, 'rubber');
    L.box(xx - 0.5, xx + 0.5, 0.75, 0.82, 22.6, 27.4, 'steel'); L.box(xx - 0.45, xx + 0.45, 0, 0.75, 22.6, 22.8, 'blackMetal'); L.box(xx - 0.45, xx + 0.45, 0, 0.75, 27.2, 27.4, 'blackMetal');
    miniMonitor(ctx, xx - sx * 0.435, 1.45, 23.4, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0.45, 0.3, 'xray');
    L.box(xx - 0.25, xx + 0.25, 0.82, 0.92, 26.6, 27.1, 'paint', { color: 0x30343a }); // tray
  }
  L.box(-1.76, 1.76, 0, 2.2, 24.9, 25.1, 'glass'); ctx.colliders.push({ x0: -1.76, x1: 1.76, z0: 24.85, z1: 25.15, y0: 0, y1: 2.2 });
  L.box(-0.08, 0.08, 0, 2.3, 24.85, 25.15, 'bronze');
  L.box(-4.9, 4.9, 3.0, 3.6, 24.6, 25.4, 'walnut'); L.box(-4.9, 4.9, 2.92, 3.0, 24.6, 25.4, 'bronze');
  plaque(ctx, 'ASSET PROTECTION SCREENING', 0, 3.3, 25.42, 0, { h: 0.34 }); // faces the arriving guest
  plaque(ctx, 'ASSET PROTECTION SCREENING', 0, 3.3, 24.58, Math.PI, { h: 0.34 });
  // planters beside the channel (marble, shrubs, small trees)
  for (const sx of [-1, 1]) for (const [a, b] of [[6.5, 13], [15, 21.5], [23.5, 28.5]]) {
    const x0 = sx < 0 ? -b : a, x1 = sx < 0 ? -a : b, cx = (x0 + x1) / 2;
    L.box(x0, x1, 0, 0.7, 25.2, 28.6, 'marble', { collide: true, round: 0.06 }); L.box(x0 - 0.02, x1 + 0.02, 0.62, 0.7, 25.18, 28.62, 'bronze');
    L.box(x0 + 0.2, x1 - 0.2, 0.68, 0.72, 25.4, 28.4, 'paint', { color: 0x3b2a1a });
    for (let x = x0 + 0.9; x < x1 - 0.4; x += 1.4) { const b2 = new THREE.IcosahedronGeometry(0.62, 0); b2.scale(1, 0.75, 1); b2.translate(x, 1.05, 26.9 + Math.sin(x) * 0.4); L.geo(b2, 'foliage', 0x447f3c); }
    tree(L, cx, 26.9, 4.6);
  }

  // ---- revolving doors (2 drums) in the entrance; wings turn slowly
  const wingGroups = [];
  for (const cx of [-2.5, 2.5]) {
    L.cyl(cx, 29.5, 1.68, 0, 0.03, 'granite', { seg: 32 }); L.cyl(cx, 29.5, 1.72, 2.55, 2.9, 'bronze', { seg: 32 });
    for (const [a0, a1] of [[Math.PI * 0.62, Math.PI * 1.38], [-Math.PI * 0.38, Math.PI * 0.38]]) {
      const g = new THREE.CylinderGeometry(1.65, 1.65, 2.55, 20, 1, true, Math.PI / 2 - a1, a1 - a0); g.translate(cx, 1.275, 29.5); L.geo(g, 'glass');
    }
    for (const sx of [-1, 1]) ctx.colliders.push({ x0: cx + sx * 1.6 - 0.08, x1: cx + sx * 1.6 + 0.08, z0: 28.7, z1: 30.3, y0: 0, y1: 2.6 });
    const grp = new THREE.Group(); grp.position.set(cx, ctx.e, 29.5);
    for (let k = 0; k < 4; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.4, 0.05), LM.glass); w.position.set(0.8, 1.25, 0); const piv = new THREE.Group(); piv.rotation.y = (k * Math.PI) / 2; piv.add(w); grp.add(piv); }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.55, 10), LM.bronze); shaft.position.set(0, 1.275, 0); grp.add(shaft);
    ctx.add(grp); wingGroups.push(grp);
  }
  L.box(-0.85, 0.85, 0, 2.9, 29.42, 29.58, 'glass'); ctx.colliders.push({ x0: -0.85, x1: 0.85, z0: 29.35, z1: 29.65, y0: 0, y1: 2.9 });
  for (const sx of [-1, 1]) { L.box(sx * 4.15, sx * 5.3, 0, 6.6, 28.6, 30.4, 'bronze', { collide: true }); L.box(sx * 0.8, sx * 0.95, 0, 2.9, 29.3, 29.7, 'bronze'); }
  L.box(-5.3, 5.3, 2.9, 6.6, 28.8, 29.2, 'walnut'); L.box(-5.3, 5.3, 6.4, 6.6, 28.6, 30.4, 'bronze');
  ctx.onUpdate((dt) => { for (const g of wingGroups) g.rotation.y += dt * 0.35; });

  // ---- lounges (west / east): rugs, leather sofas, armchairs, tables, lamps, plants
  for (const sx of [-1, 1]) {
    const cx = sx * 14.5, cz = 14;
    const rt = sx < 0 ? rugTex('rugW', '#2c3a52', '#b8924a', '#d7c08a') : rugTex('rugE', '#5b1f2b', '#b8924a', '#e3c88f');
    const rm = new THREE.MeshStandardMaterial({ map: rt, roughness: 1 });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(11, 9).rotateX(-Math.PI / 2), rm); rug.position.set(cx, ctx.e + 0.02, cz); rug.receiveShadow = true; ctx.add(rug, rug.geometry, rm);
    sofa(L, cx, cz - 2.6, 0, 3.2, 0x5b3a26); sofa(L, cx, cz + 2.6, Math.PI, 3.2, 0x5b3a26);
    armchair(L, cx - 3.4, cz, Math.PI / 2, 0x7a5a3a); armchair(L, cx + 3.4, cz, -Math.PI / 2, 0x7a5a3a);
    L.box(cx - 1.1, cx + 1.1, 0.36, 0.42, cz - 0.7, cz + 0.7, 'marble', { round: 0.04 }); L.box(cx - 1.0, cx + 1.0, 0, 0.36, cz - 0.6, cz + 0.6, 'walnut', { collide: true });
    for (const ox of [-2.3, 2.3]) { L.box(cx + ox - 0.3, cx + ox + 0.3, 0, 0.55, cz - 2.6 - 0.3, cz - 2.6 + 0.3, 'walnut', { collide: true }); lamp(L, cx + ox, cz - 2.6, 0.55); }
    for (const ox of [-2.3, 2.3]) { L.box(cx + ox - 0.3, cx + ox + 0.3, 0, 0.55, cz + 2.6 - 0.3, cz + 2.6 + 0.3, 'walnut', { collide: true }); lamp(L, cx + ox, cz + 2.6, 0.55); }
    for (const [ox, oz] of [[-5, -3.9], [5, -3.9], [-5, 3.9], [5, 3.9]]) lamp(L, cx + ox, cz + oz, 0, true);
    for (const [ox, oz] of [[-5.3, 0], [5.3, 0]]) plant(L, cx + ox, cz + oz, 1.25);
    L.box(cx - 0.3, cx + 0.3, 0.42, 0.5, cz - 0.2, cz + 0.2, 'gold');
  }

  // ---- reflection pool under The Link: black granite basin, water, gold sculpture, jets
  L.box(-7.6, 7.6, 0, 0.55, -4.6, -4.2, 'granite', { collide: true }); L.box(-7.6, 7.6, 0, 0.55, 4.2, 4.6, 'granite', { collide: true });
  L.box(-7.6, -7.2, 0, 0.55, -4.2, 4.2, 'granite', { collide: true }); L.box(7.2, 7.6, 0, 0.55, -4.2, 4.2, 'granite', { collide: true });
  for (const [x0, x1, z0, z1] of [[-7.65, 7.65, -4.65, -4.15], [-7.65, 7.65, 4.15, 4.65], [-7.65, -7.15, -4.15, 4.15], [7.15, 7.65, -4.15, 4.15]]) L.box(x0, x1, 0.55, 0.6, z0, z1, 'bronze');
  L.box(-7.2, 7.2, 0, 0.1, -4.2, 4.2, 'granite');
  { const w = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 8.4).rotateX(-Math.PI / 2), LM.water); w.position.set(0, ctx.e + 0.45, 0); w.renderOrder = 4; ctx.add(w, w.geometry); }
  ctx.colliders.push({ x0: -7.2, x1: 7.2, z0: -4.2, z1: 4.2, y0: 0, y1: 0.55 });
  for (let i = 0; i < 9; i++) { // twisted gold sculpture
    const b = new THREE.BoxGeometry(1.4 - i * 0.07, 0.62, 1.4 - i * 0.07); b.rotateY(i * 0.32); b.translate(0, 0.75 + i * 0.66, 0); L.geo(b, 'gold');
  }
  L.cyl(0, 0, 1.1, 0.1, 0.7, 'granite', { seg: 12 });
  const jetGeo = new THREE.CylinderGeometry(0.035, 0.07, 1, 6); jetGeo.translate(0, 0.5, 0);
  const jets = new THREE.InstancedMesh(jetGeo, LM.jet, 12);
  const jm = new THREE.Matrix4(), jq = new THREE.Quaternion(), jp = new THREE.Vector3(), js = new THREE.Vector3();
  ctx.add(jets, jetGeo);
  ctx.onUpdate((dt, t) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, h = 1.6 + Math.sin(t * 1.7 + i * 0.9) * 0.5;
      jets.setMatrixAt(i, jm.compose(jp.set(Math.cos(a) * 3.2, ctx.e + 0.45, Math.sin(a) * 2.6 * 1.0), jq, js.set(1, h, 1)));
    }
    jets.instanceMatrix.needsUpdate = true;
    LM.water.emissiveMap.offset.set(t * 0.012, t * 0.008);
  });

  // ---- mezzanine (Members' Mezzanine) over reception, reached by escalators (west) and stairs (east)
  L.box(-29, 29, MEZZ.y - 0.5, MEZZ.y, MEZZ.z0, MEZZ.z1, 'walnut');
  L.floor(-29, 29, MEZZ.z0, MEZZ.z1, MEZZ.y + 0.005, 'marble');
  ctx.colliders.push({ x0: -29, x1: 29, z0: MEZZ.z0, z1: MEZZ.z1, y0: MEZZ.y - 0.5, y1: MEZZ.y });
  L.box(-29, 29, MEZZ.y - 0.55, MEZZ.y - 0.5, MEZZ.z0, MEZZ.z1, 'paint', { color: 0xf3eee6 }); // soffit
  for (let x = -26; x <= 26; x += 3.25) for (const z of [-37.5, -34.5]) L.box(x - 0.18, x + 0.18, MEZZ.y - 0.58, MEZZ.y - 0.55, z - 0.18, z + 0.18, 'downlight');
  L.box(-29, 29, MEZZ.y - 0.55, MEZZ.y + 0.05, MEZZ.z1 - 0.05, MEZZ.z1 + 0.15, 'bronze'); // fascia edge
  const openings = [[ESC.x0, ESC.x1], [-ESC.x1, -ESC.x0]];
  const railRuns = [[-29, openings[0][0]], [openings[0][1], openings[1][0]], [openings[1][1], 29]];
  for (const [xa, xb] of railRuns) { // glass balustrade with bronze top rail
    L.box(xa, xb, MEZZ.y, MEZZ.y + 1.05, MEZZ.z1 - 0.04, MEZZ.z1 + 0.04, 'glass');
    L.box(xa, xb, MEZZ.y + 1.05, MEZZ.y + 1.12, MEZZ.z1 - 0.06, MEZZ.z1 + 0.06, 'bronze');
    ctx.colliders.push({ x0: xa, x1: xb, z0: MEZZ.z1 - 0.1, z1: MEZZ.z1 + 0.1, y0: MEZZ.y, y1: MEZZ.y + 1.12 });
  }
  for (const x of [-21, -8, 8, 21]) L.cyl(x, MEZZ.z1 + 0.6, 0.32, 0, MEZZ.y - 0.5, 'bronze', { seg: 12, collide: true });
  // escalators (2 lanes, static treads) and a marble stair, both rising north to the deck
  const rise = MEZZ.y / ESC.steps, tread = (ESC.zBot - ESC.zTop) / ESC.steps;
  for (const sx of [-1, 1]) {
    const xa = sx < 0 ? ESC.x0 : -ESC.x1, xb = sx < 0 ? ESC.x1 : -ESC.x0;
    for (let k = 0; k < ESC.steps; k++) {
      const z1 = ESC.zBot - k * tread, z0 = z1 - tread, h = (k + 1) * rise;
      L.box(xa + 0.15, xb - 0.15, h - 0.12, h, z0, z1, sx < 0 ? 'steel' : 'marble');
      ctx.colliders.push({ x0: xa, x1: xb, z0, z1, y0: 0, y1: h });
    }
    // truss / side skirts as one sloped slab under the steps
    const len = Math.hypot(ESC.zBot - ESC.zTop, MEZZ.y), ang = Math.atan2(MEZZ.y, ESC.zBot - ESC.zTop);
    const side = (x0, x1, mat) => { const g = new THREE.BoxGeometry(x1 - x0, 0.9, len); g.rotateX(ang); g.translate((x0 + x1) / 2, MEZZ.y / 2 - 0.15, (ESC.zBot + ESC.zTop) / 2); L.geo(g, mat); };
    side(xa, xa + 0.15, sx < 0 ? 'blackMetal' : 'bronze'); side(xb - 0.15, xb, sx < 0 ? 'blackMetal' : 'bronze');
    if (sx < 0) side(-12.47, -12.33, 'blackMetal');
    const rail = (x) => { const g = new THREE.BoxGeometry(0.1, 0.1, len); g.rotateX(ang); g.translate(x, MEZZ.y / 2 + 1.0, (ESC.zBot + ESC.zTop) / 2); L.geo(g, sx < 0 ? 'rubber' : 'bronze');
      const gl = new THREE.BoxGeometry(0.03, 0.9, len); gl.rotateX(ang); gl.translate(x, MEZZ.y / 2 + 0.5, (ESC.zBot + ESC.zTop) / 2); L.geo(gl, 'glass'); };
    rail(xa + 0.08); rail(xb - 0.08); if (sx < 0) rail(-12.4);
  }
  // mezzanine lounge + bar
  for (const x of [-22, -12, 12, 22]) { sofa(L, x, -36.8, Math.PI, 2.6, 0x3a2a22, MEZZ.y); L.box(x - 0.7, x + 0.7, MEZZ.y, MEZZ.y + 0.4, -35.4, -34.8, 'marble'); }
  for (const p of [[-26, -35], [26, -35], [-17, -37.8], [17, -37.8]]) plant(L, p[0], p[1], 1.1, MEZZ.y);
  L.box(-4.5, 4.5, MEZZ.y, MEZZ.y + 1.1, -38.4, -37.4, 'walnut', { collide: true }); L.box(-4.6, 4.6, MEZZ.y + 1.1, MEZZ.y + 1.18, -38.5, -37.3, 'marble');
  for (let x = -3.5; x <= 3.5; x += 1.75) { L.cyl(x, -36.7, 0.2, MEZZ.y + 0.7, MEZZ.y + 0.78, 'leather', { seg: 10 }); L.cyl(x, -36.7, 0.04, MEZZ.y, MEZZ.y + 0.7, 'bronze', { seg: 6 }); }
  plaque(ctx, "Members' Mezzanine", 0, MEZZ.y + 2.6, -38.8, 0, { h: 0.45 });

  // ---- reception: curved walnut desk with bronze top, lamps, monitors; back-lit onyx wall
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a0 = DESK.a0 + ((DESK.a1 - DESK.a0) * i) / segs, a1 = DESK.a0 + ((DESK.a1 - DESK.a0) * (i + 1)) / segs, am = (a0 + a1) / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, DESK.r1, a0, a1, false); shape.absarc(0, 0, DESK.r0, a1, a0, true);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: false, curveSegments: 3 });
    body.rotateX(Math.PI / 2); body.translate(DESK.cx, 1.05, DESK.cz); L.geo(body, 'walnut');
    const top = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 3 });
    top.rotateX(Math.PI / 2); top.translate(DESK.cx, 1.12, DESK.cz); L.geo(top, 'bronze');
    const mx = DESK.cx + Math.cos(am) * 6.5, mz = DESK.cz + Math.sin(am) * 6.5;
    ctx.colliders.push({ x0: mx - 0.55, x1: mx + 0.55, z0: mz - 0.55, z1: mz + 0.55, y0: 0, y1: 1.1 });
  }
  { const shape = new THREE.Shape(); shape.absarc(0, 0, DESK.r1 + 0.01, DESK.a0 + 0.55, DESK.a1 - 0.55, false); shape.absarc(0, 0, DESK.r1 - 0.02, DESK.a1 - 0.55, DESK.a0 + 0.55, true);
    const band = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 16 }); band.rotateX(Math.PI / 2); band.translate(DESK.cx, 0.2, DESK.cz); L.geo(band, 'lampWarm'); }
  plaque(ctx, '{FIRM NAME}', DESK.cx, 0.62, DESK.cz + DESK.r1 + 0.03, 0, { h: 0.42 });
  for (const a of [DESK.a0 + 0.12, DESK.a1 - 0.12]) lamp(L, DESK.cx + Math.cos(a) * 6.5, DESK.cz + Math.sin(a) * 6.5, 1.12);
  for (const a of [1.0, 1.35, 1.79, 2.14]) miniMonitor(ctx, DESK.cx + Math.cos(a) * 6.2, 1.42, DESK.cz + Math.sin(a) * 6.2, Math.atan2(-Math.cos(a), -Math.sin(a)), 0.55, 0.34, 'desk');
  L.box(-9, 9, 0.3, 5.8, -38.83, -38.78, 'onyx'); // back-lit onyx wall under the mezzanine
  L.box(-9.2, 9.2, 0.25, 0.32, -38.84, -38.74, 'bronze'); L.box(-9.2, 9.2, 5.8, 5.88, -38.84, -38.74, 'bronze');
  plaque(ctx, '{FIRM NAME}', 0, 3.4, -38.76, 0, { h: 0.9, color: '#3a2410' });
  pointLight(ctx, 0, 5.2, -29, 28, 16, 1.8);
  // concierge (east, under the mezzanine edge)
  L.box(14.8, 18.6, 0, 1.05, -31.2, -30.2, 'walnut', { collide: true, round: 0.05 }); L.box(14.7, 18.7, 1.05, 1.12, -31.3, -30.1, 'bronze');
  lamp(L, 15.2, -30.7, 1.12); plaque(ctx, 'Concierge', 16.7, 0.6, -30.15, 0, { h: 0.28 });

  // ---- lift enclosures: bronze-framed glass fences, staff speed gates (west), guest gates (east)
  for (const s of [-1, 1]) {
    const fx = s * 21.15;
    for (const [za, zb] of [[-38.7, -25], [-19, -6.15]]) {
      L.box(fx - 0.04, fx + 0.04, 0, 2.2, za, zb, 'glass');
      L.box(fx - 0.06, fx + 0.06, 2.2, 2.3, za, zb, 'bronze');
      for (let z = za; z <= zb + 0.01; z += (zb - za) / Math.max(1, Math.round((zb - za) / 3))) L.box(fx - 0.07, fx + 0.07, 0, 2.3, z - 0.05, z + 0.05, 'bronze');
      ctx.colliders.push({ x0: fx - 0.15, x1: fx + 0.15, z0: za, z1: zb, y0: 0, y1: 2.2 });
    }
    const xa = Math.min(fx, s * 29), xb = Math.max(fx, s * 29);
    L.box(xa, xb, 0, 2.2, -6.19, -6.11, 'glass'); L.box(xa, xb, 2.2, 2.3, -6.21, -6.09, 'bronze');
    ctx.colliders.push({ x0: xa, x1: xb, z0: -6.3, z1: -6.0, y0: 0, y1: 2.2 });
    for (const z of [-25, -19]) L.box(fx - 0.3, fx + 0.3, 0, 3.4, z - 0.3, z + 0.3, 'bronze', { collide: true });
    L.box(fx - 0.25, fx + 0.25, 3.0, 3.6, -25.3, -18.7, 'walnut'); L.box(fx - 0.27, fx + 0.27, 2.95, 3.0, -25.3, -18.7, 'bronze');
    plaque(ctx, s < 0 ? 'OFFICE TOWER · Staff' : 'WELLNESS TOWER · Guests', fx + s * 0.28, 3.3, -22, s < 0 ? -Math.PI / 2 : Math.PI / 2, { h: 0.3 });
  }
  ctx.barrier(-21.3, -21, -25, -19, 1.2, 'staff_side', 'staff_turnstiles');
  ctx.barriers[ctx.barriers.length - 1].mesh.visible = false; // the speed gates below are the visible gate
  for (const z of [-24.6, -22.8, -21.2, -19.4]) { // speed-gate cabinets with glass flaps (decor; the lock is the barrier)
    L.box(-22.0, -20.3, 0, 1.0, z - 0.14, z + 0.14, 'steel'); L.box(-21.95, -20.35, 1.0, 1.04, z - 0.15, z + 0.15, 'blackMetal');
    L.box(-21.85, -21.75, 1.04, 1.06, z - 0.1, z + 0.1, 'downlight');
  }
  for (const z of [-23.7, -22.0, -20.3]) L.box(-21.2, -21.1, 0.3, 1.1, z - 0.7, z + 0.7, 'glass');
  for (const z of [-24.6, -22.8, -21.2, -19.4]) L.box(20.3, 22.0, 0, 1.0, z - 0.12, z + 0.12, 'steel'); // open guest gates
  for (const [sx, yaw] of [[-1, Math.PI / 2], [1, -Math.PI / 2]]) {
    const xw = sx * 28.7, ot = sx < 0;
    plaque(ctx, ot ? 'OFFICE LOW-RISE · B1 · L · 1–2' : 'WELLNESS LOW-RISE · L · 1–2', xw, 5.05, -32.2, yaw, { h: 0.3 });
    plaque(ctx, 'CHIEF EXECUTIVE LIFT', xw, 5.05, -23.4, yaw, { h: 0.3 });
    plaque(ctx, ot ? 'OFFICE HIGH-RISE · L · 3–5' : 'WELLNESS HIGH-RISE · L · 3–4', xw, 5.05, -14.6, yaw, { h: 0.3 });
    for (const zz of [-28.2, -12.2]) { // market boards above the lift portals (own canvases, true aspect)
      marketBoard(ctx, sx * 28.74, 7.6, zz, yaw, 8.4, 2.4, ot ? 'US EQUITIES' : 'GLOBAL MARKETS');
      for (const yb of [6.3, 8.9]) L.box(sx * 28.8 - 0.05, sx * 28.8 + 0.05, yb - 0.07, yb + 0.07, zz - 4.35, zz + 4.35, 'bronze');
    }
  }
  for (const [x, z] of [[-24, -4], [24, -4], [-27.5, 24], [27.5, 24], [-27.5, -2], [27.5, -2]]) plant(L, x, z, 1.4);

  // ---- people
  const guard = { suit: 0x141518, hair: 0x0e0e0e };
  for (const [x, z, yaw] of [[-4.05, 22.3, Math.PI], [4.05, 22.3, Math.PI], [0, 24.3, 0], [-20.2, -18.2, Math.PI / 2], [-6, 23.2, 0], [6, 23.2, 0]]) L.person(x, z, { yaw, ...guard });
  for (const a of [1.15, 1.6, 2.0]) L.person(DESK.cx + Math.cos(a) * 5.2, DESK.cz + Math.sin(a) * 5.2, { yaw: Math.atan2(Math.cos(a), Math.sin(a)), suit: 0x22304a, skin: [0xd8a47f, 0xb07a54, 0xeac2a0][Math.round(a * 3) % 3] });
  L.person(16.7, -31.9, { suit: 0x22304a });
  const suits = [0x1f2a44, 0x2b2b2e, 0x3d3a36, 0x5a1f2b, 0x6b6f75, 0xc9b79c, 0x1d3b33];
  const skins = [0xd8a47f, 0xb07a54, 0xeac2a0, 0x8a5a3c, 0xf0cfb0];
  const walks = [[[0, 21], [0, 10], [-9, 6], [-9, -12], [0, -19], [9, -12], [9, 6], [0, 10]], [[-12, 6], [-18, 2], [-20, -18], [-12, -17], [-8, -10]], [[12, 6], [19, -10], [19, -21], [12, -18], [9, -6]],
    [[-2, 18], [-9, 22], [-20, 22], [-24, 8], [-9, 6]], [[3, 18], [10, 22], [21, 21], [24, 8], [9, 5]], [[9, -8], [-9, -8], [-9, 7], [9, 7]]];
  walks.forEach((w, i) => L.person(w[0][0], w[0][1], { suit: suits[i % suits.length], skin: skins[i % skins.length], walk: w }));
  for (const [x, z, yaw, i] of [[-11, 10.5, 0, 1], [-18, 17.5, Math.PI, 2], [16, 17.6, Math.PI, 3], [11.6, 10.4, 0, 4], [-25.5, -14, Math.PI / 2, 0], [-25.5, -27, Math.PI / 2, 6], [25.2, -20, -Math.PI / 2, 5],
    [-3, -21.5, Math.PI, 0], [2.5, -21.2, Math.PI, 1], [9.5, -2.5, -1, 2], [-9.5, 2, 2, 3], [-14, -36, 0, 4], [-11, -36, 0, 5], [20, -36.5, 0, 6], [1.5, -36.6, 0, 2]]) {
    L.person(x, z, { yaw, suit: suits[i], skin: skins[i % skins.length], y: z < -33 ? MEZZ.y : 0 });
  }
  L.build();
}

// ================================================================= PLAZA (outdoors, Z 30..62)
export function plaza(ctx) {
  const L = new Lux(ctx);
  // ---- ground: granite paving, red carpet to the doors, drop-off lane
  L.floor(-40, 40, 30.4, 62, 0.012, 'paving');
  L.box(-2.2, 2.2, 0.012, 0.03, 30.4, 48.6, 'rug', { color: 0x8e1621 }); L.box(-2.35, -2.2, 0.012, 0.032, 30.4, 48.6, 'gold'); L.box(2.2, 2.35, 0.012, 0.032, 30.4, 48.6, 'gold');
  for (let z = 32; z <= 46; z += 2) for (const sx of [-1, 1]) {
    L.cyl(sx * 2.9, z, 0.16, 0, 0.04, 'gold', { seg: 10 }); L.cyl(sx * 2.9, z, 0.035, 0, 0.95, 'gold', { seg: 8 }); L.cyl(sx * 2.9, z, 0.07, 0.95, 1.05, 'gold', { seg: 8 });
    if (z < 46) { const rope = new THREE.CylinderGeometry(0.03, 0.03, 2, 6); rope.rotateX(Math.PI / 2); rope.translate(sx * 2.9, 0.82, z + 1); L.geo(rope, 'rug', 0x7a0f1a); }
  }
  L.floor(-34, 34, 49, 55, 0.02, 'asphalt');
  for (const z of [48.8, 55.2]) L.box(-34.2, 34.2, 0, 0.16, z - 0.2, z + 0.2, 'stone');
  for (let x = -32; x <= 32; x += 4) L.box(x, x + 2, 0.021, 0.03, 51.92, 52.08, 'paint', { color: 0xf2f2f2 });
  for (let x = -33; x <= 33; x += 2.6) if (Math.abs(x) > 3.4) { L.cyl(x, 48.4, 0.13, 0, 0.95, 'steel', { seg: 10, collide: true }); L.cyl(x, 48.4, 0.15, 0.82, 0.88, 'downlight', { seg: 10 }); }

  // ---- entrance facade (atrium south face): granite base, dark glass curtain wall, bronze grid
  L.box(-30.6, -5.4, 0, 1.2, 30.0, 30.5, 'granite'); L.box(5.4, 30.6, 0, 1.2, 30.0, 30.5, 'granite');
  const fg = (x0, x1, y0, y1) => { const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 30.45); L.geo(g, 'facadeGlass'); };
  fg(-30.6, -5.4, 1.2, 48); fg(5.4, 30.6, 1.2, 48); fg(-5.4, 5.4, 7.2, 48);
  for (let x = -30; x <= 30; x += 3) L.box(x - 0.08, x + 0.08, Math.abs(x) < 5.5 ? 7.2 : 1.2, 48, 30.45, 30.75, 'bronze');
  for (let y = 5.2; y <= 48; y += 4) L.box(-30.6, 30.6, y - 0.06, y + 0.06, 30.45, 30.7, 'bronze');
  L.box(-30.8, 30.8, 47.6, 48.4, 30.0, 31.0, 'bronze');
  for (const sx of [-1, 1]) L.box(sx * 5.4 - 0.35, sx * 5.4 + 0.35, 0, 7.4, 30.0, 31.2, 'bronze'); // entrance portal jambs
  L.box(-5.75, 5.75, 6.6, 7.4, 30.0, 31.2, 'bronze');
  // ---- cantilevered glass canopy over the entrance with downlights
  L.box(-9.2, 9.2, 5.7, 5.85, 30.6, 38.6, 'glass');
  for (const x of [-9.2, -4.6, 0, 4.6, 9.2]) L.box(x - 0.12, x + 0.12, 5.45, 5.7, 30.6, 38.6, 'bronze');
  for (const z of [30.6, 34.6, 38.6]) L.box(-9.3, 9.3, 5.45, 5.7, z - 0.12, z + 0.12, 'bronze');
  for (const x of [-6.9, -2.3, 2.3, 6.9]) for (const z of [32.6, 36.6]) L.box(x - 0.22, x + 0.22, 5.41, 5.45, z - 0.22, z + 0.22, 'downlight');
  for (const sx of [-1, 1]) L.cyl(sx * 8.6, 38.2, 0.17, 0, 5.45, 'bronze', { seg: 12, collide: true });
  plaque(ctx, '{FIRM NAME}', 0, 6.25, 38.75, 0, { h: 0.7 });
  plaque(ctx, '{FIRM NAME}', 0, 9.0, 30.8, 0, { h: 1.4, sub: 'Excellence. Discretion. Liquidity.' });
  for (const sx of [-1, 1]) { // topiary in bronze pots by the doors
    L.cyl(sx * 6.6, 31.6, 0.5, 0, 0.8, 'bronze', { seg: 12, rTop: 0.6, collide: true });
    const c = new THREE.ConeGeometry(0.7, 2.6, 7); c.translate(sx * 6.6, 2.1, 31.6); L.geo(c, 'foliage', 0x3c7536);
  }
  // ---- fountains: granite basins, water, jets
  const jetGeo = new THREE.CylinderGeometry(0.04, 0.08, 1, 6); jetGeo.translate(0, 0.5, 0);
  const jets = new THREE.InstancedMesh(jetGeo, LM.jet, 14);
  for (const [x0, x1] of [[-13, -5], [5, 13]]) {
    for (const [a, b, c, d] of [[x0, x1, 40, 40.45], [x0, x1, 45.55, 46], [x0, x0 + 0.45, 40, 46], [x1 - 0.45, x1, 40, 46]]) L.box(a, b, 0, 0.6, c, d, 'granite', { collide: true });
    for (const [a, b, c, d] of [[x0 - 0.04, x1 + 0.04, 39.96, 40.5], [x0 - 0.04, x1 + 0.04, 45.5, 46.04], [x0 - 0.04, x0 + 0.5, 40, 46], [x1 - 0.5, x1 + 0.04, 40, 46]]) L.box(a, b, 0.6, 0.66, c, d, 'bronze');
    ctx.colliders.push({ x0, x1, z0: 40, z1: 46, y0: 0, y1: 0.6 });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.9, 5.1).rotateX(-Math.PI / 2), LM.water); w.position.set((x0 + x1) / 2, ctx.e + 0.5, 43); w.renderOrder = 4; ctx.add(w, w.geometry);
    L.box(x0 + 0.45, x1 - 0.45, 0, 0.12, 40.45, 45.55, 'granite');
  }
  ctx.add(jets, jetGeo);
  const jm = new THREE.Matrix4(), jq = new THREE.Quaternion(), jp = new THREE.Vector3(), js = new THREE.Vector3();
  // ---- flags (waving) on steel poles
  const flags = [];
  for (const [i, x] of [-32, -24, -16, 16, 24, 32].entries()) {
    L.cyl(x, 37, 0.09, 0, 12, 'steel', { seg: 8, collide: true }); L.cyl(x, 37, 0.15, 11.9, 12.1, 'gold', { seg: 8 }); L.cyl(x, 37, 0.3, 0, 0.3, 'granite', { seg: 10 });
    const g = new THREE.PlaneGeometry(3.2, 1.9, 12, 4);
    const m = new THREE.MeshStandardMaterial({ color: [0xc9a23a, 0x1f2a44, 0x7a1724][i % 3], roughness: 0.8, side: THREE.DoubleSide });
    const f = new THREE.Mesh(g, m); f.position.set(x + 1.65, ctx.e + 10.6, 37); f.castShadow = true; ctx.add(f, g, m);
    flags.push({ g, base: g.attributes.position.array.slice(), ph: i * 0.7 });
  }
  // ---- planting: sculpted hedges, trees, lamps, benches
  for (const [x0, x1, z0, z1] of [[-40, -38.6, 30.4, 62], [38.6, 40, 30.4, 62], [-40, -7, 60.6, 62], [7, 40, 60.6, 62]]) L.box(x0, x1, 0, 1.3, z0, z1, 'foliage', { collide: true, round: 0.35, color: 0x3d6d33 });
  for (let z = 33; z <= 58; z += 6) for (const sx of [-1, 1]) tree(L, sx * 35.5, z, 7);
  for (const x of [-30, -20, -10, 10, 20, 30]) { // lamp posts
    L.cyl(x, 47.6, 0.09, 0, 4.4, 'blackMetal', { seg: 8, collide: true }); L.cyl(x, 47.6, 0.25, 0, 0.4, 'blackMetal', { seg: 8 });
    L.box(x - 0.24, x + 0.24, 4.4, 5.1, 47.36, 47.84, 'lampWarm'); L.box(x - 0.3, x + 0.3, 5.1, 5.25, 47.3, 47.9, 'blackMetal');
  }
  for (const [x, z] of [[-30, 40], [30, 40], [-30, 58], [30, 58]]) { L.box(x - 1.2, x + 1.2, 0.42, 0.5, z - 0.3, z + 0.3, 'walnut', { collide: true }); for (const ox of [-1, 1]) L.box(x + ox - 0.06, x + ox + 0.06, 0, 0.42, z - 0.25, z + 0.25, 'blackMetal'); }
  // ---- supercars at the drop-off (low-poly)
  for (const [x, col] of [[-26, 0xc8102e], [-14, 0x111214], [14, 0xe0b23a], [26, 0x1d3f8f]]) {
    const z = 52;
    L.box(x - 2.25, x + 2.25, 0.3, 0.88, z - 0.95, z + 0.95, 'carPaint', { color: col, round: 0.22 });
    L.box(x - 1.0, x + 1.15, 0.85, 1.32, z - 0.78, z + 0.78, 'carPaint', { color: col, round: 0.25 });
    L.box(x - 0.92, x + 1.08, 0.9, 1.3, z - 0.8, z + 0.8, 'facadeGlass');
    for (const [ox, oz] of [[-1.45, -0.92], [1.45, -0.92], [-1.45, 0.92], [1.45, 0.92]]) { const w = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12); w.rotateX(Math.PI / 2); w.translate(x + ox, 0.34, z + oz); L.geo(w, 'rubber'); }
    for (const oz of [-0.62, 0.62]) L.box(x + 2.2, x + 2.27, 0.6, 0.72, z + oz - 0.2, z + oz + 0.2, 'downlight');
    ctx.colliders.push({ x0: x - 2.3, x1: x + 2.3, z0: z - 1.0, z1: z + 1.0, y0: 0, y1: 1.3 });
  }
  // ---- monument sign (both faces) with up-lights
  L.box(-6, 6, 0, 2.2, 59.4, 60.8, 'granite', { collide: true }); L.box(-6.1, 6.1, 2.2, 2.32, 59.3, 60.9, 'bronze');
  plaque(ctx, '{FIRM NAME}', 0, 1.35, 59.36, Math.PI, { h: 0.9, sub: 'Two Towers. One Vision.' });
  plaque(ctx, '{FIRM NAME}', 0, 1.35, 60.84, 0, { h: 0.9, sub: 'Two Towers. One Vision.' });
  for (const x of [-4, 0, 4]) L.box(x - 0.2, x + 0.2, 0, 0.08, 58.8, 59.1, 'downlight');
  // ---- people: doormen, valet, guests
  for (const sx of [-1, 1]) L.person(sx * 5.9, 31.3, { yaw: 0, suit: 0x101114, hair: 0x101010 });
  L.person(-20, 50.2, { yaw: Math.PI / 2, suit: 0x1a1a1a });
  const walkers = [[[1.2, 47], [1.2, 31.5], [0.6, 31.5], [0.6, 47]], [[-26, 50], [-10, 47.5], [-1, 46], [-1, 32], [-3, 46], [-15, 48]], [[26, 50], [12, 47.5], [1.8, 44], [1.8, 33], [3.2, 45], [14, 48.5]]];
  walkers.forEach((w, i) => L.person(w[0][0], w[0][1], { walk: w, suit: [0x2b2b2e, 0x5a1f2b, 0xc9b79c][i], skin: [0xd8a47f, 0x8a5a3c, 0xeac2a0][i] }));
  for (const [x, z, yaw, s] of [[-12, 47.2, 0.4, 0x1f2a44], [13, 44, -0.6, 0x3d3a36], [-18, 39.5, 2.6, 0x6b6f75], [19.5, 57, 3.1, 0x1d3b33]]) L.person(x, z, { yaw, suit: s });

  ctx.onUpdate((dt, t) => {
    for (const f of flags) { // wave: travelling sine along the flag, stronger at the free end
      const p = f.g.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const u = (f.base[i] + 1.6) / 3.2; p[i + 2] = f.base[i + 2] + Math.sin(t * 3.2 + f.base[i] * 2.2 + f.ph) * 0.28 * u; }
      f.g.attributes.position.needsUpdate = true; f.g.computeVertexNormals();
    }
    let k = 0;
    for (const cx of [-9, 9]) for (let i = 0; i < 7; i++) {
      const x = cx - 3 + i, h = 1.0 + Math.sin(t * 2.1 + i * 0.8 + cx) * 0.35;
      jets.setMatrixAt(k++, jm.compose(jp.set(x, ctx.e + 0.5, 43), jq, js.set(1, h, 1)));
    }
    jets.instanceMatrix.needsUpdate = true;
  });
  L.build();
}
