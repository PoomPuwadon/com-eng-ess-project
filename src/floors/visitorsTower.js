import * as THREE from 'three';
import { CH, screenMesh } from '../world/screens.js';
import { MAT, instancedBoxes, chunked } from '../world/geom.js';

// Wellness Tower: X 30..210, lift hall X 30..50. leisure() uses world coordinates; racing() still
// uses the old tower coordinates (shifted in floors/index.js).
const FELT = 0x1d6b3a, WOOD = 0x5a3a22, GUEST = 0xd09a60, DEALER = 0x111111;

// VT-01 Executive Leisure Suite (22 m tall, world coordinates, X 50..209) — incl. the Private Card Salon.
// The lift-hall portal (z -9..9) opens straight onto the grand promenade: a red-and-gold carpet with
// purple borders and marble walkways, chandeliers down the centre under a glowing coffered vault,
// lower purple soffits over the gaming floor either side.
const CREAM = 0xf3e6cc, CHAIRBACK = 0xb3171f;
function chairs(ctx, x, z, n, spacing, side) {
  for (let k = 0; k < n; k++) {
    const cx = x + (k - (n - 1) / 2) * spacing;
    ctx.deco(cx - 0.28, cx + 0.28, 0, 0.55, z - 0.28, z + 0.28, CREAM);
    ctx.deco(cx - 0.28, cx + 0.28, 0.55, 1.15, z + side * 0.22, z + side * 0.3, CHAIRBACK);
  }
}
export function leisure(ctx) {
  const H = ctx.floor.height;
  // ---- floor: patterned red carpet everywhere, the promenade on top
  ctx.deco(50.3, 209, 0.008, 0.016, -59, 59, 0x7a1424);
  for (let x = 54; x < 209; x += 6) for (let z = -56; z < 58; z += 6) if (Math.abs(z) > 12) ctx.deco(x, x + 0.8, 0.016, 0.02, z, z + 0.8, 0xc98a2e);
  ctx.deco(50.3, 206, 0.02, 0.035, -9.5, 9.5, 0xf1e6d0); // marble walkways
  ctx.deco(50.3, 206, 0.035, 0.05, -6.6, 6.6, 0x5b2a86); // purple border
  ctx.deco(50.3, 206, 0.05, 0.06, -6.0, 6.0, 0xc8102e); // red carpet
  for (const z of [-5.7, 5.5]) ctx.deco(50.3, 206, 0.06, 0.065, z, z + 0.2, 0xe0a93a);
  for (let x = 58; x < 204; x += 12) { // gold medallions
    ctx.deco(x - 1.6, x + 1.6, 0.06, 0.07, -0.5, 0.5, 0xe0a93a);
    ctx.deco(x - 0.5, x + 0.5, 0.06, 0.07, -1.6, 1.6, 0xe0a93a);
  }
  for (let x = 62; x < 206; x += 24) ctx.deco(x - 0.4, x + 0.4, 0.05, 0.062, -6.6, 6.6, 0x5b2a86); // bands at the column bays
  // ---- ceiling: lowered purple soffits with glowing edges, coffered vault over the promenade
  for (const sg of [-1, 1]) {
    ctx.deco(50.3, 209, 15, 15.6, sg > 0 ? 12 : -59, sg > 0 ? 59 : -12, 0x4b2475);
    ctx.deco(50.3, 209, 14.7, 15.0, sg > 0 ? 12 : -12.4, sg > 0 ? 12.4 : -12, 0xffd27a);
    ctx.deco(50.3, 209, 15.6, H - 0.25, sg > 0 ? 12 : -12.3, sg > 0 ? 12.3 : -12, 0xe8b45a); // vault side walls
  }
  let n = 0;
  for (let x = 53; x < 207; x += 6) for (let z = -11; z < 11; z += 5.5) ctx.deco(x, x + 5.4, H - 1.3, H - 0.25, z + 0.2, z + 5.3, n++ % 2 ? 0xc2451e : 0xe8892e);
  // ---- chandeliers down the centre line
  for (let x = 66; x <= 198; x += 16) {
    ctx.deco(x - 2.6, x + 2.6, 16.2, 16.4, -2.6, 2.6, 0xc9a23a);
    ctx.deco(x - 2.2, x + 2.2, 15.4, 16.2, -2.2, 2.2, 0xffe9a8);
    ctx.deco(x - 1.6, x + 1.6, 14.5, 15.4, -1.6, 1.6, 0xfff3c4);
    ctx.deco(x - 1.0, x + 1.0, 13.7, 14.5, -1.0, 1.0, 0xffe9a8);
    ctx.deco(x - 0.4, x + 0.4, 13.1, 13.7, -0.4, 0.4, 0xc9a23a);
    ctx.deco(x - 0.08, x + 0.08, 16.4, H - 1.3, -0.08, 0.08, 0xc9a23a);
  }
  // pendant lamps over the gaming floor
  for (let x = 58; x < 206; x += 12) for (const z of [-40, -24, 24, 40]) {
    ctx.deco(x - 0.8, x + 0.8, 11.6, 12.6, z - 0.8, z + 0.8, 0xfff0c8);
    ctx.deco(x - 0.04, x + 0.04, 12.6, 15, z - 0.04, z + 0.04, 0xc9a23a);
  }
  // ---- columns flanking the promenade
  for (let x = 62; x < 206; x += 24) for (const z of [-10.6, 10.6]) {
    ctx.box(x - 0.7, x + 0.7, 0, 15, z - 0.7, z + 0.7, 0xf1e6d0);
    ctx.deco(x - 0.85, x + 0.85, 0, 0.6, z - 0.85, z + 0.85, 0xc9a23a);
    ctx.deco(x - 0.85, x + 0.85, 14.2, 15, z - 0.85, z + 0.85, 0xc9a23a);
  }
  // ---- Automated Yield Terminals: banks of machines (north-west)
  const cabinets = [];
  for (let zz = -54; zz <= -16; zz += 4) {
    for (const [a, b] of [[54, 82], [86, 114]]) {
      ctx.box(a, b, 0, 1.8, zz - 0.4, zz + 0.4, 0x2a1a3a);
      for (let x = a + 0.6; x < b; x += 1.2) {
        cabinets.push({ x, y: ctx.e + 1.95, z: zz, sx: 1, sy: 0.3, sz: 0.8, color: (Math.floor(x) % 3) ? 0x8a5cff : 0x3db7ff });
        ctx.screen(x, 1.3, zz + 0.41, 0, 0.8, 0.6, [CH.ODDS, CH.LOTTO, CH.RACE][Math.floor(x) % 3]);
        ctx.screen(x, 1.3, zz - 0.41, Math.PI, 0.8, 0.6, [CH.LOTTO, CH.ODDS, CH.FIGHT][Math.floor(x) % 3]);
      }
    }
    for (let x = 58; x < 114; x += 9) ctx.npc(x, zz + 1.2, GUEST, Math.PI);
  }
  for (const m of chunked(cabinets, 30, (list) => instancedBoxes(list, MAT.emissive))) ctx.add(m, m.geometry);
  // ---- Rotational Variance Instruments (north-east): 5 x 3
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const x = 128 + i * 16, zz = -48 + j * 14;
    ctx.box(x - 3, x + 3, 0, 0.9, zz - 1.5, zz + 1.5, FELT);
    ctx.deco(x + 1.2, x + 2.6, 0.9, 1.1, zz - 0.7, zz + 0.7, WOOD);
    ctx.npc(x + 3.8, zz, DEALER, -Math.PI / 2);
    chairs(ctx, x - 0.5, zz + 2.1, 4, 1.4, 1);
    for (let k = 0; k < 4; k++) if ((i + j + k) % 3) ctx.npc(x - 2.6 + k * 1.4, zz + 2.4, GUEST, Math.PI);
  }
  // ---- Twenty-One Advisory Tables (south-west)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = 58 + i * 11, zz = 18 + j * 10;
    ctx.box(x - 2.2, x + 2.2, 0, 0.9, zz - 1.1, zz + 1.1, FELT);
    ctx.deco(x - 2.3, x + 2.3, 0.88, 0.95, zz - 1.2, zz + 1.2, WOOD);
    ctx.npc(x, zz - 1.9, DEALER, 0);
    chairs(ctx, x, zz + 1.8, 4, 1.2, 1);
    for (let k = 0; k < 3; k++) ctx.npc(x - 1.5 + k * 1.5, zz + 2.1, GUEST, Math.PI);
  }
  // ---- Private Banking Tables
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
    const x = 104 + i * 14, zz = 18 + j * 10;
    ctx.box(x - 3, x + 3, 0, 0.9, zz - 1.4, zz + 1.4, 0x173f6b);
    ctx.npc(x, zz - 2.2, DEALER, 0);
    chairs(ctx, x, zz + 2.1, 5, 1.2, 1);
  }
  // ---- Kinetic Probability Pit
  for (let j = 0; j < 3; j++) {
    const x = 137, zz = 20 + j * 13;
    ctx.box(x - 4, x + 4, 0, 1.0, zz - 2, zz + 2, FELT);
    for (let k = 0; k < 5; k++) ctx.npc(x - 3 + k * 1.5, zz + 2.8, GUEST, Math.PI);
  }
  // ---- Private Card Salon: walled room inside the suite
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = 161 + i * 12, zz = 20 + j * 11;
    ctx.box(x - 2.4, x + 2.4, 0, 0.8, zz - 1.3, zz + 1.3, FELT);
    ctx.deco(x - 2.6, x + 2.6, 0.75, 0.82, zz - 1.5, zz + 1.5, WOOD);
    ctx.npc(x, zz - 2.1, DEALER, 0);
    for (let k = 0; k < 4; k++) ctx.npc(x - 2 + k * 1.33, zz + 2.1, GUEST, Math.PI);
  }
  ctx.box(197, 201, 0, 0.8, 47, 50, 0x5b1730); // high-conviction table
  for (let i = 0; i < 3; i++) ctx.screen(161 + i * 12, 5.5, 55.6, Math.PI, 8, 3, CH.ODDS);
  for (let i = 0; i < 5; i++) ctx.deco(158 + i * 9, 161 + i * 9, 7, 9.4, 30, 33, 0xffe9a8); // salon chandeliers
  // ---- focal screen at the far end of the promenade
  ctx.deco(208.6, 208.9, 3.5, 13.5, -10.5, 10.5, 0xc9a23a);
  ctx.screen(208.55, 8.5, 0, -Math.PI / 2, 19, 9, CH.ODDS);
  ctx.sign('Projected yield 95.8 % · Responsible Recreation Since Q3', 130, 11.4, 0, { size: 1.2, gold: false });
}

// VT-02 Sports Analytics Arena: see arena.js

// VT-03 Combat Sports Analytics Pavilion: see pavilion.js

// stadium-shaped track: centre line radius R around (128,0) and (192,0)
const TRK = { x0: 128, x1: 192, R: 36, outer: 42, inner: 30 };
const TRK_LEN = 2 * (TRK.x1 - TRK.x0) + 2 * Math.PI * TRK.R;
function trackPos(s, lane = 0) {
  const R = TRK.R + lane;
  const S = TRK.x1 - TRK.x0;
  s = ((s % TRK_LEN) + TRK_LEN) % TRK_LEN;
  if (s < S) return [TRK.x0 + s, R, Math.PI / 2];
  s -= S;
  const arc = Math.PI * TRK.R;
  if (s < arc) { const a = Math.PI / 2 - s / TRK.R; return [TRK.x1 + Math.cos(a) * R, Math.sin(a) * R, Math.PI - a]; }
  s -= arc;
  if (s < S) return [TRK.x1 - s, -R, -Math.PI / 2];
  s -= S;
  const a = -Math.PI / 2 - s / TRK.R;
  return [TRK.x0 + Math.cos(a) * R, Math.sin(a) * R, Math.PI - a];
}

// VT-04 Equine Performance Centre
export function racing(ctx) {
  const e = ctx.e;
  const stadium = (rad) => {
    const s = new THREE.Shape();
    s.moveTo(TRK.x0, rad);
    s.lineTo(TRK.x1, rad);
    s.absarc(TRK.x1, 0, rad, Math.PI / 2, -Math.PI / 2, true);
    s.lineTo(TRK.x0, -rad);
    s.absarc(TRK.x0, 0, rad, -Math.PI / 2, -3 * Math.PI / 2, true);
    return s;
  };
  const outer = stadium(TRK.outer);
  outer.holes.push(stadium(TRK.inner));
  const tg = new THREE.ShapeGeometry(outer, 24);
  tg.rotateX(Math.PI / 2);
  const track = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ color: 0x9a6b3a, side: THREE.DoubleSide }));
  track.position.y = e + 0.03;
  ctx.add(track, tg, track.material);
  const ig = new THREE.ShapeGeometry(stadium(TRK.inner), 24);
  ig.rotateX(Math.PI / 2);
  const infield = new THREE.Mesh(ig, new THREE.MeshLambertMaterial({ color: 0x3f8f3f, side: THREE.DoubleSide }));
  infield.position.y = e + 0.02;
  ctx.add(infield, ig, infield.material);
  // grandstand (north side, facing south)
  const seatItems = [];
  for (let i = 0; i < 12; i++) {
    const zA = -44.5 - 0.85 * (i + 1), zB = -44.5 - 0.85 * i, top = 0.4 * (i + 1);
    ctx.box(110, 210, 0, top, zA, zB, 0x7a6a58);
    for (let x = 110.4; x < 210; x += 0.55) seatItems.push({ x, y: e + top + 0.22, z: (zA + zB) / 2 - 0.1, sx: 0.45, sy: 0.44, sz: 0.42, yaw: Math.PI });
  }
  for (const m of chunked(seatItems, 30, (list) => instancedBoxes(list, MAT.seat))) ctx.add(m, m.geometry);
  for (let i = 0; i < seatItems.length; i += 17) ctx.npc(seatItems[i].x, seatItems[i].z, GUEST, 0, seatItems[i].y - e - 0.2);
  ctx.seatCount = seatItems.length;
  // tote windows
  for (let i = 0; i < 6; i++) { ctx.box(85 + i * 3.6, 88 + i * 3.6, 0, 1.2, -58, -56, WOOD); ctx.npc(86.5 + i * 3.6, -55, GUEST, Math.PI); }
  // odds board in the infield
  for (const x of [147, 173]) ctx.box(x - 0.3, x + 0.3, 0, 4, -0.3, 0.3, 0x333);
  ctx.deco(145, 175, 4, 12, -0.4, 0.4, 0x111);
  ctx.screen(160, 8, -0.45, Math.PI, 29, 7.5, CH.ODDS);
  ctx.screen(160, 8, 0.45, 0, 29, 7.5, CH.RACE);
  // simulated runners (instanced, moved every frame)
  const horses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 1.6, 2.4), new THREE.MeshLambertMaterial({ color: 0xffffff }), 8);
  const col = new THREE.Color();
  for (let i = 0; i < 8; i++) horses.setColorAt(i, col.setHSL(i / 8, 0.7, 0.5));
  horses.frustumCulled = false;
  ctx.add(horses, horses.geometry, horses.material);
  const speeds = Array.from({ length: 8 }, (_, i) => 15 + Math.random() * 1.5 - i * 0.05);
  const dist = new Array(8).fill(0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  ctx.onUpdate((dt) => {
    for (let i = 0; i < 8; i++) {
      dist[i] += (speeds[i] + Math.sin(performance.now() / 1000 + i) * 0.8) * dt;
      const [x, z, yaw] = trackPos(dist[i], -4 + i * 1.1);
      q.setFromAxisAngle(up, yaw);
      m4.compose(p.set(x, e + 0.8, z), q, sc);
      horses.setMatrixAt(i, m4);
    }
    horses.instanceMatrix.needsUpdate = true;
  });
}
