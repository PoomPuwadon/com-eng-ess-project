import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Lux, LM, plaque, graniteTex } from '../world/lux.js';
import { luxLiftHall } from './luxHall.js';
import { ARENA as A, BOXES, RAMPS, FLIGHTS, AISLE_CUTS, minus, levelAt, ledBand, arenaLive } from './arena.js';
import { BC } from '../world/broadcast.js';

// ================================================================= PHASE 1 — VT-02 SPORTS ANALYTICS ARENA
// Rebuilt from scratch in the Phase 1 look. The greybox (arena.js) is only the placement guide: its
// layout data (bowl centre, level radii/heights, box slots, ramps, grand stair) and its walkable
// shape are reused so collisions match; every visible surface here is new.
// Look: Bernabéu-inspired — a silver louvred skin round the bowl under a steel radial roof with light
// rings, deep navy lacquer and walnut on the tier fronts, white-marble grand stair with a navy runner,
// glass balustrades with brass rails, private boxes with cream leather armchairs, a black-and-gold
// centre-hung screen stack over a crest-inlaid pit.
// World coords: bowl centre (108, 0), wall r 58; the arrivals hall is X 30..50, Z -40..30.

const TAU = Math.PI * 2, A0 = Math.PI, A1 = A0 + TAU;
const SH = A.stairHalfA, RUN = 0.055; // stair aisle / runner half-angles
const RISE = 0.18, RW = A.RWALL - 0.1; // inner face of the outer wall
const P = (r, a, y = 0) => [A.cx + r * Math.cos(a), y, A.cz + r * Math.sin(a)];
const yawIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a)); // facing the centre from angle a
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a)); // facing away from the centre
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48c];
const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x8a6a40, 0xc9a26a];
const OUTFIT = [0x14213d, 0xf2efe6, 0x1c1c22, 0x8a1c2b, 0x2b3a67, 0xffffff, 0x3a3f4a, 0xd8c8a8, 0x0f3b4a];
const CARPET = [0x1b2a52, 0x4a1622, 0x1d3a2c, 0x2a2a33]; // box carpets: navy, claret, racing green, charcoal

// ---------------------------------------------------------------- materials (registered in the Lux palette)
let READY = false;
function initMaterials() {
  if (READY) return;
  READY = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // pit floor: polished navy resin with a gold crest and pitch-line inlays (1 texture over the 40 m disc)
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'), m = 512;
  const grd = g.createRadialGradient(m, m, 40, m, m, 512); grd.addColorStop(0, '#1d2d5c'); grd.addColorStop(1, '#0c1430');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = '#d9a441'; g.lineWidth = 6;
  for (const rr of [500, 470, 300]) { g.beginPath(); g.arc(m, m, rr, 0, TAU); g.stroke(); }
  g.lineWidth = 3;
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; g.beginPath(); g.moveTo(m + Math.cos(a) * 300, m + Math.sin(a) * 300); g.lineTo(m + Math.cos(a) * 470, m + Math.sin(a) * 470); g.globalAlpha = i % 4 ? 0.25 : 0.8; g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = '#d9a441'; g.font = '600 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ring = '· SPORTS ANALYTICS ARENA · PERFORMANCE THROUGH CONVICTION ';
  [...ring.repeat(2)].forEach((ch, i, arr) => { const a = (i / arr.length) * TAU; g.save(); g.translate(m + Math.cos(a) * 385, m + Math.sin(a) * 385); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); });
  g.beginPath(); g.moveTo(m, m - 200); g.lineTo(m + 160, m - 120); g.lineTo(m + 140, m + 90); g.lineTo(m, m + 210); g.lineTo(m - 140, m + 90); g.lineTo(m - 160, m - 120); g.closePath(); // crest shield
  g.fillStyle = '#122152'; g.fill(); g.lineWidth = 10; g.stroke();
  g.fillStyle = '#f2e3b3'; g.font = '700 120px Georgia, serif'; g.fillText('SA', m, m - 10);
  g.font = '600 34px Georgia, serif'; g.fillText('EST. Q3', m, m + 100);
  const pit = new THREE.CanvasTexture(c); pit.colorSpace = THREE.SRGBColorSpace; pit.anisotropy = 8;
  Object.assign(LM, {
    arPit: std({ map: pit, roughness: 0.18, metalness: 0.1 }),
    arNavy: std({ color: 0x15213f, roughness: 0.32, metalness: 0.35 }),
    arNavyDeep: std({ color: 0x0a1024, roughness: 0.8, metalness: 0.1 }),
    arIvory: std({ color: 0xece6da, roughness: 0.45 }),
    arGold: std({ color: 0xd9a441, roughness: 0.28, metalness: 0.95 }),
    arTerrazzo: std({ map: graniteTex('arTerrazzo', '#232838', [110, 112, 125]), roughness: 0.14, metalness: 0.1 }), // glossy, picks up the lights
    arTruss: std({ color: 0x2a2d38, roughness: 0.5, metalness: 0.6 }),
    arCarpet: std({ vertexColors: true, roughness: 0.95 }),
    arLeather: std({ color: 0xffffff, roughness: 0.42, metalness: 0.05 }),
    arLedBlue: std({ color: 0x0b1a3a, emissive: 0x3a8bff, emissiveIntensity: 2.2 }),
    arLedGold: std({ color: 0x3a2c1e, emissive: 0xffc06a, emissiveIntensity: 1.8 }),
    arPanel: std({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.6 }),
    arPanelSoft: std({ color: 0xfff4e0, emissive: 0xffe2b0, emissiveIntensity: 0.55, roughness: 0.6 }),
    arCatch: std({ color: 0x0b0f1e, roughness: 1 }), // backstop under the bowl (never seen unless something leaks)
    arFrosted: std({ color: 0xdfe8f0, roughness: 0.35, transparent: true, opacity: 0.35, depthWrite: false }),
  });
}

// ---------------------------------------------------------------- surface helpers
// Parametric grid surface: fn(u, v) -> [x, y, z] (floor-local y). Front face = d/du × d/dv.
function surf(nu, nv, fn, uvFn, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = fn(i / nu, j / nv); pos.push(...p); uv.push(...uvFn(p, i / nu, j / nv));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const segs = (r, a0, a1, s = 1.2) => Math.max(1, Math.ceil(((a1 - a0) * Math.max(r, 1)) / s));
const planar = (t) => (p) => [p[0] / t, p[2] / t];
// annular sector at height y, facing up (or down)
const ring = (r0, r1, a0, a1, y, { down = false, tile = 2 } = {}) =>
  surf(segs(r1, a0, a1), 1, (u, v) => P(r0 + (r1 - r0) * v, a0 + (a1 - a0) * u, y), planar(tile), down);
// curved wall at radius r, facing the centre (or outward)
const wall = (r, a0, a1, y0, y1, { out = false, tile = 2.4 } = {}) =>
  surf(segs(r, a0, a1), 1, (u, v) => P(r, a0 + (a1 - a0) * u, y0 + (y1 - y0) * v), (p, u, v) => [((a0 + (a1 - a0) * u) * r) / tile, (y0 + (y1 - y0) * v) / tile], out);
// radial quad at angle a, r0..r1, bottom/top heights may vary along r; both faces
function radial(L, mat, a, r0, r1, yb0, yt0, yb1 = yb0, yt1 = yt0, color) {
  for (const flip of [false, true]) L.geo(surf(1, 1, (u, v) => P(r0 + (r1 - r0) * u, a, (1 - u) * (yb0 + (yt0 - yb0) * v) + u * (yb1 + (yt1 - yb1) * v)), (p, u, v) => [u * (r1 - r0) / 2.4, v], flip), mat, color);
}
// oriented box: centre, size (w along local x, d along local z), yaw
function obox(L, x, y, z, w, h, d, yaw, mat, color) {
  L.geo(new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z), mat, color);
}
// a box whose long axis runs radially from r0 to r1 at angle a
function rbox(L, a, r0, r1, y0, y1, w, mat, color) {
  const [x, , z] = P((r0 + r1) / 2, a);
  obox(L, x, (y0 + y1) / 2, z, w, y1 - y0, r1 - r0, Math.atan2(Math.cos(a), Math.sin(a)), mat, color);
}

// ---------------------------------------------------------------- the floor
export function sportsArena(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const e = ctx.e, H = ctx.floor.height, R = A.R, Y = A.Y;
  const r = rng(2024);
  const bc = []; // broadcast screens (world y)
  const chairs = []; // [x, y, z, yaw, color]
  const people = (x, z, y, yaw, o = {}) => L.person(x, z, { y, yaw, suit: pick(OUTFIT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()), ...o });
  const full = (extra = []) => minus(A0, A1, [...AISLE_CUTS, ...extra]);

  // ================================================================ pit
  L.geo(surf(72, 12, (u, v) => P(20 * v + 0.01, A0 + TAU * u, Y[0] + 0.01), (p) => [(p[0] - A.cx) / 40 + 0.5, 0.5 - (p[2] - A.cz) / 40]), 'arPit');
  for (const [r0, r1, m] of [[19.55, 19.7, 'arGold'], [14.95, 15.15, 'arLedBlue']]) L.geo(ring(r0, r1, A0, A1, Y[0] + 0.02), m);
  for (let i = 0; i < 14; i++) { // analytics desks round the base of the screen stack
    const a = (i / 14) * TAU + 0.22, [x, , z] = P(17, a), yw = yawIn(a);
    obox(L, x, Y[0] + 0.37, z, 1.7, 0.74, 0.8, yw, 'walnut');
    obox(L, x, Y[0] + 0.76, z, 1.8, 0.04, 0.9, yw, 'marble');
    const [mx, , mz] = P(16.75, a);
    obox(L, mx, Y[0] + 1.15, mz, 1.16, 0.68, 0.05, yw, 'blackMetal');
    bc.push({ x: mx - 0.03 * Math.cos(a), y: e + Y[0] + 1.15, z: mz - 0.03 * Math.sin(a), yaw: yw, w: 1.1, h: 0.62, cell: i % BC.MATCHES });
    const [px, , pz] = P(18.1, a);
    L.person(px, pz, { y: Y[0], yaw: yw, suit: 0xf2efe6, skin: pick(SKIN, r()), hair: pick(HAIR, r()) });
  }

  // backstop: a dark floor just under the pit level and a dark drum inside the outer wall, so no seam can
  // ever show the floor below or the outside of the tower
  L.geo(ring(0, A.RWALL + 0.4, A0, A1, Y[0] - 0.12), 'arCatch');
  L.geo(wall(A.RWALL + 0.3, A0, A1, Y[0] - 0.12, 0.05), 'arCatch');

  // ================================================================ tiers: tier fronts, walkways, boxes
  for (let k = 1; k <= 4; k++) {
    const y = Y[k], r0 = R[k], rb = r0 + A.boxDepth;
    const rEnd = k < 4 ? R[k + 1] : RW, rIn = k < 4 && A.ramps ? rEnd - A.rampBand : rEnd;
    const rampCuts = (t) => RAMPS.filter((rp) => rp.t === t).map((rp) => [rp.lo, rp.hi]);
    // walkway: terrazzo with a brass inlay, the ramp band only where there is no ramp
    for (const [s, en] of full()) {
      L.geo(ring(r0 - 0.05, rIn + (rIn === rEnd ? 0.3 : 0), s, en, y + 0.008, { tile: 2 }), 'arTerrazzo'); // one continuous floor, tucked under the walls at both edges
      L.geo(ring(rb + 0.55, rb + 0.63, s, en, y + 0.016), 'arGold');
    }
    if (k < 4) for (const [s, en] of full(rampCuts(k))) L.geo(ring(rIn, rEnd, s, en, y + 0.01), 'arTerrazzo');
    // tier front (riser at r0): walnut panelling for the walkway below, navy fascia carrying the LED board
    const yb = Y[k - 1], yf = y - 1.45;
    for (const [s, en] of full()) {
      L.geo(wall(r0, s, en, yb - 0.3, yf), 'walnut'); // starts below the floor it stands on (no seam)
      L.geo(wall(r0 - 0.02, s, en, yf, y), 'arNavy');
      L.geo(wall(r0 - 0.045, s, en, yf - 0.02, yf + 0.06), 'arLedBlue'); // blue neon line under each tier
      L.geo(wall(r0 - 0.04, s, en, y - 0.07, y + 0.01), 'arGold');
      L.geo(wall(r0 - 0.03, s, en, yb, yb + 0.22), 'arNavy'); // skirting
      // wall sconces over the walkway below (warm uplights)
      for (let a = s + 4 / r0; a < en - 2 / r0; a += 7 / r0) { const [x, , z] = P(r0 - 0.1, a); L.box(x - 0.13, x + 0.13, yb + 2.0, yb + 2.45, z - 0.13, z + 0.13, 'lampWarm'); }
    }
    for (const [s0, s1] of full(rampCuts(k - 1))) ledBand(ctx, r0 - 0.06, y - 1.25, y - 0.34, s0, s1);
  }

  // ---- private boxes: carpet, glass front with brass rail, frosted dividers, back rail, armchairs, TV
  for (const b of BOXES) {
    const k = b.k, y = Y[k], r0 = R[k], rb = r0 + A.boxDepth, dh = A.doorHalfM / rb, yw = yawIn(b.mid);
    L.geo(ring(r0 + 0.05, rb, b.a0, b.a1, y + 0.02), 'arCarpet', CARPET[b.idx % 4]);
    L.geo(ring(rb - 0.25, rb, b.a0, b.a1, y + 0.025), 'arCarpet', 0x9a7a3a); // gold-thread border at the back
    for (const out of [false, true]) L.geo(wall(r0 + 0.12, b.a0, b.a1, y, y + 1.05, { out }), 'glass');
    L.geo(ring(r0 + 0.05, r0 + 0.19, b.a0, b.a1, y + 1.1), 'arGold');
    L.geo(wall(r0 + 0.05, b.a0, b.a1, y + 1.04, y + 1.1), 'arGold');
    for (const a of b.first ? [b.a0, b.a1] : [b.a1]) { // frosted dividers with walnut posts
      radial(L, 'arFrosted', a, r0 + 0.2, rb, y, y + 1.25);
      for (const rr of [r0 + 0.12, rb]) { const [x, , z] = P(rr, a); L.box(x - 0.07, x + 0.07, y, y + 1.32, z - 0.07, z + 0.07, 'walnut'); }
    }
    for (const [s, en] of [[b.a0, b.mid - dh], [b.mid + dh, b.a1]]) { // back rail with the door gap
      for (const out of [false, true]) L.geo(wall(rb, s, en, y, y + 0.95, { out }), 'glass');
      L.geo(ring(rb - 0.06, rb + 0.06, s, en, y + 0.98), 'arGold');
    }
    // two leather recliners facing the stack, a walnut side table between them
    const yo = yawOut(b.mid), span = b.a1 - b.a0;
    for (const sd of [-1, 1]) {
      const a = b.mid + sd * 0.23 * span, [x, , z] = P(r0 + 2.75, a);
      chairs.push([x, y, z, yawIn(a), [0x7a3a1c, 0xd9c7a8, 0x3a2418, 0x8a1c2b][b.idx % 4]]); // cognac, cream, espresso, claret
      // position console on a pedestal in front of the seat, screen tilted up towards the sitter
      const [cx, , cz] = P(r0 + 1.85, a), ya = yawOut(a), TILT = -0.8;
      L.cyl(cx, cz, 0.16, y, y + 0.04, 'blackMetal', { seg: 12 });
      L.cyl(cx, cz, 0.04, y + 0.04, y + 0.78, 'blackMetal', { seg: 8 });
      L.geo(new THREE.BoxGeometry(0.58, 0.38, 0.045).rotateX(TILT).rotateY(ya).translate(cx, y + 0.86, cz), 'blackMetal');
      const nx = Math.cos(TILT) * Math.sin(ya), ny = -Math.sin(TILT), nz = Math.cos(TILT) * Math.cos(ya);
      bc.push({ x: cx + nx * 0.026, y: e + y + 0.86 + ny * 0.026, z: cz + nz * 0.026, yaw: ya, tilt: TILT, w: 0.52, h: 0.31, cell: BC.CONSOLE + ((b.idx * 2 + (sd > 0 ? 1 : 0)) % BC.CONSOLES) });
    }
    { const [x, , z] = P(r0 + 2.85, b.mid); L.cyl(x, z, 0.28, y, y + 0.52, 'walnut', { seg: 14 }); L.cyl(x, z, 0.3, y + 0.52, y + 0.56, 'marble', { seg: 14 }); }
    // a guest now and then
    for (const [rr, off] of [[r0 + 4.2, 0.3], [r0 + 1.15, -0.38]]) if (r() < 0.6) { const a = b.mid + off * span, [x, , z] = P(rr, a); people(x, z, y, yawIn(a)); }
    // the box's own TV, on a black gantry at the front, facing the seats (live match from the shared atlas)
    const [gx, , gz] = P(r0 + 0.42, b.mid), [tx, , tz] = P(r0 + 0.62, b.mid), [kx, , kz] = P(r0 + 0.57, b.mid);
    L.box(gx - 0.05, gx + 0.05, y, y + 3.45, gz - 0.05, gz + 0.05, 'blackMetal');
    L.geo(new THREE.BoxGeometry(0.1, 0.1, 0.25).rotateY(yo).translate((gx + kx) / 2, y + 3.3, (gz + kz) / 2), 'blackMetal');
    obox(L, kx, y + 2.75, kz, 1.9, 1.1, 0.06, yo, 'blackMetal'); // bezel behind the panel
    bc.push({ x: tx, y: e + y + 2.75, z: tz, yaw: yo, w: 1.78, h: 1.0, cell: b.idx % 27 === 7 ? BC.RACE : b.idx % BC.MATCHES });
  }

  // ---- stretches of each level with no box (beside the stair, between ramp landings): glass front with a
  // brass rail (open only where a ramp arrives) and standing cocktail tables
  for (let k = 1; k <= 4; k++) {
    const y = Y[k], r0 = R[k];
    const rampIn = RAMPS.filter((rp) => rp.t === k - 1).map((rp) => { const w = 3.6 / r0; return rp.dir > 0 ? [rp.aTop - w, rp.aTop + 0.03] : [rp.aTop - 0.03, rp.aTop + w]; });
    const boxes = BOXES.filter((bx) => bx.k === k).map((bx) => [bx.a0, bx.a1]);
    for (const [s0, s1] of full([...rampIn, ...boxes])) {
      if ((s1 - s0) * r0 < 0.2) continue;
      for (const out of [false, true]) L.geo(wall(r0 + 0.12, s0, s1, y, y + 1.05, { out }), 'glass');
      L.geo(ring(r0 + 0.05, r0 + 0.19, s0, s1, y + 1.1), 'arGold');
      L.geo(wall(r0 + 0.05, s0, s1, y + 1.04, y + 1.1), 'arGold');
      for (const a of [s0, s1]) { const [x, , z] = P(r0 + 0.12, a); L.box(x - 0.07, x + 0.07, y, y + 1.18, z - 0.07, z + 0.07, 'arGold'); }
      const n = Math.floor(((s1 - s0) * r0) / 4.5);
      for (let i = 0; i < n; i++) {
        const a = s0 + ((i + 0.5) / n) * (s1 - s0), [x, , z] = P(r0 + 2.4, a);
        L.cyl(x, z, 0.32, y, y + 0.03, 'blackMetal', { seg: 12 }); L.cyl(x, z, 0.04, y, y + 1.05, 'arGold', { seg: 6 }); L.cyl(x, z, 0.42, y + 1.05, y + 1.1, 'marble', { seg: 16 });
        if (r() < 0.7) { const [px, , pz] = P(r0 + 3.1, a + 0.5 / r0); people(px, pz, y, faceTo(px, pz, x, z)); }
      }
    }
  }

  // ---- ramps (terrazzo, navy side, glass balustrade + brass rail)
  for (const rp of RAMPS) {
    const lo = Math.min(rp.aLow, rp.aTop), hi = Math.max(rp.aLow, rp.aTop);
    const h = (a) => rp.y0 + (rp.y1 - rp.y0) * Math.min(1, Math.max(0, (a - rp.aLow) / (rp.aTop - rp.aLow)));
    const n = segs(rp.rOut, lo, hi, 0.8);
    L.geo(surf(n, 1, (u, v) => { const a = lo + (hi - lo) * u; return P(rp.rIn + A.rampBand * v, a, h(a) + 0.01); }, planar(2)), 'arTerrazzo');
    L.geo(surf(n, 1, (u, v) => { const a = lo + (hi - lo) * u; return P(rp.rIn, a, rp.y0 + (h(a) - rp.y0) * v); }, (p, u, v) => [u * 8, v]), 'arNavy');
    for (const flip of [false, true]) L.geo(surf(n, 1, (u, v) => { const a = lo + (hi - lo) * u; return P(rp.rIn + 0.05, a, h(a) + 1.0 * v); }, () => [0, 0], flip), 'glass');
    L.geo(surf(n, 1, (u, v) => { const a = lo + (hi - lo) * u; return P(rp.rIn - 0.03 + 0.16 * v, a, h(a) + 1.03); }, () => [0, 0]), 'arGold');
  }

  // ================================================================ the grand stair
  const sa0 = A0 - SH, sa1 = A0 + SH, ta0 = sa0 - 0.002, ta1 = sa1 + 0.002; // treads run ~5-10 cm under the cheek walls
  const sideY = (rr) => Y[levelAt(rr)];
  // the stair's pitch line (flights straight, landings flat)
  const pitch = (rr) => {
    let y = 0;
    for (const [ra, rb, ya, yb] of FLIGHTS) { if (rr >= ra) return y; if (rr >= rb) return yb + ((ya - yb) * (rr - rb)) / (ra - rb); y = yb; }
    return y;
  };
  const runner = (r0, r1, y) => {
    L.geo(ring(r0, r1, A0 - RUN, A0 + RUN, y + 0.008), 'arCarpet', 0x16244a);
    for (const s of [-1, 1]) L.geo(ring(r0, r1, A0 + s * RUN - (s > 0 ? 0.004 : 0), A0 + s * RUN + (s > 0 ? 0 : 0.004), y + 0.01), 'arGold');
  };
  let prevR = RW, prevY = 0, lvl = 4;
  for (const [ra, rb, ya, yb] of FLIGHTS) {
    // landing
    L.geo(ring(ra, prevR + (prevR === RW ? 0.3 : 0), ta0, ta1, prevY + 0.012, { tile: 2.4 }), 'marble');
    L.geo(ring(ra, ra + 0.12, sa0, sa1, prevY + 0.016), 'arGold');
    runner(ra, prevR, prevY);
    if (lvl < 4) { // level plaque on a walnut pylon at the landing's edge, facing the people coming down
      for (const s of [-1, 1]) {
        const [x, , z] = P(ra + 0.45, A0 + s * (SH - 0.55 / (ra + 0.45))); // front edge, over the box rows (keeps the side exits clear)
        L.box(x - 0.3, x + 0.3, prevY, prevY + 1.5, z - 0.22, z + 0.22, 'walnut', { collide: true });
        L.box(x - 0.32, x + 0.32, prevY + 1.5, prevY + 1.56, z - 0.24, z + 0.24, 'arGold');
        plaque(ctx, `LEVEL ${lvl}`, x - 0.31, prevY + 1.05, z, -Math.PI / 2, { h: 0.34, color: '#e3c27a', bg: '#15213f' });
      }
    }
    // flight: marble treads, navy risers with a gold step light, brass nosing, navy runner
    const n = Math.round((ya - yb) / RISE), run = (ra - rb) / n, rise = (ya - yb) / n;
    for (let i = 0; i < n; i++) {
      const r1 = ra - i * run, r0 = r1 - run, yy = ya - (i + 1) * rise;
      L.geo(ring(r0 - 0.01, r1, ta0, ta1, yy, { tile: 2.4 }), 'marble');
      L.geo(wall(r1, ta0, ta1, yy - 0.05, yy + rise), 'arNavy');
      L.geo(wall(r1 - 0.01, sa0, sa1, yy + 0.015, yy + 0.04), 'arLedGold');
      L.geo(ring(r1 - 0.045, r1, sa0, sa1, yy + 0.004), 'arGold');
      runner(r0, r1, yy);
    }
    // glass balustrades with a brass handrail and newel posts
    for (const a of [sa0, sa1]) {
      radial(L, 'glass', a, rb, ra, yb, yb + 1.0, ya, ya + 1.0);
      radial(L, 'arGold', a, rb, ra, yb + 1.0, yb + 1.07, ya + 1.0, ya + 1.07);
      for (const [rr, yy] of [[ra, ya], [rb, yb]]) { const [x, , z] = P(rr, a); L.box(x - 0.09, x + 0.09, yy, yy + 1.18, z - 0.09, z + 0.09, 'arGold'); }
    }
    prevR = rb; prevY = yb; lvl--;
  }
  L.geo(ring(R[1] - 0.6, prevR, ta0, ta1, prevY + 0.012), 'marble'); // foot of the stair on the pit floor
  runner(R[1] - 0.6, prevR, prevY);
  // continuous walnut cheek walls along both sides: from below the treads up to the pitch line, or up
  // to the neighbouring floor where the stair is cut into a level (no per-step sawtooth)
  {
    // each level's edge is moved 6 cm towards the centre so the cheek wall also closes the corner behind the
    // tier-front fascia (which stands 2-6 cm proud of the level edge)
    const LIP = 0.06, sideC = (rr) => Y[levelAt(rr + LIP)];
    const brk = [...new Set([R[1] - LIP, R[2] - LIP, R[3] - LIP, R[4] - LIP, RW, ...FLIGHTS.flatMap(([ra, rb]) => [ra, rb])])].sort((p0, p1) => p0 - p1);
    for (let i = 0; i < brk.length - 1; i++) {
      const sy = sideC((brk[i] + brk[i + 1]) / 2), n = Math.max(1, Math.ceil((brk[i + 1] - brk[i]) / 0.5));
      for (let j = 0; j < n; j++) {
        const q0 = brk[i] + ((brk[i + 1] - brk[i]) * j) / n, q1 = brk[i] + ((brk[i + 1] - brk[i]) * (j + 1)) / n;
        const b0 = Math.min(sy, pitch(q0) - 0.45), b1 = Math.min(sy, pitch(q1) - 0.45), t0 = Math.max(sy, pitch(q0) + 0.04), t1 = Math.max(sy, pitch(q1) + 0.04);
        for (const a of [sa0, sa1]) radial(L, 'walnut', a, q0, q1, b0, t0, b1, t1);
      }
    }
  }

  // ================================================================ outer wall: walnut dado, warm cove, navy skin, dark pilasters,
  // blue neon bands, the 360° ribbon, and big lit Sports Analytics signs flanked by screens
  const ph = (A.portalHalfM + 0.6) / A.RWALL;
  const notPortal = minus(A0, A1, [[A0, A0 + ph], [A1 - ph, A1]]);
  for (const [s0, en] of notPortal) {
    L.geo(wall(RW, s0, en, -0.3, 1.2), 'walnut');
    L.geo(wall(RW - 0.05, s0, en, 1.2, 1.3), 'arLedGold');
    L.geo(wall(RW, s0, en, 1.3, 6.6), 'arNavy');
  }
  L.geo(wall(RW, A0 - ph, A0 + ph, 6.6, H - 0.3), 'arNavy');
  L.geo(wall(RW, A0 + ph, A1 - ph, 6.6, H - 0.3), 'arNavy');
  for (const [y0, y1] of [[7.55, 7.72], [11.55, 11.72]]) L.geo(wall(RW - 0.45, A0, A1, y0, y1), 'arLedBlue'); // blue neon bands
  for (const yy of [8.25, 10.75]) L.geo(wall(RW - 0.42, A0, A1, yy - 0.06, yy + 0.06), 'arGold'); // ribbon-screen frame
  ledBand(ctx, RW - 0.4, 8.4, 10.6, A0, A1);
  for (let a = A0 + ph + 3 / A.RWALL; a < A1 - ph - 1 / A.RWALL; a += 6 / A.RWALL) { // dark pilasters
    rbox(L, a, RW - 0.35, RW, 1.3, H - 0.3, 0.5, 'arTruss');
    rbox(L, a, RW - 0.37, RW - 0.33, 1.3, 1.36, 0.54, 'arGold');
  }
  const SIGNS = [1, 2, 3, 4, 5].map((i) => A0 + (i / 6) * TAU);
  const signMat = litSign(ctx);
  for (const a of SIGNS) {
    const [x, , z] = P(RW - 0.5, a), yw = yawIn(a);
    obox(L, x + 0.05 * Math.cos(a), 4.7, z + 0.05 * Math.sin(a), 9.6, 3.6, 0.12, yw, 'arTruss');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 3.2), signMat);
    m.position.set(x, e + 4.7, z); m.rotation.y = yw; ctx.add(m, m.geometry);
    for (const sd of [-1, 1]) { // screens either side of the sign
      const [sx, , sz] = P(RW - 0.5, a + (sd * 8.3) / A.RWALL), sy = yawIn(a + (sd * 8.3) / A.RWALL);
      obox(L, sx + 0.06 * Math.cos(a), 4.7, sz + 0.06 * Math.sin(a), 5.2, 3.0, 0.1, sy, 'arTruss');
      bc.push({ x: sx - 0.02 * Math.cos(a), y: e + 4.7, z: sz - 0.02 * Math.sin(a), yaw: sy, w: 4.9, h: 2.76, cell: sd > 0 ? BC.SCORES : BC.DASH + (SIGNS.indexOf(a) % BC.DASHES) });
    }
  }
  for (let a = A0 + 0.3; a < A1 - 0.3; a += 8 / A.RWALL) { // warm sconces low on the wall (not behind the signs)
    if (SIGNS.some((sa) => Math.abs(sa - a) * A.RWALL < 11.5)) continue;
    const [x, , z] = P(RW - 0.1, a); L.box(x - 0.15, x + 0.15, 2.4, 2.9, z - 0.15, z + 0.15, 'lampWarm');
  }
  // portal from inside: gold jambs + lintel with a blue light line, and the welcome plaque above
  for (const s of [-1, 1]) {
    const a = A0 + s * (A.portalHalfM + 0.3) / A.RWALL;
    rbox(L, a, RW - 0.5, A.RWALL + 1.0, 0, 6.6, 0.6, 'arGold');
    rbox(L, A0 + s * (A.portalHalfM + 0.02) / A.RWALL, RW - 0.52, RW - 0.48, 0.2, 6.3, 0.05, 'arLedBlue');
  }
  { const [x, , z] = P(RW - 0.5, A0); obox(L, x + 0.5, 6.3, z, 1.5, 0.6, 2 * A.portalHalfM + 1.2, 0, 'arGold'); obox(L, x - 0.27, 6.05, z, 0.05, 0.05, 2 * A.portalHalfM, 0, 'arLedBlue'); }
  plaque(ctx, 'SPORTS ANALYTICS ARENA', P(RW - 0.45, A0)[0], 7.45, 0, Math.PI / 2, { h: 0.7, color: '#e3c27a', sub: 'Performance through conviction' });

  // ---- arrivals hall threshold + portal reveal (hall wall X 49.66 .. bowl wall)
  L.floor(49.6, 51.2, -A.portalHalfM, A.portalHalfM, 0.02, 'marble', 2.4);
  for (const s of [-1, 1]) L.box(49.5, 51.4, 0, 6.6, s < 0 ? -A.portalHalfM - 0.6 : A.portalHalfM, s < 0 ? -A.portalHalfM : A.portalHalfM + 0.6, 'arGold', { collide: true });
  L.box(49.5, 51.4, 6.0, 6.6, -A.portalHalfM, A.portalHalfM, 'arGold');

  // ================================================================ roof: dark lattice trusses, concentric rings of warm-gold
  // light segments (the reference's "halo" ceiling), an oculus halo round the stack, blue neon at the eaves
  L.geo(ring(0, A.RWALL, A0, A1, H - 0.3, { down: true }), 'arNavyDeep');
  const NT = 24, trussA = (i) => (i / NT) * TAU + 0.13;
  const yB = H - 2.5, yT = H - 0.55;
  for (let i = 0; i < NT; i++) {
    const a = trussA(i), yw = yawOut(a);
    rbox(L, a, 10, RW - 0.5, yT - 0.2, yT + 0.2, 0.34, 'arTruss'); // top chord
    rbox(L, a, 10, RW - 0.5, yB - 0.2, yB + 0.2, 0.34, 'arTruss'); // bottom chord
    for (let rr = 10; rr < RW - 1; rr += 4) {
      rbox(L, a, rr - 0.1, rr + 0.1, yB, yT, 0.22, 'arTruss'); // vertical
      const dr = Math.min(4, RW - 0.5 - rr), len = Math.hypot(dr, yT - yB), [mx, , mz] = P(rr + dr / 2, a); // diagonal brace
      L.geo(new THREE.BoxGeometry(0.16, len, 0.16).rotateX((i + Math.round(rr)) % 2 ? Math.atan2(dr, yT - yB) : -Math.atan2(dr, yT - yB)).rotateY(yw).translate(mx, (yB + yT) / 2, mz), 'arTruss');
    }
  }
  for (const rad of [14, 20.5, 27, 33.5, 40, 46.5, 53]) { // warm light segments between the trusses
    for (let i = 0; i < NT; i++) {
      const bay = TAU / NT, n = Math.max(1, Math.floor((bay * rad - 1.2) / 3.4));
      for (let j = 0; j < n; j++) {
        const a = trussA(i) + (0.6 / rad) + ((j + 0.5) / n) * (bay - 1.2 / rad), [x, , z] = P(rad, a);
        obox(L, x, H - 0.42, z, Math.min(2.4, ((bay - 1.2 / rad) * rad) / n - 0.7), 0.1, 0.42, yawOut(a), 'arLedGold');
      }
    }
  }
  const torus = (rad, tube, y, mat, seg = 6) => L.geo(new THREE.TorusGeometry(rad, tube, seg, Math.max(48, Math.round(rad * 3))).rotateX(Math.PI / 2).translate(A.cx, y, A.cz), mat);
  torus(9.5, 0.45, H - 1.2, 'arTruss'); torus(9.5, 0.12, H - 1.75, 'arLedGold'); // oculus ring the stack hangs from
  for (const [rad, y] of [[17, yB - 0.35], [18.4, yB - 0.35]]) torus(rad, 0.14, y, 'arLedGold'); // halo over the stack
  torus(RW - 0.6, 0.1, H - 0.5, 'arLedBlue');
  for (let i = 0; i < NT; i++) for (const rr of [30.2, 43.2]) { const [x, , z] = P(rr, trussA(i) + TAU / 48); L.cyl(x, z, 0.3, H - 0.4, H - 0.3, 'lampWarm', { seg: 10 }); }

  // ================================================================ centre-hung screen stack
  const SIDES = 8, tw = (ap) => 2 * ap * Math.tan(Math.PI / SIDES) - 0.3;
  const TIERS = [
    { ap: 15.0, y0: 1.4, cell: (i) => (i === 3 ? BC.RACE : (i * 2) % BC.MATCHES) },
    { ap: 14.5, y0: -7.6, cell: (i) => (i % 2 ? BC.DASH + (i % BC.DASHES) : i === 4 ? BC.SCORES : (i * 2 + 1) % BC.MATCHES) },
    { ap: 13.0, y0: Y[0] + 0.4, cell: (i) => (i === 5 ? BC.RACE : (i * 3 + 2) % BC.MATCHES) },
  ].map((t) => ({ ...t, h: (tw(t.ap) * 9) / 16 }));
  const cyl8 = (rad, y0, y1, mat) => L.geo(new THREE.CylinderGeometry(rad, rad, y1 - y0, SIDES, 1, false).translate(A.cx, (y0 + y1) / 2, A.cz), mat);
  for (const t of TIERS) {
    const rad = t.ap / Math.cos(Math.PI / SIDES);
    cyl8(rad - 0.2, t.y0 - 0.1, t.y0 + t.h + 0.4, 'blackMetal');
    for (let i = 0; i < SIDES; i++) {
      const a = Math.PI / 2 - ((i + 0.5) / SIDES) * TAU;
      bc.push({ x: A.cx + t.ap * Math.cos(a), y: e + t.y0 + t.h / 2 + 0.15, z: A.cz + t.ap * Math.sin(a), yaw: Math.atan2(Math.cos(a), Math.sin(a)), w: tw(t.ap) - 0.12, h: t.h, cell: t.cell(i) });
    }
    for (const yy of [t.y0 - 0.05, t.y0 + t.h + 0.35]) L.geo(new THREE.TorusGeometry(rad + 0.1, 0.17, 4, SIDES).rotateX(Math.PI / 2).rotateY(Math.PI / SIDES).translate(A.cx, yy, A.cz), 'arGold');
    L.geo(new THREE.TorusGeometry(rad + 0.05, 0.12, 4, SIDES).rotateX(Math.PI / 2).rotateY(Math.PI / SIDES).translate(A.cx, t.y0 - 0.3, A.cz), 'arLedBlue'); // blue underglow
  }
  for (let k = 0; k < TIERS.length - 1; k++) {
    const hi = TIERS[k], lo = TIERS[k + 1], rad = Math.max(hi.ap, lo.ap) / Math.cos(Math.PI / SIDES) + 0.3;
    cyl8(rad - 0.45, lo.y0 + lo.h + 0.4, hi.y0 - 0.1, 'blackMetal');
    ledBand(ctx, rad, lo.y0 + lo.h + 0.4, hi.y0 - 0.1, A0, A1, true);
  }
  const drumTop = TIERS[0].y0 + TIERS[0].h + 0.4;
  L.geo(new THREE.CylinderGeometry(5, 15.6, 1.6, SIDES).translate(A.cx, drumTop + 0.8, A.cz), 'blackMetal'); // crown
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, [x, , z] = P(9.5, a); L.cyl(x, z, 0.05, drumTop + 1.0, H - 1.2, 'steel', { seg: 5 }); }
  L.cyl(A.cx, A.cz, 14.8, Y[0], Y[0] + 0.4, 'marble', { seg: 48 }); // plinth on the pit floor
  L.cyl(A.cx, A.cz, 14.85, Y[0] + 0.32, Y[0] + 0.4, 'arGold', { seg: 48, open: true });
  ctx.colliders.push({ x0: A.cx - 12.2, x1: A.cx + 12.2, z0: A.cz - 12.2, z1: A.cz + 12.2, y0: e + Y[0], y1: e + Y[0] + 4 });

  // ---- hanging screens for the upper levels (double-sided, black frames, steel hangers). Big screens on
  // the line of every third box divider of the level they serve, so they sit between two box TVs: from
  // the seat on that side of each box the screen clears the box's own TV.
  for (const [k, rr, yc, w] of [[3, 34, -1.5, 7.2], [4, 44.5, 4.6, 8.0]]) {
    const h = (w * 9) / 16, lvl = BOXES.filter((bx) => bx.k === k);
    lvl.forEach((b, i) => {
      const nb = lvl.find((bx) => Math.abs(bx.a0 - b.a1) < 1e-6);
      if (!nb || i % 3 !== 1) return; // every third divider, never at the stair aisle
      const a = b.a1, yw = yawOut(a);
      const [x, , z] = P(rr, a), [xb, , zb] = P(rr - 0.16, a), [xm, , zm] = P(rr - 0.08, a);
      obox(L, xm, yc, zm, w + 0.24, h + 0.24, 0.1, yw, 'blackMetal');
      bc.push({ x, y: e + yc, z, yaw: yw, w, h, cell: (b.idx * 3 + k) % BC.MATCHES });
      bc.push({ x: xb, y: e + yc, z: zb, yaw: yw + Math.PI, w, h, cell: i % 4 === 1 ? BC.SCORES : (b.idx * 5 + k) % BC.MATCHES });
      for (const o of [-w / 2.6, w / 2.6]) { const [cx, , cz] = P(rr - 0.08, a + o / rr); L.cyl(cx, cz, 0.03, yc + h / 2 + 0.12, H - 2.7, 'steel', { seg: 4 }); }
    });
  }

  // ================================================================ chairs (instanced, chunked by quadrant + level)
  const rb = (w, h, d, x, y, z, rad = 0.06) => new RoundedBoxGeometry(w, h, d, 2, rad).translate(x, y, z);
  const merged = mergeChairs([ // a wide leather recliner: cushion, base, tall back with a headrest roll, arms, footrest
    rb(0.78, 0.2, 0.66, 0, 0.42, 0.03), new THREE.BoxGeometry(0.72, 0.32, 0.6).translate(0, 0.16, 0.03), rb(0.78, 0.74, 0.16, 0, 0.82, -0.3, 0.08),
    rb(0.62, 0.16, 0.16, 0, 1.17, -0.27, 0.07), rb(0.13, 0.3, 0.7, -0.42, 0.6, 0), rb(0.13, 0.3, 0.7, 0.42, 0.6, 0), rb(0.7, 0.14, 0.32, 0, 0.3, 0.5, 0.05)]);
  const buckets = new Map();
  for (const ch of chairs) { const key = `${Math.round(ch[1])}:${Math.floor(Math.atan2(ch[2] - A.cz, ch[0] - A.cx) / (Math.PI / 4))}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(ch); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (const list of buckets.values()) {
    const mesh = new THREE.InstancedMesh(merged, LM.arLeather, list.length);
    list.forEach(([x, y, z, yw, c], i) => { mesh.setMatrixAt(i, m4.compose(p.set(x, e + y + 0.02, z), q.setFromAxisAngle(up, yw), one)); mesh.setColorAt(i, col.set(c)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    ctx.add(mesh);
  }
  ctx.disposables.push(merged);

  // ================================================================ people on the move
  for (let k = 1; k <= 4; k++) {
    const rr = k < 4 ? R[k] + 6.2 : 56.5, pts = Array.from({ length: 36 }, (_, i) => { const [x, , z] = P(rr, A0 + (i / 36) * TAU); return [x, z]; });
    for (let j = 0; j < 9; j++) {
      const off = Math.floor(r() * 36), loop = [...pts.slice(off), ...pts.slice(0, off)];
      L.person(loop[0][0], loop[0][1], { y: Y[k], suit: pick(OUTFIT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()), walk: r() < 0.5 ? loop : loop.reverse(), speed: 0.9 + r() * 0.6 });
    }
  }
  for (let j = 0; j < 8; j++) { const z0 = -30 + r() * 52, z1 = -30 + r() * 52; L.person(46, z0, { suit: pick(OUTFIT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()), walk: [[46, z0], [46, z1], [41, z1], [41, z0]], speed: 0.9 + r() * 0.5 }); }

  // ================================================================ the arrivals hall (shared Phase 1 lift-hall design)
  luxLiftHall(ctx, L, {
    s: 1, H: 10, z0: -39.65, z1: 29.65, portal: { half: A.portalHalfM, top: A.portalH },
    P: { wall: 'walnut', wallDeep: 'arNavy', panel: 'arPanelSoft', frame: 'arGold', frameDark: 'arNavy', dado: 'arNavy', cap: 'arGold', floor: 'marble', floorTile: 2.4,
      runner: 'arNavy', edge: 'arGold', liner: 'brushedBronze', ink: '#e3c27a', kioskBg: '#0d1733', kioskBtn: '#1d3a8a', kioskEdge: '#d9a441', hostSuit: 0x14213d },
    ceo: 'ceo_vt',
    banks: [['vt_low', 'WELLNESS LOW-RISE · L · 1–2', true], ['vt_high', 'WELLNESS HIGH-RISE · L · 3–4', true], ['freight_vt', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['vt_low', ['L', '1', '2']]],
    link: null,
    portalText: 'SPORTS ANALYTICS ARENA', portalSub: 'Grand Stair · Level 4 to the Analytics Pit',
    board: (c, x, y, z, yaw, w, h) => bc.push({ x: x + 0.02, y: e + y, z, yaw, w: w * 0.62, h, cell: BC.SCORES }),
    pylon: (list) => list.forEach((it, i) => bc.push({ ...it, cell: it.k ? BC.DASH + (i % BC.DASHES) : i % BC.MATCHES })),
  });

  ctx.seatCount = chairs.length;
  ctx.arenaLuxStats = { chairs: chairs.length, consoles: bc.filter((it) => it.cell >= BC.CONSOLE).length, people: L.people.length, screens: bc.length };
  L.build();
  arenaLive(ctx, bc);
}

// Big back-lit wall sign (reference: the illuminated name panels on the bowl wall).
function litSign(ctx) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 534;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, '#13234f'); grd.addColorStop(1, '#0a1230');
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#4f9bff'; g.lineWidth = 10; g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.strokeStyle = '#d9a441'; g.lineWidth = 3; g.strokeRect(34, 34, c.width - 68, c.height - 68);
  // football icon
  const bx = 300, by = c.height / 2, R0 = 170;
  g.fillStyle = '#f5f7fb'; g.beginPath(); g.arc(bx, by, R0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111827';
  const pent = (x, y, r, rot) => { g.beginPath(); for (let k = 0; k < 5; k++) { const a = rot + (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  pent(bx, by, 58, -Math.PI / 2);
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI * 2 + Math.PI / 5; pent(bx + Math.cos(a) * 150, by + Math.sin(a) * 150, 40, a); }
  g.strokeStyle = '#111827'; g.lineWidth = 6;
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI * 2; g.beginPath(); g.moveTo(bx + Math.cos(a) * 58, by + Math.sin(a) * 58); g.lineTo(bx + Math.cos(a) * 118, by + Math.sin(a) * 118); g.stroke(); }
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const line = (t, y, size) => { let px = size; do { g.font = `800 ${px}px sans-serif`; px -= 2; } while (g.measureText(t).width > 930 && px > 20); g.fillText(t, 540, y); };
  line('SPORTS', 190, 150); line('ANALYTICS', 350, 150);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, color: 0xe8ecff, toneMapped: false });
  ctx.disposables.push(t, m);
  return m;
}

function mergeChairs(parts) {
  const pos = [], nor = [];
  for (const g of parts) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
