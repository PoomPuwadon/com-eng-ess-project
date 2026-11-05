import * as THREE from 'three';
import { CH } from '../world/screens.js';
import { MAT, instancedBoxes, chunked } from '../world/geom.js';

// VT-03 Combat Sports Analytics Pavilion — rev 11: a realistic Muay Thai stadium (user's reference:
// a round bowl under a glowing sak yant ceiling, triangular truss ring, beams of light on the ring).
//
// Spectator route (public):  narrow arrivals hall (X 30..44) → entrance corridor + ticket gates
//   (X 44..55) → grand stairs up to the CONCOURSE (Y 6.1, ring r 42.8..51.4) → VOMITORIES (7) →
//   CROSS-AISLE (r 27.5..29.5) → down to the lower bowl / up to the upper bowl. That is all a
//   spectator can reach: the lower bowl's front row is 1.6 m above the ringside floor (no way down).
// Competitors / officials (backstage access): hall north door → service corridor (Z < -53.4) →
//   backstage (X > 172) with Red / Blue dressing rooms → WALKOUT tunnel under the concourse →
//   lit walkway through the seats (Z -2.5..2.5) → ring steps (east side) → corner. See
//   floor.walkout in building.js for the routes.
//
// The whole venue is one height field (ground(x, z, y)): the y lets the tunnel run UNDER the
// concourse. All heights below are relative to the floor slab (Y 67).
const C = { x: 120, z: 0 };
const RING = { half: 5.5, top: 1.2, ropes: 5.0 }; // 11 m platform, 10 m inside the ropes
const RS = 14; // ringside radius = front of the lower bowl
const LOW = { r0: 14, rows: 15, depth: 0.9, y0: 1.6, rise: 0.3 }; // to r 27.5, top row 5.8
const XA = { r0: 27.5, r1: 29.5, y: 6.1 }; // cross-aisle
const UP = { r0: 29.5, rows: 14, depth: 0.92, y0: 6.5, rise: 0.42 }; // to r 42.38, top row 11.96
const BACK = { r0: 42.4, r1: 42.8, top: 14 };
const CONC = { r0: 42.8, r1: 51.4, y: 6.1 };
const OUTER = { r0: 51.4, r1: 52 };
const VOMS = [Math.PI, Math.PI - 0.8, Math.PI + 0.8, Math.PI - 1.6, Math.PI + 1.6, Math.PI - 2.4, Math.PI + 2.4];
const VOM_HALF = 1.5, AISLE_HALF = 0.6, WALK_HALF = 2.5;
const ENTRY = { x0: 44, x1: 55.2, half: 4 };
const STAIRS = { x0: 55.2, x1: 68, steps: 16 }; // rise CONC.y / 16 = 0.381 per step, 0.8 m treads
const CORRIDOR_Z = -53.4, BACKSTAGE_X = 172;
const WALL = 50;
const lowTop = LOW.y0 + (LOW.rows - 1) * LOW.rise, upTop = UP.y0 + (UP.rows - 1) * UP.rise;

const inVom = (dx, dz, half = VOM_HALF) => VOMS.some((v) => {
  const along = dx * Math.cos(v) + dz * Math.sin(v);
  return along > 0 && Math.abs(-dx * Math.sin(v) + dz * Math.cos(v)) < half;
});

// Height (relative to the slab) of the walkable surface at (x, z) for someone currently at height yl.
export function pavilionGround(x, z, yl = 0) {
  const dx = x - C.x, dz = z - C.z, r = Math.hypot(dx, dz);
  if (z < CORRIDOR_Z) return 0; // service corridor
  if (x >= BACKSTAGE_X) return 0; // backstage
  if (x < ENTRY.x1) return Math.abs(dz) < ENTRY.half ? 0 : WALL; // entrance corridor
  if (dx > 0 && Math.abs(dz) < WALK_HALF && r >= RS - 0.1) { // walkout trench + tunnel
    if (r < CONC.r0) return 0;
    if (yl < 3) return 0; // in the tunnel, under the concourse
    return r < OUTER.r0 ? CONC.y : WALL;
  }
  if (r < RS) { // ringside floor + the ring (east steps)
    if (Math.abs(dx) < RING.half && Math.abs(dz) < RING.half) return RING.top;
    if (Math.abs(dz) < 1 && dx >= RING.half && dx < RING.half + 0.8) return 0.8;
    if (Math.abs(dz) < 1 && dx >= RING.half + 0.8 && dx < RING.half + 1.6) return 0.4;
    return 0;
  }
  if (r < XA.r0) return LOW.y0 + Math.min(LOW.rows - 1, Math.floor((r - LOW.r0) / LOW.depth)) * LOW.rise;
  if (r < XA.r1) return XA.y;
  if (r < BACK.r0) return inVom(dx, dz) ? XA.y : UP.y0 + Math.min(UP.rows - 1, Math.floor((r - UP.r0) / UP.depth)) * UP.rise;
  if (r < BACK.r1) return inVom(dx, dz) ? XA.y : WALL;
  if (r < OUTER.r0) return CONC.y;
  if (r < OUTER.r1) return dx < 0 && Math.abs(dz) < ENTRY.half ? CONC.y : WALL;
  if (dx < 0 && Math.abs(dz) < ENTRY.half && x >= STAIRS.x0 && x < STAIRS.x1 + 0.6) {
    const k = Math.min(STAIRS.steps - 1, Math.floor((x - STAIRS.x0) / ((STAIRS.x1 - STAIRS.x0) / STAIRS.steps)));
    return (k + 1) * (CONC.y / STAIRS.steps);
  }
  return WALL;
}

export function pavilionShape(e, H) {
  const covers = (x, z) => x > ENTRY.x0 && z > -60 && z < 60;
  return {
    active: (y) => y > e - 1 && y < e + H - 0.5,
    covers,
    ground: (x, z, y = e) => e + pavilionGround(x, z, y - e),
    blocks(px, pz, x, z, y) {
      if (!covers(x, z)) return false;
      const g = pavilionGround(x, z, y - e), yl = y - e;
      return g > yl + 0.45 || g < yl - 0.6; // too high to step up, or a drop (no jumping off tiers)
    },
    // path planner: only floor-level parts (entrance, service corridor, backstage, tunnel, ringside),
    // kept 0.6 m clear of their edges so planned paths never clip a corner
    gridBlock: (x, z) => [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].some(([ox, oz]) => covers(x + ox, z + oz) && pavilionGround(x + ox, z + oz, 0) !== 0),
  };
}

// ---------------------------------------------------------------- geometry helpers
class Quads {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, color) {
    const cc = new THREE.Color(color), i = this.pos.length / 3;
    for (const v of [a, b, c, d]) { this.pos.push(...v); this.col.push(cc.r, cc.g, cc.b); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}
const P = (r, a, y) => [C.x + r * Math.cos(a), y, C.z + r * Math.sin(a)];
const steps = (r, a0, a1, seg = 1.5) => { const n = Math.max(2, Math.ceil(((a1 - a0) * r) / seg)); return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n); };
const top = (q, r0, r1, y, a0, a1, c) => { const as = steps(r1, a0, a1); for (let i = 0; i < as.length - 1; i++) q.quad(P(r0, as[i], y), P(r1, as[i], y), P(r1, as[i + 1], y), P(r0, as[i + 1], y), c); };
const wall = (q, r, y0, y1, a0, a1, c) => { const as = steps(r, a0, a1); for (let i = 0; i < as.length - 1; i++) q.quad(P(r, as[i], y0), P(r, as[i + 1], y0), P(r, as[i + 1], y1), P(r, as[i], y1), c); };
const radial = (q, a, r0, r1, y0, y1, c) => q.quad(P(r0, a, y0), P(r1, a, y0), P(r1, a, y1), P(r0, a, y1), c);
const halfAng = (hw, r) => Math.asin(Math.min(0.99, hw / r));
// Arcs of a full circle at radius r, minus gaps [{a, hw}] (hw = half width in metres).
function arcs(r, gaps) {
  const cuts = gaps.map(({ a, hw }) => { const d = halfAng(hw, r); return [a - d, a + d]; });
  // walk the circle starting just after the walkout (angle 0) gap if there is one
  let start = 0, end = Math.PI * 2;
  const out = [];
  const norm = (x) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const list = cuts.map(([c0, c1]) => [norm(c0), norm(c0) + (c1 - c0)]).sort((p, q) => p[0] - q[0]);
  const wrap = list.find(([c0, c1]) => c1 > Math.PI * 2);
  if (wrap) { start = wrap[1] - Math.PI * 2; end = wrap[0]; }
  let s = start;
  for (const [c0, c1] of list) { if (c1 > Math.PI * 2) continue; if (c0 > s) out.push([s, Math.min(c0, end)]); s = Math.max(s, c1); }
  if (s < end) out.push([s, end]);
  return out.filter(([a0, a1]) => a1 - a0 > 0.002);
}
const WALK_GAP = { a: 0, hw: WALK_HALF };
const vomGaps = (hw) => VOMS.map((a) => ({ a, hw }));
const yawIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a)); // facing the ring

// Sak yant ceiling: golden script rings and spires on a deep red ground (procedural canvas).
function yantraTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), m = S / 2;
  const bg = g.createRadialGradient(m, m, 40, m, m, m); bg.addColorStop(0, '#5a1a0e'); bg.addColorStop(0.7, '#2a0a06'); bg.addColorStop(1, '#0c0302');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const gold = '#f2b544';
  g.strokeStyle = gold; g.fillStyle = gold; g.shadowColor = '#ffb300'; g.shadowBlur = 12;
  for (const rr of [500, 470, 380, 350, 250, 225, 120]) { g.lineWidth = rr > 460 ? 5 : 3; g.beginPath(); g.arc(m, m, rr, 0, Math.PI * 2); g.stroke(); }
  const thai = 'กขคงจฉชซญฎฐฑณดตถทธนบปผพฟภมยรลวศษสหอฮ';
  const ringText = (rr, size, n) => {
    g.font = `bold ${size}px "Leelawadee UI", "Tahoma", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.save(); g.translate(m + rr * Math.cos(a), m + rr * Math.sin(a)); g.rotate(a + Math.PI / 2);
      g.fillText(thai[(i * 7 + rr) % thai.length], 0, 0); g.restore();
    }
  };
  ringText(485, 26, 120); ringText(420, 40, 64); ringText(300, 34, 52); ringText(238, 20, 60);
  // nine spires (gao yord) in the centre
  g.lineWidth = 4;
  for (let i = -4; i <= 4; i++) {
    const x = m + i * 22, h = 150 - Math.abs(i) * 14;
    g.beginPath(); g.moveTo(x - 9, m + 70); g.quadraticCurveTo(x - 12, m + 70 - h * 0.6, x, m + 70 - h); g.quadraticCurveTo(x + 12, m + 70 - h * 0.6, x + 9, m + 70); g.stroke();
    g.beginPath(); g.arc(x, m + 70 - h - 8, 5, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.moveTo(m - 110, m + 78); g.lineTo(m + 110, m + 78); g.stroke();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(m + 125 * Math.cos(a), m + 125 * Math.sin(a)); g.lineTo(m + 222 * Math.cos(a), m + 222 * Math.sin(a)); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- the build
export function pavilion(ctx) {
  const e = ctx.e, H = ctx.floor.height;
  const q = new Quads(), glow = new Quads(), glass = new Quads();
  const SEAT_A = 0x5a1a22, SEAT_B = 0x7a2430, STEP_C = 0x2a2428, RISER = 0x1d181b, CONC_C = 0x3a3238, GOLD = 0xd8a640;

  // ---- ringside floor, ring, officials, musicians
  top(q, 0.01, RS, 0.02, 0, Math.PI * 2, 0x1a1c24);
  top(glow, RS - 0.35, RS - 0.2, 0.04, 0, Math.PI * 2, GOLD);
  const R = RING.half;
  ctx.deco(C.x - R, C.x + R, 0, RING.top - 0.05, C.z - R, C.z + R, 0x14161d); // platform skirt
  ctx.deco(C.x - R + 0.2, C.x + R - 0.2, RING.top - 0.05, RING.top, C.z - R + 0.2, C.z + R - 0.2, 0x1f4fa8); // canvas
  ctx.deco(C.x - 1.4, C.x + 1.4, RING.top, RING.top + 0.01, C.z - 1.4, C.z + 1.4, 0x2a62c4); // centre logo
  const rp = RING.ropes;
  for (const [sx, sz, col] of [[-1, -1, 0xd22222], [1, 1, 0x2244cc], [1, -1, 0xeeeeee], [-1, 1, 0xeeeeee]]) ctx.deco(C.x + sx * rp - 0.15, C.x + sx * rp + 0.15, RING.top, RING.top + 1.75, C.z + sz * rp - 0.15, C.z + sz * rp + 0.15, col);
  for (const [k, y] of [0.45, 0.8, 1.15, 1.5].entries()) {
    const col = [0xd22222, 0xeeeeee, 0x2244cc, 0xeeeeee][k], yy = RING.top + y;
    ctx.deco(C.x - rp, C.x + rp, yy, yy + 0.05, C.z - rp - 0.03, C.z - rp + 0.03, col);
    ctx.deco(C.x - rp, C.x + rp, yy, yy + 0.05, C.z + rp - 0.03, C.z + rp + 0.03, col);
    ctx.deco(C.x - rp - 0.03, C.x - rp + 0.03, yy, yy + 0.05, C.z - rp, C.z + rp, col);
    ctx.deco(C.x + rp - 0.03, C.x + rp + 0.03, yy, yy + 0.05, C.z - rp, C.z + rp, col);
  }
  for (const [x0, x1, h] of [[R, R + 0.8, 0.8], [R + 0.8, R + 1.6, 0.4]]) ctx.deco(C.x + x0, C.x + x1, 0, h, C.z - 1, C.z + 1, 0x2a2e38); // ring steps (walkout side)
  ctx.npc(C.x - 1.4, C.z, 0xcc2222, Math.PI / 2, RING.top); ctx.npc(C.x + 1.4, C.z, 0x2244cc, -Math.PI / 2, RING.top); ctx.npc(C.x, C.z + 2, 0xffffff, Math.PI, RING.top);
  ctx.deco(C.x - 4, C.x + 4, 0, 0.75, C.z - 10.2, C.z - 9.2, 0x3b2414); // judges' / officials' table
  for (let i = 0; i < 5; i++) ctx.npc(C.x - 3.2 + i * 1.6, C.z - 10.9, 0x111111, 0);
  ctx.deco(C.x - 9.8, C.x - 7.2, 0, 0.4, C.z + 6.5, C.z + 9.5, 0x5a3a20); // pi-phat musicians' stage (live traditional music)
  for (let i = 0; i < 4; i++) ctx.npc(C.x - 9.3 + (i % 2) * 1.5, C.z + 7.2 + Math.floor(i / 2) * 1.5, 0xc0262d, -Math.PI / 4, 0.4);
  ctx.deco(C.x - 9.6, C.x - 9.0, 0.4, 1.0, C.z + 8.7, C.z + 9.3, 0x8a5a2a);
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) { const [x, , z] = P(11.5, a, 0); ctx.deco(x - 0.6, x + 0.6, 0, 1.6, z - 0.6, z + 0.6, 0x15171b); ctx.npc(x + 0.9, z, 0x222222, yawIn(a)); } // camera positions
  // ringside LED boards on the front of the bowl
  for (let i = 0; i < 28; i++) {
    const a = ((i + 0.5) / 28) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) * RS < WALK_HALF + 0.8 && Math.cos(a) > 0) continue;
    const [x, , z] = P(RS - 0.06, a, 0);
    ctx.screen(x, 0.8, z, yawIn(a), 2.9, 1.0, i % 3 ? CH.FIGHT : CH.ODDS);
  }

  // ---- seating bowl: lower rows, cross-aisle, upper rows (with vomitories), back wall
  const seats = [];
  let npcN = 0;
  const seatRow = (rFront, depth, y, gaps) => {
    for (const [a0, a1] of arcs(rFront + depth * 0.6, gaps)) {
      const rr = rFront + depth * 0.6;
      const n = Math.floor(((a1 - a0) * rr) / 0.6);
      for (let i = 0; i < n; i++) {
        const a = a0 + ((i + 0.5) / n) * (a1 - a0), [x, , z] = P(rr, a, 0);
        seats.push({ x, y: e + y + 0.22, z, sx: 0.48, sy: 0.44, sz: 0.44, yaw: Math.PI / 2 - a, color: (i + Math.round(rFront)) % 7 ? SEAT_A : SEAT_B });
        if (npcN++ % 6 === 0) ctx.npc(x, z, [0xd0a070, 0x2b3a55, 0xe6e6e6, 0x8a1b1b, 0x1f2a44][npcN % 5], yawIn(a), y + 0.2);
      }
    }
  };
  // front barrier (solid riser 0 -> 1.6 + glass + gold rail), walkout gap left open
  for (const [a0, a1] of arcs(RS, [WALK_GAP])) {
    wall(q, RS, 0, LOW.y0, a0, a1, RISER);
    wall(glass, RS + 0.02, LOW.y0, LOW.y0 + 1.0, a0, a1, 0x9fd8ff);
    wall(glow, RS + 0.03, LOW.y0 + 1.0, LOW.y0 + 1.06, a0, a1, GOLD);
  }
  for (let k = 0; k < LOW.rows; k++) {
    const r0 = LOW.r0 + k * LOW.depth, r1 = k === LOW.rows - 1 ? XA.r0 : r0 + LOW.depth, y = LOW.y0 + k * LOW.rise;
    for (const [a0, a1] of arcs(r0, [WALK_GAP])) {
      top(q, r0, r1, y, a0, a1, STEP_C);
      if (k) wall(q, r0, y - LOW.rise, y, a0, a1, RISER);
      for (const a of [a0, a1]) { radial(q, a, r0, r1, 0, y, RISER); radial(glass, a, r0, r1, y, y + 1.1, 0x9fd8ff); }
    }
    for (const v of VOMS) { const d = halfAng(AISLE_HALF, r0 + 0.4); top(glow, r0, r1, y + 0.01, v - d, v + d, 0x3a3236); } // stair aisles
    seatRow(r0, LOW.depth, y, [WALK_GAP, ...vomGaps(AISLE_HALF)]);
  }
  for (const [a0, a1] of arcs(XA.r0, [WALK_GAP])) {
    top(q, XA.r0, XA.r1, XA.y, a0, a1, CONC_C);
    wall(q, XA.r0, lowTop, XA.y, a0, a1, RISER);
    for (const a of [a0, a1]) { radial(q, a, XA.r0, XA.r1, 0, XA.y, RISER); radial(glass, a, XA.r0, XA.r1, XA.y, XA.y + 1.1, 0x9fd8ff); }
  }
  for (let k = 0; k < UP.rows; k++) {
    const r0 = UP.r0 + k * UP.depth, r1 = k === UP.rows - 1 ? BACK.r0 : r0 + UP.depth, y = UP.y0 + k * UP.rise;
    for (const [a0, a1] of arcs(r0, [WALK_GAP, ...vomGaps(VOM_HALF)])) {
      top(q, r0, r1, y, a0, a1, STEP_C);
      wall(q, r0, k ? y - UP.rise : XA.y, y, a0, a1, RISER);
      for (const a of [a0, a1]) radial(q, a, r0, r1, Math.cos(a) > 0 && Math.abs(Math.sin(a)) < 0.2 ? 0 : XA.y, y, RISER); // walkout side walls go to the floor
    }
    seatRow(r0, UP.depth, y, [WALK_GAP, ...vomGaps(VOM_HALF)]);
  }
  // vomitory floors (at concourse level) and their portals in the back wall
  for (const v of VOMS) {
    const ca = Math.cos(v), sa = Math.sin(v), px = -sa, pz = ca;
    const pt = (along, side, y) => [C.x + ca * along + px * side, y, C.z + sa * along + pz * side];
    q.quad(pt(XA.r1, -VOM_HALF, XA.y), pt(BACK.r1 + 0.2, -VOM_HALF, XA.y), pt(BACK.r1 + 0.2, VOM_HALF, XA.y), pt(XA.r1, VOM_HALF, XA.y), CONC_C);
    const [sx, , sz] = P(BACK.r1 + 0.6, v, 0);
    const sec = 101 + Math.round(((v - Math.PI + 2.4) / 0.8)) * 4;
    ctx.sign(`SECTIONS ${sec}–${sec + 3}`, sx, CONC.y + 3.6, sz, { size: 0.6 });
  }
  // back wall (concourse side) with vomitory openings + VIP skyboxes along its top
  for (const [a0, a1] of arcs(BACK.r1, [WALK_GAP, ...vomGaps(VOM_HALF)])) wall(q, BACK.r1, CONC.y, BACK.top, a0, a1, 0x241d22);
  for (const v of VOMS) { const d = halfAng(VOM_HALF, BACK.r1); wall(q, BACK.r1, CONC.y + 3.0, BACK.top, v - d, v + d, 0x241d22); wall(glow, BACK.r1 - 0.05, CONC.y + 2.9, CONC.y + 3.0, v - d, v + d, GOLD); }
  { const d = halfAng(WALK_HALF, BACK.r1); wall(q, BACK.r1, CONC.y, BACK.top, -d, d, 0x241d22); }
  for (const [a0, a1] of arcs(BACK.r0, [WALK_GAP, ...vomGaps(VOM_HALF + 0.4)])) {
    wall(q, BACK.r0, upTop, BACK.top, a0, a1, 0x241d22);
    wall(glass, BACK.r0 - 0.05, upTop + 0.4, BACK.top - 0.3, a0, a1, 0xffd27a); // skybox glass
    wall(glow, BACK.r0 - 0.06, BACK.top - 0.3, BACK.top - 0.15, a0, a1, GOLD);
  }

  // ---- concourse: floor, outer wall with the entrance, betting windows, section signs
  top(q, CONC.r0, CONC.r1, CONC.y, 0, Math.PI * 2, CONC_C);
  top(q, CONC.r0, CONC.r1, CONC.y - 0.3, 0, Math.PI * 2, 0x1d181b); // underside (seen from the tunnel)
  const entA = halfAng(ENTRY.half, OUTER.r0);
  wall(q, OUTER.r0 + 0.3, CONC.y, H - 0.25, -Math.PI + entA, Math.PI - entA, 0x2b2226);
  for (const [a0, a1] of arcs(OUTER.r0 + 0.3, [WALK_GAP, { a: Math.PI, hw: ENTRY.half }])) wall(q, OUTER.r0 + 0.3, 0, CONC.y, a0, a1, 0x2b2226); // below the concourse, open for the tunnel
  wall(q, OUTER.r0 + 0.3, CONC.y + 6, H - 0.25, Math.PI - entA, Math.PI + entA, 0x2b2226);
  wall(glow, OUTER.r0 + 0.25, CONC.y + 5.9, CONC.y + 6.0, Math.PI - entA, Math.PI + entA, GOLD);
  for (let i = 0; i < 12; i++) { // position windows (betting counters) on the outer wall
    const a = Math.PI + (i < 6 ? -0.35 - i * 0.42 : 0.35 + (i - 6) * 0.42);
    const [x, , z] = P(OUTER.r0 - 0.6, a, 0);
    ctx.deco(x - 1.2, x + 1.2, CONC.y, CONC.y + 1.1, z - 1.2, z + 1.2, 0x5a3a20);
    ctx.screen(...(() => { const [sx, , sz] = P(OUTER.r0 - 0.05, a, 0); return [sx, CONC.y + 2.6, sz]; })(), yawIn(a), 3.2, 1.6, i % 2 ? CH.FIGHT : CH.ODDS);
    ctx.npc(...(() => { const [nx, , nz] = P(OUTER.r0 - 2.2, a, 0); return [nx, nz]; })(), 0xd0a070, yawIn(a) + Math.PI, CONC.y);
  }
  ctx.sign('Ringside Analytics Windows · positions open between rounds', ...(() => { const [x, , z] = P(OUTER.r0 - 0.4, Math.PI - 0.77, 0); return [x, CONC.y + 4.6, z]; })(), { size: 0.6 });

  // ---- entrance: corridor from the arrivals hall, ticket gates, grand stairs up to the concourse
  for (const sz of [-1, 1]) {
    ctx.deco(ENTRY.x0, STAIRS.x1 + 0.6, 0, 12, sz * (ENTRY.half + 0.3) - 0.15, sz * (ENTRY.half + 0.3) + 0.15, 0x2b2226);
    ctx.deco(ENTRY.x0, STAIRS.x1, 3.4, 3.6, sz * ENTRY.half - 0.05, sz * ENTRY.half + 0.05, GOLD);
  }
  for (let i = 0; i < 6; i++) { const z = -3.3 + i * 1.32; ctx.deco(49.2, 50.2, 0, 1.0, z - 0.12, z + 0.12, 0x8a8f98); ctx.deco(49.6, 49.8, 0.9, 1.0, z, z + 0.55, 0xd8a640); } // ticket gates
  ctx.deco(45, 47.5, 0, 1.1, ENTRY.half - 0.9, ENTRY.half - 0.1, 0x5a3a20); ctx.npc(46.2, ENTRY.half - 0.4, 0x111111, Math.PI); // box office
  ctx.sign('COMBAT SPORTS ANALYTICS PAVILION', 49.5, 6.2, 0, { size: 1.3, sub: 'Tickets · Sections 101–128 upstairs' });
  const tread = (STAIRS.x1 - STAIRS.x0) / STAIRS.steps, rise = CONC.y / STAIRS.steps;
  for (let k = 0; k < STAIRS.steps; k++) {
    const x0 = STAIRS.x0 + k * tread;
    ctx.deco(x0, x0 + tread, 0, (k + 1) * rise, -ENTRY.half, ENTRY.half, k % 2 ? 0x3a3236 : 0x443a40);
    ctx.deco(x0 + tread - 0.06, x0 + tread, (k + 1) * rise, (k + 1) * rise + 0.01, -ENTRY.half, ENTRY.half, GOLD);
    for (const z of [-ENTRY.half + 0.15, 0, ENTRY.half - 0.15]) ctx.deco(x0, x0 + tread, (k + 1) * rise + 0.9, (k + 1) * rise + 0.97, z - 0.04, z + 0.04, GOLD); // handrails
  }

  // ---- walkout: lit runway through the seats, tunnel under the concourse, backstage
  const xs = C.x + Math.sqrt(RS * RS - WALK_HALF * WALK_HALF), xt = C.x + Math.sqrt(CONC.r0 ** 2 - WALK_HALF ** 2);
  ctx.deco(xs, BACKSTAGE_X, 0.02, 0.04, -WALK_HALF, WALK_HALF, 0x0c0c10);
  ctx.deco(xs, BACKSTAGE_X, 0.04, 0.06, -WALK_HALF, -WALK_HALF + 0.25, 0xd22222);
  ctx.deco(xs, BACKSTAGE_X, 0.04, 0.06, WALK_HALF - 0.25, WALK_HALF, 0x2244cc);
  for (let x = xs + 1; x < xt; x += 3) ctx.deco(x, x + 1.2, 0.04, 0.06, -0.3, 0.3, 0xffd27a);
  for (const sz of [-1, 1]) ctx.deco(xt, BACKSTAGE_X, 0, CONC.y - 0.3, sz * WALK_HALF - 0.15 * sz, sz * WALK_HALF + 0.15 * sz, 0x1d181b); // tunnel walls
  for (let x = xt + 1; x < BACKSTAGE_X; x += 2.5) ctx.deco(x, x + 1.4, CONC.y - 0.45, CONC.y - 0.35, -1.2, 1.2, 0xfff0c8); // tunnel lights
  for (const sz of [-1, 1]) ctx.deco(xt - 0.4, xt + 0.4, 0, 4.2, sz * (WALK_HALF + 0.2) - 0.35, sz * (WALK_HALF + 0.2) + 0.35, sz < 0 ? 0xd22222 : 0x2244cc); // tunnel mouth
  ctx.deco(xt - 0.4, xt + 0.4, 4.2, 5.0, -WALK_HALF - 0.55, WALK_HALF + 0.55, 0x15171b);
  ctx.screen(xt - 0.45, 4.6, 0, -Math.PI / 2, 4.6, 0.7, CH.FIGHT);
  ctx.sign('WALKOUT — Red Corner · Blue Corner', xt - 1, 5.6, 0, { size: 0.7 });
  // backstage wall (with the tunnel), dressing-room dressing, warm-up area
  for (const [z0, z1] of [[CORRIDOR_Z, -WALK_HALF], [WALK_HALF, 59]]) ctx.deco(BACKSTAGE_X - 0.3, BACKSTAGE_X, 0, H - 0.25, z0, z1, 0x2b2226);
  ctx.deco(BACKSTAGE_X - 0.3, BACKSTAGE_X, 4.2, H - 0.25, -WALK_HALF, WALK_HALF, 0x2b2226);
  for (const [z, col] of [[-26, 0xd22222], [26, 0x2244cc]]) {
    ctx.deco(186, 204, 0.01, 0.03, z - 10, z + 10, 0x26303a); // mats
    for (let i = 0; i < 3; i++) ctx.deco(199.5 + i * 2 - 0.3, 199.5 + i * 2 + 0.3, 1.0, 2.6, z - 8, z - 7.4, col); // heavy bags
    ctx.npc(190, z, col, -Math.PI / 2); ctx.npc(192, z + 2, 0x111111, -Math.PI / 2);
  }
  for (let i = 0; i < 4; i++) ctx.deco(176 + i * 3, 177.5 + i * 3, 0, 1.8, 50, 52, 0x3a3f47); // equipment cases
  // service corridor: walls + the locked door from the arrivals hall
  ctx.deco(ENTRY.x0, BACKSTAGE_X, 0, 6, CORRIDOR_Z, CORRIDOR_Z + 0.3, 0x2b2226);
  ctx.deco(ENTRY.x0 - 0.3, ENTRY.x0, 0, H - 0.25, CORRIDOR_Z, -40, 0x2b2226);
  ctx.deco(ENTRY.x0 - 0.3, ENTRY.x0, 0, H - 0.25, 30, 59, 0x2b2226);
  ctx.barrier(38.5, 41.5, -40.35, -39.65, 2.6, 'backstage', 'pavilion_backstage_door');
  ctx.sign('Competitors & Officials only', 40, 3.4, -39.4, { size: 0.55, gold: false });
  ctx.sign('Service Corridor → Competitors\' Quarters', 100, 4.2, -56.2, { size: 0.7, gold: false });

  // ---- atmosphere: sak yant ceiling, triangular truss ring, light beams, big screens
  const yt = yantraTexture();
  const dg = new THREE.CircleGeometry(47, 96); dg.rotateX(Math.PI / 2);
  const dm = new THREE.MeshBasicMaterial({ map: yt, toneMapped: false });
  const disc = new THREE.Mesh(dg, dm); disc.position.set(C.x, e + H - 0.4, C.z); ctx.add(disc, dg, dm, yt);
  for (const [rr, y0, y1, n] of [[36, H - 6.5, H - 4.5, 36], [46, H - 4.5, H - 2.5, 44]]) { // zig-zag truss rings
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, ya = i % 2 ? y1 : y0, yb = i % 2 ? y0 : y1;
      glow.quad(P(rr, a0, ya), P(rr, a1, yb), P(rr + 0.35, a1, yb), P(rr + 0.35, a0, ya), 0xc8c8d0);
    }
    top(glow, rr, rr + 0.35, y0, 0, Math.PI * 2, 0x9a9aa8); top(glow, rr, rr + 0.35, y1, 0, Math.PI * 2, 0x9a9aa8);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1, [sx, , sz] = P(36, a, 0);
    const from = new THREE.Vector3(sx, e + H - 6.5, sz), to = new THREE.Vector3(C.x + Math.cos(a) * 2, e + RING.top, C.z + Math.sin(a) * 2);
    const len = from.distanceTo(to), bg = new THREE.CylinderGeometry(0.2, 2.6, len, 14, 1, true);
    const beam = new THREE.Mesh(bg, beamMat);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(up, from.clone().sub(to).normalize());
    beam.renderOrder = 8; ctx.add(beam, bg);
    ctx.deco(sx - 0.4, sx + 0.4, H - 7.1, H - 6.5, sz - 0.4, sz + 0.4, 0x15171b);
  }
  ctx.disposables.push(beamMat);
  for (const [a, w] of [[Math.PI / 2, 2], [-Math.PI / 2, 2], [0, 1], [Math.PI, 1]]) { // big screens high on the bowl
    for (let j = 0; j < w; j++) {
      const off = w === 2 ? (j ? 0.13 : -0.13) : 0, [x, , z] = P(BACK.r0 - 1.5, a + off, 0);
      ctx.screen(x, BACK.top + 3.6, z, yawIn(a + off), 8.5, 5.2, CH.FIGHT);
      ctx.deco(x - 0.05, x + 0.05, BACK.top + 6.2, H - 4.5, z - 0.05, z + 0.05, 0x222222);
    }
  }

  // ---- finish
  for (const m of chunked(seats, 30, (list) => instancedBoxes(list, MAT.seat))) ctx.add(m, m.geometry);
  const chamber = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false });
  for (const [qq, mat, order] of [[q, chamber, 0], [glow, glowMat, 0], [glass, glassMat, 6]]) {
    const m = qq.build(mat); m.position.y = e; m.renderOrder = order; ctx.add(m, m.geometry, mat);
  }
  // breathing ceiling: the sak yant glow pulses slowly (~5 s per breath)
  let tb = 0;
  ctx.breath = () => 0.25 + 0.9 * (0.5 - 0.5 * Math.cos((tb / 5) * Math.PI * 2)); // 25 % … 115 %, clearly visible
  ctx.onUpdate((dt) => {
    tb += dt;
    const k = ctx.breath();
    dm.color.setScalar(k); // ceiling only — the spotlight beams stay steady
  });
  ctx.shapes = [pavilionShape(e, H)];
  ctx.seatCount = seats.length;
}
