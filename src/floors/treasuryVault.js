import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Lux, LM, plaque, addLuxMaterials } from '../world/lux.js';
import { kitMaterials } from './luxKit.js';
import { ceiling } from './luxHall.js';
import { CARS, BANKS, canAccess, REFUSALS } from '../layout/building.js';

// ================================================================= PHASE 1 — B1 BASEMENT: THE TREASURY RESERVE
// Redesign (user, 2026-11-12): a very secure vault behind heavy layers of security, in polished steel, black
// granite and gold under cold white light. EVERY lift (CEO lift included) now lands outside the layers; the
// layers are live per role: they open for roles with 'vault_inner' access (tour, admin, CEO) and for the cash
// robots, and refuse everyone else.
// Route (world coords; heights relative to the slab at Y -10; the sunken zone drops to -10 / -18 rel):
//   Treasury Arrival Hall (X -30..-12, all B1 lift landings on its west wall)
//   → Credential Verification Airlocks (glass wall at X -4: two people airlocks + a wide escort airlock)
//   → Photonic Assurance Corridor (X 4..28, Z ±2.5: red laser grid, powers down for cleared users)
//   → Asset Protection Sentry Hall (X 28..42: armoured booths, robot sentries) ending in a balcony
//   → the Descent: a grand stair X 42..58.8 down 10 m into the Liquidity Moat hall (X 42..72, 20 m tall)
//   → the moat (X 62..72, 8 m deep, water) crossed by a retracting bridge
//   → the 6 m round vault door in a 2 m wall at X 72..74
//   → the Treasury Reserve chamber (X 74..128, Z ±30, 20 m tall): gold racks and stacks, cash pallets with
//     forklifts, deposit-box walls, a counting team and the reserve total display.
// Also on B1: Infrastructure Core (IT data hall, X -78..-42) and the Armoured Logistics Bay (ALC depot,
// X -12..30, Z 12..39). Plain names in code comments only: the vault, the server room, the robot depot.

const TAU = Math.PI * 2;
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a, v) => a[Math.floor(v * a.length) % a.length];
const H = 6.5, LOW = -10, MOAT = -18, TOP = 9.75; // room ceilings, sunken floor, moat bottom, B1 ceiling
const AREA = 'vault_inner';
const ARR = { x0: -30, x1: -12, z0: -38.9, z1: 38.9 };
const AIR = { x: -4, people: [-7, 7], escort: 0 };
const LAS = { x0: 4, x1: 28, z: 2.5, h: 4 };
const SEN = { x0: 28, x1: 42, z0: -14, z1: 12 };
const STAIR = { x0: 42, x1: 58.8, z: 4, n: 56 };
const RISE = 10 / STAIR.n, TREAD = (STAIR.x1 - STAIR.x0) / STAIR.n;
const MH = { x0: 42, x1: 72, z: 30 }, MOATX = [62, 72], BRIDGE_Z = 2;
const VW = { x0: 72, x1: 74 }, DOOR = { y: LOW + 3.4, r: 3.0, hinge: -3.1 };
const VAULT = { x0: 74, x1: 128, z: 30 };
const DATA = { x0: -78, x1: -42, z0: -38, z1: 38, raised: 0.3 };
const BAY = { x0: -12, x1: 30, z0: 12, z1: 38.9 };
export const TREASURY = { ARR, AIR, LAS, SEN, STAIR, MH, MOATX, VW, DOOR, VAULT, DATA, BAY };

// ---------------------------------------------------------------- walkable height field (two levels + the moat)
const state = { bridge: 1, ok: true }; // bridge extension 0..1 and whether the player's role is cleared (shared with the shape)
function groundAt(x, z) {
  if (x >= DATA.x0 && x <= DATA.x1 && z >= DATA.z0 && z <= DATA.z1) return DATA.raised;
  if (x < MH.x0 || x > VAULT.x1 || Math.abs(z) > MH.z) return 0;
  if (x < STAIR.x1 && Math.abs(z) <= STAIR.z) return -Math.min(10, (Math.floor((x - STAIR.x0) / TREAD) + 1) * RISE);
  if (x < MOATX[0]) return LOW;
  if (x < MOATX[1]) return Math.abs(z) <= BRIDGE_Z && state.bridge > 0.98 && state.ok ? LOW : MOAT; // the bridge refuses uncleared feet
  if (x < VW.x1 && Math.abs(z) < 2.6) return LOW + 0.4; // the door sill
  return LOW;
}
const covers = (x, z) => x >= -79 && x <= 129 && Math.abs(z) <= 39;
export function treasuryShape(e) {
  return {
    active: (y) => y > e + MOAT - 1 && y < e + TOP,
    covers,
    ground: (x, z) => e + groundAt(x, z),
    blocks(px, pz, x, z, y) {
      if (!covers(x, z)) return false;
      const yl = y - e, g = groundAt(x, z);
      return g > yl + 0.45 || g < yl - 0.5; // no stepping up walls, no dropping off the balcony / into the moat
    },
    gridBlock: (x, z) => covers(x, z) && groundAt(x, z) !== 0 && groundAt(x, z) !== DATA.raised,
  };
}

// ---------------------------------------------------------------- materials
const canvasT = (w, h, draw, repeat = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
let READY = false;
function initMaterials() {
  if (READY) return;
  READY = true;
  kitMaterials();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const brushed = canvasT(512, 512, (g, w, h) => { // brushed steel panels, 1.2 m, with a dark reveal (texture = 2.4 m)
    const r = rng(11); g.fillStyle = '#aeb4bb'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const k = r(); g.fillStyle = `rgba(${150 + k * 90},${155 + k * 90},${162 + k * 85},0.18)`; g.fillRect(0, r() * h, w, 1); }
    g.fillStyle = 'rgba(30,32,36,0.8)'; for (const p of [0, w / 2]) { g.fillRect(p, 0, 3, h); g.fillRect(0, p, w, 3); }
  });
  const goldBars = canvasT(256, 256, (g, w, h) => { // stacked bullion seen from the side (texture = 1 m)
    g.fillStyle = '#5a4214'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let i = 0; i < 4; i++) {
      const x = i * 64 + (row % 2) * 32 - 32, y = row * 32;
      const grd = g.createLinearGradient(0, y, 0, y + 30); grd.addColorStop(0, '#ffe08a'); grd.addColorStop(0.5, '#d9a93c'); grd.addColorStop(1, '#a8781e');
      g.fillStyle = grd; g.fillRect(x + 3, y + 2, 58, 28); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 8, y + 5, 46, 3);
    }
  });
  const cash = canvasT(256, 256, (g, w, h) => { // bundled notional banknotes (generic), with bands (texture = 1 m)
    g.fillStyle = '#9fb894'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row++) { g.fillStyle = row % 2 ? '#b7cdac' : '#a7c19c'; g.fillRect(0, row * 16, w, 15); g.fillStyle = 'rgba(40,60,40,0.35)'; g.fillRect(0, row * 16 + 15, w, 1); }
    g.fillStyle = '#e9e1c4'; for (const x of [40, 168]) g.fillRect(x, 0, 24, h);
  });
  const boxes = canvasT(512, 512, (g, w, h) => { // brass safe-deposit doors, 0.3 x 0.2 m, numbered (texture = 2.4 x 1.6 m)
    g.fillStyle = '#2a2116'; g.fillRect(0, 0, w, h);
    let n = 1000;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const x = i * 64, y = j * 64, grd = g.createLinearGradient(x, y, x + 64, y + 64); grd.addColorStop(0, '#e6c279'); grd.addColorStop(1, '#9c7834');
      g.fillStyle = grd; g.fillRect(x + 3, y + 3, 58, 58);
      g.fillStyle = '#3a2a10'; g.beginPath(); g.arc(x + 48, y + 32, 5, 0, TAU); g.fill(); g.fillRect(x + 47, y + 32, 2, 8);
      g.font = 'bold 11px monospace'; g.fillText(String(n++), x + 8, y + 18);
    }
  });
  const rack = canvasT(256, 512, (g, w, h) => { // server rack front: black glass, units, blue/green status lights (texture = 0.6 x 1.2 m)
    const r = rng(17); g.fillStyle = '#0b0e14'; g.fillRect(0, 0, w, h);
    for (let u = 0; u < 24; u++) { const y = u * 21; g.fillStyle = '#151a24'; g.fillRect(12, y + 2, w - 24, 18); for (let k = 0; k < 4; k++) if (r() < 0.75) { g.fillStyle = r() < 0.8 ? '#36a3ff' : '#3cff9a'; g.fillRect(24 + k * 10, y + 8, 4, 4); } }
  });
  const tiles = canvasT(256, 256, (g, w) => { // perforated raised-floor tiles, 0.6 m (texture = 1.2 m)
    g.fillStyle = '#8b9099'; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(30,32,38,0.6)';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = i * 128, y = j * 128; g.fillRect(x, y, 128, 3); g.fillRect(x, y, 3, 128); if ((i + j) % 2 === 0) for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) { g.beginPath(); g.arc(x + 14 + a * 11, y + 14 + b * 11, 2.6, 0, TAU); g.fill(); } }
  });
  addLuxMaterials({
    bkSteel: std({ map: brushed, roughness: 0.32, metalness: 0.85, envMapIntensity: 0.9 }),
    bkSteelDark: std({ color: 0x3a3f46, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.8 }),
    bkBlack: std({ color: 0x08090c, roughness: 0.08, metalness: 0.5, envMapIntensity: 1.0 }),
    bkPanel: std({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 0.55, roughness: 0.6 }),
    bkGoldBars: std({ map: goldBars, roughness: 0.28, metalness: 1, emissive: 0x3a2808, envMapIntensity: 1.1 }),
    bkCash: std({ map: cash, roughness: 0.85 }),
    bkWrap: std({ color: 0xe8f4ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    bkBoxes: std({ map: boxes, roughness: 0.35, metalness: 0.9, envMapIntensity: 0.9 }),
    bkRack: std({ map: rack, roughness: 0.2, metalness: 0.3, emissive: 0xffffff, emissiveMap: rack, emissiveIntensity: 0.9 }),
    bkTiles: std({ map: tiles, roughness: 0.55, metalness: 0.5 }),
    bkWater: std({ color: 0x061a2a, roughness: 0.05, metalness: 0.4, emissive: 0x1d6aa8, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }),
    bkRed: new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }),
    bkAmber: new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false }),
    bkCyan: new THREE.MeshBasicMaterial({ color: 0x5fd8ff, toneMapped: false }),
  }, { bkSteel: 2.4, bkGoldBars: 1, bkCash: 1, bkBoxes: 2.4, bkRack: 1.2, bkTiles: 1.2 });
}

// box of cross-section w x h from point a to point b (local z along a->b)
const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
function obGeo(a, b, w, h) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A).normalize();
  const m = new THREE.Matrix4().lookAt(B, A, Math.abs(dir.y) > 0.95 ? _x : _up);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  return new THREE.BoxGeometry(w, h, A.distanceTo(B)).applyMatrix4(m);
}

// ---------------------------------------------------------------- live displays (canvas, redrawn slowly)
function display(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const redraw = (...a) => { draw(g, w, h, ...a); t.needsUpdate = true; };
  redraw(0);
  return { t, redraw, mat: new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) };
}
function fit(g, text, maxW, size, weight = 'bold', family = 'sans-serif') { let px = size; do { g.font = `${weight} ${px}px ${family}`; px -= 1; } while (g.measureText(text).width > maxW && px > 8); }

// ---------------------------------------------------------------- the floor
export function treasuryVault(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const e = ctx.e, r = rng(1010);
  const box = (x0, x1, y0, y1, z0, z1, m, o) => L.box(x0, x1, y0, y1, z0, z1, m, o);
  const wall = (x0, x1, y0, y1, z0, z1, m = 'bkSteel') => box(x0, x1, y0, y1, z0, z1, m, { collide: true });
  const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850];
  const guard = (x, z, o = {}) => L.person(x, z, { suit: 0x0b0d12, skin: pick(SKIN, r()), hair: 0x111111, ...o });
  const staff = (x, z, o = {}) => L.person(x, z, { suit: pick([0xe8e6e0, 0x1c2a4e, 0x2a2e36], r()), skin: pick(SKIN, r()), hair: pick([0x111111, 0x2a1a10, 0x5a3a20], r()), ...o });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, e + y, z); ctx.add(m, geo); return m; };
  const allowed = () => canAccess(ctx.role || 'visitor', AREA);
  let lastRefusal = -10;
  const refuse = (t) => { if (t - lastRefusal > 4) { lastRefusal = t; ctx.toast && ctx.toast(REFUSALS[AREA]); } };

  // ================================================================ Treasury Arrival Hall (every B1 lift lands here)
  L.floor(ARR.x0, ARR.x1, ARR.z0, ARR.z1, 0.012, 'granite');
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, H, ARR.x0, ARR.x1, ARR.z0, ARR.z1, 3.9);
  // west wall: steel cladding with a gold portal round every landing door, and the corridor to the data hall
  const b1Doors = CARS.filter((c) => BANKS[c.bank].stops.includes('B1')).map((c) => ({ c, x: c.x1 > -30.5 && c.x1 < -29.5 ? -30 : c.x0 > 29.5 && c.x0 < 30.5 ? 30 : null, zc: (c.z0 + c.z1) / 2 })).filter((d) => d.x != null);
  const gapsW = [...b1Doors.filter((d) => d.x < 0).map((d) => [d.zc - d.c.doorW / 2 - 0.1, d.zc + d.c.doorW / 2 + 0.1, d.c.doorH]), [-6, 6, 4]].sort((a, b) => a[0] - b[0]);
  const cladWithGaps = (x, dir, za, zb, gaps, top) => {
    let z = za;
    for (const [g0, g1, gh] of gaps) {
      if (g0 > z) box(x, x + dir * 0.15, 0, top, z, g0, 'bkSteel', { collide: true });
      box(x, x + dir * 0.15, gh, top, g0, g1, 'bkSteel');
      for (const zz of [g0 - 0.12, g1]) box(x + dir * 0.15, x + dir * 0.3, 0, gh + 0.2, zz, zz + 0.12, 'gold'); // gold jambs
      box(x + dir * 0.15, x + dir * 0.3, gh, gh + 0.2, g0 - 0.12, g1 + 0.12, 'gold');
      z = Math.max(z, g1);
    }
    if (zb > z) box(x, x + dir * 0.15, 0, top, z, zb, 'bkSteel', { collide: true });
  };
  cladWithGaps(ARR.x0, 1, ARR.z0, ARR.z1, gapsW, H);
  for (const d of b1Doors.filter((d) => d.x < 0)) plaque(ctx, d.c.label, ARR.x0 + 0.32, d.c.doorH + 0.55, d.zc, Math.PI / 2, { h: 0.22, color: '#e3c27a' });
  // east wall (route opening Z ±5; open to the logistics bay south of Z 12)
  wall(ARR.x1 - 0.15, ARR.x1, 0, H, ARR.z0, -5); wall(ARR.x1 - 0.15, ARR.x1, 0, H, 5, BAY.z0);
  box(ARR.x1 - 0.15, ARR.x1, 4.2, H, -5, 5, 'bkSteel');
  for (const zz of [-5.2, 5]) box(ARR.x1 - 0.35, ARR.x1 + 0.1, 0, 4.4, zz, zz + 0.2, 'gold');
  box(ARR.x1 - 0.35, ARR.x1 + 0.1, 4.2, 4.4, -5.2, 5.2, 'gold');
  plaque(ctx, 'TREASURY RESERVE', ARR.x1 - 0.2, 5.2, 0, -Math.PI / 2, { h: 0.55, color: '#e3c27a', sub: 'Your contributions at work' });
  for (const zz of [ARR.z0, ARR.z1]) box(ARR.x0, ARR.x1, 0, H, zz - 0.1, zz + 0.1, 'bkSteel'); // N / S cladding
  for (let z = -36; z <= 36; z += 6) box(ARR.x1 - 0.18, ARR.x1 - 0.14, 0, H, z - 0.03, z + 0.03, 'gold');
  // guard desk, wellness screening arches before the airlocks
  box(-22, -19, 0, 1.1, -14, -8, 'bkBlack', { collide: true }); box(-22.05, -18.95, 1.1, 1.15, -14.05, -7.95, 'gold');
  for (let i = 0; i < 3; i++) guard(-23, -13 + i * 2, { yaw: Math.PI / 2 });
  for (const zz of [-2.6, 2.6]) {
    box(-15.2, -14.8, 0, 2.6, zz - 1.1, zz - 0.9, 'bkSteelDark', { collide: true }); box(-15.2, -14.8, 0, 2.6, zz + 0.9, zz + 1.1, 'bkSteelDark', { collide: true });
    box(-15.2, -14.8, 2.4, 2.6, zz - 1.1, zz + 1.1, 'bkSteelDark'); box(-15.22, -14.78, 2.42, 2.48, zz - 0.85, zz + 0.85, 'bkCyan');
  }
  plaque(ctx, 'WELLNESS SCREENING', -14.75, 3.1, 0, -Math.PI / 2, { h: 0.25, color: '#e3c27a' });
  for (const z of [-4.2, 4.2]) guard(-16.5, z, { yaw: -Math.PI / 2 });
  plaque(ctx, 'INFRASTRUCTURE CORE (IT)  ←', -29.7, 4.6, -8.8, Math.PI / 2, { h: 0.24, color: '#e3c27a' });
  plaque(ctx, 'ARMOURED LOGISTICS BAY  →', ARR.x1 - 0.2, 2.6, 9, -Math.PI / 2, { h: 0.24, color: '#e3c27a' });
  for (let i = 0; i < 6; i++) staff(-26 + r() * 10, -30 + r() * 60, { walk: [[-27, -30 + i * 8], [-15, -28 + i * 8], [-15, -2 + i], [-27, 1 + i]], speed: 1.1 });

  // ================================================================ Credential Verification Airlocks (glass wall at X -4)
  L.floor(ARR.x1, LAS.x0, -14, BAY.z0, 0.012, 'granite');
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, H, ARR.x1, LAS.x0, -14, BAY.z0, 3.9);
  wall(ARR.x1, LAS.x0, 0, H, -14.15, -14); wall(ARR.x1, BAY.x1, 0, H, BAY.z0, BAY.z0 + 0.15); // N wall; S wall (shared with the bay)
  const airlocks = [];
  const door = (x, z0, z1, h) => { // two leaves sliding apart along z; collider open when apart
    const w = (z1 - z0) / 2, geo = new THREE.BoxGeometry(0.08, h, w);
    const leaves = [mk(geo, LM.glass, x, h / 2, z0 + w / 2), mk(geo, LM.glass, x, h / 2, z1 - w / 2)];
    const edges = leaves.map((lf) => { const g2 = new THREE.BoxGeometry(0.12, h, 0.08); const m = new THREE.Mesh(g2, LM.gold); lf.add(m); ctx.disposables.push(g2); return m; });
    edges[0].position.z = w / 2 - 0.04; edges[1].position.z = -w / 2 + 0.04;
    const d = { pos: 0, t: 0, x, z0, z1, w, leaves };
    ctx.colliders.push({ x0: x - 0.15, x1: x + 0.15, z0, z1, y0: e, y1: e + h, openFn: () => d.pos > 0.85 && allowed() }); // no tailgating a courier
    d.set = () => { leaves[0].position.z = z0 + w / 2 - d.pos * w * 0.95; leaves[1].position.z = z1 - w / 2 + d.pos * w * 0.95; };
    return d;
  };
  const airlock = (xa, xb, zc, hw, h, label) => {
    // glass chamber: side walls, roof, steel frames; doors at xa (entry, west) and xb (exit, east)
    for (const s of [-1, 1]) { box(xa, xb, 0, h, zc + s * hw - 0.05, zc + s * hw + 0.05, 'glass', { collide: true }); box(xa - 0.1, xb + 0.1, h, h + 0.12, zc + s * hw - 0.12, zc + s * hw + 0.12, 'bkSteelDark'); }
    box(xa, xb, h, h + 0.06, zc - hw, zc + hw, 'glass');
    for (const xx of [xa, xb]) { for (const s of [-1, 1]) box(xx - 0.14, xx + 0.14, 0, h + 0.12, zc + s * hw - 0.14, zc + s * hw + 0.14, 'bkSteelDark'); box(xx - 0.14, xx + 0.14, h - 0.2, h + 0.12, zc - hw, zc + hw, 'bkSteelDark'); }
    box(xa + 0.2, xb - 0.2, 0.012, 0.03, zc - hw + 0.2, zc + hw - 0.2, 'bkBlack');
    const st = [mk(new THREE.BoxGeometry(0.06, 0.18, 0.4), LM.bkRed.clone(), xa - 0.2, h - 0.45, zc), mk(new THREE.BoxGeometry(0.06, 0.18, 0.4), LM.bkRed.clone(), xb + 0.2, h - 0.45, zc)];
    const a = { xa, xb, z0: zc - hw, z1: zc + hw, entry: door(xa, zc - hw + 0.14, zc + hw - 0.14, h - 0.2), exit: door(xb, zc - hw + 0.14, zc + hw - 0.14, h - 0.2), dwell: 0, side: null, st };
    plaque(ctx, label, xa - 0.18, h + 0.45, zc, -Math.PI / 2, { h: 0.2, color: '#e3c27a' });
    airlocks.push(a);
    return a;
  };
  for (const zc of AIR.people) airlock(AIR.x - 1.3, AIR.x + 1.3, zc, 1.3, 2.8, 'CREDENTIAL VERIFICATION');
  airlock(AIR.x - 2, AIR.x + 2, AIR.escort, 2.3, 3.4, 'ESCORTED LIQUIDITY ONLY');
  // the glass security wall between the airlocks, floor to ceiling, steel mullions
  { let z = -14; for (const [a0, a1] of [[-8.3, -5.7], [-2.3, 2.3], [5.7, 8.3]]) { box(AIR.x - 0.05, AIR.x + 0.05, 0, H, z, a0, 'glass', { collide: true }); z = a1; } box(AIR.x - 0.05, AIR.x + 0.05, 0, H, z, BAY.z0, 'glass', { collide: true });
    for (const [a0, a1, hh] of [[-8.3, -5.7, 2.92], [-2.3, 2.3, 3.52], [5.7, 8.3, 2.92]]) box(AIR.x - 0.05, AIR.x + 0.05, hh, H, a0, a1, 'glass');
    for (let zz = -14; zz <= BAY.z0; zz += 2.2) box(AIR.x - 0.08, AIR.x + 0.08, 0, H, zz - 0.06, zz + 0.06, 'bkSteelDark'); }
  guard(-8, -11, { yaw: Math.PI / 2 }); guard(-8, 10.5, { yaw: Math.PI / 2 }); guard(1.5, -10, { yaw: -Math.PI / 2 });
  box(-1, 3, 0, 1.1, -13.2, -11.8, 'bkBlack', { collide: true }); guard(1, -13.6, { yaw: 0 });

  // ================================================================ Photonic Assurance Corridor (laser grid)
  wall(LAS.x0 - 0.3, LAS.x0, 0, H, -14, -LAS.z); wall(LAS.x0 - 0.3, LAS.x0, 0, H, LAS.z, BAY.z0); box(LAS.x0 - 0.3, LAS.x0, LAS.h, H, -LAS.z, LAS.z, 'bkSteel');
  for (const s of [-1, 1]) { box(LAS.x0 - 0.5, LAS.x0, 0, LAS.h + 0.2, s * LAS.z - 0.2, s * LAS.z + 0.2, 'gold'); }
  box(LAS.x0 - 0.5, LAS.x0, LAS.h, LAS.h + 0.25, -LAS.z - 0.2, LAS.z + 0.2, 'gold');
  plaque(ctx, 'PHOTONIC ASSURANCE CORRIDOR', LAS.x0 - 0.52, LAS.h + 0.8, 0, -Math.PI / 2, { h: 0.3, color: '#e3c27a', sub: 'Please remain perfectly still. Or authorised.' });
  L.floor(LAS.x0, LAS.x1, -LAS.z, LAS.z, 0.012, 'bkBlack');
  for (const s of [-1, 1]) { wall(LAS.x0, LAS.x1, 0, LAS.h, s * LAS.z - (s < 0 ? 0.2 : 0), s * LAS.z + (s > 0 ? 0.2 : 0), 'bkBlack'); for (const y of [0.15, LAS.h - 0.15]) box(LAS.x0, LAS.x1, y - 0.03, y + 0.03, s * (LAS.z - 0.02) - 0.02, s * (LAS.z - 0.02) + 0.02, 'bkSteelDark'); }
  box(LAS.x0, LAS.x1, LAS.h, LAS.h + 0.2, -LAS.z - 0.2, LAS.z + 0.2, 'bkBlack');
  for (let x = LAS.x0 + 1; x < LAS.x1; x += 2) for (const s of [-1, 1]) box(x - 0.15, x + 0.15, 0.2, LAS.h - 0.2, s * (LAS.z - 0.03) - 0.02, s * (LAS.z - 0.03) + 0.02, 'bkSteelDark'); // emitter strips
  // the beams: one merged static grid + three sweeping beams (own meshes, toggled together)
  const beams = [];
  for (let x = LAS.x0 + 1.5; x < LAS.x1 - 1; x += 1.6) {
    const k = Math.round((x - LAS.x0) / 1.6);
    if (k % 2) beams.push(new THREE.BoxGeometry(0.025, 0.025, 2 * LAS.z).translate(x, 0.3 + (k % 5) * 0.6, 0));
    else { const len = Math.hypot(2 * LAS.z, LAS.h - 0.6), g = new THREE.BoxGeometry(0.025, 0.025, len); g.rotateX(Math.atan2(LAS.h - 0.6, 2 * LAS.z) * (k % 4 ? 1 : -1)); g.translate(x, LAS.h / 2, 0); beams.push(g); }
    beams.push(new THREE.BoxGeometry(0.025, LAS.h - 0.4, 0.025).translate(x + 0.4, LAS.h / 2, (k % 3 - 1) * 1.4));
  }
  const beamGeo = mergeGeometries(beams.map((g) => g.index ? g.toNonIndexed() : g));
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const laserMesh = mk(beamGeo, laserMat, 0, 0, 0); laserMesh.position.y = e;
  const sweeps = [8, 15, 22].map((x) => mk(new THREE.BoxGeometry(0.03, 0.03, 2 * LAS.z), laserMat, x, 1, 0));
  ctx.disposables.push(laserMat);
  ctx.colliders.push({ x0: LAS.x0 - 0.3, x1: LAS.x0 + 0.2, z0: -LAS.z, z1: LAS.z, y0: e, y1: e + LAS.h, lock: AREA }); // only cleared roles pass
  let laserOn = 1;

  // ================================================================ Asset Protection Sentry Hall + balcony over the Descent
  L.floor(SEN.x0, SEN.x1, SEN.z0, SEN.z1, 0.012, 'granite');
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, H, SEN.x0, SEN.x1, SEN.z0, SEN.z1, 3.9);
  wall(SEN.x0 - 0.3, SEN.x0, 0, H, SEN.z0, -LAS.z); wall(SEN.x0 - 0.3, SEN.x0, 0, H, LAS.z, SEN.z1); box(SEN.x0 - 0.3, SEN.x0, LAS.h, H, -LAS.z, LAS.z, 'bkSteel');
  wall(SEN.x0, SEN.x1, 0, H, SEN.z0 - 0.15, SEN.z0); wall(SEN.x0, SEN.x1, 0, H, SEN.z1, SEN.z1 + 0.15);
  for (const [z0, z1, yaw] of [[SEN.z0 + 0.2, SEN.z0 + 3.2, 0], [SEN.z1 - 3.2, SEN.z1 - 0.2, Math.PI]]) { // armoured booths
    for (const xx of [30, 39]) box(xx, xx + 0.15, 0, 2.8, z0, z1, 'bkSteelDark', { collide: true });
    box(30, 39.15, 0, 2.8, (yaw ? z0 : z1) - 0.06, (yaw ? z0 : z1) + 0.06, 'glass', { collide: true }); box(30, 39.15, 0, 1.0, (yaw ? z0 : z1) - 0.1, (yaw ? z0 : z1) + 0.1, 'bkSteelDark', { collide: true });
    box(30, 39.15, 2.8, 2.95, z0, z1, 'bkSteelDark');
    for (let i = 0; i < 3; i++) { const xx = 31.5 + i * 3, zs = (z0 + z1) / 2; box(xx - 0.8, xx + 0.8, 0, 0.75, zs - 0.4, zs + 0.4, 'bkBlack'); guard(xx, yaw ? z1 - 0.6 : z0 + 0.6, { yaw, sit: true }); box(xx - 0.5, xx + 0.5, 0.9, 1.4, zs + (yaw ? -0.35 : 0.35) - 0.02, zs + (yaw ? -0.35 : 0.35) + 0.02, 'bkCyan'); }
  }
  plaque(ctx, 'ASSET PROTECTION SENTRY HALL', SEN.x0 + 0.05, 5.0, 7, Math.PI / 2, { h: 0.3, color: '#e3c27a' });
  for (const z of [-6, 6]) guard(40, z, { yaw: -Math.PI / 2 });
  // balcony edge at X 42 (glass rail), gap for the stair head
  for (const [z0, z1] of [[SEN.z0, -STAIR.z], [STAIR.z, SEN.z1]]) { box(MH.x0 - 0.06, MH.x0 + 0.06, 0, 1.1, z0, z1, 'glass'); box(MH.x0 - 0.08, MH.x0 + 0.08, 1.1, 1.16, z0, z1, 'gold'); box(MH.x0 - 0.1, MH.x0 + 0.1, -0.4, 0.02, z0, z1, 'gold'); }

  // ================================================================ the Liquidity Moat hall (X 42..72, 20 m tall)
  L.floor(MH.x0, MOATX[0], -MH.z, MH.z, LOW + 0.012, 'granite');
  for (const [z0, z1] of [[-MH.z, -STAIR.z - 0.2], [STAIR.z + 0.2, MH.z]]) wall(MH.x0, MH.x0 + 0.3, LOW, 0, z0, z1); // the face under the sentry hall (open where the stair rises)
  for (const [z0, z1] of [[-MH.z, SEN.z0], [SEN.z1, MH.z]]) wall(MH.x0, MH.x0 + 0.3, 0, TOP, z0, z1);
  box(MH.x0, MH.x0 + 0.3, H, TOP, SEN.z0, SEN.z1, 'bkSteel');
  for (const s of [-1, 1]) wall(MH.x0, VAULT.x1, MOAT, TOP, s * MH.z - (s < 0 ? 0.3 : 0), s * MH.z + (s > 0 ? 0.3 : 0)); // N / S walls of the moat hall + vault
  for (let x = 44; x <= 70; x += 4) for (const s of [-1, 1]) box(x - 0.2, x + 0.2, LOW, TOP, s * (MH.z - 0.05) - 0.05, s * (MH.z - 0.05) + 0.05, 'gold'); // gold pilasters
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, TOP, MH.x0 + 0.3, VW.x0, -MH.z, MH.z, 4.2);
  plaque(ctx, 'LIQUIDITY MOAT', 52, 4.5, -MH.z + 0.35, 0, { h: 0.8, color: '#e3c27a', sub: 'Depth 8 m · Swimming is not a recognised credential' });
  // the grand stair down (steel treads, gold nosing, glass balustrades), solid underneath
  for (let k = 0; k < STAIR.n; k++) {
    const x0 = STAIR.x0 + k * TREAD, top = -(k + 1) * RISE;
    box(x0, x0 + TREAD + 0.01, LOW, top, -STAIR.z, STAIR.z, 'bkSteel');
    box(x0, x0 + 0.04, top - 0.03, top + 0.004, -STAIR.z, STAIR.z, 'gold');
  }
  { // stringers (sloped steel cheeks), glass balustrades and gold handrails on both sides
    const quad = (a, b, c, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); g.computeVertexNormals(); return g; };
    for (const s of [-1, 1]) {
      for (const dz of [-0.06, 0.06]) {
        const z = s * (STAIR.z + 0.1) + dz, A = [STAIR.x0, 0.25, z], B = [STAIR.x1, LOW + 0.25, z], C = [STAIR.x1, LOW + 1.35, z], D = [STAIR.x0, 1.35, z];
        L.geo(dz > 0 ? quad(A, D, C, B) : quad(A, B, C, D), 'glass');
        const A2 = [STAIR.x0, LOW, z], B2 = [STAIR.x1, LOW, z];
        L.geo(dz > 0 ? quad(A2, A, B, B2) : quad(A2, B2, B, A), 'bkSteelDark');
      }
      L.geo(obGeo([STAIR.x0, 1.38, s * (STAIR.z + 0.1)], [STAIR.x1, LOW + 1.38, s * (STAIR.z + 0.1)], 0.08, 0.08), 'gold');
    }
  }
  // moat: pit walls, water, rail on the ledge
  box(MOATX[0], MOATX[1], MOAT, MOAT + 0.05, -MH.z, MH.z, 'bkSteelDark');
  box(MOATX[0], MOATX[1], MOAT + 0.05, MOAT + 1.5, -MH.z, MH.z, 'bkWater');
  wall(MOATX[0] - 0.3, MOATX[0], MOAT, LOW, -MH.z, MH.z, 'bkSteelDark');
  for (const [z0, z1] of [[-MH.z, -BRIDGE_Z - 0.2], [BRIDGE_Z + 0.2, MH.z]]) { box(MOATX[0] - 0.36, MOATX[0] - 0.24, LOW, LOW + 1.1, z0, z1, 'glass'); box(MOATX[0] - 0.38, MOATX[0] - 0.22, LOW + 1.1, LOW + 1.16, z0, z1, 'gold'); }
  for (let z = -27; z <= 27; z += 4.5) box(MOATX[0] - 0.32, MOATX[0] - 0.28, LOW - 0.9, LOW - 0.1, z - 0.6, z + 0.6, 'bkCyan'); // underwater-style lights on the pit wall
  box(MOATX[0] - 0.3, MOATX[0], LOW - 0.5, LOW, -BRIDGE_Z - 0.3, BRIDGE_Z + 0.3, 'gold'); // bridge seat
  // the retracting bridge (own group: slides into the vault wall and drops under the vault floor)
  const bridgeG = new THREE.Group(); ctx.add(bridgeG);
  const bdeck = new THREE.Mesh(new THREE.BoxGeometry(MOATX[1] - MOATX[0], 0.5, BRIDGE_Z * 2), LM.bkSteel); bdeck.position.set(0, -0.25, 0);
  const bedges = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(MOATX[1] - MOATX[0], 0.08, 0.1), LM.gold); m.position.set(0, 1.1, s * (BRIDGE_Z - 0.05)); return m; });
  const bglass = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(MOATX[1] - MOATX[0], 1.1, 0.04), LM.glass); m.position.set(0, 0.55, s * (BRIDGE_Z - 0.05)); m.renderOrder = 5; return m; });
  const bled = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(MOATX[1] - MOATX[0], 0.04, 0.06), LM.bkCyan); m.position.set(0, -0.48, s * (BRIDGE_Z - 0.04)); return m; });
  bridgeG.add(bdeck, ...bedges, ...bglass, ...bled);
  for (const m of [bdeck, ...bedges, ...bglass, ...bled]) ctx.disposables.push(m.geometry);
  const BX = (MOATX[0] + MOATX[1]) / 2;
  const setBridge = () => { bridgeG.position.set(BX + (1 - state.bridge) * 10.5, e + LOW - (1 - state.bridge) * 0.9, 0); };
  state.bridge = 0; setBridge();
  // guard posts and patrols on the moat-hall floor
  for (const s of [-1, 1]) {
    const zc = s * 18;
    box(46, 52, LOW, LOW + 2.6, zc - 2, zc - 1.9, 'glass', { collide: true }); box(46, 52, LOW, LOW + 2.6, zc + 1.9, zc + 2, 'glass', { collide: true });
    box(45.9, 46, LOW, LOW + 2.6, zc - 2, zc + 2, 'bkSteelDark', { collide: true }); box(45.9, 52.1, LOW + 2.6, LOW + 2.75, zc - 2.05, zc + 2.05, 'bkSteelDark');
    for (const xx of [47.5, 50]) guard(xx, zc, { y: LOW, yaw: Math.PI / 2, fidget: 0.2 });
    guard(55, zc, { y: LOW, walk: [[54, s * 6], [60.5, s * 6], [60.5, s * 28], [54, s * 28]], speed: 0.9 });
  }
  for (const z of [-5.5, 5.5]) guard(60.8, z, { y: LOW, yaw: Math.PI / 2 });

  // ================================================================ the vault wall with the 6 m round door (X 72..74)
  {
    const sh = new THREE.Shape(); // in (u = -z, v = y rel), extruded along +x (proper rotation: x = w, y = v, z = -u)
    sh.moveTo(-MH.z, MOAT); sh.lineTo(MH.z, MOAT); sh.lineTo(MH.z, TOP); sh.lineTo(-MH.z, TOP); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(0, DOOR.y, DOOR.r + 0.1, 0, TAU, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: VW.x1 - VW.x0, bevelEnabled: false, curveSegments: 48 });
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i), w = p.getZ(i); p.setXYZ(i, VW.x0 + w, v, -u); }
    g.computeVertexNormals(); L.geo(g, 'bkSteelDark');
    ctx.colliders.push({ x0: VW.x0, x1: VW.x1, z0: -MH.z, z1: -DOOR.r, y0: e + MOAT, y1: e + TOP }, { x0: VW.x0, x1: VW.x1, z0: DOOR.r, z1: MH.z, y0: e + MOAT, y1: e + TOP },
      { x0: VW.x0, x1: VW.x1, z0: -DOOR.r, z1: DOOR.r, y0: e + DOOR.y + 2.4, y1: e + TOP });
    // gold ring + stepped frame on the moat face, cyan line
    const ring = (rad, tube, mat, x) => { const t = new THREE.TorusGeometry(rad, tube, 10, 64).rotateY(Math.PI / 2).translate(x, DOOR.y, 0); L.geo(t, mat); };
    ring(DOOR.r + 0.3, 0.22, 'gold', VW.x0 - 0.05); ring(DOOR.r + 0.75, 0.12, 'bkSteel', VW.x0 - 0.04); ring(DOOR.r + 1.05, 0.04, 'bkCyan', VW.x0 - 0.02);
    for (const s of [-1, 1]) for (let y = LOW; y < TOP - 1; y += 3.2) box(VW.x0 - 0.06, VW.x0, y, y + 2.9, s * 8 - 1.4, s * 8 + 1.4, 'bkSteel'); // armour plates either side
    plaque(ctx, 'TREASURY RESERVE', VW.x0 - 0.08, DOOR.y + DOOR.r + 2.0, 0, -Math.PI / 2, { h: 0.9, color: '#e3c27a', sub: 'Time-locked · Rate-locked · Emotionally unavailable' });
  }
  // the door: a steel cylinder on a gold hinge, 12 bolts, a spoked wheel; beacons spin while it cycles
  const hingeG = new THREE.Group(); hingeG.position.set(VW.x0 + 0.55, e + DOOR.y, DOOR.hinge); ctx.add(hingeG);
  const doorG = new THREE.Group(); doorG.position.set(0, 0, -DOOR.hinge); hingeG.add(doorG); // door centre relative to the hinge
  const dmesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); doorG.add(m); ctx.disposables.push(geo); return m; };
  dmesh(new THREE.CylinderGeometry(DOOR.r, DOOR.r, 1.1, 48).rotateZ(Math.PI / 2), LM.bkSteel);
  for (const [rad, tube] of [[DOOR.r - 0.15, 0.1], [DOOR.r - 0.8, 0.07], [1.0, 0.06]]) dmesh(new THREE.TorusGeometry(rad, tube, 8, 48).rotateY(Math.PI / 2), LM.gold, -0.58);
  dmesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24).rotateZ(Math.PI / 2), LM.gold, -0.75);
  const wheel = new THREE.Group(); wheel.position.x = -0.95; doorG.add(wheel);
  for (let k = 0; k < 3; k++) { const g = new THREE.BoxGeometry(0.12, 2.6, 0.12); const m = new THREE.Mesh(g, LM.gold); m.rotation.x = (k / 3) * Math.PI; wheel.add(m); ctx.disposables.push(g); }
  { const g = new THREE.TorusGeometry(1.3, 0.08, 8, 40).rotateY(Math.PI / 2); wheel.add(new THREE.Mesh(g, LM.gold)); ctx.disposables.push(g); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; dmesh(new THREE.BoxGeometry(0.2, 0.5, 0.5), LM.bkSteelDark, -0.6, Math.cos(a) * 2.2, Math.sin(a) * 2.2); } // lock housings
  // mechanism on the vault side
  for (let i = -2; i <= 2; i++) dmesh(new THREE.BoxGeometry(0.12, 0.16, 4.6), LM.bkSteelDark, 0.6, i * 0.9, 0);
  const bolts = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const g = new THREE.CylinderGeometry(0.17, 0.17, 0.9, 12); const m = new THREE.Mesh(g, LM.gold); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Math.cos(a), Math.sin(a))); doorG.add(m); ctx.disposables.push(g); bolts.push({ m, a }); }
  mk(new THREE.CylinderGeometry(0.35, 0.35, 6.4, 20), LM.gold, VW.x0 + 0.55, DOOR.y, DOOR.hinge); // hinge pin
  const beacons = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sz, sy]) => {
    const g = new THREE.Group(); g.position.set(VW.x0 - 0.3, e + DOOR.y + sy * (DOOR.r + 1.6), sz * (DOOR.r + 1.6)); ctx.add(g);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 12), LM.bkAmber.clone()); g.add(lamp);
    const fan = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 4.5).translate(0, 2.25, 0), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    g.add(fan); ctx.disposables.push(lamp.geometry, fan.geometry, fan.material, lamp.material);
    return { g, lamp, fan };
  });
  const vd = { bolts: 0, swing: 0 }; // bolts 0 = thrown, 1 = retracted; swing 0 = shut, 1 = open (106°)
  ctx.colliders.push({ x0: VW.x0, x1: VW.x1, z0: -DOOR.r, z1: DOOR.r, y0: e + LOW, y1: e + DOOR.y + 2.4, openFn: () => vd.swing > 0.8 && allowed() });
  const setDoor = () => {
    hingeG.rotation.y = vd.swing * 1.85;
    for (const b of bolts) { const rr = DOOR.r - 0.25 + (1 - vd.bolts) * 0.55; b.m.position.set(0, Math.cos(b.a) * rr, Math.sin(b.a) * rr); }
    wheel.rotation.x = vd.bolts * Math.PI * 1.5;
  };
  setDoor();

  // ================================================================ the Treasury Reserve chamber (X 74..128, Z ±30, 20 m tall)
  L.floor(VW.x1, VAULT.x1, -VAULT.z, VAULT.z, LOW + 0.012, 'granite');
  box(VW.x1, VAULT.x1, LOW - 0.6, LOW, -VAULT.z, VAULT.z, 'bkSteelDark'); // vault floor slab (the bridge hides under it)
  for (let x = 76; x < VAULT.x1; x += 4) box(x - 0.05, x + 0.05, LOW + 0.012, LOW + 0.022, -VAULT.z, VAULT.z, 'gold'); // gold floor inlay
  box(VW.x1, VAULT.x1, LOW + 0.012, LOW + 0.03, -2.2, 2.2, 'ecRunner' in LM ? 'ecRunner' : 'bkBlack');
  wall(VAULT.x1 - 0.3, VAULT.x1, LOW, TOP, -VAULT.z, VAULT.z);
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, TOP, VW.x1, VAULT.x1, -VAULT.z, VAULT.z, 4.5);
  // deposit-box walls (east wall full height under the display, the upper N/S walls)
  const depositPlane = (len, h, rotY, x, y, z) => { const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 4.8, (uv.getY(i) * h) / 3.2); L.geo(g.rotateY(rotY).translate(x, y, z), 'bkBoxes'); }; // boxes 0.6 x 0.4 m
  depositPlane(2 * VAULT.z - 2, 9, -Math.PI / 2, VAULT.x1 - 0.34, LOW + 4.7, 0);
  for (const s of [-1, 1]) depositPlane(VAULT.x1 - VW.x1 - 4, 8.4, s < 0 ? 0 : Math.PI, (VW.x1 + VAULT.x1) / 2, LOW + 13.6, s * (VAULT.z - 0.02) - s * 0.33);
  for (const s of [-1, 1]) { box(VW.x1 + 2, VAULT.x1 - 2, LOW + 9.15, LOW + 9.35, s * (VAULT.z - 0.6) - 0.3, s * (VAULT.z - 0.6) + 0.3, 'gold'); } // gallery ledges under the upper deposit walls
  // rolling library ladder on the east wall
  for (const zz of [9.5, 10.4]) box(VAULT.x1 - 1.4, VAULT.x1 - 1.3, LOW, LOW + 9, zz - 0.04, zz + 0.04, 'brushedBronze');
  for (let y = 0.4; y < 9; y += 0.35) box(VAULT.x1 - 1.4, VAULT.x1 - 1.3, LOW + y, LOW + y + 0.04, 9.5, 10.4, 'brushedBronze');
  // the reserve total display (placeholder until the money system exists)
  const total = display(2048, 512, (g, w, h, t) => {
    g.fillStyle = '#04060a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d6b47a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d6b47a'; fit(g, 'TREASURY RESERVE · TOTAL HOLDINGS', w - 200, 64, 'bold', 'Georgia, serif'); g.fillText('TREASURY RESERVE · TOTAL HOLDINGS', w / 2, 92);
    const v = 1000000000 + Math.floor((t || 0) * 137) * 25; // slowly rising placeholder
    const txt = v.toLocaleString('en-US', { minimumFractionDigits: 2 });
    g.fillStyle = '#ffffff'; fit(g, txt, w - 260, 210, 'bold', 'monospace'); g.fillText(txt, w / 2, 262);
    g.fillStyle = 'rgba(255,255,255,0.65)'; fit(g, 'All balances are notional. No real currency is accepted, held or paid out. · Live ledger connects in Phase 2', w - 200, 34, '', 'sans-serif');
    g.fillText('All balances are notional. No real currency is accepted, held or paid out. · Live ledger connects in Phase 2', w / 2, 430);
  });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), total.mat); m.rotation.y = -Math.PI / 2; m.position.set(VAULT.x1 - 0.4, e + LOW + 12.6, 0); ctx.add(m, m.geometry, total.mat, total.t);
    box(VAULT.x1 - 0.38, VAULT.x1 - 0.3, LOW + 9.15, LOW + 16.05, -13.3, 13.3, 'gold'); } // the frame sits behind the screen
  // gold: tall racks along the north wall (4 levels), pyramid stacks on pallets
  for (let x = 80; x < 124; x += 6.2) {
    for (const xx of [x, x + 5.6]) for (const zz of [-29.4, -25.2]) box(xx - 0.1, xx + 0.1, LOW, LOW + 8.4, zz - 0.1, zz + 0.1, 'bkSteelDark', { collide: true });
    for (let k = 0; k < 4; k++) { const y = LOW + 0.3 + k * 2.05; box(x, x + 5.6, y, y + 0.1, -29.5, -25.1, 'bkSteelDark'); box(x + 0.2, x + 5.4, y + 0.1, y + 1.3, -29.2, -25.4, 'bkGoldBars'); }
  }
  const pyramid = (cx, cz) => { box(cx - 0.75, cx + 0.75, LOW, LOW + 0.15, cz - 0.75, cz + 0.75, 'walnut', { collide: true }); for (let k = 0; k < 4; k++) { const s = 0.68 - k * 0.15; box(cx - s, cx + s, LOW + 0.15 + k * 0.3, LOW + 0.45 + k * 0.3, cz - s, cz + s, 'bkGoldBars'); } };
  for (let x = 82; x <= 118; x += 4) for (const z of [-19, -15, -11]) pyramid(x, z);
  plaque(ctx, 'BULLION · INSTITUTIONAL ADVANTAGE', 100, 2.0 + LOW, -22.6, 0, { h: 0.35, color: '#e3c27a' });
  // cash: pallets in the south half + tall wrapped stacks along the south wall
  const pallet = (cx, cz, h = 1.4) => { box(cx - 0.6, cx + 0.6, LOW, LOW + 0.14, cz - 0.6, cz + 0.6, 'walnut', { collide: true }); box(cx - 0.55, cx + 0.55, LOW + 0.14, LOW + 0.14 + h, cz - 0.55, cz + 0.55, 'bkCash'); box(cx - 0.57, cx + 0.57, LOW + 0.14, LOW + 0.16 + h, cz - 0.57, cz + 0.57, 'bkWrap'); };
  for (let x = 82; x <= 118; x += 3) for (const z of [11, 14.5, 18]) if (r() < 0.85) pallet(x, z, 0.9 + r() * 1.2);
  for (let x = 80; x < 125; x += 1.4) pallet(x, 27.8, 3.2 + (Math.floor(x) % 3) * 0.6);
  plaque(ctx, 'LIQUIDITY RESERVES · STRATEGIC CONTRIBUTIONS', 100, 2.0 + LOW, 22.6, Math.PI, { h: 0.35, color: '#e3c27a' });
  // counting team in the central aisle
  for (let i = 0; i < 6; i++) {
    const x = 94 + (i % 3) * 7, z = i < 3 ? -5.5 : 5.5;
    box(x - 1.6, x + 1.6, LOW, LOW + 0.78, z - 0.6, z + 0.6, 'bkBlack', { collide: true }); box(x - 1.62, x + 1.62, LOW + 0.78, LOW + 0.82, z - 0.62, z + 0.62, 'gold');
    box(x - 0.4, x + 0.4, LOW + 0.82, LOW + 1.2, z - 0.25, z + 0.25, 'bkSteelDark'); box(x - 0.3, x + 0.3, LOW + 1.0, LOW + 1.16, z - 0.26, z - 0.24, 'bkCyan');
    for (const dx of [-1.0, 1.0]) staff(x + dx, z + (z < 0 ? -1.05 : 1.05), { y: LOW, yaw: z < 0 ? 0 : Math.PI, sit: true, suit: 0xe8e6e0 });
  }
  for (const [x, z] of [[77, -6], [77, 6], [125, -22], [125, 22], [100, -24], [100, 24]]) guard(x, z, { y: LOW, yaw: x < 90 ? Math.PI / 2 : -Math.PI / 2 });
  for (let i = 0; i < 4; i++) staff(85 + i * 8, 0, { y: LOW, walk: [[80, -2.5], [122, -2.5], [122, 2.5], [80, 2.5]], speed: 1 });

  // forklifts (own meshes, loop round the cash pallets)
  const forkGeo = mergeGeometries([new THREE.BoxGeometry(1.2, 1.1, 2.0).translate(0, 0.75, 0), new THREE.BoxGeometry(1.1, 0.12, 1.3).translate(0, 2.0, -0.2), new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(0.5, 1.95, 0.5), new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(-0.5, 1.95, 0.5), new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(0.5, 1.95, -0.8), new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(-0.5, 1.95, -0.8), new THREE.BoxGeometry(0.2, 2.6, 0.2).translate(0, 1.5, 1.05)].map((g) => g.toNonIndexed()));
  const forkMat = new THREE.MeshStandardMaterial({ color: 0xe0a91c, roughness: 0.45, metalness: 0.3 });
  const forkLoad = mergeGeometries([new THREE.BoxGeometry(1.1, 1.0, 1.1).translate(0, 0.8, 1.7).toNonIndexed()]);
  const forks = [[0, 0.0], [1, 0.5]].map(([i, ph]) => { const g = new THREE.Group(); g.add(new THREE.Mesh(forkGeo, forkMat), new THREE.Mesh(forkLoad, LM.bkCash)); ctx.add(g); return { g, ph, i }; });
  ctx.disposables.push(forkGeo, forkMat, forkLoad);
  const forkLoop = [[80, 8.5], [121, 8.5], [121, 21], [80, 21]], forkLen = 2 * (41 + 12.5);
  const loopPos = (pts, s) => { let acc = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= acc + d) { const t = (s - acc) / d; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]; } acc += d; } return [...pts[0], 0]; };

  // ================================================================ Infrastructure Core (IT data hall, X -78..-42)
  wall(DATA.x1, DATA.x1 + 0.3, 0, H, DATA.z0, -6); wall(DATA.x1, DATA.x1 + 0.3, 0, H, 6, DATA.z1); box(DATA.x1, DATA.x1 + 0.3, 4, H, -6, 6, 'bkSteel');
  for (const s of [-1, 1]) wall(DATA.x1, ARR.x0, 0, 4, s * 6 - (s < 0 ? 0.2 : 0), s * 6 + (s > 0 ? 0.2 : 0)); // corridor to the arrival hall
  L.floor(DATA.x1, ARR.x0, -6, 6, 0.012, 'granite'); box(DATA.x1, ARR.x0, 4, 4.15, -6, 6, 'bkSteelDark');
  for (let x = DATA.x1 + 2; x < ARR.x0 - 1; x += 3) box(x - 0.6, x + 0.6, 3.98, 4.0, -1, 1, 'bkPanel');
  for (const zz of [DATA.z0, DATA.z1]) box(DATA.x0, DATA.x1, 0, H, zz - (zz < 0 ? 0.3 : 0), zz + (zz > 0 ? 0.3 : 0), 'bkSteel', { collide: true });
  box(DATA.x0 - 0.3, DATA.x0, 0, H, DATA.z0, DATA.z1, 'bkSteel', { collide: true });
  box(DATA.x0, DATA.x1, 0, DATA.raised, DATA.z0, DATA.z1, 'bkSteelDark'); L.floor(DATA.x0, DATA.x1, DATA.z0, DATA.z1, DATA.raised + 0.012, 'bkTiles');
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, H, DATA.x0, DATA.x1, DATA.z0, DATA.z1, 3.6);
  plaque(ctx, 'INFRASTRUCTURE CORE (IT)', DATA.x1 + 0.32, 4.7, 0, Math.PI / 2, { h: 0.4, color: '#e3c27a', sub: 'Uptime is a lifestyle' });
  const y0 = DATA.raised;
  for (const zc of [-30, -18, -6, 6, 18, 30]) { // pairs of rack rows facing a contained cold aisle
    for (const s of [-1, 1]) {
      const zf = zc + s * 1.05, zb = zc + s * 2.15;
      box(-74, -48, y0, y0 + 2.25, Math.min(zf, zb), Math.max(zf, zb), 'bkRack', { collide: true });
      box(-74, -48, y0 + 2.25, y0 + 2.35, Math.min(zf, zb), Math.max(zf, zb), 'bkSteelDark');
      box(-74, -48, y0 + 3.2, y0 + 3.35, zc + s * 1.6 - 0.25, zc + s * 1.6 + 0.25, 'satinV', { color: 0xd8a52a }); // cable tray
    }
    box(-74, -48, y0 + 2.35, y0 + 2.4, zc - 1.05, zc + 1.05, 'glass'); // containment roof
    for (const xx of [-74.05, -47.95]) box(xx - 0.04, xx + 0.04, y0, y0 + 2.35, zc - 1.05, zc + 1.05, 'glass', { collide: true });
    box(-74, -48, y0 + 0.01, y0 + 0.02, zc - 0.15, zc + 0.15, 'bkCyan');
  }
  for (let z = -34; z <= 34; z += 8.5) { box(DATA.x0, DATA.x0 + 1.2, y0, y0 + 2.4, z - 1.2, z + 1.2, 'bkSteel', { collide: true }); box(DATA.x0 + 1.2, DATA.x0 + 1.22, y0 + 1.6, y0 + 2.2, z - 0.9, z + 0.9, 'bkCyan'); } // cooling units
  box(-46.5, -43.5, y0, y0 + 0.78, 9, 15, 'bkBlack', { collide: true }); box(-46.55, -43.45, y0 + 0.78, y0 + 0.82, 8.95, 15.05, 'gold');
  for (let i = 0; i < 3; i++) { box(-46.4 + 0.1, -46.3, y0 + 0.9, y0 + 1.6, 9.5 + i * 1.8, 11 + i * 1.8, 'bkCyan'); staff(-45, 9.8 + i * 1.8, { y: y0, yaw: -Math.PI / 2, sit: true, suit: 0x1c2a4e }); }
  for (let i = 0; i < 6; i++) staff(-60, 0, { y: y0, walk: [[-76, -24 + i * 9.6], [-46, -24 + i * 9.6], [-46, -24 + i * 9.6 + 1.2], [-76, -24 + i * 9.6 + 1.2]].map(([x, z]) => [x, Math.max(-36, Math.min(36, z + (i % 2 ? 0 : 0)))]), speed: 0.9, suit: 0x1c2a4e });

  // ================================================================ Armoured Logistics Bay (ALC depot, X -12..30, Z 12..39)
  L.floor(BAY.x0, BAY.x1, BAY.z0, BAY.z1, 0.012, 'concreteDark');
  ceiling(L, { wall: 'bkSteelDark', wallDeep: 'bkSteelDark', panel: 'bkPanel' }, H, BAY.x0, BAY.x1, BAY.z0, BAY.z1, 4.2);
  box(BAY.x0, BAY.x1, 0, H, BAY.z1 - 0.1, BAY.z1 + 0.1, 'bkSteel');
  const vtGap = b1Doors.filter((d) => d.x > 0).map((d) => [d.zc - d.c.doorW / 2 - 0.1, d.zc + d.c.doorW / 2 + 0.1, d.c.doorH]);
  cladWithGaps(BAY.x1, -1, BAY.z0, BAY.z1, vtGap, H);
  for (let i = 0; i < 6; i++) { // charging docks on the south wall
    const x = -7 + i * 5;
    box(x - 1.4, x + 1.4, 0.012, 0.04, 33, 38, 'bkCyan'); box(x - 0.3, x + 0.3, 0, 1.8, 38.2, 38.8, 'bkSteelDark', { collide: true }); box(x - 0.2, x + 0.2, 1.2, 1.6, 38.18, 38.2, 'bkCyan');
    if (i % 3 !== 1) { box(x - 0.5, x + 0.5, 0.15, 1.35, 34.8, 36.2, 'satinV', { color: 0x2e7bd6 }); box(x - 0.45, x + 0.45, 1.35, 1.45, 34.85, 36.15, 'bkSteel'); box(x - 0.3, x + 0.3, 1.0, 1.1, 34.78, 34.8, 'bkAmber'); }
  }
  plaque(ctx, 'AUTONOMOUS LIQUIDITY COURIER DEPOT', 9, 4.2, BAY.z1 - 0.15, Math.PI, { h: 0.45, color: '#e3c27a', sub: 'Armoured Logistics Bay · Nothing can go wrong in transit' });
  // maintenance gantry over a courier on a lift table
  for (const [x, z] of [[4, 20], [14, 20], [4, 28], [14, 28]]) box(x - 0.2, x + 0.2, 0, 5, z - 0.2, z + 0.2, 'satinV', { color: 0xe0a91c, collide: true });
  for (const z of [20, 28]) box(4, 14, 4.8, 5.2, z - 0.2, z + 0.2, 'satinV', { color: 0xe0a91c });
  box(8.5, 9.5, 3.4, 4.8, 23.5, 24.5, 'bkSteelDark'); box(7.5, 10.5, 0, 0.6, 22.5, 25.5, 'bkSteelDark', { collide: true }); box(8.4, 9.6, 0.6, 1.8, 23.3, 24.7, 'satinV', { color: 0x2e7bd6 });
  for (const [x, z] of [[7, 22], [11, 26]]) staff(x, z, { yaw: Math.atan2(9 - x, 24 - z), suit: 0x1c2a4e, fidget: 0.3 });
  // muster area: hatched floor, guards lined up, a supervisor
  L.geo(new THREE.PlaneGeometry(10, 7).rotateX(-Math.PI / 2).translate(-5, 0.03, 17.5), 'hazard');
  for (let i = 0; i < 8; i++) guard(-9 + (i % 4) * 2.2, 16 + Math.floor(i / 4) * 2.5, { yaw: Math.PI, fidget: 0.1 });
  guard(-5, 13.4, { yaw: 0 });
  // route board (static display)
  const board = display(1024, 512, (g, w, h) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d6b47a'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#d6b47a'; g.textAlign = 'left'; g.textBaseline = 'middle'; fit(g, 'ALC ROUTE BOARD', w - 60, 46, 'bold', 'Georgia, serif'); g.fillText('ALC ROUTE BOARD', 30, 50);
    [['ALC-01', 'Treasury Reserve → Asset Protection HQ', '250,000.00', 'ESCORTED'], ['ALC-02', 'Treasury Reserve → Executive Leisure Suite', '1,800,000.00', 'ESCORTED'], ['ALC-03', 'Treasury Reserve → Sports Analytics Arena', '420,000.00', 'STANDBY'], ['ALC-04', 'Treasury Reserve → Equine Performance Centre', '760,000.00', 'CHARGING']].forEach(([n, rt, amt, st], i) => {
      const y = 130 + i * 90; g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'; g.fillRect(24, y - 34, w - 48, 70);
      g.fillStyle = '#5fd8ff'; fit(g, n, 120, 30); g.fillText(n, 40, y);
      g.fillStyle = '#fff'; fit(g, rt, 520, 26, '600'); g.fillText(rt, 170, y);
      g.fillStyle = '#7ee0a0'; g.textAlign = 'right'; fit(g, amt, 170, 26, 'bold', 'monospace'); g.fillText(amt, 860, y);
      g.fillStyle = st === 'ESCORTED' ? '#ffb347' : '#aab'; fit(g, st, 130, 20); g.fillText(st, w - 36, y); g.textAlign = 'left';
    });
  });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), board.mat); m.position.set(14, e + 3.4, BAY.z0 + 0.2); ctx.add(m, m.geometry, board.mat, board.t); box(9.8, 18.2, 1.3, 5.5, BAY.z0 + 0.15, BAY.z0 + 0.18, 'gold'); }

  // ================================================================ robot sentries (instanced, patrolling)
  const sentryGeo = mergeGeometries([new THREE.CylinderGeometry(0.42, 0.5, 1.0, 12).translate(0, 0.7, 0), new THREE.SphereGeometry(0.42, 12, 8, 0, TAU, 0, Math.PI / 2).translate(0, 1.2, 0), new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12).translate(0, 0.1, 0)].map((g) => g.toNonIndexed()));
  const eyeGeo = new THREE.BoxGeometry(0.5, 0.07, 0.1).translate(0, 1.38, 0.38);
  const SENTRY = [
    { y: 0, pts: [[30.5, -9], [40.5, -9], [40.5, 8], [30.5, 8]], sp: 0.9 },
    { y: 0, pts: [[40.5, 8], [30.5, 8], [30.5, -9], [40.5, -9]], sp: 0.9 },
    { y: LOW, pts: [[44, -26], [60, -26], [60, -8], [44, -8]], sp: 0.8 },
    { y: LOW, pts: [[44, 8], [60, 8], [60, 26], [44, 26]], sp: 0.8 },
    { y: LOW, pts: [[78, -22], [124, -22], [124, -8], [78, -8]], sp: 0.7 },
  ];
  const sBody = new THREE.InstancedMesh(sentryGeo, LM.blackMetal, SENTRY.length), sEye = new THREE.InstancedMesh(eyeGeo, LM.bkRed, SENTRY.length);
  sBody.frustumCulled = sEye.frustumCulled = false; ctx.add(sBody, sentryGeo); ctx.add(sEye, eyeGeo);
  const sLen = SENTRY.map((s) => s.pts.reduce((a, p, i) => a + Math.hypot(s.pts[(i + 1) % s.pts.length][0] - p[0], s.pts[(i + 1) % s.pts.length][1] - p[1]), 0));

  // ================================================================ live security (per role, per user)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  let clock = 0, totalAcc = 0;
  ctx.onUpdate((dt, t, viewer, agents = []) => {
    clock += dt;
    const ok = allowed();
    state.ok = ok;
    const vrel = viewer ? { x: viewer.x, z: viewer.z, y: viewer.y - e } : null;
    const users = [...(ok && vrel ? [vrel] : []), ...agents.map((a) => ({ x: a.x, z: a.z, y: a.y - e }))].filter((u) => u.y > MOAT - 2 && u.y < TOP);
    // refusal for roles without access who walk up to a layer
    if (vrel && !ok && ((vrel.x > AIR.x - 4 && vrel.x < AIR.x - 1 && Math.abs(vrel.z) < 10) || (vrel.x > LAS.x0 - 2.5 && vrel.x < LAS.x0 && Math.abs(vrel.z) < 3) || (vrel.x > MOATX[0] - 2 && vrel.x < MOATX[0] && Math.abs(vrel.z) < 3 && vrel.y < -3))) refuse(clock);
    // airlocks: one door at a time; the far door opens after the near one has closed
    for (const a of airlocks) {
      const inZ = (u, pad = 0) => u.z > a.z0 - pad && u.z < a.z1 + pad;
      const inside = users.some((u) => u.x > a.xa && u.x < a.xb && inZ(u));
      const nearW = users.some((u) => u.x > a.xa - 3.5 && u.x <= a.xa && inZ(u, 1));
      const nearE = users.some((u) => u.x >= a.xb && u.x < a.xb + 3.5 && inZ(u, 1));
      if (inside) {
        if (!a.side) a.side = a.entry.pos >= a.exit.pos ? 'W' : 'E';
        a.dwell += dt;
        const [inn, out] = a.side === 'W' ? [a.entry, a.exit] : [a.exit, a.entry];
        inn.t = 0; if (inn.pos < 0.05 && a.dwell > 0.5) out.t = 1;
      } else {
        a.dwell = 0; a.side = null;
        a.entry.t = nearW && a.exit.pos < 0.05 ? 1 : 0;
        a.exit.t = nearE && !nearW && a.entry.pos < 0.05 ? 1 : 0;
      }
      for (const d of [a.entry, a.exit]) { d.pos += Math.sign(d.t - d.pos) * Math.min(Math.abs(d.t - d.pos), dt * 1.6); d.set(); }
      const busy = inside || a.entry.pos > 0.02 || a.exit.pos > 0.02;
      for (const s of a.st) s.material.color.set(busy ? 0x3cff9a : 0xff2030);
    }
    // lasers: power down (fade) while a cleared user or a courier is in or at the corridor
    const clear = users.some((u) => u.x > LAS.x0 - 4 && u.x < LAS.x1 + 3 && Math.abs(u.z) < 4.5 && u.y > -1);
    laserOn += Math.sign((clear ? 0 : 1) - laserOn) * Math.min(Math.abs((clear ? 0 : 1) - laserOn), dt * 1.5);
    laserMat.opacity = laserOn; laserMesh.visible = laserOn > 0.01;
    sweeps.forEach((m, i) => { m.visible = laserOn > 0.01; m.position.y = e + 0.4 + (Math.sin(clock * (0.9 + i * 0.3) + i) * 0.5 + 0.5) * (LAS.h - 0.8); });
    // bridge: extends for cleared users / couriers near the moat; never retracts under someone
    const onBridge = vrel && vrel.x > MOATX[0] - 0.5 && vrel.x < MOATX[1] + 0.5 && Math.abs(vrel.z) < BRIDGE_Z + 0.6 && vrel.y > LOW - 1;
    const wantB = onBridge || users.some((u) => u.x > STAIR.x1 - 12 && u.x < VW.x1 + 14 && Math.abs(u.z) < 14 && u.y < -3);
    state.bridge += Math.sign((wantB ? 1 : 0) - state.bridge) * Math.min(Math.abs((wantB ? 1 : 0) - state.bridge), dt * 0.35);
    setBridge();
    // the vault door: bolts retract first, then it swings (closing: swing shut, then throw the bolts)
    const wantD = users.some((u) => u.x > MOATX[0] - 6 && u.x < VW.x1 + 16 && Math.abs(u.z) < 14 && u.y < -3);
    if (wantD) { if (vd.bolts < 1) vd.bolts = Math.min(1, vd.bolts + dt * 0.8); else vd.swing = Math.min(1, vd.swing + dt * 0.22); }
    else { if (vd.swing > 0) vd.swing = Math.max(0, vd.swing - dt * 0.22); else vd.bolts = Math.max(0, vd.bolts - dt * 0.8); }
    setDoor();
    const cycling = (wantD && vd.swing < 1) || (!wantD && vd.bolts > 0);
    for (const [i, b] of beacons.entries()) { b.fan.rotation.x = clock * 5 + i; b.fan.material.opacity = cycling ? 0.35 : 0; b.lamp.material.color.set(cycling && Math.sin(clock * 10 + i) > 0 ? 0xffc040 : 0x6a3a08); }
    // forklifts, sentries
    for (const f of forks) { const [x, z, yaw] = loopPos(forkLoop, ((clock * 1.4 + f.ph * forkLen) % forkLen)); f.g.position.set(x, e + LOW, z); f.g.rotation.y = yaw; }
    SENTRY.forEach((s, i) => {
      const [x, z, yaw] = loopPos(s.pts, (clock * s.sp + i * 7) % sLen[i]);
      m4.compose(pv.set(x, e + s.y, z), q.setFromAxisAngle(up, yaw), one); sBody.setMatrixAt(i, m4); sEye.setMatrixAt(i, m4);
    });
    sBody.instanceMatrix.needsUpdate = sEye.instanceMatrix.needsUpdate = true;
    if ((totalAcc += dt) > 1 && ctx.group.visible) { totalAcc = 0; total.redraw(clock); }
  });

  ctx.shapes = [treasuryShape(e)];
  ctx.treasuryStats = { people: L.people.length, airlocks: airlocks.length };
  L.build();
}
