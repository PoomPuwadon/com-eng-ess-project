// Character kit — procedural, stylised-caricature people for the firm (user-approved style, 2026-11-18):
// ~5 heads tall, chunky silhouette, painted faces (texture-swapped expressions), built from primitives.
// Each Character is a small rig: hips → torso → head, two-bone arms solved by IK (hand targets in torso
// space), two-bone legs. Poses set hand targets / leg modes; the walk cycle runs on top.
// This module is the SHOWCASE version (one mesh per part). The in-game version will bake the same
// shapes into instanced, GPU-animated crowds (see .claude/skills/character-style).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
export const D = { hipY: 0.9, legY: 0.86, hipX: 0.105, thigh: 0.43, shin: 0.37, H: 0.62, shY: 0.54, upper: 0.33, fore: 0.3, neckY: 0.58, headY: 0.64, headR: 0.17, depth: 0.66 };
export const HC = new V3(0, D.headR * 1.05, 0); // head centre in head-pivot space
export const HEAD_SY = 1.08;
const C8 = Math.cos(Math.PI / 8);
const BUILDS = { slim: [0.215, 0.158], avg: [0.24, 0.17], broad: [0.272, 0.18], heavy: [0.262, 0.225] };

// ---------------------------------------------------------------- materials & geometry caches
const mats = new Map();
export function mat(color, o = {}) {
  const key = [color, o.rough, o.metal, o.emissive, o.ei, o.side, o.opacity].join('|');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide });
    if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    mats.set(key, m);
  }
  return m;
}
export const gold = () => mat(0xd9ad3c, { rough: 0.28, metal: 0.95 });
export const texMat = (tex, o = {}) => new THREE.MeshStandardMaterial({ map: tex, flatShading: true, roughness: o.rough ?? 0.75 });

const geos = new Map();
const G = (key, make) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
// Level of detail used while building: 0 = full (showcase, player avatars), 1 = crowd (plain boxes,
// ~60 % sphere segments), 2 = far crowd (minimum segments). Set only around crowd baking.
export const LOD = { level: 0 };
const segC = (seg) => (LOD.level >= 2 ? Math.min(seg, 5) : seg);
export const cyl = (rt, rb, h, seg = 8, down = true) => { seg = segC(seg); return G(`cy${rt}|${rb}|${h}|${seg}|${down}`, () => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, down ? -h / 2 : h / 2, 0); return g; }); };
export const cylC = (rt, rb, h, seg = 10, axis = 'y') => { seg = segC(seg); return G(`cc${rt}|${rb}|${h}|${seg}|${axis}`, () => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); return g; }); };
export const rbox = (w, h, d, r = 0.02) => (LOD.level >= 1 ? box(w, h, d) : G(`rb${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.0005))));
export const box = (w, h, d) => G(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r, ws = 10, hs = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => {
  if (LOD.level === 1) { ws = Math.max(6, Math.round(ws * 0.6)); hs = Math.max(4, Math.round(hs * 0.6)); } else if (LOD.level >= 2) { ws = Math.min(ws, 5); hs = Math.min(hs, 3); }
  return G(`sp${r}|${ws}|${hs}|${ps}|${pl}|${ts}|${tl}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
};
export const torus = (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => { if (LOD.level >= 1) { rs = Math.min(rs, 4); ts = Math.min(ts, LOD.level >= 2 ? 6 : 8); } return G(`to${r}|${t}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)); };
export const plane = (w, h) => G(`pl${w}|${h}`, () => new THREE.PlaneGeometry(w, h));

export function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- painted faces
// The face is a transparent shell over the head sphere; u = 0.25 is the front (+z), so the canvas
// centre-front is x = 128 on a 512 x 256 canvas. One material per expression, shared by everyone.
export const EXPRESSIONS = ['neutral', 'smug', 'happy', 'shout', 'focus', 'panic', 'cry'];
const INK = '#1a1210';
const faceMats = new Map();
export function faceMat(expr) {
  let m = faceMats.get(expr);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, (g) => drawFace(g, expr)), alphaTest: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    faceMats.set(expr, m);
  }
  return m;
}
export function drawFace(g, e) {
  const cx = 128, ey = 116, dx = 30, my = 162;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (pts, w = 5, col = INK) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const ell = (x, y, rx, ry, col = INK) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const quad = (x0, y0, x1, y1, x2, y2, w = 5, col = INK) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke(); };
  const dotEyes = (ry = 9) => { for (const s of [-1, 1]) { ell(cx + s * dx, ey, 7, ry); ell(cx + s * dx + 2, ey - 3, 2.2, 2.2, '#fff'); } };
  const brows = (inner, outer, y = ey - 20) => { for (const s of [-1, 1]) line([[cx + s * (dx - 12), y + inner], [cx + s * (dx + 12), y + outer]]); };
  switch (e) {
    case 'smug':
      for (const s of [-1, 1]) { ell(cx + s * dx, ey + 2, 8, 5); line([[cx + s * (dx - 11), ey - 3], [cx + s * (dx + 11), ey - 4]], 4.5); }
      line([[cx - dx - 12, ey - 22], [cx - dx + 12, ey - 20]]);
      line([[cx + dx - 12, ey - 26], [cx + dx + 2, ey - 31], [cx + dx + 12, ey - 28]]);
      quad(cx - 18, my + 2, cx + 2, my + 6, cx + 20, my - 7);
      break;
    case 'happy':
      for (const s of [-1, 1]) quad(cx + s * dx - 10, ey + 3, cx + s * dx, ey - 11, cx + s * dx + 10, ey + 3);
      brows(-4, 0, ey - 24);
      g.fillStyle = INK; g.beginPath(); g.moveTo(cx - 20, my - 4); g.quadraticCurveTo(cx, my + 26, cx + 20, my - 4); g.closePath(); g.fill();
      ell(cx, my + 8, 8, 4, '#c0392b');
      break;
    case 'shout':
      dotEyes(7); brows(7, -4, ey - 18);
      ell(cx, my + 4, 16, 15); ell(cx, my + 12, 10, 5, '#c0392b');
      g.fillStyle = '#fff'; g.fillRect(cx - 11, my - 8, 22, 4);
      break;
    case 'focus':
      for (const s of [-1, 1]) ell(cx + s * dx, ey + 1, 7, 6);
      brows(4, 0, ey - 15); line([[cx - 10, my], [cx + 8, my - 1]], 4.5);
      break;
    case 'panic':
      for (const s of [-1, 1]) { ell(cx + s * dx, ey, 12, 13); ell(cx + s * dx, ey, 9.5, 10.5, '#fff'); ell(cx + s * dx, ey + 1, 3, 3); }
      brows(-10, 2, ey - 26);
      g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, my + 4, 7, 9, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#7fd3ff'; g.beginPath(); g.moveTo(cx + 62, ey - 36); g.quadraticCurveTo(cx + 73, ey - 16, cx + 62, ey - 12); g.quadraticCurveTo(cx + 51, ey - 16, cx + 62, ey - 36); g.fill();
      break;
    case 'cry':
      for (const s of [-1, 1]) { quad(cx + s * dx - 10, ey - 2, cx + s * dx, ey + 8, cx + s * dx + 10, ey - 2); line([[cx + s * dx, ey + 7], [cx + s * (dx + 3), ey + 52]], 6, '#58b8ff'); }
      brows(-8, 4, ey - 20);
      quad(cx - 16, my + 8, cx, my - 8, cx + 16, my + 8);
      break;
    default:
      dotEyes(); brows(0, 0); quad(cx - 12, my, cx, my + 4, cx + 12, my, 4.5);
  }
}
export function headPoint(lat, lon, k = 1) {
  const R = D.headR * k;
  return new V3(Math.sin(lon) * Math.cos(lat) * R, HC.y + Math.sin(lat) * R * HEAD_SY, Math.cos(lon) * Math.cos(lat) * R);
}

// ---------------------------------------------------------------- hair
export const HAIR_STYLES = ['slick', 'short', 'buzz', 'bob', 'long', 'bun', 'pony', 'afro', 'curly', 'bald'];
export function addHair(c, style, color) {
  if (!style || style === 'bald') return;
  const m = mat(color, { rough: 0.55, side: THREE.DoubleSide });
  const R = D.headR * 1.07;
  const g = new THREE.Group(); g.position.copy(HC); g.scale.set(1, HEAD_SY, 1); c.head.add(g);
  const part = (ts, tl, gap = 0, r = R) => add(g, sph(r, 14, 10, gap ? Math.PI / 2 + gap : 0, gap ? Math.PI * 2 - 2 * gap : Math.PI * 2, ts, tl), m);
  switch (style) {
    case 'slick': part(0, 1.05); part(1.05, 0.8, 1.2); add(g, rbox(0.2, 0.06, 0.12, 0.03), m, 0, R * 0.86, R * 0.3, -0.3); break;
    case 'short': part(0, 1.2); part(1.2, 0.55, 1.25); break;
    case 'buzz': part(0, 1.3, 0, D.headR * 1.025); break;
    case 'bob': part(0, 1.15); part(1.15, 1.0, 0.95); break;
    case 'long': part(0, 1.15); part(1.15, 1.3, 1.0); add(g, rbox(0.3, 0.32, 0.07, 0.03), m, 0, -0.2, -0.14); break;
    case 'bun': part(0, 1.2); part(1.2, 0.55, 1.25); add(g, sph(0.065, 8, 6), m, 0, R * 0.75, -R * 0.75); break;
    case 'pony': part(0, 1.2); part(1.2, 0.6, 1.25); add(g, cylC(0.04, 0.02, 0.26), m, 0, -0.05, -R - 0.04, 0.35); break;
    case 'afro': part(0, 1.12, 0, R * 1.3); part(1.12, 0.75, 1.3, R * 1.3); break;
    case 'curly': part(0, 1.15, 0, R * 1.12); part(1.15, 0.6, 1.25, R * 1.12); break;
  }
}

// ---------------------------------------------------------------- IK
const _d = new V3(), _p = new V3(), _u = new V3(), _e = new V3(), _f = new V3(), _q = new THREE.Quaternion(), DOWN = new V3(0, -1, 0);
export function solveArm(a, T, pole) {
  const S = a.upper.position, L1 = a.L1, L2 = a.L2;
  _d.copy(T).sub(S);
  const dist = Math.min(Math.max(_d.length(), Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.002);
  _d.normalize();
  const ang = Math.acos(THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, 0, -1);
  _p.normalize();
  _u.copy(_d).multiplyScalar(Math.cos(ang)).addScaledVector(_p, Math.sin(ang));
  a.upper.quaternion.setFromUnitVectors(DOWN, _u);
  _e.copy(S).addScaledVector(_u, L1);
  _f.copy(S).addScaledVector(_d, dist).sub(_e).normalize();
  _q.copy(a.upper.quaternion).invert();
  a.elbow.quaternion.setFromUnitVectors(DOWN, _f.applyQuaternion(_q));
}

// rifle carried at low ready (torso space): grip point + muzzle direction; the left hand holds the forend
export const RIFLE_GRIP = new V3(-0.13, 0.28, 0.22);
export const RIFLE_DIR = new V3(0.3, -0.25, 0.92).normalize();
const RIFLE_FORE = RIFLE_GRIP.clone().addScaledVector(RIFLE_DIR, 0.3).add(new V3(0, -0.03, 0));

// ---------------------------------------------------------------- poses (hand targets in torso space)
const _a = new V3(), _b = new V3();
const ss = (x) => x * x * (3 - 2 * x);
export const POSES = {
  idle(c, t, o) { o.R.y += Math.sin(t * 1.3) * 0.01; o.L.y += Math.sin(t * 1.3 + 1) * 0.01; o.hy = Math.sin(t * 0.4) * 0.3; },
  admin(c, t, o) { o.R.set(-0.06, 0.1, 0.27); o.L.set(0.06, 0.1, 0.27); o.pR.set(-1, -0.3, 0); o.pL.set(1, -0.3, 0); o.hy = Math.sin(t * 0.35) * 0.45; o.swing = false; },
  cigar(c, t, o) {
    const k = (t % 7) / 7; let s = k < 0.12 ? k / 0.12 : k < 0.32 ? 1 : k < 0.44 ? 1 - (k - 0.32) / 0.12 : 0; s = ss(s);
    o.R.copy(_a.set(-0.2, 0.26, 0.3)).lerp(_b.set(-0.05, 0.74, 0.26), s); o.pR.set(-1, -0.5, 0);
    o.L.set(c.sx - 0.07, 0.0, 0.11); o.pL.set(1, 0, -0.6);
    o.hp = -0.06 - s * 0.08; o.hy = Math.sin(t * 0.3) * 0.35 * (1 - s); o.swing = false;
  },
  phone(c, t, o) { o.R.set(-0.2, 0.8, 0.07); o.pR.set(-1, -0.6, 0.2); o.hy = Math.sin(t * 0.7) * 0.3; o.hp = 0.05; },
  shout(c, t, o) {
    const on = Math.sin(t * 0.8) > -0.4;
    o.R.set(-0.36 + Math.sin(t * 7) * 0.04, on ? 1.05 + Math.sin(t * 6) * 0.05 : 0.3, on ? 0.2 : 0.3); o.pR.set(-1, 0, 0);
    o.L.set(0.2, 0.8, 0.07); o.pL.set(1, -0.6, 0.2);
    o.bounce = on ? Math.abs(Math.sin(t * 5)) * 0.03 : 0; o.hy = Math.sin(t * 1.7) * 0.3; o.face = on ? 'shout' : 'focus';
  },
  twoPhones(c, t, o) {
    o.R.set(-0.2, 0.8, 0.07); o.pR.set(-1, -0.6, 0.2);
    o.L.set(0.22, 0.34 + Math.sin(t * 2) * 0.05, 0.38 + Math.sin(t * 1.3) * 0.04); o.pL.set(1, -0.5, -0.3);
    o.hy = 0.25 + Math.sin(t * 0.5) * 0.25; o.hp = 0.12;
  },
  headset(c, t, o) {
    o.R.set(-0.12, 0.74, 0.2); o.pR.set(-1, -0.5, 0);
    o.L.set(0.2, 0.28 + Math.sin(t * 2.3) * 0.06, 0.34 + Math.sin(t * 1.7) * 0.05); o.pL.set(1, -0.4, -0.4);
    o.face = Math.sin(t * 0.6) > 0 ? 'happy' : 'smug'; o.hy = Math.sin(t * 0.9) * 0.2;
  },
  clipboard(c, t, o) {
    o.L.set(0.06, 0.3, 0.3); o.pL.set(1, -0.5, 0);
    o.R.set(-0.03 + Math.sin(t * 7) * 0.02, 0.34 + Math.sin(t * 5) * 0.02, 0.33); o.pR.set(-1, -0.5, 0);
    const look = Math.sin(t * 0.5) > 0.3; o.hp = look ? -0.05 : 0.3; o.hy = look ? Math.sin(t * 0.4) * 0.4 : 0; o.swing = false;
  },
  tablet(c, t, o) { o.L.set(0.13, 0.28, 0.32); o.R.set(-0.1 + Math.sin(t * 1.5) * 0.04, 0.3, 0.33); o.pL.set(1, -0.5, 0); o.pR.set(-1, -0.5, 0); o.hp = 0.3; o.swing = false; },
  cross(c, t, o) { o.R.set(0.12, 0.34, 0.22); o.L.set(-0.12, 0.38, 0.25); o.pR.set(-1, -0.2, 0.6); o.pL.set(1, -0.2, 0.6); o.hy = Math.sin(t * 0.4) * 0.5; o.swing = false; },
  carry(c, t, o) { o.R.set(-0.17, 0.22, 0.33); o.L.set(0.17, 0.22, 0.33); o.pR.set(-1, -0.6, 0); o.pL.set(1, -0.6, 0); o.hp = 0.35; o.lean = 0.08; o.swing = false; },
  rifle(c, t, o) { o.R.copy(RIFLE_GRIP); o.L.copy(RIFLE_FORE); o.pR.set(-1, -0.6, -0.3); o.pL.set(0.4, -1, 0.1); o.hy = Math.sin(t * 0.5) * 0.5; o.swing = false; },
  fight(c, t, o) {
    o.legs = 'stance'; o.bounce = Math.abs(Math.sin(t * 4.2)) * 0.04;
    o.R.set(-0.13, 0.74, 0.26); o.L.set(0.13, 0.72, 0.3); o.pR.set(-1, -0.8, 0); o.pL.set(1, -0.8, 0);
    const j = Math.max(0, Math.sin(t * 1.9)) ** 8, k = Math.max(0, Math.sin(t * 1.9 + 2.2)) ** 8;
    o.L.z += j * 0.34; o.R.x += k * 0.12; o.R.z += k * 0.36; o.twist = (k - j) * 0.3; o.hp = 0.12; o.swing = false;
  },
  deal(c, t, o) { o.R.set(-0.15 + Math.sin(t * 3) * 0.05, 0.13, 0.42); o.L.set(0.15, 0.13, 0.42 + Math.sin(t * 2.4) * 0.04); o.pR.set(-1, -0.4, -0.3); o.pL.set(1, -0.4, -0.3); o.hp = 0.35; o.lean = 0.06; },
  ride(c, t, o) { o.legs = 'ride'; o.lean = 0.95; o.R.set(-0.1, 0.32, 0.42 + Math.sin(t * 9) * 0.04); o.L.set(0.1, 0.32, 0.42 + Math.sin(t * 9) * 0.04); o.pR.set(-1, -0.3, 0); o.pL.set(1, -0.3, 0); o.hp = -0.8; o.swing = false; },
  ref(c, t, o) { o.R.set(-0.24, 0.04, 0.02); o.L.set(0.24, 0.04, 0.02); o.pR.set(-1, 0.2, 0.3); o.pL.set(1, 0.2, 0.3); o.hy = Math.sin(t * 0.6) * 0.6; },
  drink(c, t, o) { o.R.set(-0.17, 0.3, 0.31); o.pR.set(-1, -0.5, -0.2); o.hy = Math.sin(t * 0.5) * 0.4; o.swing = false; },
  // ---- seated (hips at 0.48 m, thighs forward): typing at a desk
  sit(c, t, o) {
    o.legs = 'sit'; o.swing = false; o.hp = 0.28; o.hy = Math.sin(t * 0.3) * 0.15;
    o.R.set(-0.17, 0.2 + Math.sin(t * 11) * 0.012, 0.42); o.L.set(0.17, 0.2 + Math.sin(t * 13 + 1) * 0.012, 0.42);
    o.pR.set(-1, -0.6, -0.2); o.pL.set(1, -0.6, -0.2);
  },
  phoneSit(c, t, o) { POSES.sit(c, t, o); o.R.set(-0.2, 0.8, 0.07); o.pR.set(-1, -0.6, 0.2); o.hp = 0.05; o.face = Math.sin(t * 0.6) > 0 ? 'happy' : 'smug'; },
  shoutSit(c, t, o) { POSES.sit(c, t, o); const on = Math.sin(t * 0.7) > 0.2; if (on) { o.R.set(-0.34, 1.0 + Math.sin(t * 6) * 0.05, 0.2); o.pR.set(-1, 0, 0); o.face = 'shout'; o.hp = -0.05; } },
  // ---- crowd reactions / events
  cheer(c, t, o) {
    o.R.set(-0.33 + Math.sin(t * 8) * 0.05, 1.1, 0.12); o.L.set(0.33 + Math.sin(t * 8 + 1) * 0.05, 1.1, 0.12);
    o.pR.set(-1, 0, 0); o.pL.set(1, 0, 0); o.bounce = Math.abs(Math.sin(t * 7)) * 0.06; o.face = 'happy'; o.swing = false;
  },
  panic(c, t, o) { o.R.set(-0.17, 0.86, 0.2); o.L.set(0.17, 0.86, 0.2); o.pR.set(-1, -0.4, 0); o.pL.set(1, -0.4, 0); o.hy = Math.sin(t * 9) * 0.25; o.face = 'panic'; o.swing = false; },
  strike(c, t, o) { // baton swing (Kinetic Performance Feedback)
    const a = Math.sin(t * 8);
    o.R.set(-0.25, 0.62 + a * 0.32, 0.3 + Math.cos(t * 8) * 0.18); o.pR.set(-1, 0, -0.4); o.lean = 0.12 + a * 0.06; o.swing = false;
  },
};

// ---------------------------------------------------------------- the rig (bones only) — shared by Character and the crowd
/** Create the bone groups on `c` (root → body → torso → head; arms upper/elbow/grip; legs hip/knee). */
export function makeBones(c, spec = {}) {
  const [rt, rb] = BUILDS[spec.build || 'avg'];
  c.rt = rt; c.rb = rb; c.sx = rt + 0.035;
  c.slope = Math.atan(((rt - rb) * C8 * D.depth) / D.H);
  c.root = new THREE.Group(); c.body = new THREE.Group(); c.root.add(c.body);
  c.root.scale.setScalar(spec.scale || 1);
  c.torso = new THREE.Group(); c.torso.position.y = D.hipY; c.body.add(c.torso);
  c.head = new THREE.Group(); c.head.position.y = D.headY; c.torso.add(c.head);
  const arm = (side) => {
    const upper = new THREE.Group(); upper.position.set(side * c.sx, D.shY, 0); c.torso.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -D.upper; upper.add(elbow);
    const grip = new THREE.Group(); grip.position.y = -D.fore - 0.035; elbow.add(grip);
    return { side, upper, elbow, grip, hand: null, cur: new V3(side * (c.sx + 0.03), D.shY - 0.58, 0.06), L1: D.upper, L2: D.fore + 0.035 };
  };
  const leg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * D.hipX, D.legY, 0); c.body.add(hip);
    const knee = new THREE.Group(); knee.position.y = -D.thigh; hip.add(knee);
    return { side, hip, knee, foot: null };
  };
  c.armR = arm(-1); c.armL = arm(1); c.legR = leg(-1); c.legL = leg(1);
  c.pose = spec.pose || 'idle';
  c.expr = spec.face || 'neutral';
  c.t0 = Math.random() * 100; c.phase = 0; c.hp = 0; c.hy = 0; c.airborne = false;
  c.o = { R: new V3(), L: new V3(), pR: new V3(), pL: new V3() };
  return c;
}

/** Pose + walk-cycle the rig for this frame. speed in m/s (0 = standing). Returns the face to show. */
export function animateRig(c, dt, t, speed = 0, snap = false) {
  const o = c.o, sx = c.sx, tt = t + c.t0;
  o.R.set(-sx - 0.03, D.shY - 0.6, 0.06); o.L.set(sx + 0.03, D.shY - 0.6, 0.06);
  o.pR.set(-0.35, -0.2, -1); o.pL.set(0.35, -0.2, -1);
  o.lean = 0; o.twist = 0; o.hy = 0; o.hp = 0; o.bounce = 0; o.legs = 'stand'; o.swing = true; o.face = null;
  (POSES[c.pose] || POSES.idle)(c, tt, o);
  const air = c.airborne && o.legs === 'stand';
  const moving = speed > 0.1 && o.legs === 'stand' && !air;
  if (moving) c.phase += (dt * speed * Math.PI * 2) / (1.35 * c.root.scale.x);
  const ph = c.phase, sw = Math.sin(ph);
  if (moving && o.swing) { o.R.z += sw * 0.2; o.L.z -= sw * 0.2; o.R.y += Math.abs(sw) * 0.04; o.L.y += Math.abs(sw) * 0.04; }
  if (moving) { o.hy *= 0.3; o.twist += sw * 0.06; }
  if (air && o.swing) { o.R.set(-sx - 0.2, D.shY - 0.25, 0.1); o.L.set(sx + 0.2, D.shY - 0.25, 0.1); o.pR.set(-0.3, -1, -0.3); o.pL.set(0.3, -1, -0.3); }

  const { legL, legR } = c;
  let by = o.bounce;
  if (o.legs === 'ride') {
    for (const l of [legL, legR]) { l.hip.rotation.set(-1.25, 0, l.side * 0.42); l.knee.rotation.set(2.1, 0, 0); }
  } else if (o.legs === 'sit') {
    for (const l of [legL, legR]) { l.hip.rotation.set(-Math.PI / 2, 0, l.side * 0.05); l.knee.rotation.set(Math.PI / 2, 0, 0); }
    by -= D.hipY - 0.48;
  } else if (o.legs === 'stance') {
    legL.hip.rotation.set(-0.25, 0, 0.12); legR.hip.rotation.set(0.22, 0, -0.12);
    legL.knee.rotation.x = 0.3; legR.knee.rotation.x = 0.25; by -= 0.03;
  } else if (air) { // jump: knees tucked
    legL.hip.rotation.set(-0.7, 0, 0.05); legR.hip.rotation.set(-0.35, 0, -0.05);
    legL.knee.rotation.x = 1.2; legR.knee.rotation.x = 0.9;
  } else if (moving) {
    const k = Math.min(1, speed / 2.2) * 0.55 + 0.1;
    legL.hip.rotation.set(-sw * k, 0, 0); legR.hip.rotation.set(sw * k, 0, 0);
    legL.knee.rotation.x = 0.9 * k * Math.max(0, Math.cos(ph)); legR.knee.rotation.x = 0.9 * k * Math.max(0, -Math.cos(ph));
    by += 0.035 * Math.abs(Math.cos(ph));
  } else {
    for (const l of [legL, legR]) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.x = 0; }
  }
  c.body.position.y = by;
  c.torso.position.y = D.hipY + Math.sin(tt * 1.6) * 0.004;
  c.torso.rotation.set(o.lean, o.twist, 0);
  const k = snap ? 1 : 1 - Math.exp(-dt * 6);
  c.hy += (o.hy - c.hy) * k; c.hp += (o.hp - c.hp) * k;
  c.head.rotation.set(c.hp, c.hy, 0);
  const ka = snap ? 1 : 1 - Math.exp(-dt * 12);
  c.armR.cur.lerp(o.R, ka); c.armL.cur.lerp(o.L, ka);
  solveArm(c.armR, c.armR.cur, o.pR); solveArm(c.armL, c.armL.cur, o.pL);
  return o.face || c.expr;
}

// ---------------------------------------------------------------- the character (rig + meshes)
export class Character {
  static faceOverride = null;
  constructor(spec) {
    this.spec = spec;
    makeBones(this, spec);
    const rt = this.rt, rb = this.rb;
    const skin = (this.skinMat = mat(spec.skin ?? 0xd9a47f, { rough: 0.8 }));
    const top = spec.top || mat(0x555555), sleeves = spec.sleeves || top, fore = spec.fore || sleeves, hands = spec.hands || skin;
    const pants = spec.pants || mat(0x222226), thighs = spec.thighs || pants, shins = spec.shins || thighs, shoes = spec.shoes || mat(0x111111, { rough: 0.4 });

    add(this.torso, G(`torso${rt}|${rb}`, () => { const g = new THREE.CylinderGeometry(rt, rb, D.H, 8); g.rotateY(Math.PI / 8); g.translate(0, D.H / 2, 0); g.scale(1, 1, D.depth); return g; }), top);
    add(this.torso, G(`shcap${rt}`, () => { const g = new THREE.SphereGeometry(rt, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateY(Math.PI / 8); g.scale(1, 0.32, D.depth); g.translate(0, D.H, 0); return g; }), top);
    add(this.body, G(`pelvis${rb}`, () => { const g = new THREE.CylinderGeometry(rb, rb * 0.95, 0.18, 8); g.rotateY(Math.PI / 8); g.translate(0, -0.09, 0); g.scale(1, 1, D.depth); return g; }), pants, 0, D.hipY + 0.02, 0);
    add(this.torso, cyl(0.058, 0.064, 0.12, 8, false), skin, 0, D.neckY, 0);
    if (!spec.helmet) {
      add(this.head, sph(D.headR, 16, 12), skin, HC.x, HC.y, HC.z).scale.set(1, HEAD_SY, 1);
      this.faceMesh = add(this.head, sph(D.headR * 1.012, 16, 12), faceMat(spec.face || 'neutral'), HC.x, HC.y, HC.z);
      this.faceMesh.scale.set(1, HEAD_SY, 1); this.faceMesh.castShadow = false;
      if (LOD.level < 2) { // ears + nose (dropped on far crowd figures)
        for (const s of [-1, 1]) add(this.head, sph(0.036, 6, 5), skin, s * D.headR * 0.98, HC.y - 0.005, -0.01);
        add(this.head, sph(0.03, 6, 5), skin, ...headPoint(-0.13, 0, 0.98).toArray()).scale.set(0.9, 1, 1.1);
      }
      addHair(this, spec.hair, spec.hairColor ?? 0x1b1b1b);
    }
    for (const a of [this.armR, this.armL]) {
      if (LOD.level < 2) add(a.upper, sph(0.078, 8, 6), sleeves);
      add(a.upper, cyl(0.066, 0.058, D.upper), sleeves);
      add(a.elbow, cyl(0.058, 0.05, D.fore), fore);
      a.hand = add(a.grip, sph(0.062, 8, 6), hands);
    }
    for (const l of [this.legR, this.legL]) {
      add(l.hip, cyl(0.09, 0.074, D.thigh), thighs);
      add(l.knee, cyl(0.072, 0.06, D.shin + 0.02), shins);
      l.foot = add(l.knee, rbox(0.125, 0.085, 0.27, 0.035), shoes, 0, -D.shin - 0.02, 0.05);
    }
    if (spec.armor) armor(this, spec.armor);
    for (const fn of spec.extras || []) fn(this);
    this.update(0.016, 0, 0, true);
  }
  /** torso-front z at height y (torso space), optionally x off-centre */
  front(y, x = 0) {
    const r = this.rb + ((this.rt - this.rb) * y) / D.H, f = r * C8 * D.depth;
    return f * Math.sqrt(Math.max(0, 1 - (x / (r * 1.02)) ** 2));
  }
  /** put a mesh flat on the chest at (x, y), lifted by dz */
  onChest(mesh, x, y, dz = 0.006) { mesh.position.set(x, y, this.front(y, x) + dz); mesh.rotation.x = this.slope; this.torso.add(mesh); return mesh; }
  get tagY() { return D.hipY + D.headY + HC.y + D.headR * HEAD_SY + 0.22; }
  setFace(e) { if (this.faceMesh && this._face !== e) { this._face = e; this.faceMesh.material = faceMat(e); } }
  update(dt, t, speed = 0, snap = false) {
    const f = animateRig(this, dt, t, speed, snap);
    this.setFace(Character.faceOverride || f);
  }
}


// ---------------------------------------------------------------- sci-fi armour (Asset Protection; from the user's reference photo)
function chestLabelTex() {
  return canvasTex(512, 128, (g) => {
    g.fillStyle = '#0b0c0f'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#e8e8ea'; g.font = '800 46px "Segoe UI", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('ASSET PROTECTION', 92, 66);
    const tri = (x, y, s) => { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.9, y + s * 0.6); g.lineTo(x - s * 0.9, y + s * 0.6); g.closePath(); g.fill(); };
    g.fillStyle = '#e0262b'; tri(48, 52, 15); tri(32, 80, 15); tri(64, 80, 15);
  });
}
let _chestLabel;
export function armor(c, { trim = false, visor = 0xff3030, chief = false } = {}) {
  const plate = mat(0x15161a, { rough: 0.42, metal: 0.55 }), plate2 = mat(0x24262c, { rough: 0.5, metal: 0.4 }), g = gold();
  const vis = mat(0x050505, { emissive: visor, ei: 2.4, rough: 0.2 });
  const t = c.torso, accent = chief ? g : plate;
  const chestZ = c.front(0.4) - 0.03;
  add(t, rbox(c.rt * 1.9, 0.3, 0.16, 0.05), plate, 0, 0.4, chestZ);
  for (let i = 0; i < 3; i++) add(t, rbox(0.26 - i * 0.02, 0.07, 0.1, 0.025), plate2, 0, 0.2 - i * 0.075, c.front(0.2 - i * 0.075) - 0.02);
  add(t, rbox(c.rt * 1.7, 0.34, 0.14, 0.05), plate, 0, 0.38, -c.front(0.38) + 0.03);
  add(t, cyl(0.12, 0.13, 0.07, 8, false), plate2, 0, 0.6, 0);
  _chestLabel ??= new THREE.MeshStandardMaterial({ map: chestLabelTex(), roughness: 0.5 });
  add(t, plane(0.3, 0.075), _chestLabel, 0, 0.47, chestZ + 0.081).castShadow = false;
  if (trim || chief) {
    add(t, rbox(c.rt * 1.93, 0.025, 0.17, 0.01), g, 0, 0.555, chestZ);
    add(t, rbox(c.rt * 1.93, 0.025, 0.17, 0.01), g, 0, 0.25, chestZ);
    add(t, cylC(0.032, 0.032, 0.012, 12, 'z'), g, 0.15, 0.36, chestZ + 0.085);
  }
  for (const a of [c.armL, c.armR]) {
    const s = a.side;
    add(a.upper, rbox(0.22, 0.15, 0.25, 0.05), accent, s * 0.03, 0.02, 0, 0, 0, -s * 0.25);
    add(a.upper, rbox(0.19, 0.1, 0.22, 0.04), plate2, s * 0.05, -0.08, 0, 0, 0, -s * 0.35);
    if (trim) add(a.upper, rbox(0.225, 0.022, 0.255, 0.01), g, s * 0.035, 0.09, 0, 0, 0, -s * 0.25);
    add(a.elbow, cyl(0.086, 0.078, 0.22), plate, 0, -0.03, 0);
    add(a.elbow, cyl(0.09, 0.09, 0.025), trim || chief ? g : plate2, 0, -0.03, 0);
    a.hand.material = plate2; a.hand.scale.setScalar(1.2);
  }
  for (const l of [c.legL, c.legR]) {
    add(l.hip, rbox(0.16, 0.22, 0.1, 0.03), plate, 0, -0.15, 0.06);
    add(l.knee, rbox(0.12, 0.1, 0.1, 0.03), plate2, 0, -0.01, 0.07);
    add(l.knee, rbox(0.13, 0.24, 0.11, 0.03), plate, 0, -0.2, 0.04);
    l.foot.geometry = rbox(0.15, 0.12, 0.3, 0.04); l.foot.material = plate2; l.foot.position.y += 0.015;
  }
  add(c.body, G(`belt${c.rb}`, () => { const q = new THREE.CylinderGeometry(c.rb * 1.06, c.rb * 1.06, 0.07, 8); q.rotateY(Math.PI / 8); q.scale(1, 1, D.depth); return q; }), plate2, 0, D.hipY - 0.01, 0);
  for (const s of [-1, 1]) add(c.body, rbox(0.08, 0.09, 0.06, 0.015), plate, s * 0.15, D.hipY - 0.03, c.rb * D.depth * 0.8);
  // helmet
  const h = c.head;
  add(h, sph(D.headR * 1.2, 12, 9), plate, HC.x, HC.y, HC.z).scale.set(1, 1.05, 1.1);
  const v = add(h, sph(D.headR * 1.215, 14, 6, Math.PI / 2 - 0.85, 1.7, 1.25, 0.5), vis, HC.x, HC.y, HC.z); v.scale.set(1, 1.05, 1.1); v.castShadow = false;
  add(h, rbox(0.2, 0.1, 0.12, 0.03), plate2, 0, HC.y - 0.13, 0.13);
  for (const s of [-1, 1]) add(h, cylC(0.07, 0.07, 0.06, 10, 'x'), plate2, s * 0.2, HC.y, -0.01);
  add(h, rbox(0.05, 0.07, 0.32, 0.02), trim || chief ? g : plate2, 0, HC.y + 0.2, -0.01);
  add(h, sph(0.018, 6, 4), mat(0x000000, { emissive: 0xffb020, ei: 3 }), 0.1, HC.y + 0.14, 0.15);
  add(h, box(0.012, 0.13, 0.012), plate2, -0.17, HC.y + 0.17, -0.05);
}
export function rifle(c) {
  const r = new THREE.Group(), m = mat(0x1c1d21, { rough: 0.45, metal: 0.6 }), m2 = mat(0x2c2e33, { rough: 0.6, metal: 0.3 });
  add(r, rbox(0.07, 0.12, 0.52, 0.02), m, 0, 0.03, 0.1);
  add(r, box(0.035, 0.035, 0.34), m2, 0, 0.05, 0.52);
  add(r, rbox(0.06, 0.13, 0.24, 0.02), m2, 0, 0.0, -0.28);
  add(r, box(0.05, 0.16, 0.08), m2, 0, -0.1, 0.16, 0.25);
  add(r, box(0.045, 0.11, 0.05), m2, 0, -0.06, -0.02, -0.2);
  add(r, rbox(0.05, 0.05, 0.2, 0.015), m, 0, 0.12, 0.08);
  add(r, box(0.012, 0.012, 0.18), mat(0x000000, { emissive: 0x39d0ff, ei: 2 }), 0.037, 0.04, 0.2);
  r.position.copy(RIFLE_GRIP).add(new V3(0, 0.05, 0));
  r.quaternion.setFromUnitVectors(new V3(0, 0, 1), RIFLE_DIR);
  c.torso.add(r);
  c.pose = 'rifle';
}

// ---------------------------------------------------------------- floating tags
export function makeTag(lines, o = {}) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true, sizeAttenuation: !o.screen }));
  s.center.set(0.5, 0);
  if (o.screen) s.renderOrder = 999;
  const ps = o.ps ?? 0.0042, fam = '"Segoe UI", Inter, Arial, sans-serif', pad = o.pad ?? 14, gap = 5;
  s.userData.set = (ls) => {
    let w = 0, hh = 0;
    for (const l of ls) { g.font = `${l.w ?? 700} ${l.px}px ${fam}`; w = Math.max(w, g.measureText(l.t).width); hh += l.px + gap; }
    const W = Math.ceil(w + pad * 2), H = Math.ceil(hh - gap + pad * 2);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; tex.dispose(); }
    g.clearRect(0, 0, W, H);
    if (o.bg) {
      g.fillStyle = o.bg; g.beginPath(); g.roundRect(2, 2, W - 4, H - 4, o.radius ?? 12); g.fill();
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = 3; g.stroke(); }
    }
    let y = pad; g.textAlign = 'center'; g.textBaseline = 'top';
    for (const l of ls) { g.font = `${l.w ?? 700} ${l.px}px ${fam}`; g.fillStyle = l.c ?? '#fff'; g.fillText(l.t, W / 2, y); y += l.px + gap; }
    tex.needsUpdate = true;
    s.scale.set(W * ps, H * ps, 1);
  };
  s.userData.set(lines);
  return s;
}

// ---------------------------------------------------------------- Autonomous Liquidity Courier (cash robot)
export class Robot {
  constructor(amount = 250000) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const black = mat(0x0d0d10, { rough: 0.25, metal: 0.6 }), g = gold(), rubber = mat(0x151515, { rough: 0.9 });
    add(this.body, rbox(0.78, 0.6, 1.02, 0.12), black, 0, 0.52, 0);
    add(this.body, rbox(0.8, 0.05, 1.04, 0.02), g, 0, 0.3, 0);
    add(this.body, rbox(0.8, 0.05, 1.04, 0.02), g, 0, 0.74, 0);
    add(this.body, rbox(0.56, 0.06, 0.74, 0.03), g, 0, 0.84, 0);
    for (const s of [-1, 1]) {
      add(this.body, cylC(0.11, 0.11, 0.03, 16, 'x'), g, s * 0.395, 0.52, -0.12);
      add(this.body, cylC(0.035, 0.035, 0.06, 8, 'x'), black, s * 0.41, 0.52, -0.12);
      for (let k = 0; k < 3; k++) add(this.body, box(0.016, 0.21, 0.016), g, s * 0.42, 0.52, -0.12, (k * Math.PI) / 3);
    }
    const face = canvasTex(256, 150, (q, w, h) => {
      q.fillStyle = '#040807'; q.fillRect(0, 0, w, h);
      q.strokeStyle = '#ffd46b'; q.lineWidth = 12; q.lineCap = 'round'; q.shadowColor = '#ffb020'; q.shadowBlur = 16;
      for (const x of [80, 176]) { q.beginPath(); q.arc(x, 78, 26, Math.PI * 1.1, Math.PI * 1.9); q.stroke(); }
      q.lineWidth = 8; q.beginPath(); q.arc(128, 92, 30, Math.PI * 0.2, Math.PI * 0.8); q.stroke();
    });
    add(this.body, plane(0.56, 0.33), new THREE.MeshBasicMaterial({ map: face }), 0, 0.53, 0.512).castShadow = false;
    this.wheels = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = add(this.root, cylC(0.14, 0.14, 0.1, 14, 'x'), rubber, sx * 0.36, 0.14, sz * 0.34);
      add(w, box(0.105, 0.2, 0.04), g);
      this.wheels.push(w);
    }
    this.beacon = add(this.body, sph(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffa000, emissiveIntensity: 2 }), 0, 0.9, -0.2);
    this.tag = makeTag([{ t: 'IN TRANSIT', px: 18, c: '#a8ffd8' }, { t: '$' + amount.toLocaleString('en-US'), px: 40, c: '#ffd46b' }], { bg: 'rgba(8,10,12,.78)', border: '#d9ad3c', ps: 0.006 });
    this.tag.position.y = 1.2; this.root.add(this.tag);
  }
  update(dt, t, speed = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.14;
    this.beacon.material.emissiveIntensity = 1.6 + Math.sin(t * 6) * 1.2;
    this.body.position.y = speed > 0.1 ? Math.abs(Math.sin(t * 14)) * 0.008 : 0;
    this.tag.position.y = 1.2 + Math.sin(t * 2) * 0.04;
  }
}

// ---------------------------------------------------------------- racehorse (faces +z)
export class Horse {
  constructor({ coat = 0x6b3a1f, dark = 0x1e1410, cloth = 0x1d3f8f, number = 7 } = {}) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const cm = mat(coat, { rough: 0.6 }), dm = mat(dark, { rough: 0.7 });
    add(this.body, rbox(0.48, 0.52, 1.25, 0.2), cm, 0, 1.15, 0);
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.28, 0.5); this.body.add(this.neck);
    add(this.neck, rbox(0.22, 0.64, 0.3, 0.1), cm, 0, 0.28, 0);
    add(this.neck, rbox(0.06, 0.6, 0.08, 0.02), dm, 0, 0.3, -0.15);
    add(this.neck, rbox(0.2, 0.22, 0.52, 0.08), cm, 0, 0.6, 0.2, 0.05);
    for (const s of [-1, 1]) {
      add(this.neck, cylC(0.03, 0.0, 0.1, 5), cm, s * 0.06, 0.76, 0.02);
      add(this.neck, sph(0.022, 6, 4), mat(0x050505), s * 0.1, 0.66, 0.24);
    }
    this.tail = new THREE.Group(); this.tail.position.set(0, 1.32, -0.62); this.body.add(this.tail);
    add(this.tail, cyl(0.06, 0.03, 0.6), dm);
    add(this.body, rbox(0.52, 0.3, 0.44, 0.02), mat(cloth, { rough: 0.8 }), 0, 1.3, -0.02);
    const num = canvasTex(128, 128, (q) => { q.fillStyle = '#fff'; q.fillRect(14, 14, 100, 100); q.fillStyle = '#111'; q.font = '800 76px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(String(number), 64, 68); });
    for (const s of [-1, 1]) add(this.body, plane(0.18, 0.18), texMat(num), s * 0.262, 1.28, -0.02, 0, (s * Math.PI) / 2, 0).castShadow = false;
    add(this.body, rbox(0.3, 0.08, 0.36, 0.03), mat(0x4a2c16, { rough: 0.5 }), 0, 1.44, -0.02);
    this.legs = [];
    [[-1, 1, 0], [1, 1, 0.5], [-1, -1, 0.25], [1, -1, 0.75]].forEach(([sx, sz, off]) => {
      const up = new THREE.Group(); up.position.set(sx * 0.15, 0.95, sz * 0.45); this.body.add(up);
      add(up, cyl(0.075, 0.06, 0.48), cm);
      const lo = new THREE.Group(); lo.position.y = -0.48; up.add(lo);
      add(lo, cyl(0.048, 0.042, 0.42), dm);
      add(lo, rbox(0.09, 0.07, 0.11, 0.02), mat(0x111111), 0, -0.43, 0.01);
      this.legs.push({ up, lo, off: off * Math.PI * 2, front: sz > 0 });
    });
    this.saddleY = 1.48; this.phase = 0;
  }
  update(dt, t, speed = 0) {
    const gait = Math.min(1, speed / 3);
    this.phase += dt * (2 + speed * 2.2);
    const p = this.phase;
    for (const l of this.legs) {
      const a = p + l.off;
      l.up.rotation.x = Math.sin(a) * 0.65 * gait;
      l.lo.rotation.x = (l.front ? -1 : 1) * Math.max(0, Math.sin(a + 1)) * 0.9 * gait;
    }
    this.body.position.y = Math.abs(Math.sin(p)) * 0.07 * gait;
    this.body.rotation.x = Math.sin(p) * 0.04 * gait;
    this.neck.rotation.x = 0.65 + Math.sin(p) * 0.1 * gait;
    this.tail.rotation.x = 0.6 + gait * 0.5 + Math.sin(p * 2) * 0.1;
  }
}
