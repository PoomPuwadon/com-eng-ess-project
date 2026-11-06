import * as THREE from 'three';
import { CH } from '../world/screens.js';

// OT-02 Probability Research Institute — greybox rev 2 (user's reference image, 2026-11-06).
// The Thai lottery run like a quant research lab: a raised draw platform in the middle with a giant
// geodesic draw drum on a gold A-frame (balls tumbling inside) and a giant animatronic quant robot
// that reaches into the drum, carries a ball to the Drawn Numbers rack and drops it in. Floating
// holographic analysis panels, lab-coat quants at multi-monitor desks, server racks, a north
// mezzanine and a south/west window wall. Main space X -109..-50.5, Z -39..39; y relative to 27 m.

const COAT = 0xf2f2f2, DESKC = 0xe3e6ea, RACK = 0x1a1e26, GOLD = 0xd8a62a, GLASS = 0xbfe6ff;
const C = { x: -80, z: 0 }; // drum centre (plan)
const PLAT = { x0: -92, x1: -68, z0: -11, z1: 11, h: 1.2 }; // draw platform
const DRUM = { y: 6.0, r: 3.3 }; // drum centre height, radius (axle along Z)
const MZ = { x0: -108.5, x1: -56, z0: -39, z1: -29, y: 4.5 }; // north mezzanine

// ---------------------------------------------------------------- holographic panel textures
let panelTex = null;
function panelTextures() {
  if (panelTex) return panelTex;
  panelTex = [0, 1, 2].map((v) => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 576;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,40,70,0.88)'; g.fillRect(0, 0, 1024, 576);
    g.strokeStyle = '#5ff2ff'; g.lineWidth = 8; g.strokeRect(6, 6, 1012, 564);
    g.fillStyle = '#bff9ff'; g.font = 'bold 52px Arial';
    g.fillText(['THAI LOTTERY PATTERN ANALYSIS', 'สถิติหวย · DRAW FREQUENCY', 'PREDICTIVE MODEL v7.3'][v], 34, 74);
    g.font = 'italic 34px Georgia, serif'; g.fillStyle = '#e6fdff';
    const eqs = [['P(N=n) = 1 / 10⁶', 'E[R] = Σ pᵢ·vᵢ = 0.60', 'H = −Σ p log p'], ['χ² = Σ (O−E)² / E', 'P(last2 | dream) ≈ 0.01', 'lim n→∞ hope = 0'], ['ŷ = β₀ + β₁·luck', 'σ² = E[X²] − μ²', 'R² = 0.0003 (significant)']][v];
    eqs.forEach((t, i) => g.fillText(t, 40, 150 + i * 62));
    if (v === 0) { // bell curve
      g.strokeStyle = '#ff7ad0'; g.lineWidth = 6; g.beginPath();
      for (let i = 0; i <= 60; i++) { const x = 560 + i * 7, y = 520 - 300 * Math.exp(-(((i - 30) / 10) ** 2)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    } else { // bars
      for (let i = 0; i < 10; i++) {
        const h = 60 + Math.abs(Math.sin(i * 2.1 + v)) * 260;
        g.fillStyle = ['#5ff2ff', '#ff7ad0', '#ffd34d'][i % 3]; g.fillRect(560 + i * 42, 520 - h, 30, h);
        g.fillStyle = '#bff9ff'; g.font = '24px Arial'; g.fillText(String(i), 568 + i * 42, 552);
      }
    }
    g.fillStyle = '#ffd34d'; g.font = 'bold 30px Arial'; g.fillText('CONFIDENCE: VERY', 40, 520);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return panelTex;
}

// ---------------------------------------------------------------- the floor
export function lottery(ctx) {
  const e = ctx.e;
  const disposables = [];
  const mat = (o) => { const m = new THREE.MeshLambertMaterial(o); disposables.push(m); return m; };
  const add = (geo, m, x, y, z, parent = ctx.group) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); disposables.push(geo); return me; };
  const rail = (x0, x1, z0, z1, y = 0) => ctx.glassBox(x0, x1, y, y + 1.1, z0, z1, GLASS, true);

  // ---- floor, guide lines, windows (south + west), roof trusses
  ctx.deco(-109, -50.5, 0.012, 0.025, -39, 39, 0xdfe3e8);
  for (const z of [-3.2, 3.2]) ctx.deco(-68, -50.5, 0.025, 0.04, z - 0.12, z + 0.12, 0xf2c230); // yellow guide lines to the platform
  for (const z of [-2.6, 2.6]) ctx.deco(-68, -50.5, 0.025, 0.04, z - 0.08, z + 0.08, 0x3fae5a);
  for (let x = -107; x <= -54; x += 5.5) ctx.deco(x, x + 5, 0.8, 9.3, 38.85, 38.95, 0xbfe0ff); // south windows
  for (let z = -27; z <= 35; z += 5.5) ctx.deco(-108.95, -108.85, 0.8, 9.3, z, z + 5, 0xbfe0ff); // west windows
  for (let x = -104; x <= -56; x += 8) ctx.deco(x - 0.2, x + 0.2, 9.1, 9.7, -39, 39, 0x8a8f99); // roof trusses
  for (let z = -32; z <= 32; z += 16) ctx.deco(-109, -50.5, 9.3, 9.6, z - 0.15, z + 0.15, 0x8a8f99);

  // ---- the draw platform: 1.2 m high, stairs east (main) + north + south, glass rail
  ctx.box(PLAT.x0, PLAT.x1, 0, PLAT.h, PLAT.z0, PLAT.z1, 0xf0eee8);
  ctx.deco(PLAT.x0 - 0.05, PLAT.x1 + 0.05, PLAT.h - 0.22, PLAT.h - 0.06, PLAT.z0 - 0.05, PLAT.z1 + 0.05, GOLD); // gold band on the sides (top stays clean)
  const steps = (axis, a0, dir, b0, b1) => { // 5 risers of 0.2 m, 0.4 m treads, going away from the platform edge
    for (let i = 0; i < 5; i++) {
      const top = PLAT.h - (i + 1) * 0.2, a = a0 + dir * i * 0.4, b = a0 + dir * (i + 1) * 0.4;
      if (axis === 'x') ctx.box(Math.min(a, b), Math.max(a, b), 0, top, b0, b1, 0xd9d6cf);
      else ctx.box(b0, b1, 0, top, Math.min(a, b), Math.max(a, b), 0xd9d6cf);
    }
  };
  steps('x', PLAT.x1, 1, -4, 4); // main stair facing the portal
  steps('z', PLAT.z0, -1, -91, -86); // north
  steps('z', PLAT.z1, 1, -91, -86); // south
  const runs = (axis, a0, a1, f0, f1, gaps) => {
    let cur = a0;
    for (const [ga, gb] of [...gaps, [a1, a1]]) { if (ga - cur > 0.05) axis === 'x' ? rail(cur, ga, f0, f1, PLAT.h) : rail(f0, f1, cur, ga, PLAT.h); cur = gb; }
  };
  runs('z', PLAT.z0, PLAT.z1, PLAT.x1 - 0.12, PLAT.x1, [[-4, 4]]);
  runs('z', PLAT.z0, PLAT.z1, PLAT.x0, PLAT.x0 + 0.12, []);
  runs('x', PLAT.x0, PLAT.x1, PLAT.z0, PLAT.z0 + 0.12, [[-91, -86]]);
  runs('x', PLAT.x0, PLAT.x1, PLAT.z1 - 0.12, PLAT.z1, [[-91, -86]]);
  // control consoles with operators round the drum
  for (const [x, z, yaw] of [[-72.5, -6.5, -Math.PI / 2], [-72.5, 6.5, -Math.PI / 2], [-88, -7.5, Math.PI / 2], [-88, 7.5, Math.PI / 2]]) {
    ctx.box(x - 0.9, x + 0.9, PLAT.h, PLAT.h + 1.0, z - 1.1, z + 1.1, 0x9aa3ad);
    ctx.screen(x + (yaw < 0 ? 0.92 : -0.92), PLAT.h + 1.3, z, yaw < 0 ? Math.PI / 2 : -Math.PI / 2, 1.6, 0.6, CH.LOTTO, 0.4);
    ctx.npc(x + (yaw < 0 ? 1.6 : -1.6), z, COAT, yaw, PLAT.h);
  }

  // ---- the draw drum: gold A-frame, geodesic glass cage (spins), tumbling balls
  const gold = mat({ color: GOLD }), white = mat({ color: 0xffffff });
  for (const sz of [-1, 1]) {
    const zf = sz * (DRUM.r + 0.9);
    for (const sx of [-1, 1]) {
      const len = Math.hypot(2.6, DRUM.y - PLAT.h);
      const leg = add(new THREE.BoxGeometry(0.45, len, 0.45), gold, C.x + sx * 1.3, e + (PLAT.h + DRUM.y) / 2, zf);
      leg.rotation.z = sx * Math.atan2(2.6, DRUM.y - PLAT.h);
    }
    add(new THREE.BoxGeometry(3.2, 0.35, 0.5), gold, C.x, e + PLAT.h + 1.4, zf); // cross brace
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12).rotateX(Math.PI / 2), gold, C.x, e + DRUM.y, sz * (DRUM.r + 0.6)); // hub
  }
  add(new THREE.CylinderGeometry(0.12, 0.12, 2 * DRUM.r + 1.6, 8).rotateX(Math.PI / 2), gold, C.x, e + DRUM.y, C.z); // axle
  ctx.colliders.push({ x0: C.x - 3.2, x1: C.x + 3.2, z0: -DRUM.r - 1.2, z1: DRUM.r + 1.2, y0: e + PLAT.h, y1: e + 9.6 }); // keep people out of the frame
  const cage = new THREE.Group(); cage.position.set(C.x, e + DRUM.y, C.z); ctx.group.add(cage);
  const ico = new THREE.IcosahedronGeometry(DRUM.r, 1);
  const edges = new THREE.EdgesGeometry(ico);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf4f7fb });
  cage.add(new THREE.LineSegments(edges, lineMat));
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.12, depthWrite: false });
  cage.add(new THREE.Mesh(ico, shellMat));
  disposables.push(ico, edges, lineMat, shellMat);
  // balls: instanced, each on its own tumbling loop in the lower half of the drum
  const NB = 160, ballGeo = new THREE.SphereGeometry(0.21, 10, 8), ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, NB);
  const col = new THREE.Color(), BALL_COLS = [0xff4d4d, 0xffd34d, 0x4dd2ff, 0x6cff6c, 0xff7ad0, 0xffffff, 0xff9a3c, 0x9a7bff];
  const bp = Array.from({ length: NB }, (_, i) => ({ r: 0.4 + Math.random() * 2.4, a: Math.random() * Math.PI * 2, w: 1.5 + Math.random() * 2.5, z: (Math.random() - 0.5) * 4.2, lift: 0.4 + Math.random() * 0.8 }));
  for (let i = 0; i < NB; i++) balls.setColorAt(i, col.set(BALL_COLS[i % BALL_COLS.length]));
  ctx.group.add(balls); disposables.push(ballGeo, ballMat);
  const m4 = new THREE.Matrix4();
  const placeBalls = (t) => {
    for (let i = 0; i < NB; i++) {
      const b = bp[i], a = b.a + t * b.w;
      let x = Math.cos(a) * b.r, y = -1.3 + Math.sin(a) * b.r * b.lift, z = b.z;
      const d = Math.hypot(x, y, z), lim = DRUM.r - 0.3;
      if (d > lim) { x *= lim / d; y *= lim / d; z *= lim / d; }
      m4.makeTranslation(C.x + x, e + DRUM.y + y, C.z + z);
      balls.setMatrixAt(i, m4);
    }
    balls.instanceMatrix.needsUpdate = true;
  };
  placeBalls(0);
  ctx.sign('Draw Mechanism — Do Not Touch (Statistically Significant)', C.x + 5.5, PLAT.h + 2.6, 0, { size: 0.45, gold: false });

  // ---- the Drawn Numbers rack (east of the robot): six glass cups on a gold stand
  const RACKP = { x: -72.5, z: -9.8, y: PLAT.h + 1.6 };
  ctx.box(RACKP.x - 0.4, RACKP.x + 0.4, PLAT.h, RACKP.y - 0.1, RACKP.z - 0.4, RACKP.z + 0.4, GOLD);
  ctx.deco(RACKP.x - 1.9, RACKP.x + 1.9, RACKP.y - 0.1, RACKP.y, RACKP.z - 0.5, RACKP.z + 0.5, GOLD);
  const slot = (k) => [RACKP.x - 1.5 + k * 0.6, e + RACKP.y + 0.22, RACKP.z];
  ctx.sign('DRAWN NUMBERS', RACKP.x, RACKP.y + 1.1, RACKP.z + 0.3, { size: 0.4, gold: false });
  const drawn = [];
  for (let k = 0; k < 6; k++) { const s = add(new THREE.SphereGeometry(0.24, 12, 10), mat({ color: BALL_COLS[k] }), ...slot(k)); s.visible = false; drawn.push(s); }

  // ---- the animatronic: a giant quant robot (lab coat, glasses) north of the drum, one working arm
  const ROBOT = { x: -78.5, z: -7.6 };
  const coat = mat({ color: 0xf4f4f4 }), metal = mat({ color: 0x7d8794 }), dark = mat({ color: 0x2a2f38 }), eye = new THREE.MeshBasicMaterial({ color: 0x5ff2ff });
  disposables.push(eye);
  const robot = new THREE.Group(); robot.position.set(ROBOT.x, e + PLAT.h, ROBOT.z); ctx.group.add(robot);
  add(new THREE.CylinderGeometry(1.3, 1.6, 1.4, 16), dark, 0, 0.7, 0, robot); // pedestal
  add(new THREE.BoxGeometry(2.6, 3.4, 1.6), coat, 0, 3.1, 0, robot); // torso (lab coat)
  add(new THREE.BoxGeometry(0.9, 2.2, 0.06), mat({ color: 0x2b5fa8 }), 0, 3.6, 0.82, robot); // tie
  const neck = new THREE.Group(); neck.position.set(0, 4.9, 0); robot.add(neck);
  add(new THREE.BoxGeometry(1.5, 1.4, 1.4), metal, 0, 0.75, 0, neck); // head
  for (const sx of [-0.35, 0.35]) {
    add(new THREE.SphereGeometry(0.14, 10, 8), eye, sx, 0.85, 0.72, neck);
    add(new THREE.TorusGeometry(0.24, 0.04, 6, 16), dark, sx, 0.85, 0.74, neck); // glasses
  }
  add(new THREE.BoxGeometry(1.1, 0.12, 0.05), dark, 0, 0.35, 0.72, neck); // mouth slot
  add(new THREE.BoxGeometry(0.5, 1.2, 0.5), metal, -1.55, 3.6, 0, robot); // idle left arm
  // working arm: shoulder (yaw + pitch) -> upper arm -> elbow -> forearm -> claw
  const L1 = 4, L2 = 4;
  ctx.colliders.push({ x0: ROBOT.x - 1.6, x1: ROBOT.x + 1.6, z0: ROBOT.z - 1.6, z1: ROBOT.z + 1.6, y0: e + PLAT.h, y1: e + PLAT.h + 6.5 });
  const SH = new THREE.Vector3(ROBOT.x + 1.55, e + PLAT.h + 4.3, ROBOT.z); // shoulder, world
  const shoulder = new THREE.Group(); shoulder.position.set(1.55, 4.3, 0); shoulder.rotation.order = 'YXZ'; robot.add(shoulder);
  add(new THREE.SphereGeometry(0.45, 12, 10), metal, 0, 0, 0, shoulder);
  add(new THREE.BoxGeometry(0.55, 0.55, L1), coat, 0, 0, L1 / 2, shoulder);
  const elbow = new THREE.Group(); elbow.position.set(0, 0, L1); shoulder.add(elbow);
  add(new THREE.SphereGeometry(0.35, 12, 10), metal, 0, 0, 0, elbow);
  add(new THREE.BoxGeometry(0.42, 0.42, L2), metal, 0, 0, L2 / 2, elbow);
  const hand = new THREE.Group(); hand.position.set(0, 0, L2); elbow.add(hand);
  const fingers = [];
  for (const s of [-1, 1]) { const f = add(new THREE.BoxGeometry(0.1, 0.12, 0.55), dark, s * 0.2, 0, 0.25, hand); fingers.push([f, s]); }
  const held = add(new THREE.SphereGeometry(0.24, 12, 10), mat({ color: 0xffffff }), 0, 0, 0.42, hand);
  held.visible = false;
  // 2-bone IK in the vertical plane through the shoulder (elbow down, so it stays under the ceiling);
  // the claw always points straight down
  const ik = (T) => {
    const dx = T.x - SH.x, dy = T.y - SH.y, dz = T.z - SH.z;
    const h = Math.hypot(dx, dz), d = Math.min(Math.hypot(h, dy), L1 + L2 - 0.02);
    const phi = Math.atan2(dy, h);
    const a1 = Math.acos(Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    shoulder.rotation.y = Math.atan2(dx, dz); // the robot group is unrotated
    shoulder.rotation.x = -(phi - a1);
    elbow.rotation.x = -bend;
    hand.rotation.x = Math.PI / 2 - (-(phi - a1) - bend);
    neck.rotation.y = Math.atan2(dx, dz) * 0.6;
  };
  // the draw cycle: rest -> into the drum -> grab -> out -> over the rack -> drop -> rest
  const V = (x, y, z) => new THREE.Vector3(x, e + y, z);
  const REST = V(-74.5, PLAT.h + 3.2, -6.2);
  const ABOVE = V(C.x + 0.4, DRUM.y + DRUM.r + 0.1, -1.6);
  const INSIDE = V(C.x + 0.4, DRUM.y - 1.2, -1.4);
  const keys = [[0, REST], [1.4, ABOVE], [2.6, INSIDE], [3.4, INSIDE], [4.6, ABOVE], [6.2, null], [7.0, null], [8.2, REST], [9.5, REST]];
  const CYCLE = 9.5;
  let tAll = 0, lastCycle = -1, nDrawn = 0, colourNow = 0;
  const tmp = new THREE.Vector3();
  const targetAt = (t) => {
    const k = keys.map(([tk, p]) => [tk, p || V(slot(nDrawn % 6)[0], RACKP.y + 0.9, slot(nDrawn % 6)[2])]);
    for (let i = 0; i < k.length - 1; i++) {
      if (t <= k[i + 1][0]) { const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]); const s = u * u * (3 - 2 * u); return tmp.copy(k[i][1]).lerp(k[i + 1][1], s); }
    }
    return tmp.copy(REST);
  };
  ik(REST);

  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    tAll += dt;
    cage.rotation.z += dt * 0.7;
    placeBalls(tAll);
    const cyc = Math.floor(tAll / CYCLE), t = tAll % CYCLE;
    if (cyc !== lastCycle) { // new draw: clear the rack after six balls
      lastCycle = cyc;
      if (nDrawn % 6 === 0) drawn.forEach((s) => { s.visible = false; });
      colourNow = BALL_COLS[Math.floor(Math.random() * BALL_COLS.length)];
      held.material.color.set(colourNow);
    }
    ik(targetAt(t));
    held.visible = t > 3.0 && t < 7.0;
    const grip = t > 2.9 && t < 7.0 ? 0.05 : 0.35;
    for (const [f, s] of fingers) f.rotation.y = s * grip;
    if (t >= 7.0 && t - dt < 7.0) { const s = drawn[nDrawn % 6]; s.material.color.set(colourNow); s.visible = true; nDrawn++; }
  });
  ctx.sign('Chief Draw Officer (animatronic)', ROBOT.x, PLAT.h + 7.6, ROBOT.z, { size: 0.45, gold: false });

  // ---- floating holographic analysis panels (tilted towards the floor)
  const tex = panelTextures();
  for (const [x, y, z, yaw, w, v] of [
    [-80, 7.2, -16, 0, 9, 0], [-80, 7.2, 16, Math.PI, 9, 1], // either side of the drum
    [-64, 7.4, -12, Math.PI / 4, 6, 2], [-64, 7.4, 12, 3 * Math.PI / 4, 6, 1], // seen from the portal
    [-97, 7.0, -14, Math.PI / 4, 6, 1], [-97, 7.0, 14, 3 * Math.PI / 4, 6, 2],
    [-58, 6.8, -26, -Math.PI / 2, 5, 0], [-58, 6.8, 26, -Math.PI / 2, 5, 2],
  ]) {
    const m = new THREE.MeshBasicMaterial({ map: tex[v], transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const p = add(new THREE.PlaneGeometry(w, w * 0.5625), m, x, e + y, z);
    p.rotation.order = 'YXZ'; p.rotation.y = yaw; p.rotation.x = -0.18;
    disposables.push(m);
    ctx.deco(x - 0.02, x + 0.02, y + w * 0.28, 9.6, z - 0.02, z + 0.02, 0x8fd8ff); // hanger
  }

  // ---- north mezzanine (Y 4.5): research gallery with desks, racks, a stair at the east end
  ctx.box(MZ.x0, MZ.x1, MZ.y - 0.3, MZ.y, MZ.z0, MZ.z1, 0xd8dbe0);
  ctx.deco(MZ.x0, MZ.x1, MZ.y - 0.35, MZ.y - 0.3, MZ.z1 - 0.15, MZ.z1, 0x5ff2ff);
  rail(MZ.x0, -60, MZ.z1 - 0.12, MZ.z1, MZ.y); // stair gap -60..-56
  rail(MZ.x1 - 0.12, MZ.x1, MZ.z0, MZ.z1, MZ.y);
  for (let x = -104; x <= -64; x += 10) ctx.box(x - 0.3, x + 0.3, 0, MZ.y - 0.3, MZ.z1 - 0.9, MZ.z1 - 0.3, 0xc8ccd2);
  for (let i = 0; i < 14; i++) { // 15 risers of 0.3 m down to the south
    const top = MZ.y - 0.3 - i * 0.3;
    ctx.box(-60, -56, 0, top, MZ.z1 + i * 0.4, MZ.z1 + (i + 1) * 0.4, 0xd9d6cf);
  }
  for (let x = -104; x <= -66; x += 3.4) {
    ctx.box(x - 1.3, x + 1.3, MZ.y, MZ.y + 0.75, -34.5, -33.5, DESKC);
    ctx.screen(x, MZ.y + 1.15, -33.6, 0, 1.0, 0.6, CH.CHART);
    ctx.npc(x, -32.5, COAT, Math.PI, MZ.y);
  }
  for (let x = -106; x <= -60; x += 1.3) ctx.box(x - 0.55, x + 0.55, MZ.y, MZ.y + 2.2, -38.6, -37.6, RACK); // racks on the gallery
  ctx.sign('Model Validation Gallery', -82, MZ.y + 3.4, MZ.z1, { size: 0.6 });
  // under the mezzanine: server racks
  for (const z of [-37.5, -34]) for (let x = -106; x <= -62; x += 1.3) {
    ctx.box(x - 0.55, x + 0.55, 0, 2.2, z - 0.5, z + 0.5, RACK);
    ctx.deco(x - 0.4, x + 0.4, 0.4, 2.0, z + 0.5, z + 0.52, (Math.round(x * 3) % 3) ? 0x3fe07a : 0x5ff2ff);
  }

  // ---- quants: lab coats at multi-monitor desks round the platform
  let quants = 0;
  const free = (x, z) => !(x > PLAT.x0 - 3.5 && x < PLAT.x1 + 3.5 && z > PLAT.z0 - 3.5 && z < PLAT.z1 + 3.5) && // platform + stairs
    !(x > PLAT.x1 && Math.abs(z) < 4) && // aisle from the portal
    !(x > -62 && z < -17) && z > -27.5; // mezzanine stair (+ its approach)
  for (let zz = -25; zz <= 35; zz += 5) {
    for (let x = -104; x <= -56; x += 3.3) {
      if (!free(x, zz) || (zz > 30 && x < -96)) continue;
      ctx.box(x - 1.3, x + 1.3, 0, 0.75, zz - 0.5, zz + 0.5, DESKC);
      for (let k = -1; k <= 1; k++) ctx.screen(x + k * 0.8, 1.15, zz - 0.4, 0, 0.75, 0.5, [CH.LOTTO, CH.CHART, CH.LOTTO][k + 1]);
      ctx.npc(x, zz + 1.0, COAT, Math.PI);
      quants++;
    }
  }
  // server racks near the windows (south-west corner) + standing analysts with clipboards
  for (const z of [32, 35.5]) for (let x = -107; x <= -98; x += 1.3) ctx.box(x - 0.55, x + 0.55, 0, 2.2, z - 0.5, z + 0.5, RACK);
  for (const [x, z] of [[-66, -7], [-66, 7], [-94, 14], [-94, -14], [-70, 22], [-90, 24], [-75, -20]]) ctx.npc(x, z, COAT, Math.atan2(C.x - x, C.z - z));
  for (const [x, z] of [[-60, -16], [-60, 16], [-106, -16], [-106, 22]]) { ctx.box(x - 0.6, x + 0.6, 0, 0.8, z - 0.6, z + 0.6, 0xb08a5a); ctx.deco(x - 0.5, x + 0.5, 0.8, 2.6, z - 0.5, z + 0.5, 0x3f9a4a); } // planters

  // ---- walls: draw results over the mezzanine, heat-map on the portal wall, signs
  ctx.screen(-82, 7.3, -38.9, 0, 40, 3.6, CH.LOTTO); // draw results (north wall, above the gallery)
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
    const v = Math.abs(Math.sin(i * 1.7 + j * 2.3));
    ctx.deco(-50.45, -50.35, 2.5 + j * 1.1, 3.5 + j * 1.1, 14 + i * 1.5, 15.4 + i * 1.5, v > 0.8 ? 0xd62839 : v > 0.55 ? 0xf28c28 : v > 0.3 ? 0xf6d55c : 0x3d8fd6);
  }
  ctx.sign('Probability Heat-Map — last two digits', -51.0, 9.2, 23, { size: 0.55, gold: false });
  ctx.sign('Probability Research Institute', -64, 8.9, 0, { size: 1.0, sub: `${quants} quants · 1 lottery · 0 doubts` });
  ctx.sign('Next draw: 1st & 16th · Results: Government Lottery Office (placeholder)', -82, 9.3, -38.4, { size: 0.5, gold: false });

  ctx.disposables.push(...disposables);
}
