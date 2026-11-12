import * as THREE from 'three';
import { Lux, LM, plaque, addLuxMaterials, peopleInstanced } from '../world/lux.js';
import { kitMaterials } from './luxKit.js';
import { luxLiftHall, ceiling } from './luxHall.js';
import { CH } from '../world/screens.js';
import { QUALITY } from '../quality.js';

// ================================================================= PHASE 1 — OT-02 PROBABILITY RESEARCH INSTITUTE
// Redesign (user, 2026-11-12): the "Monte Carlo Rehearsal Theatre". A bright white/navy research lab built as
// a raked cinema: six curved tiers of quant desks step DOWN towards a pit, where the animatronic "Chief Draw
// Officer" works the draw drum on a stage in front of an IMAX wall. The IMAX is a LIVE camera feed of the robot
// (the stage is small seen from the back row) flanked by the results board and the predictive model; a
// countdown to the next official draw runs above it. Lottery tickets everywhere: every tier riser is a strip of
// tickets, tickets on the desks, giant ticket banners on the walls, confetti in the pit.
// IMAX scale (user, 2026-11-12, Siam Paragon IMAX as the scale / screen reference): the rake is 20 m deep and
// ~34°, so from the back row the robot is small and the 44 x 26 m screen carries the show.
// Sequence (world coords; heights relative to the lift-hall slab, Y 47; the pit floor is -20 = Y 27):
//   lift hall (X -30..-49.66, Phase 1 shared design)
//   → the portal (10 x 5 m) into a dim navy cinema foyer (X -57..-49.66, Z ±6, ceiling 4.2): poster lightboxes,
//     velvet queue ropes, the Ticket Allocation Desk, ushers
//   → the reveal: the top concourse (y 0) at the back of the theatre, every tier stepping down to the pit
//   → tiers 1..12 on gentle arcs about F (-130, 0), wall to wall: tier k spans r 40 + (k-1)·2.45 .. +2.45 at
//     y -20 + k·5/3 (tier 12 = 0); aisle stairs at angles 0, ±0.22, ±0.44, ±0.7 rad (8 risers of 0.21 m per tier)
//   → the pit (r < 40, y -20): walkway, gold rail (X -93.6 / Z ±10.5), the stage (X -108.4..-96, Z ±8.5, 1.2 m)
// Above the foyer: the glass Model Projection Booth with three beams onto the IMAX wall.
// Plain names in code comments only: the Thai lottery quant lab.

const TAU = Math.PI * 2;
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a, v) => a[Math.floor(v * a.length) % a.length];

// ---------------------------------------------------------------- layout (exported for the spec / tests)
const F = { x: -130, z: 0 }; // centre of the tier arcs (behind the screen wall: the rows are gentle arcs)
const NT = 12, RISE = 20 / NT, PIT_Y = -20, PIT_R = 40, TD = 2.45, TOP_R = PIT_R + NT * TD; // top of tier 12 = r 69.4
const XW = -109, ZW = 39, XB = -57, XE = -49.66, CEIL = 9.75; // west wall, side walls, concourse back wall, portal wall
const FOY = { x0: XB, x1: XE, z: 5.6, h: 4.2 }; // matches the 11.2 x 5.6 portal opening
const AISLES = [-0.7, -0.44, -0.22, 0, 0.22, 0.44, 0.7], AHW = 0.9, STEPS = 8;
const STAGE = { x0: -108.4, x1: -96, z: 8.5, h: 1.2 }, STAGE_TOP = PIT_Y + 1.2;
const RAIL = { x: -93.6, z: 10.5 };
const SEAT = { back: 1.25, band: 1.6, pitch: 1.45, maxTh: Math.PI }; // hips behind the tier edge, blocked desk band, spacing
const RIG = { x: -102.3, z: -3.2, s: 1.2 }; // the draw machine (drum + robot + rack), scaled 1.2
const IMAX = { x: -108.8, z: 22, y0: -18.5, y1: 7.5 }; // 44 x 26 m, floor to ceiling
const SIDE = { z0: 23.6, z1: 37.6, y0: -12, y1: 2.6 }; // results (north) / model (south) panels
export const THEATRE = { F, PIT_Y, PIT_R, TD, NT, TOP_R, XB, FOY, AISLES, AHW, STAGE, RAIL, RIG, IMAX };

const tierY = (k) => (k <= 0 ? PIT_Y : k >= NT ? 0 : PIT_Y + k * RISE);
const rFront = (k) => PIT_R + (k - 1) * TD;
const rMid = (k) => PIT_R + (k - 0.5) * TD;
const polar = (x, z) => [Math.hypot(x - F.x, z - F.z), Math.atan2(z - F.z, x - F.x)];
const tierAt = (r) => (r < PIT_R ? 0 : r >= TOP_R ? NT + 1 : 1 + Math.floor((r - PIT_R) / TD));
const aisleHalf = (k) => AHW / rMid(k);
const inAisle = (k, th) => k >= 1 && k <= NT && AISLES.some((a) => Math.abs(th - a) < aisleHalf(k));
// the angular limit of the room at radius r (west wall at XW, side walls at ±ZW)
const thMax = (r) => Math.min(Math.acos(Math.max(-1, Math.min(1, (XW - F.x) / r))), r > ZW ? Math.asin(ZW / r) : Math.PI);
// desk sectors per tier: [a0, a1] between the aisles (with the desk margin), inside the room
const DESK_SECTORS = [];
for (let k = 1; k <= NT; k++) {
  const rs = rFront(k) + SEAT.back, m = (AHW + 0.12) / rs;
  const lim = Math.min(SEAT.maxTh, Math.asin(Math.min(1, (ZW - 1.2) / (rs + 0.9))), Math.acos(Math.max(-1, (XW + 1.2 - F.x) / rs)));
  const edges = [-lim, ...AISLES.flatMap((a) => [a - m, a + m]), lim];
  const secs = [];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 1.4 / rs) secs.push([Math.max(-lim, edges[i]), Math.min(lim, edges[i + 1])]);
  DESK_SECTORS[k] = secs.filter(([a, b]) => b - a > 1.4 / rs);
}
const inDeskBand = (k, r, th) => k >= 1 && k <= NT && r - rFront(k) < SEAT.band && DESK_SECTORS[k].some(([a, b]) => th > a && th < b);
const inRail = (x, z) => x < RAIL.x && Math.abs(z) < RAIL.z;

// ---------------------------------------------------------------- walkable height field
function groundAt(x, z) {
  if (x > XB) return 0; // foyer + the slab strip by the portal
  if (x >= STAGE.x0 && x <= STAGE.x1 && Math.abs(z) <= STAGE.z) return STAGE_TOP;
  const [r, th] = polar(x, z), k = tierAt(r);
  if (k === 0) return PIT_Y;
  if (k > NT) return 0; // the top concourse
  if (inAisle(k, th)) { const i = Math.min(STEPS - 1, Math.floor((r - rFront(k)) / (TD / STEPS))); return tierY(k - 1) + ((i + 1) * RISE) / STEPS; }
  return tierY(k);
}
const covers = (x, z) => x >= XW - 1 && x <= XE && Math.abs(z) <= ZW + 1;
export function theatreShape(e) {
  return {
    active: (y) => y > e + PIT_Y - 1 && y < e + CEIL,
    covers,
    ground: (x, z) => e + groundAt(x, z),
    blocks(px, pz, x, z, y) {
      if (!covers(x, z)) return false;
      if (x < XW + 0.4 || Math.abs(z) > ZW - 0.4) return true; // the walls (their colliders stop at the slab)
      const yl = y - e, g = groundAt(x, z);
      if (g > yl + 0.45 || g < yl - 0.5) return true; // tier fronts: only the aisle stairs go up or down
      if (inRail(x, z) !== inRail(px, pz)) return true; // the gold rail round the stage
      const [r, th] = polar(x, z);
      if (x <= XB && inDeskBand(tierAt(r), r, th)) return true; // desks + chairs
      return false;
    },
    gridBlock: (x, z) => covers(x, z) && (x > XB ? false : groundAt(x, z) !== 0),
  };
}

// ---------------------------------------------------------------- materials + textures
const canvasT = (w, h, draw, repeat = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const THAI = '"Leelawadee UI", "Leelawadee", Tahoma, sans-serif';
// one lottery ticket (front, ~2:1), drawn at (x, y) with size w x h. Layout follows the real paper ticket
// (reference: Government Lottery of Thailand 2026.jpg, Wikimedia Commons, CC BY-SA 4.0): header + theme art on the
// left, the six digits on a yellow band with digit words, the draw date, งวดที่ / ชุดที่, barcode, 80 บาท, the L6
// mark and the under-20 warning; a teal side strip. The emblem is generic (not the official crest).
const DIGW = ['ZER', 'ONE', 'TWO', 'THR', 'FOR', 'FIV', 'SIX', 'SEV', 'EGT', 'NIN'];
function ticket(g, x, y, w, h, num, hue, set = 12) {
  const r = rng(Number(num) % 9973 + 7);
  const X = (u) => x + u * w, Y = (v) => y + v * h, fs = (v) => Math.max(6, v * h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  // paper: pastel wash + fine security guilloche
  const grd = g.createLinearGradient(x, y, x + w, y);
  grd.addColorStop(0, `hsl(${hue},60%,93%)`); grd.addColorStop(0.55, `hsl(${(hue + 40) % 360},55%,95%)`); grd.addColorStop(1, `hsl(${(hue + 90) % 360},50%,93%)`);
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  g.lineWidth = Math.max(0.6, w / 900);
  for (let i = 0; i < 46; i++) { g.strokeStyle = `hsla(${(hue + i * 7) % 360},55%,60%,0.22)`; g.beginPath(); for (let k = 0; k <= 60; k++) { const u = X(k / 60), v = Y(0.5 + Math.sin(k * 0.42 + i * 0.5) * 0.18 + (i - 23) * 0.022); k ? g.lineTo(u, v) : g.moveTo(u, v); } g.stroke(); }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const ink = '#33338a', purple = '#6a2a8a', red = '#d0191f';
  // left edge strip (vertical slogan)
  g.fillStyle = `hsla(${hue},50%,85%,0.9)`; g.fillRect(x, y, w * 0.045, h);
  g.save(); g.translate(X(0.032), Y(0.97)); g.rotate(-Math.PI / 2);
  g.fillStyle = purple; g.font = `700 ${fs(0.055)}px ${THAI}`; g.fillText('สลากสร้างสรรค์.....เพื่อสังคม', 0, 0);
  g.font = `700 ${fs(0.06)}px Arial`; g.fillText('GLO', h * 0.78, 0); g.restore();
  // generic round emblem + header
  const ex = X(0.105), ey = Y(0.14), er = h * 0.085;
  g.fillStyle = '#2a7fc4'; g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, er * 0.08);
  for (let i = 0; i < 16; i++) { const t = (i / 16) * TAU; g.beginPath(); g.moveTo(ex + Math.cos(t) * er * 0.35, ey + Math.sin(t) * er * 0.35); g.lineTo(ex + Math.cos(t) * er * 0.85, ey + Math.sin(t) * er * 0.85); g.stroke(); }
  g.beginPath(); g.arc(ex, ey, er * 0.92, 0, TAU); g.stroke();
  g.fillStyle = ink; g.font = `800 ${fs(0.078)}px ${THAI}`; g.fillText('สลากกินแบ่งรัฐบาล', X(0.19), Y(0.115));
  g.font = `700 ${fs(0.04)}px Arial`; g.fillText('THAI GOVERNMENT LOTTERY', X(0.2), Y(0.175));
  g.fillStyle = purple; g.font = `italic 700 ${fs(0.05)}px ${THAI}`; g.fillText('สถาบันวิจัยความน่าจะเป็น', X(0.2), Y(0.255));
  g.font = `700 ${fs(0.032)}px Arial`; g.fillText('Probability Research Institute /', X(0.2), Y(0.305)); g.fillText('Monte Carlo Rehearsal Theatre', X(0.2), Y(0.345));
  g.fillStyle = red; g.font = `400 ${fs(0.036)}px ${THAI}`; g.fillText('1 ธันวาคม · สถาบันวิจัยฯ ครบรอบ 25 ปี', X(0.12), Y(0.415));
  // QR code
  const qx = X(0.49), qy = Y(0.07), qs = h * 0.17, cell = qs / 13;
  g.fillStyle = '#fff'; g.fillRect(qx - cell, qy - cell, qs + 2 * cell, qs + 2 * cell); g.fillStyle = '#111';
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) { const fin = (i < 4 && j < 4) || (i > 8 && j < 4) || (i < 4 && j > 8); if (fin ? (i % 3 === 0 || j % 3 === 0 || (i % 9 > 0 && i % 9 < 3 && j % 9 > 0 && j % 9 < 3)) : r() < 0.5) g.fillRect(qx + i * cell, qy + j * cell, cell, cell); }
  // theme illustration: the institute building, a draw drum and balls
  const ix0 = X(0.075), iy0 = Y(0.44), iw = w * 0.36, ih = h * 0.3;
  const sky = g.createLinearGradient(0, iy0, 0, iy0 + ih); sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(1, '#fff3c8'); g.fillStyle = sky; g.fillRect(ix0, iy0, iw, ih);
  g.fillStyle = '#5a8fd0'; g.fillRect(ix0 + iw * 0.12, iy0 + ih * 0.12, iw * 0.3, ih * 0.88); g.fillStyle = '#8fc0ff'; for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.fillRect(ix0 + iw * (0.14 + j * 0.07), iy0 + ih * (0.18 + i * 0.13), iw * 0.05, ih * 0.08);
  g.fillStyle = '#3f6db0'; g.fillRect(ix0 + iw * 0.45, iy0 + ih * 0.35, iw * 0.22, ih * 0.65);
  g.strokeStyle = '#c99a2e'; g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.arc(ix0 + iw * 0.8, iy0 + ih * 0.5, ih * 0.3, 0, TAU); g.stroke();
  for (let i = 0; i < 9; i++) { g.fillStyle = ['#ff5a4d', '#ffd34d', '#4dc2ff', '#6ad66a', '#ff7ad0'][i % 5]; g.beginPath(); g.arc(ix0 + iw * (0.72 + r() * 0.16), iy0 + ih * (0.45 + r() * 0.3), ih * 0.06, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(ix0 + iw * 0.5, iy0 + ih * 1.02, iw * 0.55, ih * 0.12, 0, 0, TAU); g.fill();
  // zodiac glyphs (silhouettes)
  g.fillStyle = '#222';
  for (let i = 0; i < 4; i++) { const zx = X(0.47 + (i % 2) * 0.055), zy = Y(0.4 + Math.floor(i / 2) * 0.1); g.beginPath(); g.ellipse(zx, zy, h * 0.02, h * 0.024, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(zx + h * 0.018, zy - h * 0.03, h * 0.008, h * 0.016, 0.4, 0, TAU); g.fill(); }
  // 80 บาท, signature, green mark, warning
  g.fillStyle = red; g.font = `800 ${fs(0.14)}px Georgia, serif`; g.fillText('80', X(0.06), Y(0.88));
  g.font = `700 ${fs(0.055)}px ${THAI}`; g.fillText('บาท', X(0.075), Y(0.94));
  g.strokeStyle = '#1a2a6a'; g.lineWidth = Math.max(1, h * 0.006); g.beginPath(); g.moveTo(X(0.2), Y(0.83)); for (let k = 1; k < 14; k++) g.lineTo(X(0.2 + k * 0.009), Y(0.83 + Math.sin(k * 1.7) * 0.03)); g.stroke();
  g.fillStyle = '#1a2a6a'; g.font = `400 ${fs(0.03)}px ${THAI}`; g.fillText('ประธานกรรมการ', X(0.2), Y(0.89));
  g.fillStyle = '#2a9a3a'; g.beginPath(); g.arc(X(0.38), Y(0.85), h * 0.045, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.font = `800 ${fs(0.05)}px Arial`; g.textAlign = 'center'; g.fillText('G', X(0.38), Y(0.868)); g.textAlign = 'left';
  g.fillStyle = '#2a9a3a'; g.font = `700 ${fs(0.04)}px Arial`; g.fillText('Green Industry', X(0.405), Y(0.86));
  g.fillStyle = red; g.font = `700 ${fs(0.04)}px ${THAI}`; g.fillText('ไม่ขายให้ผู้ที่มีอายุต่ำกว่า 20 ปี', X(0.06), Y(0.985));
  // right half: digits on the yellow band + digit words
  g.fillStyle = '#fff27a'; g.fillRect(X(0.59), Y(0.04), w * 0.31, h * 0.2);
  num.split('').forEach((d, i) => {
    const cx = X(0.615 + i * 0.05);
    g.fillStyle = '#111'; g.font = `800 ${fs(0.14)}px Arial`; g.textAlign = 'center'; g.fillText(d, cx, Y(0.18));
    g.font = `700 ${fs(0.035)}px Arial`; g.fillText(DIGW[+d], cx, Y(0.225));
  });
  g.textAlign = 'left';
  // draw date, watermark set number, งวดที่ / ชุดที่, faint serial
  g.fillStyle = 'rgba(80,80,90,0.28)'; g.font = `800 ${fs(0.3)}px Arial`; g.fillText(String(set).padStart(2, '0'), X(0.7), Y(0.52));
  g.fillStyle = '#2a7fc4'; g.font = `700 ${fs(0.085)}px ${THAI}`; g.fillText('1 ธันวาคม 2569', X(0.62), Y(0.35));
  g.font = `700 ${fs(0.045)}px Arial`; g.fillText('1 DECEMBER 2026', X(0.665), Y(0.405));
  g.fillStyle = '#222'; g.font = `400 ${fs(0.04)}px ${THAI}`; g.fillText('งวดที่', X(0.6), Y(0.46)); g.fillText('ชุดที่', X(0.86), Y(0.46));
  g.fillStyle = red; g.font = `800 ${fs(0.075)}px Georgia, serif`; g.fillText('23', X(0.6), Y(0.54));
  g.fillStyle = 'rgba(208,25,31,0.18)'; g.font = `700 ${fs(0.07)}px Arial`; g.fillText(String(1000000 + ((Number(num) * 37) % 8999999)), X(0.665), Y(0.54));
  g.fillStyle = '#111'; g.font = `italic 800 ${fs(0.085)}px Georgia, serif`; g.fillText(String(set).padStart(2, '0'), X(0.86), Y(0.545));
  // barcode + serial string
  let bx = X(0.6); g.fillStyle = '#111';
  while (bx < X(0.9)) { const bw = (1 + Math.floor(r() * 3)) * w / 1400; g.fillRect(bx, Y(0.58), bw, h * 0.13); bx += bw + (1 + Math.floor(r() * 2)) * w / 1400; }
  g.font = `700 ${fs(0.045)}px monospace`; g.fillText(`26${num}${String(Number(num) % 9973).padStart(4, '0')}03-${String(set * 557).padStart(4, '0')}`, X(0.6), Y(0.77));
  // L6 mark, แบบใบ
  g.fillStyle = '#1f6fb8'; g.font = `italic 800 ${fs(0.11)}px Arial`; g.fillText('L6', X(0.64), Y(0.92));
  g.font = `700 ${fs(0.028)}px Arial`; g.fillText('LOTTERY 6', X(0.64), Y(0.955));
  g.fillStyle = '#222'; g.font = `700 ${fs(0.07)}px ${THAI}`; g.fillText('แบบใบ', X(0.76), Y(0.91));
  // teal side strip with vertical text
  g.fillStyle = 'rgba(150,215,210,0.85)'; g.fillRect(X(0.915), y, w * 0.085, h);
  g.save(); g.translate(X(0.945), Y(0.06)); g.rotate(Math.PI / 2); g.fillStyle = '#1b3a4a'; g.font = `700 ${fs(0.045)}px ${THAI}`; g.fillText('สลากกินแบ่งรัฐบาล', 0, 0);
  g.font = `700 ${fs(0.038)}px ${THAI}`; g.fillText('สลากกินแบ่งรัฐบาลหลัก (Lottery 6) แบบใบ', 0, -h * 0.05); g.restore();
  g.strokeStyle = 'rgba(120,120,140,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.restore();
}
const NUMS = ['482915', '071336', '995204', '160847', '338571', '724068', '503192', '849960'];
let READY = false;
function initMaterials() {
  if (READY) return;
  READY = true;
  kitMaterials();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const strip = canvasT(4096, 512, (g) => { for (let i = 0; i < 4; i++) ticket(g, i * 1024 + 8, 6, 1008, 500, NUMS[i], [330, 120, 200, 40][i], 12 + i * 7); }); // 4 tickets = 8 m of riser
  const one = canvasT(1024, 512, (g) => ticket(g, 0, 0, 1024, 512, NUMS[5], 330, 25), false);
  const carpet = canvasT(256, 256, (g, w, h) => { // navy carpet with a small gold-dot grid (texture = 2 m)
    const r = rng(5); g.fillStyle = '#1c2b4d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const k = r(); g.fillStyle = `rgba(${40 + k * 40},${55 + k * 50},${100 + k * 60},0.35)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    g.fillStyle = 'rgba(217,178,92,0.55)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(32 + i * 64, 32 + j * 64, 3, 0, TAU); g.fill(); }
  });
  const glazing = canvasT(256, 512, (g, w, h) => { // pale daylight glazing with a few distant towers
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#cfe6ff'); grd.addColorStop(0.7, '#eaf4ff'); grd.addColorStop(1, '#f6f1e6'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = rng(23); for (let i = 0; i < 9; i++) { const x = r() * w, bw = 14 + r() * 30, bh = 60 + r() * 180; g.fillStyle = `rgba(150,170,195,${0.25 + r() * 0.25})`; g.fillRect(x, h - bh, bw, bh); }
  });
  const poster = (title, sub, a, b) => canvasT(320, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, a); grd.addColorStop(1, b); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9b25c'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    ticket(g, 40, 150, 240, 120, pick(NUMS, title.length / 17), 330);
    g.fillStyle = '#f4e2b0'; g.textAlign = 'center'; g.font = '700 30px Georgia, serif';
    title.split('|').forEach((t, i) => g.fillText(t, w / 2, 70 + i * 36));
    g.font = 'italic 19px Georgia, serif'; g.fillStyle = '#ffffff'; sub.split('|').forEach((t, i) => g.fillText(t, w / 2, 330 + i * 26));
    g.font = '700 16px Arial'; g.fillStyle = '#d9b25c'; g.fillText('NOW CALCULATING', w / 2, h - 40);
  }, false);
  addLuxMaterials({
    ptWhite: std({ color: 0xf3f5f8, roughness: 0.38, metalness: 0.02 }),
    ptWhiteGloss: std({ color: 0xffffff, roughness: 0.16, metalness: 0.05, envMapIntensity: 1.0 }),
    ptStep: std({ color: 0xdfe3e9, roughness: 0.42, metalness: 0.02 }),
    ptNavy: std({ color: 0x1b2a4a, roughness: 0.45, metalness: 0.1 }),
    ptNavyGloss: std({ color: 0x14213d, roughness: 0.22, metalness: 0.3, envMapIntensity: 0.8 }),
    ptCarpet: std({ map: carpet, roughness: 1, metalness: 0 }),
    ptEpoxy: std({ color: 0xeef1f5, roughness: 0.2, metalness: 0.05, envMapIntensity: 0.8 }),
    ptPanel: std({ color: 0xffffff, emissive: 0xf2f7ff, emissiveIntensity: 0.55, roughness: 0.6 }),
    ptTicket: std({ map: strip, emissive: 0xffffff, emissiveMap: strip, emissiveIntensity: 0.22, roughness: 0.6, vertexColors: true }),
    ptTicketOne: std({ map: one, emissive: 0xffffff, emissiveMap: one, emissiveIntensity: 0.18, roughness: 0.65, side: THREE.DoubleSide }),
    ptWindow: std({ map: glazing, emissive: 0xffffff, emissiveMap: glazing, emissiveIntensity: 0.45, roughness: 0.1 }),
    ptLed: new THREE.MeshBasicMaterial({ color: 0x6fd6ff, toneMapped: false }),
    ptLedWarm: new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false }),
    ptRope: std({ color: 0x8a1626, roughness: 0.85 }),
    ptPoster0: std({ map: poster('THE 1ST|OF THE MONTH', 'Six digits.|One destiny.|Rated P(win) ≈ 10⁻⁶', '#14213d', '#3a1830'), emissive: 0xffffff, emissiveMap: poster('THE 1ST|OF THE MONTH', 'Six digits.|One destiny.|Rated P(win) ≈ 10⁻⁶', '#14213d', '#3a1830'), emissiveIntensity: 0.75 }),
    ptPoster1: ((t) => std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.75 }))(poster('THE 16TH:|THE SEQUEL', 'This time|the model|is confident.', '#1b2a4a', '#123a3a')),
    ptPoster2: std({ map: poster('LAST TWO|DIGITS', 'A regression story.|R² = 0.0003|(significant)', '#2a1a40', '#14213d'), emissive: 0xffffff, emissiveMap: poster('LAST TWO|DIGITS', 'A regression story.|R² = 0.0003|(significant)', '#2a1a40', '#14213d'), emissiveIntensity: 0.75 }),
    ptPoster3: ((t) => std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.75 }))(poster('IN QUANTS|WE TRUST', 'Predictive Model v7.3|Critics: "very|statistical"', '#14213d', '#402414')),
  }, { ptCarpet: 2 });
}

// ---------------------------------------------------------------- geometry helpers
const P2 = (r, a) => [F.x + r * Math.cos(a), F.z + r * Math.sin(a)];
// Sutherland-Hodgman clip of a polygon [[x, z], ...] against the room rectangle
function clipRoom(pts, x0 = XW, x1 = XB, z0 = -ZW, z1 = ZW) {
  const planes = [[(p) => p[0] - x0], [(p) => x1 - p[0]], [(p) => p[1] - z0], [(p) => z1 - p[1]]];
  let out = pts;
  for (const [f] of planes) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    if (!out.length) break;
  }
  return out;
}
// annular sector polygon (r0 may be 0)
function sector(r0, r1, a0, a1) {
  const n = Math.max(2, Math.ceil(((a1 - a0) * r1) / 1.2)), pts = [];
  for (let i = 0; i <= n; i++) pts.push(P2(r1, a0 + ((a1 - a0) * i) / n));
  if (r0 > 0.01) for (let i = n; i >= 0; i--) pts.push(P2(r0, a0 + ((a1 - a0) * i) / n));
  else pts.push([F.x, F.z]);
  return pts;
}
// flat polygon at height y (floor-local), world-metre UVs
function flat(L, pts, y, mat, tile = 2, color) {
  if (pts.length < 3) return;
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  L.geo(g, mat, color);
}
// vertical strip along an arc of radius r about F from a0 to a1 (clipped to the room), facing the centre
function arcStrip(L, r, a0, a1, y0, y1, mat, { uW = 8, color, outward = false } = {}) {
  const lim = thMax(r) - 0.002; a0 = Math.max(a0, -lim); a1 = Math.min(a1, lim);
  if (a1 - a0 < 1e-3) return;
  const n = Math.max(1, Math.ceil(((a1 - a0) * r) / 1.0)), pos = [], uv = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const [xa, za] = P2(r, t0), [xb, zb] = P2(r, t1), ua = (t0 * r) / uW, ub = (t1 * r) / uW;
    const A = [xa, y0, za], B = [xb, y0, zb], C = [xb, y1, zb], D = [xa, y1, za];
    // seen from the centre, increasing angle runs to the RIGHT: (A, B, C) is counter-clockwise from the centre
    const tri = outward ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
    const tuv = outward ? [[ua, 0], [ub, 1], [ub, 0], [ua, 0], [ua, 1], [ub, 1]] : [[ua, 0], [ub, 0], [ub, 1], [ua, 0], [ub, 1], [ua, 1]];
    for (const v of tri) pos.push(...v);
    for (const v of tuv) uv.push(...v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  L.geo(g, mat, color);
}
// vertical radial quad at angle a from r0 to r1 (both faces)
function radial(L, a, r0, r1, y0, y1, mat) {
  const [xa, za] = P2(r0, a), [xb, zb] = P2(r1, a), len = Math.hypot(xb - xa, zb - za);
  const g = new THREE.BoxGeometry(len, y1 - y0, 0.04);
  g.rotateY(-Math.atan2(zb - za, xb - xa)); g.translate((xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2);
  L.geo(g, mat);
}
// box of cross-section w x h from a to b (floor-local), for rails and beams
function bar(L, a, b, w, h, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, h, len);
  g.applyMatrix4(new THREE.Matrix4().lookAt(A, B, new THREE.Vector3(0, 1, 0)).setPosition(A.clone().add(B).multiplyScalar(0.5)));
  L.geo(g, mat);
}
function display(w, h, draw, transparent = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent, depthWrite: !transparent });
  return { c, g, t, m, redraw(...a) { draw(g, w, h, ...a); t.needsUpdate = true; } };
}
function light(ctx, x, y, z, intensity, distance, color = 0xf4f8ff, decay = 1.4) {
  const l = new THREE.PointLight(color, intensity, distance, decay); l.position.set(x, ctx.e + y, z); ctx.add(l); return l;
}

// ---------------------------------------------------------------- the floor
const PT = { wall: 'ptWhite', wallDeep: 'ptStep', panel: 'ptPanel', frame: 'ptNavy', frameDark: 'ptNavyGloss', dado: 'ptNavy', cap: 'gold',
  floor: 'marble', floorTile: 2.4, runner: 'ptCarpet', edge: 'gold', liner: 'steel', ink: '#1b2a4a', kioskBg: '#14213d', kioskBtn: '#24407a', kioskEdge: '#d9b25c', hostSuit: 0x1b2a4a };
const COAT = 0xf2f2f2, NAVY = 0x1b2a4a, USHER = 0x7a1626;
const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48a];
const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x111111];

export function drawTheatre(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const e = ctx.e, r = rng(2026);
  const box = (x0, x1, y0, y1, z0, z1, m, o) => L.box(x0, x1, y0, y1, z0, z1, m, o);
  const staff = (x, z, o = {}) => L.person(x, z, { suit: COAT, skin: pick(SKIN, r()), hair: pick(HAIR, r()), ...o });

  // ================================================================ lift hall (shared Phase 1 design)
  luxLiftHall(ctx, L, {
    s: -1, H: ctx.floor.height, P: PT, ceo: 'ceo',
    banks: [['ot_low', 'OFFICE LOW-RISE · B1 · L · 1–2', false], ['freight_ot', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['ot_low', ['B1', 'L', '1', '2']]],
    portal: { half: 5, top: 5 },
    portalText: 'PROBABILITY RESEARCH INSTITUTE', portalSub: 'Monte Carlo Rehearsal Theatre · Now Calculating',
  });
  for (const z of [-5.9, 5.9]) box(-49.75, -49.55, 0.3, 5.4, z - 0.06, z + 0.06, 'gold');

  // ================================================================ the foyer (dim navy cinema lobby)
  L.floor(FOY.x0, FOY.x1, -FOY.z, FOY.z, 0.012, 'ptCarpet', 2);
  for (const s of [-1, 1]) {
    box(FOY.x0, FOY.x1, 0, FOY.h, s * FOY.z, s * (FOY.z + 0.25), 'ptNavyGloss', { collide: true });
    box(FOY.x0, FOY.x1, 0, 0.18, s * (FOY.z - 0.04), s * FOY.z, 'gold');
    box(FOY.x0, FOY.x1, FOY.h - 0.35, FOY.h - 0.3, s * (FOY.z - 0.05), s * FOY.z, 'ptLedWarm');
  }
  box(FOY.x0, FOY.x1, FOY.h, FOY.h + 0.3, -FOY.z - 0.25, FOY.z + 0.25, 'ptNavy'); // ceiling
  for (let x = FOY.x0 + 1; x < FOY.x1; x += 1.8) for (const z of [-3.6, 0, 3.6]) box(x - 0.16, x + 0.16, FOY.h - 0.03, FOY.h, z - 0.16, z + 0.16, 'ptLedWarm');
  // poster lightboxes (two each side) + the Ticket Allocation Desk (north) + queue ropes
  [[-55.6, 1, 'ptPoster0'], [-52.4, 1, 'ptPoster1'], [-55.6, -1, 'ptPoster2'], [-52.4, -1, 'ptPoster3']].forEach(([x, s, m]) => {
    if (s < 0 && x > -54) return; // the desk stands there
    box(x - 0.95, x + 0.95, 0.55, 3.45, s * (FOY.z - 0.1), s * (FOY.z - 0.02), 'gold');
    box(x - 0.8, x + 0.8, 0.7, 3.3, s * (FOY.z - 0.11), s * (FOY.z - 0.1), m);
  });
  box(-53.6, -50.6, 0, 1.1, -FOY.z + 0.95, -FOY.z + 1.6, 'ptNavyGloss', { collide: true });
  box(-53.65, -50.55, 1.1, 1.16, -FOY.z + 0.9, -FOY.z + 1.65, 'gold');
  staff(-52.1, -FOY.z + 0.45, { yaw: 0, suit: USHER });
  plaque(ctx, 'TICKET ALLOCATION DESK', -52.1, 2.7, -FOY.z + 0.12, 0, { h: 0.26, color: '#e3c27a', sub: 'สลากกินแบ่ง · 80 บาท' });
  for (const z of [-2.7, 2.7]) {
    for (let x = -56; x <= -51; x += 1.25) L.cyl(x, z, 0.05, 0, 0.95, 'gold', { seg: 10 }).cyl(x, z, 0.16, 0, 0.04, 'gold', { seg: 12 }).cyl(x, z, 0.07, 0.95, 1.02, 'gold', { seg: 10 });
    box(-56, -51, 0.8, 0.88, z - 0.035, z + 0.035, 'ptRope', { collide: true });
  }
  for (const z of [-4.4, 4.4]) staff(-56.2, z, { yaw: Math.PI / 2 + (z < 0 ? 0.4 : -0.4), suit: USHER, fidget: 0.4 }); // ushers at the mouth, greeting arrivals
  plaque(ctx, 'MONTE CARLO REHEARSAL THEATRE', XB + 0.3, 3.8, 0, Math.PI / 2, { h: 0.34, color: '#e3c27a' });

  // ================================================================ the room shell (white lab walls, daylight windows, coffered ceiling)
  box(XW, XW + 0.05, PIT_Y, CEIL, -ZW, ZW, 'ptWhite');
  for (const s of [-1, 1]) {
    box(XW, XB, PIT_Y, CEIL, s * ZW, s * (ZW - 0.05), 'ptWhite');
    for (let x = -86; x <= -66.5; x += 6.5) { // tall windows on the N / S walls (the concourse sees out)
      box(x, x + 5.5, -6, 8.8, s * (ZW - 0.06), s * (ZW - 0.07), 'ptWindow');
      for (const xf of [x - 0.5, x + 5.5]) box(xf, xf + 0.5, PIT_Y, CEIL, s * (ZW - 0.05), s * (ZW - 0.3), 'ptNavy'); // navy fins
    }
    box(XW, XB, 9.0, 9.08, s * (ZW - 0.06), s * (ZW - 0.12), 'ptLed');
  }
  // the back wall over the foyer (concourse side): the foyer mouth, and the booth glass above it (|Z| < 10, Y 4.6..8.3)
  for (const s of [-1, 1]) {
    box(XB - 0.3, XB, 0, CEIL, s * 10, s * ZW, 'ptWhite', { collide: true });
    box(XB - 0.3, XB, 0, 4.6, s * FOY.z, s * 10, 'ptWhite', { collide: true });
  }
  box(XB - 0.3, XB, FOY.h, 4.6, -FOY.z, FOY.z, 'ptNavy'); box(XB - 0.3, XB, 8.3, CEIL, -10, 10, 'ptWhite');
  for (const z of [-FOY.z, FOY.z]) box(XB - 0.42, XB, 0, FOY.h + 0.1, z - 0.15, z + 0.15, 'gold');
  box(XB - 0.42, XB, FOY.h - 0.05, FOY.h + 0.1, -FOY.z, FOY.z, 'gold');
  for (const z of [-30, -18, 18, 30]) box(XB - 0.4, XB - 0.3, 0, CEIL, z - 0.25, z + 0.25, 'ptNavy');
  box(XB - 0.36, XB - 0.3, 1.2, 1.25, -ZW, ZW, 'gold');
  plaque(ctx, 'PROBABILITY RESEARCH INSTITUTE', XB - 0.45, 6.4, -24, -Math.PI / 2, { h: 0.6, color: '#1b2a4a' });
  plaque(ctx, 'IN QUANTS WE TRUST', XB - 0.45, 6.4, 24, -Math.PI / 2, { h: 0.6, color: '#1b2a4a', sub: 'Six digits. Zero doubt.' });
  ceiling(L, { wall: 'ptWhite', wallDeep: 'ptStep', panel: 'ptPanel' }, CEIL, XW, XB, -ZW, ZW, 4.0);

  // ================================================================ the tiers
  const tint = [0xffffff, 0xfff0f4, 0xf0fff4, 0xf0f6ff, 0xfffbea, 0xf8f0ff];
  for (let k = 1; k <= NT; k++) {
    const r0 = rFront(k), r1 = r0 + TD, y0 = tierY(k - 1), y1 = tierY(k), dh = aisleHalf(k);
    const edges = [-Math.PI, ...AISLES.flatMap((a) => [a - dh, a + dh]), Math.PI];
    for (let i = 0; i < edges.length; i += 2) {
      const [a0, a1] = [edges[i], edges[i + 1]];
      flat(L, clipRoom(sector(r0, r1, a0, a1)), y1, 'ptCarpet');
      arcStrip(L, r0, a0, a1, y0, y1, 'ptTicket', { color: tint[k - 1] }); // the riser: a strip of lottery tickets
      arcStrip(L, r0 - 0.012, a0, a1, y1 - 0.05, y1, 'ptLed'); // LED edge
      arcStrip(L, r0 + 0.08, a0, a1, y1, y1 + 0.02, 'gold'); // nosing
    }
    // aisle stairs: five risers of 0.2 m, white stone treads with an LED step light
    for (const a of AISLES) {
      for (let s = 0; s < STEPS; s++) {
        const ra = r0 + (s * TD) / STEPS, rb = r0 + ((s + 1) * TD) / STEPS, ys = y0 + ((s + 1) * RISE) / STEPS;
        flat(L, clipRoom(sector(ra, rb, a - dh, a + dh)), ys, 'ptStep');
        arcStrip(L, ra, a - dh, a + dh, ys - RISE / STEPS, ys, 'ptWhite');
        arcStrip(L, ra - 0.01, a - dh * 0.92, a + dh * 0.92, ys - 0.04, ys - 0.02, 'ptLed');
      }
      for (const s of [-1, 1]) { const [mx, mz] = P2(rMid(k), a + s * dh); if (mx > XW && Math.abs(mz) < ZW - 0.3) radial(L, a + s * dh, r0, r1, y0, y1, 'ptWhite'); } // the tier block's sides (inside the room)
      // handrails (gold) down the middle of the wide aisles are omitted: the stairs are 1.8 m wide
    }
  }
  // the top concourse (y 0) and the pit floor (y -6)
  for (const [a0, a1] of [[-Math.PI, 0], [0, Math.PI]]) {
    flat(L, clipRoom(sector(TOP_R, 80, a0, a1)), 0.012, 'marble', 2.4);
    flat(L, clipRoom(sector(0, PIT_R, a0, a1)), PIT_Y + 0.012, 'ptEpoxy');
    for (const rr of [30, 35.5]) flat(L, clipRoom(sector(rr, rr + 0.25, a0, a1)), PIT_Y + 0.016, 'ptNavy');
  }

  // ================================================================ the stage, rail and consoles
  box(STAGE.x0, STAGE.x1, PIT_Y, STAGE_TOP, -STAGE.z, STAGE.z, 'ptWhiteGloss');
  box(STAGE.x1, STAGE.x1 + 0.02, PIT_Y + 0.25, STAGE_TOP - 0.35, -STAGE.z, STAGE.z, 'ptNavyGloss');
  for (const s of [-1, 1]) box(STAGE.x0, STAGE.x1, PIT_Y + 0.25, STAGE_TOP - 0.35, s * STAGE.z, s * (STAGE.z + 0.02), 'ptNavyGloss');
  box(STAGE.x1, STAGE.x1 + 0.03, STAGE_TOP - 0.3, STAGE_TOP - 0.22, -STAGE.z, STAGE.z, 'gold');
  box(STAGE.x1 - 0.02, STAGE.x1 + 0.025, STAGE_TOP - 0.05, STAGE_TOP, -STAGE.z, STAGE.z, 'ptLed');
  flat(L, [[STAGE.x0 + 1, -STAGE.z + 1], [STAGE.x1 - 1, -STAGE.z + 1], [STAGE.x1 - 1, STAGE.z - 1], [STAGE.x0 + 1, STAGE.z - 1]], STAGE_TOP + 0.005, 'ptNavyGloss');
  plaque(ctx, 'DRAW MECHANISM — DO NOT TOUCH (STATISTICALLY SIGNIFICANT)', STAGE.x1 + 0.04, PIT_Y + 0.62, 0, Math.PI / 2, { h: 0.26, color: '#e3c27a' });
  // gold rail with glass infill: X -87.6 (|Z| < 12) and Z ±12 back to the west wall
  const railRun = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) { const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n; L.cyl(x, z, 0.05, PIT_Y, PIT_Y + 1.1, 'gold', { seg: 10 }); }
    bar(L, [a[0], PIT_Y + 1.1, a[1]], [b[0], PIT_Y + 1.1, b[1]], 0.09, 0.09, 'gold');
    box(Math.min(a[0], b[0]), Math.max(a[0], b[0]) + (a[0] === b[0] ? 0.02 : 0), PIT_Y + 0.12, PIT_Y + 1.02, Math.min(a[1], b[1]), Math.max(a[1], b[1]) + (a[1] === b[1] ? 0.02 : 0), 'glass');
  };
  railRun([RAIL.x, -RAIL.z], [RAIL.x, RAIL.z]);
  for (const s of [-1, 1]) railRun([XW + 0.05, s * RAIL.z], [RAIL.x, s * RAIL.z]);
  for (const z of [-6.5, -2.2, 2.2, 6.5]) { // draw-control consoles in the strip in front of the stage, operators facing the stage
    box(-95.7, -94.9, PIT_Y, PIT_Y + 0.95, z - 0.9, z + 0.9, 'ptNavyGloss');
    box(-95.75, -94.85, PIT_Y + 0.95, PIT_Y + 1.0, z - 0.95, z + 0.95, 'gold');
    ctx.screen(-95.3, PIT_Y + 1.35, z, Math.PI / 2, 1.5, 0.55, CH.LOTTO, 0.35);
    staff(-94.2, z, { yaw: -Math.PI / 2, y: PIT_Y });
  }

  // ================================================================ the draw machine (drum, animatronic, rack), scaled 1.4
  const rig = drawMachine(ctx);

  // ================================================================ IMAX wall: live draw feed, results, model, countdown
  const imax = imaxWall(ctx, L, rig);

  // ================================================================ desks, quants, monitors, tickets on the desks
  const seats = desks(ctx, L, r);

  // ================================================================ projection booth (above the foyer) + beams
  const BX0 = XB - 0.2, BX1 = -50.2, BZ = 10, BY = 4.5, BT = 8.3;
  box(BX0 + 0.05, BX1, BY - 0.2, BY, -BZ, BZ, 'ptNavy');
  box(BX0, BX0 + 0.04, BY, BT, -BZ, BZ, 'glass');
  for (const z of [-BZ, -5, 0, 5, BZ]) box(BX0 - 0.06, BX0 + 0.06, BY, BT, z - 0.06, z + 0.06, 'gold');
  box(BX0 - 0.06, BX0 + 0.06, BY - 0.08, BY, -BZ, BZ, 'gold');
  box(BX0 + 0.2, BX1, BT, CEIL - 0.3, -BZ, BZ, 'ptNavy');
  box(BX0 + 0.1, BX1, BY, BT, -BZ - 0.1, -BZ, 'ptNavy'); box(BX0 + 0.1, BX1, BY, BT, BZ, BZ + 0.1, 'ptNavy'); box(BX1 - 0.1, BX1, BY, BT, -BZ, BZ, 'ptNavy');
  for (const x of [-55, -52.5]) for (const z of [-7.5, -2.5, 2.5, 7.5]) box(x - 0.15, x + 0.15, BT - 0.05, BT, z - 0.15, z + 0.15, 'ptLedWarm');
  plaque(ctx, 'MODEL PROJECTION BOOTH', BX0 - 0.1, BT + 0.55, 0, -Math.PI / 2, { h: 0.3, color: '#e3c27a' });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  ctx.disposables.push(beamMat);
  for (const [z, tz, ty, rad] of [[-4, -30.6, -4.7, 7], [0, 0, -5.5, 13.5], [4, 30.6, -4.7, 7]]) {
    box(-56.6, -55.2, BY, BY + 0.9, z - 0.45, z + 0.45, 'blackMetal');
    box(-56.66, -56.6, BY + 0.3, BY + 0.6, z - 0.15, z + 0.15, 'ptLedWarm');
    staff(-54.4, z + 1.1, { yaw: -Math.PI / 2, y: BY, fidget: 0.3 });
    const A = new THREE.Vector3(-56.7, e + BY + 0.45, z), B = new THREE.Vector3(IMAX.x + 0.2, e + ty, tz), len = A.distanceTo(B);
    const g = new THREE.ConeGeometry(rad, len, 24, 1, true); g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2); // apex at the origin, opening along +Z
    const m = new THREE.Mesh(g, beamMat); m.position.copy(A); m.lookAt(B); m.renderOrder = 7; ctx.add(m, g);
  }

  // ================================================================ walls: giant ticket banners, archive, signage
  for (const s of [-1, 1]) for (const x of [-100, -88]) { // giant tickets hung on the side walls over the side tiers
    const g = new THREE.PlaneGeometry(11, 5.5); const m = new THREE.Mesh(g, LM.ptTicketOne);
    m.position.set(x, e - 3, s * (ZW - 0.2)); m.rotation.y = s < 0 ? 0 : Math.PI; ctx.add(m, g);
    box(x - 5.6, x + 5.6, -0.2, -0.1, s * (ZW - 0.12), s * (ZW - 0.3), 'gold');
    L.box(x - 5.6, x - 5.56, -0.15, CEIL, s * (ZW - 0.2), s * (ZW - 0.24), 'steel').box(x + 5.56, x + 5.6, -0.15, CEIL, s * (ZW - 0.2), s * (ZW - 0.24), 'steel');
  }
  for (const s of [-1, 1]) { // "Research Material Archive": stacks of ticket bundles in the pit's back corners (inside the rail)
    for (let i = 0; i < 14; i++) {
      const x = -107.6 + (i % 4) * 0.95, z = s * (8.9 + Math.floor(i / 4) * 0.4), h = 0.45 + (i % 3) * 0.35;
      box(x - 0.42, x + 0.42, PIT_Y, PIT_Y + h, z - 0.18, z + 0.18, 'ptTicketOne');
    }
  }
  for (let i = 0; i < 90; i++) { // ticket confetti on the pit walkway
    const a = (r() - 0.5) * 1.1, rr = 30 + r() * 9.6, [x, z] = P2(rr, a);
    if (inRail(x, z) || x < XW + 0.5) continue;
    const g = new THREE.PlaneGeometry(0.24, 0.12).rotateX(-Math.PI / 2).rotateY(r() * TAU).translate(x, PIT_Y + 0.02 + i * 0.0001, z);
    L.geo(g, 'ptTicketOne');
  }

  // ================================================================ people: ushers, analysts, the crowd on the concourse
  const arcLoop = (rA, rB, t0, t1, n = 14) => [...Array.from({ length: n + 1 }, (_, i) => P2(rA, t0 + ((t1 - t0) * i) / n)), ...Array.from({ length: n + 1 }, (_, i) => P2(rB, t1 - ((t1 - t0) * i) / n))];
  const walker = (path, o) => staff(path[0][0], path[0][1], { walk: path, ...o });
  walker(arcLoop(70.2, 71.2, -0.45, 0.45), { suit: USHER, speed: 0.9 });
  walker(arcLoop(71.2, 70.2, 0.42, -0.42), { suit: USHER, speed: 0.85 });
  walker(arcLoop(38.4, 39.2, 0.15, 0.6), { suit: USHER, y: PIT_Y, speed: 0.8 }); // south of the camera track
  for (let i = 0; i < 6; i++) walker(arcLoop(70.0 + (i % 3) * 0.5, 71.6 - (i % 3) * 0.3, -0.44 + i * 0.02, 0.44 - i * 0.03), { suit: i % 2 ? NAVY : COAT, speed: 1.0 + i * 0.07 });
  for (const [a, rr] of [[-0.12, 37.8], [0.1, 38.2], [0.02, 39.0], [-0.4, 37.5], [0.45, 38.4], [-0.75, 36], [0.8, 36.5]]) { const [x, z] = P2(rr, a); if (!inRail(x, z) && x > XW + 1) staff(x, z, { y: PIT_Y, yaw: Math.atan2(RIG.x - x, RIG.z - z), fidget: 0.5 }); }
  for (const z of [-14, -8, 8, 14]) staff(-58.6, z, { yaw: -Math.PI / 2, suit: z > 0 ? NAVY : COAT, fidget: 0.3 }); // looking down from the concourse

  // ================================================================ light
  for (const z of [-6, 6]) light(ctx, -100, -8, z, 60, 34, 0xfff2dc); // the stage (low graphics mode switches lamp lights off)
  for (const z of [-22, 0, 22]) light(ctx, -82, 4, z, 35, 40);
  light(ctx, -64, 7.5, 0, 20, 28);

  // ================================================================ the floor's life: draw cycle, IMAX, applause
  const cheer = applause(ctx, seats, r);
  rig.onDrop = (digit, n) => { imax.onBall(digit, n); cheer.start(); };
  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    rig.update(dt);
    imax.update(dt);
    cheer.update(dt);
  });

  ctx.shapes = [theatreShape(e)];
  ctx.theatreStats = { seats: seats.length, quants: seats.filter((s) => !s.empty).length, people: L.people.length };
  L.build();
}

// ---------------------------------------------------------------- the draw machine
// The OT-02 rev-2 animatronic, drum and rack (same 9.5 s draw cycle and 2-bone IK), rebuilt in a rig-local
// frame (origin = drum centre at stage level, +z towards the audience) and scaled 1.4. The robot stands
// beside the drum facing the audience; the Drawn Numbers rack sits in front of it.
function drawMachine(ctx) {
  const e = ctx.e, S = RIG.s;
  const rig = new THREE.Group(); rig.position.set(RIG.x, e + STAGE_TOP, RIG.z); rig.rotation.y = Math.PI / 2; rig.scale.setScalar(S);
  ctx.group.add(rig);
  const add = (geo, m, x, y, z, parent = rig) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); ctx.disposables.push(geo); return me; };
  const own = (m) => { ctx.disposables.push(m); return m; };
  const gold = LM.gold, coat = LM.ptWhiteGloss, metal = LM.steel, dark = LM.ptNavyGloss, eye = own(new THREE.MeshBasicMaterial({ color: 0x5ff2ff, toneMapped: false }));
  // world-space collider for a rig-local box (keeps people off the machine)
  const toW = (x, z) => [RIG.x + z * S, RIG.z - x * S];
  const colBox = (x0, x1, z0, z1, h) => { const [ax, az] = toW(x0, z0), [bx, bz] = toW(x1, z1); ctx.colliders.push({ x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), y0: e + STAGE_TOP, y1: e + STAGE_TOP + h * S }); };
  const DR = { y: 4.8, r: 3.3 };
  // drum: gold A-frame, geodesic glass cage, tumbling balls
  for (const sz of [-1, 1]) {
    const zf = sz * (DR.r + 0.9);
    for (const sx of [-1, 1]) { const len = Math.hypot(2.6, DR.y); const leg = add(new THREE.BoxGeometry(0.45, len, 0.45), gold, sx * 1.3, DR.y / 2, zf); leg.rotation.z = sx * Math.atan2(2.6, DR.y); }
    add(new THREE.BoxGeometry(3.2, 0.35, 0.5), gold, 0, 1.4, zf);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12).rotateX(Math.PI / 2), gold, 0, DR.y, sz * (DR.r + 0.6));
  }
  add(new THREE.CylinderGeometry(0.12, 0.12, 2 * DR.r + 1.6, 8).rotateX(Math.PI / 2), gold, 0, DR.y, 0);
  colBox(-3.2, 3.2, -DR.r - 1.2, DR.r + 1.2, 8.4);
  const cage = new THREE.Group(); cage.position.set(0, DR.y, 0); rig.add(cage);
  const ico = new THREE.IcosahedronGeometry(DR.r, 1), edges = new THREE.EdgesGeometry(ico);
  const lineMat = own(new THREE.LineBasicMaterial({ color: 0xf4f7fb })), shellMat = own(new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.05 }));
  cage.add(new THREE.LineSegments(edges, lineMat)); cage.add(new THREE.Mesh(ico, shellMat)); ctx.disposables.push(ico, edges);
  const NB = 160, ballGeo = new THREE.SphereGeometry(0.21, 10, 8), ballMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, NB); ctx.disposables.push(ballGeo);
  const col = new THREE.Color(), BALL_COLS = [0xff4d4d, 0xffd34d, 0x4dd2ff, 0x6cff6c, 0xff7ad0, 0xffffff, 0xff9a3c, 0x9a7bff];
  const bp = Array.from({ length: NB }, () => ({ r: 0.4 + Math.random() * 2.4, a: Math.random() * TAU, w: 1.5 + Math.random() * 2.5, z: (Math.random() - 0.5) * 4.2, lift: 0.4 + Math.random() * 0.8 }));
  for (let i = 0; i < NB; i++) balls.setColorAt(i, col.set(BALL_COLS[i % BALL_COLS.length]));
  rig.add(balls);
  const m4 = new THREE.Matrix4();
  const placeBalls = (t) => {
    for (let i = 0; i < NB; i++) {
      const b = bp[i], a = b.a + t * b.w;
      let x = Math.cos(a) * b.r, y = -1.3 + Math.sin(a) * b.r * b.lift, z = b.z;
      const d = Math.hypot(x, y, z), lim = DR.r - 0.3;
      if (d > lim) { x *= lim / d; y *= lim / d; z *= lim / d; }
      balls.setMatrixAt(i, m4.makeTranslation(x, DR.y + y, z));
    }
    balls.instanceMatrix.needsUpdate = true;
  };
  placeBalls(0);
  // the Drawn Numbers rack: six glass cups on a gold stand, in front of the robot
  const RK = { x: -6, z: 3.6, y: 1.6 };
  add(new THREE.BoxGeometry(0.8, RK.y - 0.1, 0.8), gold, RK.x, (RK.y - 0.1) / 2, RK.z);
  add(new THREE.BoxGeometry(3.8, 0.1, 1.0), gold, RK.x, RK.y - 0.05, RK.z);
  colBox(RK.x - 1.9, RK.x + 1.9, RK.z - 0.5, RK.z + 0.5, RK.y);
  const slot = (k) => new THREE.Vector3(RK.x - 1.5 + k * 0.6, RK.y + 0.22, RK.z);
  const drawn = [];
  for (let k = 0; k < 6; k++) {
    add(new THREE.CylinderGeometry(0.27, 0.22, 0.34, 14, 1, true), LM.glass, slot(k).x, RK.y + 0.17, RK.z);
    const s = add(new THREE.SphereGeometry(0.24, 12, 10), own(new THREE.MeshStandardMaterial({ color: BALL_COLS[k], roughness: 0.25 })), slot(k).x, slot(k).y, slot(k).z); s.visible = false; drawn.push(s);
  }
  // the animatronic: lab coat, tie, glasses, cyan eyes; facing +z (the audience), working arm on the drum side
  const RB = { x: -6, z: -2.5 };
  const robot = new THREE.Group(); robot.position.set(RB.x, 0, RB.z); rig.add(robot);
  add(new THREE.CylinderGeometry(1.3, 1.6, 1.4, 16), dark, 0, 0.7, 0, robot);
  add(new THREE.BoxGeometry(2.6, 3.4, 1.6), coat, 0, 3.1, 0, robot);
  for (const sx of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.9, 2.6, 0.05), coat, sx, 3.3, 0.83, robot).rotation.z = sx * 0.12; // lapels
  add(new THREE.BoxGeometry(0.5, 2.2, 0.06), own(new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.5 })), 0, 3.6, 0.84, robot);
  add(new THREE.BoxGeometry(0.42, 0.5, 0.05), own(new THREE.MeshStandardMaterial({ color: 0x8a1626, roughness: 0.5 })), -0.85, 3.7, 0.85, robot); // pocket square (a ticket)
  const neck = new THREE.Group(); neck.position.set(0, 4.9, 0); robot.add(neck);
  add(new THREE.BoxGeometry(1.5, 1.4, 1.4), metal, 0, 0.75, 0, neck);
  for (const sx of [-0.35, 0.35]) { add(new THREE.SphereGeometry(0.14, 10, 8), eye, sx, 0.85, 0.72, neck); add(new THREE.TorusGeometry(0.24, 0.04, 6, 16), dark, sx, 0.85, 0.74, neck); }
  add(new THREE.BoxGeometry(1.1, 0.12, 0.05), dark, 0, 0.35, 0.72, neck);
  add(new THREE.BoxGeometry(0.5, 1.2, 0.5), metal, -1.55, 3.6, 0, robot); // idle arm (away from the drum)
  colBox(RB.x - 1.7, RB.x + 1.7, RB.z - 1.7, RB.z + 1.7, 6.5);
  const L1 = 4, L2 = 4;
  const SH = new THREE.Vector3(RB.x + 1.55, 4.3, RB.z); // shoulder, rig-local
  const shoulder = new THREE.Group(); shoulder.position.set(1.55, 4.3, 0); shoulder.rotation.order = 'YXZ'; robot.add(shoulder);
  add(new THREE.SphereGeometry(0.45, 12, 10), metal, 0, 0, 0, shoulder);
  add(new THREE.BoxGeometry(0.55, 0.55, L1), coat, 0, 0, L1 / 2, shoulder);
  const elbow = new THREE.Group(); elbow.position.set(0, 0, L1); shoulder.add(elbow);
  add(new THREE.SphereGeometry(0.35, 12, 10), metal, 0, 0, 0, elbow);
  add(new THREE.BoxGeometry(0.42, 0.42, L2), metal, 0, 0, L2 / 2, elbow);
  const hand = new THREE.Group(); hand.position.set(0, 0, L2); elbow.add(hand);
  const fingers = [];
  for (const s of [-1, 1]) { const f = add(new THREE.BoxGeometry(0.1, 0.12, 0.55), dark, s * 0.2, 0, 0.25, hand); fingers.push([f, s]); }
  const heldMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
  const held = add(new THREE.SphereGeometry(0.24, 12, 10), heldMat, 0, 0, 0.42, hand); held.visible = false;
  const ik = (T) => { // 2-bone IK in the vertical plane through the shoulder, elbow down, claw pointing down
    const dx = T.x - SH.x, dy = T.y - SH.y, dz = T.z - SH.z;
    const h = Math.hypot(dx, dz), d = Math.min(Math.hypot(h, dy), L1 + L2 - 0.02);
    const phi = Math.atan2(dy, h);
    const a1 = Math.acos(Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    shoulder.rotation.y = Math.atan2(dx, dz);
    shoulder.rotation.x = -(phi - a1);
    elbow.rotation.x = -bend;
    hand.rotation.x = Math.PI / 2 - (-(phi - a1) - bend);
    neck.rotation.y = Math.atan2(dx, dz) * 0.35;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const REST = V(-2.8, 3.2, 0.6), ABOVE = V(0.4, DR.y + DR.r + 0.1, -0.8), INSIDE = V(0.4, DR.y - 1.2, -0.6);
  const keys = [[0, REST], [1.4, ABOVE], [2.6, INSIDE], [3.4, INSIDE], [4.6, ABOVE], [6.2, null], [7.0, null], [8.2, REST], [9.5, REST]];
  const CYCLE = 9.5, tmp = new THREE.Vector3();
  let tAll = 0, lastCycle = -1, nDrawn = 0, colourNow = 0, digit = 0;
  const targetAt = (t) => {
    const over = slot(nDrawn % 6).clone(); over.y = RK.y + 0.9;
    const k = keys.map(([tk, p]) => [tk, p || over]);
    for (let i = 0; i < k.length - 1; i++) if (t <= k[i + 1][0]) { const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]); const s = u * u * (3 - 2 * u); return tmp.copy(k[i][1]).lerp(k[i + 1][1], s); }
    return tmp.copy(REST);
  };
  ik(REST);
  const handW = new THREE.Vector3(), drumW = new THREE.Vector3();
  const api = {
    onDrop: null, hand, held,
    handWorld: () => hand.getWorldPosition(handW),
    drumWorld: () => cage.getWorldPosition(drumW),
    state: () => ({ t: tAll % CYCLE, drawn: nDrawn, holding: held.visible, digit }),
    update(dt) {
      tAll += dt;
      cage.rotation.z += dt * 0.7;
      placeBalls(tAll);
      const cyc = Math.floor(tAll / CYCLE), t = tAll % CYCLE;
      if (cyc !== lastCycle) {
        lastCycle = cyc;
        if (nDrawn % 6 === 0) drawn.forEach((s) => { s.visible = false; });
        colourNow = BALL_COLS[Math.floor(Math.random() * BALL_COLS.length)]; digit = Math.floor(Math.random() * 10);
        heldMat.color.set(colourNow);
      }
      ik(targetAt(t));
      held.visible = t > 3.0 && t < 7.0;
      const grip = t > 2.9 && t < 7.0 ? 0.05 : 0.35;
      for (const [f, s] of fingers) f.rotation.y = s * grip;
      if (t >= 7.0 && t - dt < 7.0) { const s = drawn[nDrawn % 6]; s.material.color.set(colourNow); s.visible = true; nDrawn++; if (api.onDrop) api.onDrop(digit, nDrawn); }
    },
  };
  plaque(ctx, 'CHIEF DRAW OFFICER (ANIMATRONIC)', ...(() => { const [x, z] = toW(RB.x, RB.z + 1.65); return [x + 0.05, 0.9 * S + STAGE_TOP, z]; })(), Math.PI / 2, { h: 0.3, color: '#e3c27a' });
  plaque(ctx, 'DRAWN NUMBERS', ...(() => { const [x, z] = toW(RK.x, RK.z + 0.52); return [x + 0.05, (RK.y - 0.45) * S + STAGE_TOP, z]; })(), Math.PI / 2, { h: 0.24, color: '#e3c27a' });
  return api;
}

// ---------------------------------------------------------------- the IMAX wall
// Centre: a live camera feed of the draw (render target, ~15 Hz while someone is on the floor) with a LIVE
// overlay; north: the results board; south: the predictive model; above: the countdown to the next official draw.
function imaxWall(ctx, L, rig) {
  const e = ctx.e, W = IMAX.z * 2, Hh = IMAX.y1 - IMAX.y0, cy = (IMAX.y0 + IMAX.y1) / 2;
  const box = (...a) => L.box(...a);
  // frame
  box(IMAX.x - 0.05, IMAX.x + 0.02, PIT_Y, 9.35, -IMAX.z - 0.4, IMAX.z + 0.4, 'ptNavyGloss'); // black surround
  for (const z of [-IMAX.z - 0.3, IMAX.z + 0.3]) box(IMAX.x, IMAX.x + 0.12, IMAX.y0 - 0.3, 9.25, z - 0.12, z + 0.12, 'gold');
  for (const y of [IMAX.y0 - 0.3, IMAX.y1 + 0.05, 9.2]) box(IMAX.x, IMAX.x + 0.12, y, y + 0.1, -IMAX.z - 0.42, IMAX.z + 0.42, 'gold');
  for (const s of [-1, 1]) { // side panel frames
    box(IMAX.x - 0.05, IMAX.x + 0.02, SIDE.y0 - 0.3, SIDE.y1 + 0.3, s * (SIDE.z0 - 0.3), s * (SIDE.z1 + 0.3), 'ptNavyGloss');
    for (const y of [SIDE.y0 - 0.3, SIDE.y1 + 0.2]) box(IMAX.x, IMAX.x + 0.12, y, y + 0.1, s * (SIDE.z0 - 0.3), s * (SIDE.z1 + 0.3), 'gold');
  }
  const plane = (w, h, m, x, y, z, order = 0) => { const g = new THREE.PlaneGeometry(w, h); const me = new THREE.Mesh(g, m); me.position.set(x, e + y, z); me.rotation.y = Math.PI / 2; me.renderOrder = order; ctx.add(me, g); return me; };
  // the live feed
  const rt = new THREE.WebGLRenderTarget(1024, 608, { samples: 0 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const feedMat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }); // the feed is not tone-mapped yet: lift it to match the room
  const feed = plane(W, Hh, feedMat, IMAX.x + 0.13, cy, 0);
  ctx.disposables.push(rt, feedMat);
  const cam = new THREE.PerspectiveCamera(30, W / Hh, 0.5, 40);
  const look = new THREE.Vector3(), camPos = new THREE.Vector3(), lookS = new THREE.Vector3(RIG.x, e + STAGE_TOP + 4.5, RIG.z);
  // overlay: LIVE badge, ball callout, rehearsal digits
  let digits = [], callout = '', calloutT = 0;
  const ov = display(1024, 608, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d62839'; g.beginPath(); g.arc(40, 38, 11, 0, TAU); g.fill();
    g.fillStyle = 'rgba(10,18,36,0.6)'; g.fillRect(58, 20, 330, 38);
    g.fillStyle = '#fff'; g.font = '700 24px Arial'; g.fillText('LIVE · DRAW CAM 1 · REHEARSAL', 66, 48);
    g.fillStyle = 'rgba(10,18,36,0.66)'; g.fillRect(w - 330, h - 74, 312, 56);
    g.fillStyle = '#d9b25c'; g.font = '700 18px Arial'; g.fillText('THIS REHEARSAL', w - 318, h - 52);
    g.fillStyle = '#fff'; g.font = '800 30px Arial'; g.fillText([0, 1, 2, 3, 4, 5].map((i) => (digits[i] ?? '·')).join(' '), w - 318, h - 24);
    if (callout) { g.fillStyle = 'rgba(217,178,92,0.92)'; g.fillRect(24, h - 92, 430, 64); g.fillStyle = '#14213d'; g.font = '800 34px Arial'; g.fillText(callout, 40, h - 48); }
  }, true);
  ov.redraw();
  const ovMesh = plane(W, Hh, ov.m, IMAX.x + 0.16, cy, 0, 6); ctx.disposables.push(ov.t, ov.m);
  // results board (north)
  const pad = (n, k) => String(n).padStart(k, '0');
  const SAMPLE = { first: '482915', front: ['071', '336'], back: ['204', '995'], two: '47', date: '16 พ.ย. 2569' };
  let rehearsals = 0, history = [];
  const res = display(960, 1000, (g, w, h) => {
    g.fillStyle = '#0e1a33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9b25c'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#14213d'; g.font = `700 46px ${THAI}`; g.fillText('ผลการออกรางวัล · RESULTS', 30, 64);
    g.fillStyle = '#9fb3d9'; g.font = `400 26px ${THAI}`; g.fillText(`Last official draw · ${SAMPLE.date} · sample data (placeholder)`, 30, 140);
    g.fillStyle = '#fff'; g.font = `700 34px ${THAI}`; g.fillText('รางวัลที่ 1 · FIRST PRIZE', 30, 210);
    g.fillStyle = '#ffd34d'; g.font = '800 132px Arial'; g.fillText(SAMPLE.first.split('').join(' '), 30, 340);
    const row = (y, label, vals) => { g.fillStyle = '#9fb3d9'; g.font = `700 28px ${THAI}`; g.fillText(label, 30, y); g.fillStyle = '#ffffff'; g.font = '800 64px Arial'; vals.forEach((v, i) => g.fillText(v, 30 + i * 300, y + 70)); };
    row(410, 'เลขหน้า 3 ตัว · FRONT 3', SAMPLE.front);
    row(530, 'เลขท้าย 3 ตัว · LAST 3', SAMPLE.back);
    row(650, 'เลขท้าย 2 ตัว · LAST 2', [SAMPLE.two]);
    g.fillStyle = '#1b2a4a'; g.fillRect(20, 780, w - 40, 200);
    g.fillStyle = '#d9b25c'; g.font = '700 26px Arial'; g.fillText(`MONTE CARLO REHEARSALS TODAY: ${rehearsals}`, 40, 822);
    g.fillStyle = '#fff'; g.font = '700 40px monospace';
    history.slice(-3).reverse().forEach((n, i) => g.fillText(`#${pad(rehearsals - i, 4)}  ${n}  ${n.slice(-2) === SAMPLE.two ? '✓ MODEL VALIDATED' : '✓ CONSISTENT'}`, 40, 880 + i * 44));
  });
  res.redraw();
  plane(SIDE.z1 - SIDE.z0, SIDE.y1 - SIDE.y0, res.m, IMAX.x + 0.13, (SIDE.y0 + SIDE.y1) / 2, -(SIDE.z0 + SIDE.z1) / 2); ctx.disposables.push(res.t, res.m);
  // predictive model (south): last-two-digit heat map + a confident bell curve
  let heat = Array.from({ length: 100 }, () => Math.random());
  const mod = display(960, 1000, (g, w, h) => {
    g.fillStyle = '#0e1a33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5ff2ff'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#0e1a33'; g.font = '700 44px Arial'; g.fillText('PREDICTIVE MODEL v7.3', 30, 64);
    g.fillStyle = '#9fb3d9'; g.font = `400 26px ${THAI}`; g.fillText('สถิติเลขท้าย 2 ตัว · last-two-digit heat map', 30, 140);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const v = heat[i * 10 + j];
      g.fillStyle = v > 0.85 ? '#d62839' : v > 0.6 ? '#f28c28' : v > 0.35 ? '#f6d55c' : '#3d8fd6'; g.fillRect(40 + j * 52, 170 + i * 52, 48, 48);
      g.fillStyle = 'rgba(14,26,51,0.85)'; g.font = '700 18px monospace'; g.fillText(`${i}${j}`, 52 + j * 52, 200 + i * 52);
    }
    g.strokeStyle = '#ff7ad0'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i <= 60; i++) { const x = 600 + i * 5.5, y = 640 - 380 * Math.exp(-(((i - 30) / 10) ** 2)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = '#e6fdff'; g.font = 'italic 30px Georgia, serif';
    ['P(N = n) = 1 / 10⁶', 'E[R] = Σ pᵢvᵢ = 0.60', 'R² = 0.0003 (significant)', 'σ(hope) → ∞'].forEach((t, i) => g.fillText(t, 40, 740 + i * 46));
    g.fillStyle = '#ffd34d'; g.font = '800 40px Arial'; g.fillText('CONFIDENCE: VERY', 560, 720);
    g.fillStyle = '#9fb3d9'; g.font = '700 24px Arial'; g.fillText('NEXT LAST-2 (FORECAST):', 560, 790);
    g.fillStyle = '#fff'; g.font = '800 96px Arial'; g.fillText(pad(heat.indexOf(Math.max(...heat)), 2), 560, 900);
  });
  mod.redraw();
  plane(SIDE.z1 - SIDE.z0, SIDE.y1 - SIDE.y0, mod.m, IMAX.x + 0.13, (SIDE.y0 + SIDE.y1) / 2, (SIDE.z0 + SIDE.z1) / 2); ctx.disposables.push(mod.t, mod.m);
  // countdown to the next official draw (the 1st and the 16th, 16:00 Bangkok time = 09:00 UTC)
  const nextDraw = (now) => {
    const d = new Date(now), y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (const [yy, mm, dd] of [[y, m, 1], [y, m, 16], [y, m + 1, 1], [y, m + 1, 16]]) { const t = Date.UTC(yy, mm, dd, 9, 0, 0); if (t > now) return t; }
    return now;
  };
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const cd = display(2048, 70, (g, w, h) => {
    const now = Date.now(), t = nextDraw(now), s = Math.max(0, Math.floor((t - now) / 1000)), nd = new Date(t);
    g.fillStyle = '#0e1a33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9b25c'; g.font = '700 38px Arial'; g.fillText(`NEXT OFFICIAL DRAW · ${nd.getUTCDate()} ${MON[nd.getUTCMonth()]} ${nd.getUTCFullYear()} · 16:00 ICT`, 30, 50);
    g.fillStyle = '#ffffff'; g.font = '800 54px monospace'; g.textAlign = 'right';
    g.fillText(`T− ${Math.floor(s / 86400)}d ${pad(Math.floor(s / 3600) % 24, 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}`, w - 30, 54); g.textAlign = 'left';
  });
  cd.redraw();
  plane(W, 9.1 - IMAX.y1 - 0.15, cd.m, IMAX.x + 0.13, (IMAX.y1 + 0.15 + 9.1) / 2, 0); ctx.disposables.push(cd.t, cd.m);

  // the feed camera is a real, visible broadcast rig in the pit ("DRAW CAM 1"): a jib on a dolly track with
  // an operator; the IMAX shows exactly what its lens sees
  const jib = cameraRig(ctx, L, feedMat);
  let clock = 0, frame = 0, cdAcc = 0;
  const aim = () => {
    camPos.set(JIB.headX, e + STAGE_TOP + 3.5 + Math.sin(clock * 0.07) * 1.2, -3.2 + Math.sin(clock * 0.09) * 5);
    look.copy(rig.handWorld()).lerp(lookS, 0.45);
  };
  ctx.preRender = (renderer, scene, viewCam) => {
    const p = viewCam.position;
    if (p.y < e + PIT_Y - 1 || p.y > e + CEIL || p.x > -30 || p.x < XW - 1) return; // only while someone is on the floor
    if ((frame++ % (QUALITY.low ? 8 : 4)) !== 0) return; // ~15 Hz (7 Hz in low graphics mode)
    cam.position.copy(camPos); cam.lookAt(look);
    feed.visible = ovMesh.visible = jib.group.visible = false; // the rig never films itself
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
    feed.visible = ovMesh.visible = jib.group.visible = true;
  };
  return {
    camera: () => ({ pos: camPos.clone(), look: look.clone() }),
    update(dt) {
      clock += dt;
      aim(); jib.update(camPos, look, clock);
      if ((cdAcc += dt) >= 1) { cdAcc = 0; cd.redraw(); }
      if (callout && (calloutT -= dt) <= 0) { callout = ''; ov.redraw(); }
    },
    onBall(digit, n) {
      const i = (n - 1) % 6;
      if (i === 0) digits = [];
      digits[i] = digit; callout = `BALL ${i + 1} OF 6 · ${digit}`; calloutT = 2.8; ov.redraw();
      if (i === 5) { rehearsals++; history.push(digits.join('')); res.redraw(); heat = heat.map((v) => Math.min(1, Math.max(0, v + (Math.random() - 0.5) * 0.3))); mod.redraw(); }
    },
  };
}

// ---------------------------------------------------------------- DRAW CAM 1: the camera that films the IMAX feed
// A broadcast jib on a dolly track in the pit walkway (between the stage rail and tier 1). The dolly tracks the
// shot along Z, the arm booms up and down, the head points where the feed looks; an operator rides beside it
// and an assistant minds the cable. Its on-board monitor shows the live feed. Hidden while it renders the feed.
const JIB = { trackX: -92.7, z0: -9.4, z1: 3.0, headX: -91.2, pivotH: 2.6 };
function cameraRig(ctx, L, feedMat) {
  const e = ctx.e, black = LM.blackMetal, steel = LM.steel;
  // static: the track, sleepers, end stops, cable drum with the camera's name plate
  for (const dx of [-0.35, 0.35]) L.box(JIB.trackX + dx - 0.03, JIB.trackX + dx + 0.03, PIT_Y, PIT_Y + 0.07, JIB.z0, JIB.z1, 'steel', { collide: true });
  for (let z = JIB.z0 + 0.2; z < JIB.z1; z += 0.6) L.box(JIB.trackX - 0.48, JIB.trackX + 0.48, PIT_Y, PIT_Y + 0.035, z - 0.06, z + 0.06, 'ptNavy');
  for (const z of [JIB.z0, JIB.z1]) L.box(JIB.trackX - 0.45, JIB.trackX + 0.45, PIT_Y, PIT_Y + 0.22, z - 0.08, z + 0.08, 'gold');
  L.box(JIB.trackX - 0.35, JIB.trackX + 0.35, PIT_Y, PIT_Y + 0.75, JIB.z1 + 0.4, JIB.z1 + 1.1, 'blackMetal', { collide: true });
  L.cyl(JIB.trackX, JIB.z1 + 0.75, 0.3, PIT_Y + 0.75, PIT_Y + 0.95, 'ptNavy', { seg: 16 });
  plaque(ctx, 'DRAW CAM 1 · LIVE TO IMAX', JIB.trackX + 0.37, PIT_Y + 0.45, JIB.z1 + 0.75, Math.PI / 2, { h: 0.12, color: '#ff4d4d' });
  // moving parts
  const group = new THREE.Group(); ctx.group.add(group);
  const mesh = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); parent.add(m); ctx.disposables.push(geo); return m; };
  const dolly = new THREE.Group(); group.add(dolly);
  mesh(new THREE.BoxGeometry(1.0, 0.22, 1.5).translate(0, 0.2, 0), black, dolly);
  for (const sx of [-0.35, 0.35]) for (const sz of [-0.55, 0.55]) mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14).rotateZ(Math.PI / 2).translate(sx, 0.12, sz), steel, dolly);
  mesh(new THREE.CylinderGeometry(0.13, 0.16, JIB.pivotH - 0.3, 12).translate(0, 0.3 + (JIB.pivotH - 0.3) / 2, 0), steel, dolly);
  mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3).translate(0, JIB.pivotH, 0), black, dolly);
  const arm = mesh(new THREE.BoxGeometry(0.14, 0.14, 1), LM.ptWhiteGloss);
  const cw = mesh(new THREE.BoxGeometry(0.42, 0.42, 0.5), black);
  const head = new THREE.Group(); group.add(head);
  mesh(new THREE.BoxGeometry(0.42, 0.44, 0.78).translate(0, 0, -0.18), black, head);
  mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.5, 18).rotateX(Math.PI / 2).translate(0, 0, 0.45), black, head);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.05, metalness: 0.6, emissive: 0x1a3a6a, emissiveIntensity: 0.4 });
  const tally = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
  ctx.disposables.push(glass, tally);
  mesh(new THREE.CircleGeometry(0.135, 18).translate(0, 0, 0.705), glass, head);
  mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06).translate(0, 0.25, 0.12), tally, head); // red tally light: on air
  mesh(new THREE.BoxGeometry(0.06, 0.24, 0.5).translate(-0.24, 0.05, -0.1), LM.gold, head); // handle
  const mon = mesh(new THREE.PlaneGeometry(0.36, 0.21).rotateY(Math.PI).translate(0.05, 0.08, -0.58), feedMat, head); // on-board monitor (the live feed)
  mon.renderOrder = 1;
  // the crew (two standing figures, moved with the dolly)
  const crew = peopleInstanced(ctx, 2);
  crew.color(0, NAVY, 0xc68c62, 0x111111); crew.color(1, 0x2a2e36, 0x8d5a3b, 0x2a1a10);
  // the dolly keeps people off it
  const col = { x0: JIB.trackX - 0.55, x1: JIB.trackX + 0.55, z0: 0, z1: 0, y0: e + PIT_Y, y1: e + PIT_Y + JIB.pivotH };
  ctx.colliders.push(col);
  const P = new THREE.Vector3(), dir = new THREE.Vector3(), C = new THREE.Vector3(), M = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
  return {
    group,
    update(H, look, clock) {
      const zc = Math.min(JIB.z1 - 0.8, Math.max(JIB.z0 + 0.8, H.z));
      dolly.position.set(JIB.trackX, e + PIT_Y, zc);
      col.z0 = zc - 0.8; col.z1 = zc + 0.8;
      P.set(JIB.trackX, e + PIT_Y + JIB.pivotH, zc);
      dir.subVectors(H, P); const len = dir.length(); dir.normalize();
      C.copy(P).addScaledVector(dir, -1.3);
      M.addVectors(C, H).multiplyScalar(0.5);
      arm.position.copy(M); arm.lookAt(H); arm.scale.set(1, 1, len + 1.3);
      cw.position.copy(C); cw.lookAt(H);
      head.position.copy(H); head.lookAt(look);
      const yaw = Math.atan2(look.x - H.x, look.z - H.z);
      crew.set(0, m4.compose(pp.set(JIB.trackX + 0.95, e + PIT_Y + 0.85, zc - 0.35), q.setFromAxisAngle(up, yaw), one)); // operator, watching the shot
      crew.set(1, m4.compose(pp.set(JIB.trackX + 0.85, e + PIT_Y + 0.85 + Math.abs(Math.sin(clock * 2.2)) * 0.02, zc + 1.6), q.setFromAxisAngle(up, Math.PI + yaw * 0.3), one)); // cable assistant
      crew.commit();
    },
  };
}

// ---------------------------------------------------------------- desks, seated quants, monitors, tickets
// Seat-local frame (hips at the origin, facing -X; rotated per seat to face the centre F): a white desk 1.3 m
// wide with a navy modesty panel at the tier edge, three monitors, a navy task chair.
const DESK_PARTS = {
  ptWhite: [[-1.09, -0.35, 0.72, 0.75, -0.65, 0.65]],
  ptNavy: [[-1.13, -1.09, 0, 1.0, -0.66, 0.66], [-0.22, 0.25, 0.42, 0.48, -0.24, 0.24], [0.25, 0.31, 0.48, 1.05, -0.22, 0.22]],
  steel: [[-1.0, -0.96, 0, 0.72, -0.62, -0.58], [-1.0, -0.96, 0, 0.72, 0.58, 0.62], [0.0, 0.05, 0.0, 0.42, -0.025, 0.025], [-0.2, 0.25, 0.0, 0.03, -0.24, 0.24]],
  blackMetal: [[-0.99, -0.96, 0.82, 1.14, -0.63, -0.21], [-0.99, -0.96, 0.82, 1.14, -0.2, 0.2], [-0.99, -0.96, 0.82, 1.14, 0.21, 0.63], [-0.95, -0.9, 0.75, 0.82, -0.05, 0.05], [-0.72, -0.56, 0.75, 0.768, -0.22, 0.22]],
  ptLed: [[-1.135, -1.13, 0.96, 0.99, -0.66, 0.66]],
};
let DESK_T = null;
function deskTemplate() {
  if (DESK_T) return DESK_T;
  DESK_T = {};
  for (const [mat, boxes] of Object.entries(DESK_PARTS)) {
    const gs = boxes.map(([x0, x1, y0, y1, z0, z1]) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.deleteAttribute('uv'); return g; });
    DESK_T[mat] = gs.length > 1 ? mergeBoxes(gs) : gs[0];
  }
  return DESK_T;
}
function mergeBoxes(gs) {
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g of gs) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); for (const i of g.index.array) idx.push(i + off); off += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
}
function desks(ctx, L, r) {
  const e = ctx.e, T = deskTemplate(), seats = [];
  for (let k = 1; k <= NT; k++) {
    const rs = rFront(k) + SEAT.back;
    for (const [a0, a1] of DESK_SECTORS[k]) {
      const pad = 0.66 / rs, n = Math.max(1, Math.floor(((a1 - a0 - 2 * pad) * rs) / SEAT.pitch) + 1), step = n > 1 ? (a1 - a0 - 2 * pad) / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const th = n > 1 ? a0 + pad + i * step : (a0 + a1) / 2, [x, z] = P2(rs, th);
        seats.push({ x, z, y: tierY(k), th, k, empty: r() < 0.14, suit: r() < 0.78 ? COAT : NAVY, skin: pick(SKIN, r()), hair: pick(HAIR, r()) });
      }
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (const [mat, geo] of Object.entries(T)) {
    const mesh = new THREE.InstancedMesh(geo, LM[mat], seats.length);
    seats.forEach((s, i) => mesh.setMatrixAt(i, m4.compose(p.set(s.x, e + s.y, s.z), q.setFromAxisAngle(up, -s.th), one)));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    ctx.add(mesh, geo);
  }
  // monitors (shared animated atlas): three per desk, facing the quant
  const MON_CH = [CH.LOTTO, CH.CHART, CH.LOTTO];
  for (const s of seats) {
    const c = Math.cos(s.th), sn = Math.sin(s.th), yaw = Math.atan2(c, sn);
    for (const [k, dz] of [[0, -0.42], [1, 0], [2, 0.42]]) {
      // seat-local (-0.955, dz) rotated by -th about Y: x' = x cos(th) - z sin(th)... (rotation by -th)
      const lx = -0.955, x = s.x + lx * c - dz * sn, z = s.z + lx * sn + dz * c;
      ctx.screen(x, s.y + 0.98, z, yaw, 0.4, 0.28, MON_CH[k]);
    }
  }
  // tickets on the desks (instanced paper)
  const tg = new THREE.PlaneGeometry(0.22, 0.11).rotateX(-Math.PI / 2), tickets = new THREE.InstancedMesh(tg, LM.ptTicketOne, seats.length * 2);
  let ti = 0;
  for (const s of seats) for (let j = 0; j < 2; j++) {
    const lx = -0.55 - r() * 0.3, lz = (r() - 0.5) * 1.0, c = Math.cos(s.th), sn = Math.sin(s.th);
    q.setFromAxisAngle(up, r() * TAU);
    tickets.setMatrixAt(ti++, m4.compose(p.set(s.x + lx * c - lz * sn, e + s.y + 0.752 + j * 0.002, s.z + lx * sn + lz * c), q, one));
  }
  tickets.instanceMatrix.needsUpdate = true; tickets.computeBoundingSphere(); ctx.add(tickets, tg);
  return seats;
}

// ---------------------------------------------------------------- seated quants + applause on every ball
function applause(ctx, seats, r) {
  const e = ctx.e, sat = seats.filter((s) => !s.empty), N = sat.length, NC = Math.min(160, N);
  const seated = peopleInstanced(ctx, N, true), stand = peopleInstanced(ctx, NC);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const yawOf = (s) => Math.atan2(-Math.cos(s.th), -Math.sin(s.th)); // face the centre
  const put = (i, s, show) => seated.set(i, m4.compose(p.set(s.x, e + s.y + 0.85, s.z), q.setFromAxisAngle(up, yawOf(s)), show ? one : zero));
  sat.forEach((s, i) => { seated.color(i, s.suit, s.skin, s.hair); put(i, s, true); });
  for (let j = 0; j < NC; j++) { stand.color(j, sat[j].suit, sat[j].skin, sat[j].hair); stand.set(j, m4.makeScale(0, 0, 0)); }
  seated.commit(); stand.commit();
  let t = -1, chosen = [];
  return {
    start() {
      if (t >= 0) return;
      t = 0; chosen = [];
      const pool = sat.map((_, i) => i).sort(() => r() - 0.5).slice(0, NC);
      for (const i of pool) { chosen.push({ i, ph: r() * TAU, f: 6 + r() * 4 }); put(i, sat[i], false); }
      seated.commit();
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      if (t > 2.8) {
        for (const c of chosen) put(c.i, sat[c.i], true);
        for (let j = 0; j < NC; j++) stand.set(j, m4.makeScale(0, 0, 0));
        seated.commit(); stand.commit(); t = -1; return;
      }
      chosen.forEach((c, j) => {
        const s = sat[c.i], back = 0.1, hop = Math.abs(Math.sin(t * c.f + c.ph)) * 0.22 * Math.min(1, (2.8 - t) * 2);
        p.set(s.x + Math.cos(s.th) * back, e + s.y + 0.85 + hop, s.z + Math.sin(s.th) * back);
        stand.set(j, m4.compose(p, q.setFromAxisAngle(up, yawOf(s) + Math.sin(t * 5 + c.ph) * 0.3), one));
      });
      stand.commit();
    },
    get active() { return t >= 0; },
  };
}
