import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BC, buildBroadcastScreens, updateBroadcast, setFeedListener, broadcastState } from '../world/broadcast.js';
import { playGain, playLoss, playPosition } from '../world/sfx.js';

// VT-02 Sports Analytics Arena — DEMO rev 4 (theatre-style box arena).
// You enter at the TOP (the concourse where the lifts stop, Y = 0 here) through a portal in the
// outer wall and walk DOWN: 4 levels step down towards a central pit 16.5 m below. The bowl is a
// full circle. Each level has its own ring walkway; its inner edge is lined with OPEN private boxes
// (no roof): low glass dividers, a glass-panel fence at the front, a hanging TV with a live game and
// two position dashboards underneath. Every gain/loss of a box pops up above it with a room-wide
// sound, and every new position opened in a box pops up too (with a chime). In the middle hangs a
// stacked drum: odds boards, live matches, odds, matches, separated by scrolling LED rings. A ribbon
// screen wraps the whole bowl under the roof, LED boards run along every tier front, and the two
// upper levels get their own big hanging screens. Ramps start right beside the entrance.

export const ARENA = {
  cx: 125, cz: 0,
  R: [0, 20, 30, 40, 50], // level front radii (0 = pit)
  Y: [-16.5, -13.5, -9, -4.5, 0], // level heights relative to the entrance concourse
  RWALL: 58, portalHalfM: 7, portalH: 6, portalA: Math.PI,
  boxDepth: 5, boxWidth: 7.5, doorHalfM: 0.8,
  rampBand: 2.2, rampSlope: 3.5,
};
const A = ARENA;
const TAU = Math.PI * 2;
const A0 = Math.PI, A1 = A0 + TAU; // full circle (seam behind the portal)
const norm = (a) => A0 + ((((a - A0) % TAU) + TAU) % TAU);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const levelAt = (r) => (r >= A.R[4] ? 4 : r >= A.R[3] ? 3 : r >= A.R[2] ? 2 : r >= A.R[1] ? 1 : 0);
const inPortal = (a) => Math.abs(angDiff(a, A.portalA)) * A.RWALL < A.portalHalfM;

// ---------------------------------------------------------------- ramps (2 per level change)
export const RAMPS = [];
for (let t = 0; t < 4; t++) {
  const rOut = A.R[t + 1], rIn = rOut - A.rampBand, rMid = rOut - A.rampBand / 2;
  const span = ((A.Y[t + 1] - A.Y[t]) * A.rampSlope) / rMid;
  for (const [c, dir] of [[norm(Math.PI - 0.36), 1], [norm(Math.PI + 0.36), -1]]) { // flanking the entrance, tops nearest it
    const lo = c - span / 2, hi = c + span / 2;
    RAMPS.push({ t, rIn, rOut, lo, hi, aLow: dir > 0 ? lo : hi, aTop: dir > 0 ? hi : lo, dir, y0: A.Y[t], y1: A.Y[t + 1] });
  }
}
const rampFrac = (rp, an) => Math.min(1, Math.max(0, (an - rp.aLow) / (rp.aTop - rp.aLow)));

// Floor height (relative to the concourse) of the arena height-field at a point.
export function groundLocal(x, z) {
  const r = Math.hypot(x - A.cx, z - A.cz);
  if (r >= A.RWALL) return 0;
  const k = levelAt(r);
  const an = norm(Math.atan2(z - A.cz, x - A.cx));
  for (const rp of RAMPS) if (rp.t === k && r >= rp.rIn && r < rp.rOut && an >= rp.lo && an <= rp.hi) return rp.y0 + (rp.y1 - rp.y0) * rampFrac(rp, an);
  return A.Y[k];
}

// ---------------------------------------------------------------- boxes (per level)
function aislesFor(k) {
  return RAMPS.filter((rp) => rp.t === k - 1).map((rp) => {
    const w = 3.6 / A.R[k];
    return rp.dir > 0 ? [rp.aTop - w, rp.aTop + 0.03] : [rp.aTop - 0.03, rp.aTop + w];
  });
}
export const BOXES = [];
for (let k = 1; k <= 4; k++) {
  const cuts = aislesFor(k).sort((p, q) => p[0] - q[0]);
  let start = A0 + 0.002;
  const arcs = [];
  for (const [s, e] of cuts) { arcs.push([start, s]); start = e; }
  arcs.push([start, A1 - 0.002]);
  const rMid = A.R[k] + A.boxDepth / 2;
  let n0 = 1;
  for (const [s, e] of arcs) {
    const n = Math.floor(((e - s) * rMid) / A.boxWidth);
    for (let i = 0; i < n; i++) {
      const a0 = s + ((e - s) * i) / n, a1 = s + ((e - s) * (i + 1)) / n;
      BOXES.push({ k, a0, a1, mid: (a0 + a1) / 2, first: i === 0, idx: BOXES.length, name: `L${k}-${String(n0++).padStart(2, '0')}`, backs: BOXES.length % 2 ? 'away' : 'home' });
    }
  }
}
const boxAt = (k, a) => { const an = norm(a); return BOXES.find((b) => b.k === k && an >= b.a0 && an <= b.a1) || null; };
const boxCell = (b) => (b.idx % 27 === 7 ? BC.RACE : b.idx % BC.MATCHES);

// ---------------------------------------------------------------- collision shape
export function arenaShape(e, H) {
  const pol = (x, z) => ({ r: Math.hypot(x - A.cx, z - A.cz), a: Math.atan2(z - A.cz, x - A.cx) });
  const top = A.Y[A.Y.length - 1];
  const inWall = (p, y) => Math.abs(p.r - A.RWALL) < 0.4 && !(inPortal(p.a) && Math.abs(y - (e + top)) < 0.6);
  return {
    active: (y) => y > e + A.Y[0] - 1 && y < e + H - 0.5,
    ground: (x, z) => e + groundLocal(x, z),
    blocks(px, pz, x, z, y) {
      const p0 = pol(px, pz), p1 = pol(x, z);
      if (inWall(p1, y) && !inWall(p0, y)) return true; // outer wall (portal open at the top level)
      if (p1.r < A.RWALL) {
        const g = e + groundLocal(x, z);
        if (g > y + 0.45) return true; // riser / ramp side too high
        if (g < y - 0.6) return true; // glass fences & rails: no walking off an edge
      }
      const k = A.Y.findIndex((yy, i) => i > 0 && Math.abs(y - (e + yy)) < 0.6);
      if (k > 0) {
        const r0 = A.R[k], rb = r0 + A.boxDepth;
        const in0 = p0.r >= r0 && p0.r <= rb, in1 = p1.r >= r0 && p1.r <= rb;
        if (in0 && in1 && boxAt(k, p0.a) !== boxAt(k, p1.a)) return true; // glass divider
        if ((p0.r > rb) !== (p1.r > rb) && (in0 || in1)) {
          const b = boxAt(k, p1.a) || boxAt(k, p0.a);
          if (b && Math.abs(angDiff(p1.a, b.mid)) * rb > A.doorHalfM) return true; // back rail (gap at the middle)
        }
      }
      return false;
    },
    // path planner: concourse only (inside the bowl you walk the ramps)
    covers: (x, z) => pol(x, z).r < A.RWALL,
    gridBlock: (x, z) => pol(x, z).r < A.RWALL + 0.6,
  };
}

// ---------------------------------------------------------------- geometry helpers
class Quads {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, color) {
    const cc = new THREE.Color(color);
    const i = this.pos.length / 3;
    for (const v of [a, b, c, d]) { this.pos.push(...v); this.col.push(cc.r, cc.g, cc.b); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}
const P = (r, a, y) => [A.cx + r * Math.cos(a), y, A.cz + r * Math.sin(a)];
function arcs(r, a0, a1, seg = 1.5) {
  const n = Math.max(2, Math.ceil(((a1 - a0) * Math.max(r, 1)) / seg));
  return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);
}
const ringTop = (q, r0, r1, y, color, a0 = A0, a1 = A1) => { const as = arcs(r1, a0, a1); for (let i = 0; i < as.length - 1; i++) q.quad(P(r0, as[i], y), P(r1, as[i], y), P(r1, as[i + 1], y), P(r0, as[i + 1], y), color); };
const ringWall = (q, r, y0, y1, color, a0 = A0, a1 = A1) => { const as = arcs(r, a0, a1); for (let i = 0; i < as.length - 1; i++) q.quad(P(r, as[i], y0), P(r, as[i + 1], y0), P(r, as[i + 1], y1), P(r, as[i], y1), color); };
const radial = (q, a, r0, r1, y0, y1, color) => q.quad(P(r0, a, y0), P(r1, a, y0), P(r1, a, y1), P(r0, a, y1), color);
function minus(a0, a1, cuts) {
  const out = [];
  let s = a0;
  for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) { if (c0 > s) out.push([s, Math.min(c0, a1)]); s = Math.max(s, c1); }
  if (s < a1) out.push([s, a1]);
  return out;
}

const mats = {
  chamber: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.3, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  gold: new THREE.MeshBasicMaterial({ color: 0xffc65a, side: THREE.DoubleSide }),
  blue: new THREE.MeshBasicMaterial({ color: 0x2f7bff, side: THREE.DoubleSide }),
  dark: new THREE.MeshLambertMaterial({ color: 0x151b28 }),
};
// Scrolling LED ribbon (one shared canvas texture for every band in the arena).
let ledTex = null, ledCount = 0;
function ledTexture() {
  if (ledTex) return ledTex;
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 96;
  const g = c.getContext('2d');
  const segs = [['#0b1e5b', '#ffc65a', '{FIRM NAME} · SPORTS ANALYTICS'], ['#111827', '#3dff7a', 'LIVE ODDS · 1X2 · O/U 2.5 · BTTS'],
    ['#4b0f2e', '#ffffff', 'CHAMPIONS LEAGUE · LIVE'], ['#2a0606', '#ffffff', 'F1 GRAND PRIX · LIVE TIMING'], ['#1f2937', '#93c5fd', 'POSITIONS OPEN · 24/7'],
    ['#0b1e5b', '#ffffff', 'RESPONSIBLE RECREATION'], ['#3b0d0d', '#ffc65a', 'PREMIER LEAGUE · IN-PLAY'], ['#111827', '#ffffff', 'LIQUIDITY IS A LIFESTYLE']];
  const w = c.width / segs.length;
  segs.forEach(([bg, fg, t], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 96);
    g.fillStyle = fg; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, i * w + w / 2, 50);
    g.fillStyle = '#ffc65a'; g.fillRect(i * w, 0, 3, 96);
  });
  ledTex = new THREE.CanvasTexture(c);
  ledTex.colorSpace = THREE.SRGBColorSpace;
  ledTex.wrapS = THREE.RepeatWrapping;
  return ledTex;
}
const ledMat = () => (ledMat.m ||= new THREE.MeshBasicMaterial({ map: ledTexture(), side: THREE.BackSide, toneMapped: false }));
// Inward-facing band on a circle of radius r between angles a0..a1 (u scaled so text keeps its size).
function ledBand(ctx, r, y0, y1, a0, a1, outward = false) {
  const len = (a1 - a0) * r;
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, Math.max(8, Math.ceil(len / 1.5)), 1, true, Math.PI / 2 - a1, a1 - a0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (outward ? 1 : -1) * uv.getX(i) * (len / 64));
  const m = new THREE.Mesh(g, outward ? (ledMat.o ||= new THREE.MeshBasicMaterial({ map: ledTexture(), side: THREE.FrontSide, toneMapped: false })) : ledMat());
  m.position.set(A.cx, ctx.e + (y0 + y1) / 2, A.cz);
  ctx.add(m, g);
  ledCount++;
}
function stepLed(dt) { if (ledTex) ledTex.offset.x = (ledTex.offset.x + dt * 0.05) % 1; }

const NAVY = 0x1a2030, STEP = 0x283043, RISER = 0x1d2a4a, GLASS = 0x9fd8ff, GOLD = 0xffc65a, BLUE = 0x2f7bff;
const CARPET = [0x5a1a28, 0x1d2f5a, 0x24452f, 0x4a3a1a];

// ---------------------------------------------------------------- gain / loss pop-ups
const fmt = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`;
function makePopupPool(ctx, n) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 120;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.visible = false; sp.renderOrder = 20;
    ctx.add(sp, tex, sp.material);
    pool.push({ sp, c, tex, life: 0, y0: 0 });
  }
  return pool;
}
function showPopup(pool, e, box, amount, pick = null) {
  const p = pool.find((q) => q.life <= 0) || pool.reduce((a, b) => (a.life < b.life ? a : b));
  const g = p.c.getContext('2d');
  const gain = amount >= 0;
  const col = pick ? '#ffc65a' : gain ? '#3dff7a' : '#ff4d5e';
  g.clearRect(0, 0, 320, 120);
  g.fillStyle = pick ? 'rgba(10,22,58,0.9)' : gain ? 'rgba(6,40,18,0.88)' : 'rgba(48,8,12,0.88)';
  g.beginPath(); g.roundRect(4, 4, 312, 112, 18); g.fill();
  g.strokeStyle = col; g.lineWidth = 4; g.stroke();
  g.fillStyle = col; g.font = 'bold 50px sans-serif'; g.textAlign = 'center';
  g.fillText(pick ? Math.abs(amount).toLocaleString() : fmt(amount), 160, 62);
  g.fillStyle = '#ffffff'; g.font = '20px sans-serif';
  g.fillText(pick ? `New position · Box ${box.name} · ${pick}` : `${gain ? 'Realised gain' : 'Strategic contribution'} · Box ${box.name}`, 160, 98);
  p.tex.needsUpdate = true;
  const [x, , z] = P(A.R[box.k] + 2.5, box.mid, 0);
  p.y0 = e + A.Y[box.k] + 3.9;
  p.sp.position.set(x, p.y0, z);
  p.sp.material.opacity = 1;
  p.sp.visible = true;
  p.life = 2.6;
}
function stepPopups(pool, dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const t = 2.6 - p.life; // 0..2.6
    const s = Math.min(1, 0.55 + t * 2.5) * 2.4;
    p.sp.scale.set(s * 2.67, s, 1);
    p.sp.position.y = p.y0 + t * 0.6;
    p.sp.material.opacity = Math.min(1, p.life / 0.6);
    if (p.life <= 0) p.sp.visible = false;
  }
}

export function arena(ctx) {
  const e = ctx.e, H = ctx.floor.height;
  const Y0 = A.Y[0], TOP = A.Y[4];
  const q = new Quads(), glass = new Quads(), glow = new Quads();
  const bc = [];

  // ---- pit
  ringTop(q, 0.01, A.R[1], Y0 + 0.02, 0x1f2635);
  ringTop(glow, 16.4, 16.7, Y0 + 0.04, GOLD);

  // ---- levels: tops, risers (gold fascia), ramps
  for (let k = 1; k <= 4; k++) {
    const rEnd = k < 4 ? A.R[k + 1] : A.RWALL;
    const rIn = k < 4 ? rEnd - A.rampBand : rEnd;
    ringTop(q, A.R[k], rIn, A.Y[k], STEP);
    if (k < 4) for (const [s, en] of minus(A0, A1, RAMPS.filter((rp) => rp.t === k).map((rp) => [rp.lo, rp.hi]))) ringTop(q, rIn, rEnd, A.Y[k], STEP, s, en);
    ringWall(q, A.R[k], A.Y[k - 1], A.Y[k], RISER);
    ringWall(glow, A.R[k] - 0.03, A.Y[k] - 0.28, A.Y[k] - 0.06, GOLD);
  }
  for (const rp of RAMPS) {
    const as = arcs(rp.rOut, Math.min(rp.aLow, rp.aTop), Math.max(rp.aLow, rp.aTop), 1.0);
    const h = (an) => rp.y0 + (rp.y1 - rp.y0) * rampFrac(rp, an);
    for (let i = 0; i < as.length - 1; i++) {
      const [a, b] = [as[i], as[i + 1]];
      q.quad(P(rp.rIn, a, h(a)), P(rp.rOut, a, h(a)), P(rp.rOut, b, h(b)), P(rp.rIn, b, h(b)), 0x343d52);
      q.quad(P(rp.rIn, a, rp.y0), P(rp.rIn, b, rp.y0), P(rp.rIn, b, h(b)), P(rp.rIn, a, h(a)), RISER);
      glass.quad(P(rp.rIn, a, h(a)), P(rp.rIn, b, h(b)), P(rp.rIn, b, h(b) + 1.0), P(rp.rIn, a, h(a) + 1.0), GLASS);
      glow.quad(P(rp.rIn, a, h(a) + 1.0), P(rp.rIn, b, h(b) + 1.0), P(rp.rIn, b, h(b) + 1.08), P(rp.rIn, a, h(a) + 1.08), GOLD);
    }
    const [lx, , lz] = P(rp.rIn + 1.1, rp.aTop, 0);
    ctx.sign(`↓ LEVEL ${rp.t === 0 ? 'PIT' : rp.t}`, lx, rp.y1 + 2.6, lz, { size: 0.5, gold: false });
  }

  // ---- outer wall (full circle) with the entrance portal at the top level + deck ledge outside
  const ph = A.portalHalfM / A.RWALL;
  ringWall(q, A.RWALL, Y0, TOP, NAVY);
  ringWall(q, A.RWALL, TOP + A.portalH, H - 0.25, NAVY);
  ringWall(q, A.RWALL, TOP, TOP + A.portalH, NAVY, A0 + ph, A1 - ph);
  for (const a of [A0 - ph, A0 + ph]) radial(glow, a, A.RWALL - 0.5, A.RWALL + 0.5, TOP, TOP + A.portalH, GOLD);
  ringWall(glow, A.RWALL + 0.02, TOP + A.portalH, TOP + A.portalH + 0.25, GOLD, A0 - ph, A0 + ph);
  ringTop(q, A.RWALL, A.RWALL + 2.5, TOP + 0.01, 0x1b2438);
  ringWall(glow, A.RWALL - 0.1, 4.5, 5.0, BLUE);
  ringWall(glow, A.RWALL - 0.1, 7.5, 7.9, GOLD);

  // ---- open private boxes
  BOXES.forEach((b) => {
    const k = b.k, r0 = A.R[k], rb = r0 + A.boxDepth, y = A.Y[k];
    const dh = A.doorHalfM / rb;
    // low glass dividers (no roof, no walls)
    for (const a of b.first ? [b.a0, b.a1] : [b.a1]) {
      radial(glass, a, r0, rb, y, y + 1.2, GLASS);
      radial(glow, a, r0, rb, y + 1.2, y + 1.25, GOLD);
    }
    // back rail with an opening in the middle
    for (const [s, en] of [[b.a0, b.mid - dh], [b.mid + dh, b.a1]]) {
      ringWall(glass, rb, y, y + 1.0, GLASS, s, en);
      ringWall(glow, rb, y + 1.0, y + 1.05, GOLD, s, en);
    }
    ringTop(q, r0 + 0.1, rb - 0.1, y + 0.03, CARPET[b.idx % 4], b.a0, b.a1);
    ringWall(glass, r0 + 0.08, y, y + 1.1, GLASS, b.a0, b.a1); // glass-panel fence
    ringTop(glow, r0, r0 + 0.12, y + 1.1, GOLD, b.a0, b.a1);
    ringTop(glow, r0, r0 + 0.3, y + 0.05, BLUE, b.a0, b.a1); // front edge light strip
    // hanging TV on a slim gantry, position dashboards below it (all facing the seats)
    const yaw = Math.atan2(Math.cos(b.mid), Math.sin(b.mid));
    const [gx, , gz] = P(r0 + 0.45, b.mid, 0);
    ctx.deco(gx - 0.06, gx + 0.06, y, y + 3.45, gz - 0.06, gz + 0.06, 0x111111);
    const [tx, , tz] = P(r0 + 0.6, b.mid, 0);
    ctx.deco(tx - 0.05, tx + 0.05, y + 3.3, y + 3.45, tz - 0.05, tz + 0.05, 0x111111);
    bc.push({ x: tx, y: e + y + 2.75, z: tz, yaw, w: 1.75, h: 0.98, cell: boxCell(b) });
    const dA = 0.5 / (r0 + 0.62);
    for (const [o, d] of [[-dA, 0], [dA, 1]]) {
      const [dx, , dz] = P(r0 + 0.62, b.mid + o, 0);
      bc.push({ x: dx, y: e + y + 1.78, z: dz, yaw, w: 0.95, h: 0.53, cell: BC.DASH + ((b.idx + d) % BC.DASHES) });
    }
    // guests facing the centre
    const sA = 1.5 / (r0 + 2.6);
    [-sA, 0, sA].forEach((o, i) => { if ((b.idx + i) % 5 !== 4) { const [nx, , nz] = P(r0 + 2.6, b.mid + o, 0); ctx.npc(nx, nz, i === 1 ? 0xf0f0f0 : 0x2b3a55, yaw, y); } });
  });

  // ---- centre stack: live matches (scoreboards) + the F1 race (live timing) + odds
  const add = (geo, mat, x, yy, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, e + yy, z); m.rotation.x = rx; ctx.add(m, geo); return m; };
  const ring = (ap, rows, y0, h, cellFor, sides = 12) => {
    const pw = 2 * ap * Math.tan(Math.PI / sides);
    add(new THREE.CylinderGeometry((ap - 0.15) / Math.cos(Math.PI / sides), (ap - 0.15) / Math.cos(Math.PI / sides), rows * (h + 0.1) + 0.2, sides, 1, false), mats.dark, A.cx, y0 + (rows * (h + 0.1)) / 2, A.cz);
    for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
      const a = Math.PI / 2 - ((i + 0.5) / sides) * TAU; // facet centres of the cylinder
      bc.push({ x: A.cx + ap * Math.cos(a), y: e + y0 + row * (h + 0.1) + h / 2 + 0.1, z: A.cz + ap * Math.sin(a), yaw: Math.atan2(Math.cos(a), Math.sin(a)), w: pw - 0.12, h, cell: cellFor(row, i) });
    }
  };
  // stacked from the top down to the pit floor: three tall eight-sided tiers (each one merges two of the
  // earlier levels) with LED rings between — every screen is ~12 m wide, 16:9
  const SIDES = 8, tw = (ap) => 2 * ap * Math.tan(Math.PI / SIDES) - 0.3;
  const TIERS = [
    { ap: 15.0, y0: 1.4, cell: (i) => (i === 3 ? BC.RACE : (i * 2) % BC.MATCHES) },
    { ap: 14.5, y0: -7.6, cell: (i) => (i % 2 ? BC.DASH + (i % BC.DASHES) : i === 4 ? BC.SCORES : (i * 2 + 1) % BC.MATCHES) },
    { ap: 13.0, y0: A.Y[0] + 0.4, cell: (i) => (i === 5 ? BC.RACE : (i * 3 + 2) % BC.MATCHES) },
  ].map((t) => ({ ...t, h: tw(t.ap) * 9 / 16 }));
  for (const t of TIERS) {
    ring(t.ap, 1, t.y0, t.h, (row, i) => t.cell(i), SIDES);
    for (const yy of [t.y0, t.y0 + t.h + 0.3]) add(new THREE.TorusGeometry(t.ap / Math.cos(Math.PI / SIDES) + 0.1, 0.16, 4, SIDES * 6), mats.gold, A.cx, yy, A.cz, Math.PI / 2);
  }
  for (let k = 0; k < TIERS.length - 1; k++) { // LED rings between the tiers
    const hi = TIERS[k], lo = TIERS[k + 1];
    const r = Math.max(hi.ap, lo.ap) / Math.cos(Math.PI / SIDES) + 0.3;
    ledBand(ctx, r, lo.y0 + lo.h + 0.4, hi.y0 - 0.1, A0, A1, true);
  }
  add(new THREE.CylinderGeometry(14.4, 14.8, 0.4, SIDES, 1, false, Math.PI / SIDES), mats.dark, A.cx, A.Y[0] + 0.2, A.cz); // plinth on the pit floor
  ctx.colliders.push({ x0: A.cx - 12.2, x1: A.cx + 12.2, z0: A.cz - 12.2, z1: A.cz + 12.2, y0: e + A.Y[0], y1: e + A.Y[0] + 4 }); // the stack's base is solid
  const drumTop = TIERS[0].y0 + TIERS[0].h + 0.3;
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; ctx.deco(A.cx + 7 * Math.cos(a) - 0.06, A.cx + 7 * Math.cos(a) + 0.06, drumTop, H - 2, A.cz + 7 * Math.sin(a) - 0.06, A.cz + 7 * Math.sin(a) + 0.06, 0x222222); }

  // ---- wrap-around ribbon screen under the roof + LED boards along every tier front
  ledBand(ctx, A.RWALL - 0.35, 8.4, 10.6, A0, A1);
  for (let k = 1; k <= 4; k++) {
    const cuts = RAMPS.filter((rp) => rp.t === k - 1).map((rp) => [rp.lo, rp.hi]);
    for (const [s0, s1] of minus(A0, A1, cuts)) ledBand(ctx, A.R[k] - 0.06, A.Y[k] - 1.25, A.Y[k] - 0.34, s0, s1);
  }

  // ---- big hanging screens for the upper levels (far from the drum), double-sided
  for (const [k, r, n, yc, w, h] of [[3, 34, 12, -1.5, 6.4, 3.6], [4, 44.5, 16, 4.6, 7.2, 4.0]]) {
    for (let i = 0; i < n; i++) {
      const a = A0 + ((i + 0.5) / n) * TAU;
      const yaw = Math.atan2(Math.cos(a), Math.sin(a));
      const [x, , z] = P(r, a, 0);
      const [xb, , zb] = P(r - 0.12, a, 0);
      bc.push({ x, y: e + yc, z, yaw, w, h, cell: (i * 3 + k) % BC.MATCHES });
      bc.push({ x: xb, y: e + yc, z: zb, yaw: yaw + Math.PI, w, h, cell: i % 4 === 1 ? BC.SCORES : (i * 5 + k) % BC.MATCHES });
      for (const o of [-w / 2.6, w / 2.6]) {
        const [rx, , rz] = P(r - 0.06, a + o / r, 0);
        ctx.deco(rx - 0.04, rx + 0.04, yc + h / 2, H - 2.2, rz - 0.04, rz + 0.04, 0x222222);
      }
    }
  }

  // ---- roof truss + gold light rings
  const parts = [];
  for (let i = 0; i < 20; i++) { const bx = new THREE.BoxGeometry(A.RWALL - 8, 0.9, 0.6); bx.translate(8 + (A.RWALL - 8) / 2, 0, 0); bx.rotateY(-(i / 20) * TAU); parts.push(bx.toNonIndexed()); }
  for (const rr of [20, 34, 48]) parts.push(new THREE.TorusGeometry(rr, 0.35, 4, 72).rotateX(Math.PI / 2).toNonIndexed());
  add(mergeGeometries(parts), mats.dark, A.cx, H - 2.2, A.cz);
  for (const rr of [22, 36, 50, 56]) add(new THREE.TorusGeometry(rr, 0.16, 4, 96), mats.gold, A.cx, H - 1.6, A.cz, Math.PI / 2);

  // ---- pit: analytics desks under the drum
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.22;
    const x = A.cx + 17 * Math.cos(a), z = A.cz + 17 * Math.sin(a); // ring of desks round the stack's base
    ctx.box(x - 0.8, x + 0.8, Y0, Y0 + 0.75, z - 0.8, z + 0.8, 0x2a3348);
    const yaw = Math.atan2(Math.cos(a), Math.sin(a));
    bc.push({ x: x - 0.5 * Math.cos(a), y: e + Y0 + 1.15, z: z - 0.5 * Math.sin(a), yaw, w: 1.1, h: 0.62, cell: i % BC.MATCHES });
    ctx.npc(x + 1.1 * Math.cos(a), z + 1.1 * Math.sin(a), 0xf0f0f0, yaw, Y0);
  }

  // ---- concourse: the lift hall flows straight into the portal (top level)
  const portalX = A.cx - Math.sqrt(A.RWALL * A.RWALL - 49);
  ctx.deco(50, portalX + 0.5, 0.02, 0.035, -A.portalHalfM, A.portalHalfM, 0x1b2438);
  for (const zz of [-A.portalHalfM, A.portalHalfM - 0.4]) ctx.deco(50, portalX + 0.5, 0.035, 0.045, zz, zz + 0.4, GOLD);
  for (let x = 52; x < portalX - 1; x += 3) ctx.deco(x, x + 1.4, 0.035, 0.045, -0.2, 0.2, BLUE);
  for (const sg of [-1, 1]) ctx.box(portalX - 0.9, portalX + 1.2, 0, A.portalH + 1.4, sg > 0 ? A.portalHalfM : -A.portalHalfM - 1.6, sg > 0 ? A.portalHalfM + 1.6 : -A.portalHalfM, 0x1b2438);
  ctx.deco(portalX - 0.9, portalX + 1.2, A.portalH, A.portalH + 1.4, -A.portalHalfM, A.portalHalfM, 0x1b2438);
  for (const sg of [-1, 1]) ctx.deco(portalX - 0.95, portalX - 0.9, 0.3, A.portalH + 1.2, sg * (A.portalHalfM + 0.8) - 0.15, sg * (A.portalHalfM + 0.8) + 0.15, GOLD);
  ctx.deco(portalX - 0.95, portalX - 0.9, A.portalH + 0.5, A.portalH + 0.7, -A.portalHalfM - 1.4, A.portalHalfM + 1.4, BLUE);
  ctx.sign('SPORTS ANALYTICS ARENA', portalX - 1.2, A.portalH + 2.4, 0, { size: 1.8, sub: 'Enter at Level 4 · ramps either side' });
  for (const a of [Math.PI / 2, -Math.PI / 2, 0]) { const [x, , z] = P(A.RWALL - 2, a, 0); ctx.sign('SPORTS ANALYTICS ARENA', x, 6.7, z, { size: 2.6 }); }

  for (const [qq, mat, order] of [[q, mats.chamber, 0], [glow, mats.glow, 0], [glass, mats.glass, 6]]) {
    const m = qq.build(mat);
    m.position.y = e; m.renderOrder = order;
    ctx.add(m, m.geometry);
  }
  for (const m of buildBroadcastScreens(bc)) ctx.add(m, m.geometry);
  ctx.disposables.push(...parts);

  // ---- live gains / losses: every goal settles the boxes watching that match
  const pool = makePopupPool(ctx, 18);
  const stats = { events: 0, popups: 0, gains: 0, losses: 0, lastSound: null };
  ctx.arenaStats = stats;
  ctx.debugPopup = (idx, amount) => showPopup(pool, e, BOXES[idx], amount); // dev: force a pop-up
  setFeedListener((ev) => {
    stats.events++;
    const watching = BOXES.filter((b) => (ev.type === 'goal' ? boxCell(b) === ev.match : boxCell(b) === BC.RACE));
    const pick = watching.sort(() => Math.random() - 0.5).slice(0, 4);
    let g = 0, l = 0;
    for (const b of pick) {
      const win = ev.type === 'goal' ? b.backs === ev.side : (b.idx + ev.winner) % 3 === 0;
      const amount = (win ? 1 : -1) * 500 * Math.round((2 + Math.random() * 98));
      if (ctx.group.visible) showPopup(pool, e, b, amount);
      stats.popups++;
      win ? (g++, stats.gains++) : (l++, stats.losses++);
    }
    // room-wide sound, only while you are in the arena
    if (ctx.group.visible && pick.length) {
      if (g) { playGain(); stats.lastSound = 'gain'; }
      if (l) setTimeout(() => { playLoss(); stats.lastSound = 'loss'; }, g ? 350 : 0);
    }
  });
  // every position opened in a box is announced: pop-up above the box + a chime (Phase 0: simulated)
  stats.positions = 0;
  ctx.placePosition = (idx, amount, pick) => {
    const b = BOXES[idx];
    stats.positions++;
    if (ctx.group.visible) { showPopup(pool, e, b, amount, pick); playPosition(); stats.lastSound = 'position'; }
  };
  let nextPos = 2;
  ctx.onUpdate((dt) => {
    updateBroadcast(dt, ctx.group.visible); stepPopups(pool, dt); stepLed(dt);
    if ((nextPos -= dt) > 0) return;
    nextPos = 1.8 + Math.random() * 3.2;
    const b = BOXES[Math.floor(Math.random() * BOXES.length)];
    const cell = boxCell(b);
    let pick = `${broadcastState().race.top[Math.floor(Math.random() * 6)]} to win`; // F1 race cell
    if (cell < BC.MATCHES) { const m = (broadcastState().matches[cell] || '').split(' '); pick = (b.backs === 'home' ? m[0] : m[2]) || 'Home'; }
    ctx.placePosition(b.idx, 500 * Math.round(2 + Math.random() * 498), pick);
  });

  ctx.shapes = [arenaShape(e, H)];
  ctx.boxCount = BOXES.length;
  ctx.ledBands = ledCount;
  ctx.seatCount = BOXES.length * 3;
  ctx.bcScreens = bc.length;
}
