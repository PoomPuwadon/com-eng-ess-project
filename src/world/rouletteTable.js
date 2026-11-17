import * as THREE from 'three';
import { WHEEL, RED, GW, GH, chipsFor, drawLayout, numberCentre } from '../apps/rouletteBoard.js';

// A fully modelled Rotational Variance Instrument, built over one of the VT-01 tables when a player
// sits down (the other 50 tables keep their cheap instanced rotor). Dimensions in metres, relative to
// the table: the wheel sits in the mahogany bowl at the table's end (wx), the layout on the felt.
//
// Wheel profile (radius r, height y above the floor slab):
//   bowl rim 0.64 → ball track (maple, r 0.575, y ≈ 0.975) → cone with 8 diamond deflectors
//   (r 0.565 → 0.45) → rotor (r 0.44, top 0.9355): pockets r 0.30–0.40, number ring 0.40–0.44 → turret.
// Angle convention: a point at angle a is (cos a, sin a) in world (x, z). A rotor turned by θ shows its
// local angle a at world angle a − θ. Pocket i of WHEEL sits at local angle i · 2π/37.

const STEP = (Math.PI * 2) / 37;
const R = { rim: 0.64, track: 0.572, coneOut: 0.565, coneIn: 0.45, rotor: 0.44, numIn: 0.40, pocketIn: 0.30, pocket: 0.352, ball: 0.011 };
const Y = { rimTop: 1.005, track: 0.975, coneOut: 0.97, coneIn: 0.945, rotorTop: 0.9355 };
const LAYOUT = { w: 1.93, cx: 0.585, y: 0.872 }; // layout width (m), centre offset from the table centre, height
LAYOUT.h = (LAYOUT.w * GH) / GW;

let shared = null; // geometries + materials shared by every live table
function sharedAssets() {
  if (shared) return shared;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // rotor face: pockets + number ring
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'), cx = 512, px = 512 / R.rotor;
  g.fillStyle = '#4a2412'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 37; i++) {
    const n = WHEEL[i], col = n === 0 ? '#0e8a47' : RED.has(n) ? '#b8101c' : '#151517';
    const a0 = i * STEP - STEP / 2, a1 = a0 + STEP;
    g.fillStyle = col;
    g.beginPath(); g.arc(cx, cx, R.rotor * px, a0, a1); g.arc(cx, cx, R.pocketIn * px, a1, a0, true); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.10)'; // pocket floor highlight
    g.beginPath(); g.arc(cx, cx, R.numIn * px - 6, a0 + 0.01, a1 - 0.01); g.arc(cx, cx, R.pocketIn * px + 6, a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
    g.save(); g.translate(cx, cx); g.rotate(i * STEP + Math.PI / 2);
    g.fillStyle = '#fff'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 0, -((R.numIn + R.rotor) / 2) * px);
    g.restore();
  }
  g.strokeStyle = '#d9b25a'; g.lineWidth = 5; // number-ring separator + rotor edge
  g.beginPath(); g.arc(cx, cx, R.numIn * px, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cx, R.rotor * px - 3, 0, Math.PI * 2); g.stroke();
  const rotorTex = new THREE.CanvasTexture(c); rotorTex.colorSpace = THREE.SRGBColorSpace; rotorTex.anisotropy = 8;
  // chip face: white edge spots, tinted per instance
  const cc = document.createElement('canvas'); cc.width = cc.height = 128;
  const h = cc.getContext('2d');
  h.fillStyle = '#ffffff'; h.fillRect(0, 0, 128, 128);
  h.fillStyle = '#d8d8d8'; h.beginPath(); h.arc(64, 64, 40, 0, Math.PI * 2); h.fill();
  h.fillStyle = '#ffffff'; h.beginPath(); h.arc(64, 64, 34, 0, Math.PI * 2); h.fill();
  for (let k = 0; k < 8; k++) { h.save(); h.translate(64, 64); h.rotate((k * Math.PI) / 4); h.fillStyle = '#f4f4f4'; h.fillRect(-7, -64, 14, 18); h.restore(); }
  const chipTex = new THREE.CanvasTexture(cc); chipTex.colorSpace = THREE.SRGBColorSpace;

  shared = {
    mat: {
      mahogany: std({ color: 0x5a2416, roughness: 0.28, metalness: 0.08, side: THREE.DoubleSide }),
      maple: std({ color: 0xc89a62, roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide }),
      chrome: std({ color: 0xe8e8ee, roughness: 0.12, metalness: 1.0 }),
      gold: std({ color: 0xd9a441, roughness: 0.25, metalness: 0.95 }),
      rotor: std({ map: rotorTex, roughness: 0.35, metalness: 0.05 }),
      ball: std({ color: 0xfbfbf6, roughness: 0.12, metalness: 0.0 }),
      felt: std({ color: 0x125c3a, roughness: 0.97 }),
      chip: std({ map: chipTex, roughness: 0.45, metalness: 0.02 }),
      dolly: std({ color: 0xf0d18a, roughness: 0.15, metalness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.4 }),
    },
    geo: {
      bowl: lathe([[R.rim, 0.80], [R.rim + 0.01, 0.99], [R.rim, Y.rimTop], [R.rim - 0.035, Y.rimTop + 0.004], [0.595, Y.rimTop - 0.004]]),
      track: lathe([[0.596, Y.rimTop - 0.004], [0.584, Y.track + 0.006], [R.track, Y.track], [R.coneOut, Y.coneOut], [R.coneIn, Y.coneIn], [R.coneIn - 0.004, Y.rotorTop - 0.01]]),
      rotorBody: new THREE.CylinderGeometry(R.rotor, R.rotor - 0.01, 0.03, 72),
      rotorFace: new THREE.CircleGeometry(R.rotor, 96).rotateX(-Math.PI / 2),
      fret: new THREE.BoxGeometry(R.numIn - R.pocketIn, 0.012, 0.004),
      dome: lathe([[R.pocketIn, Y.rotorTop], [0.26, Y.rotorTop + 0.012], [0.18, Y.rotorTop + 0.03], [0.10, Y.rotorTop + 0.045], [0.04, Y.rotorTop + 0.05], [0.0, Y.rotorTop + 0.05]]),
      ring: new THREE.TorusGeometry(R.pocketIn, 0.006, 8, 72).rotateX(Math.PI / 2),
      deflector: new THREE.OctahedronGeometry(0.02, 0),
      spindle: new THREE.CylinderGeometry(0.018, 0.026, 0.09, 16),
      arm: new THREE.CylinderGeometry(0.007, 0.007, 0.15, 10).rotateZ(Math.PI / 2),
      knob: new THREE.SphereGeometry(0.014, 14, 10),
      ball: new THREE.SphereGeometry(R.ball, 20, 14),
      felt: new THREE.PlaneGeometry(2.3, 1.3).rotateX(-Math.PI / 2),
      layout: new THREE.PlaneGeometry(LAYOUT.w, LAYOUT.h),
      chip: new THREE.CylinderGeometry(0.021, 0.021, 0.0065, 28),
      dolly: new THREE.CylinderGeometry(0.010, 0.016, 0.05, 16),
    },
  };
  return shared;
}

const coneY = (r) => Y.coneIn + ((r - R.coneIn) / (R.coneOut - R.coneIn)) * (Y.coneOut - Y.coneIn);
function surfaceY(r) {
  if (r >= R.coneOut) return Y.track + (r - R.track) * 0.6;
  if (r >= R.coneIn) return coneY(r);
  if (r >= R.rotor) return Y.coneIn - ((R.coneIn - r) / (R.coneIn - R.rotor)) * (Y.coneIn - Y.rotorTop);
  return Y.rotorTop;
}
const ease = (s, p) => 1 - (1 - s) ** p;

/**
 * Build a live table. t = { tx, z, flip, wx, e } (table centre x, z, which side the players sit on,
 * wheel x, floor elevation). Returns an object with update/spin/stack helpers and dispose().
 */
export function buildLiveTable(t) {
  const { mat, geo } = sharedAssets();
  const root = new THREE.Group();
  root.name = 'live-roulette-table';
  const mesh = (gm, m, parent = root) => { const o = new THREE.Mesh(gm, m); parent.add(o); return o; };

  // ---------------------------------------------------------------- the wheel
  // +3 cm: the static table's mahogany wheel well has a solid top at 0.95 m; the live rotor must sit above it
  const wheel = new THREE.Group(); wheel.position.set(t.wx, t.e + 0.03, t.z); root.add(wheel);
  mesh(geo.bowl, mat.mahogany, wheel);
  mesh(geo.track, mat.maple, wheel);
  const defl = new THREE.InstancedMesh(geo.deflector, mat.chrome, 8);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, r = 0.508;
    q.setFromEuler(e3.set(0, -a + (k % 2 ? Math.PI / 2 : 0), 0));
    defl.setMatrixAt(k, m4.compose(v3.set(Math.cos(a) * r, coneY(r) + 0.007, Math.sin(a) * r), q, s3.set(1.5, 0.45, 0.7)));
  }
  wheel.add(defl);
  const rotor = new THREE.Group(); wheel.add(rotor);
  mesh(geo.rotorBody, mat.mahogany, rotor).position.y = Y.rotorTop - 0.016;
  mesh(geo.rotorFace, mat.rotor, rotor).position.y = Y.rotorTop + 0.0005;
  const frets = new THREE.InstancedMesh(geo.fret, mat.chrome, 37);
  for (let i = 0; i < 37; i++) {
    const b = i * STEP + STEP / 2, rm = (R.numIn + R.pocketIn) / 2;
    q.setFromEuler(e3.set(0, -b, 0));
    frets.setMatrixAt(i, m4.compose(v3.set(Math.cos(b) * rm, Y.rotorTop + 0.006, Math.sin(b) * rm), q, s3.set(1, 1, 1)));
  }
  rotor.add(frets);
  mesh(geo.dome, mat.mahogany, rotor);
  mesh(geo.ring, mat.gold, rotor).position.y = Y.rotorTop + 0.004;
  mesh(geo.spindle, mat.gold, rotor).position.y = Y.rotorTop + 0.09;
  for (let k = 0; k < 4; k++) {
    const arm = mesh(geo.arm, mat.gold, rotor); arm.position.y = Y.rotorTop + 0.115; arm.rotation.y = (k * Math.PI) / 4;
    for (const sgn of [-1, 1]) { const kn = mesh(geo.knob, mat.gold, rotor); const a = (k * Math.PI) / 4; kn.position.set(Math.cos(a) * 0.075 * sgn, Y.rotorTop + 0.115, -Math.sin(a) * 0.075 * sgn); }
  }
  mesh(geo.knob, mat.gold, rotor).position.y = Y.rotorTop + 0.14;
  const ball = mesh(geo.ball, mat.ball, wheel);

  // ---------------------------------------------------------------- felt + layout
  const felt = mesh(geo.felt, mat.felt); felt.position.set(t.tx + 0.35, t.e + LAYOUT.y - 0.0015, t.z);
  const lg = new THREE.Group(); // layout frame: x along the board, -z = far edge (players sit at +z)
  lg.position.set(t.tx + LAYOUT.cx, t.e + LAYOUT.y, t.z);
  if (t.flip) { lg.rotation.y = Math.PI; lg.position.x = t.tx + LAYOUT.cx; }
  root.add(lg);
  const layoutCanvas = document.createElement('canvas');
  drawLayout(layoutCanvas, { pixelWidth: 2048 });
  const layoutTex = new THREE.CanvasTexture(layoutCanvas); layoutTex.colorSpace = THREE.SRGBColorSpace; layoutTex.anisotropy = 8;
  const layoutMat = new THREE.MeshStandardMaterial({ map: layoutTex, roughness: 0.95 });
  const layout = new THREE.Mesh(geo.layout, layoutMat); layout.rotation.x = -Math.PI / 2; lg.add(layout);
  const boardToLocal = (bx, by) => new THREE.Vector3((bx / GW - 0.5) * LAYOUT.w, 0, (by / GH - 0.5) * LAYOUT.h);

  const chips = new THREE.InstancedMesh(geo.chip, mat.chip, 800);
  chips.count = 0; chips.frustumCulled = false; lg.add(chips);
  const col = new THREE.Color();
  const dolly = mesh(geo.dolly, mat.dolly, lg); dolly.visible = false;

  /** stacks: [{ ax, ay, amount, offset? }] — one chip column per position (+ payouts beside winners). */
  function setStacks(stacks) {
    let n = 0;
    for (const st of stacks) {
      const p = boardToLocal(st.ax, st.ay);
      if (st.offset) p.x += st.offset[0], p.z += st.offset[1];
      chipsFor(st.amount).forEach((c, k) => {
        if (n >= 800) return;
        const jitter = ((k * 37) % 5) * 0.0006;
        chips.setMatrixAt(n, m4.compose(v3.set(p.x + jitter, 0.0035 + k * 0.0067, p.z - jitter), q.identity(), s3.set(1, 1, 1)));
        chips.setColorAt(n, col.set(c));
        n++;
      });
    }
    chips.count = n;
    chips.instanceMatrix.needsUpdate = true;
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  }
  function setLayout(hover, winning) {
    drawLayout(layoutCanvas, { pixelWidth: 2048, hover, winning });
    layoutTex.needsUpdate = true;
    if (winning == null) { dolly.visible = false; return; }
    const [bx, by] = numberCentre(winning);
    dolly.position.copy(boardToLocal(bx, by)).setY(0.026);
    dolly.visible = true;
  }

  // ---------------------------------------------------------------- motion
  const st = { theta: Math.random() * 6.28, omega: 0.35, rel: 0, spin: null, idleOmega: 0.35 };
  st.rel = Math.floor(Math.random() * 37) * STEP;
  function placeBall(rel, r, y) {
    const a = rel - st.theta;
    ball.position.set(Math.cos(a) * r, y + R.ball, Math.sin(a) * r);
  }
  placeBall(st.rel, R.pocket, Y.rotorTop);

  /**
   * Launch the ball and land it in `pocket` (decided by the server before the launch).
   * Phases: on the track (decelerating) → leaves the track, spirals down the cone, clips a deflector
   * → rattles across a few frets → settles and rides the rotor. The relative path is solved so the
   * final pocket is exact; everything else is cosmetic.
   */
  function spin(pocket, { seconds = 8.2 } = {}) {
    const target = WHEEL.indexOf(pocket) * STEP;
    const T3 = seconds, T1 = T3 * 0.6, T2 = T3 * 0.8;
    const rel0 = st.rel;
    let d = (target - rel0) % (Math.PI * 2); if (d < 0) d += Math.PI * 2;
    const D = d + Math.PI * 2 * 15; // ~15 laps relative to the rotor
    st.omega = 1.2; // the croupier gives the rotor a push
    return new Promise((resolve) => { st.spin = { t: 0, T1, T2, T3, rel0, D, resolve }; });
  }

  function update(dt) {
    st.omega += (st.idleOmega - st.omega) * (1 - Math.exp(-dt / 7)); // the rotor slowly loses speed
    st.theta += st.omega * dt;
    rotor.rotation.y = st.theta;
    const s = st.spin;
    if (!s) { placeBall(st.rel, R.pocket, Y.rotorTop); return; }
    s.t += dt;
    const t = Math.min(s.t, s.T3);
    let rel = s.rel0 + s.D * ease(t / s.T3, 2.6);
    let r, y;
    if (t < s.T1) { r = R.track; y = surfaceY(r); }
    else if (t < s.T2) {
      const u = (t - s.T1) / (s.T2 - s.T1);
      r = R.track - (R.track - (R.rotor - 0.03)) * u * u;
      const hit = Math.exp(-(((u - 0.55) / 0.07) ** 2)); // the deflector
      r += 0.018 * hit;
      y = surfaceY(r) + 0.022 * hit;
    } else {
      const u = (t - s.T2) / (s.T3 - s.T2), decay = (1 - u) ** 2;
      rel += 0.32 * Math.sin(Math.PI * 2 * 2.5 * u) * decay; // rattling across neighbouring pockets
      r = R.pocket + 0.045 * Math.abs(Math.cos(Math.PI * 2.5 * u)) * (1 - u);
      y = Y.rotorTop + 0.022 * Math.abs(Math.sin(Math.PI * 2.5 * u)) * decay;
    }
    placeBall(rel, r, y);
    if (s.t >= s.T3) {
      st.rel = s.rel0 + s.D; st.spin = null;
      placeBall(st.rel, R.pocket, Y.rotorTop);
      s.resolve();
    }
  }

  return {
    root, layout, update, spin, setStacks, setLayout, spinning: () => Boolean(st.spin),
    wheelCentre: () => new THREE.Vector3(t.wx, t.e + 0.95, t.z),
    ballWorld: () => ball.getWorldPosition(new THREE.Vector3()),
    dispose() { root.removeFromParent(); layoutTex.dispose(); layoutMat.dispose(); chips.dispose(); defl.dispose(); frets.dispose(); },
  };
}
