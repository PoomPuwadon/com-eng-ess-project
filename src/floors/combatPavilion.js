import * as THREE from 'three';
import { Lux, LM, plaque, graniteTex } from '../world/lux.js';
import { luxLiftHall } from './luxHall.js';
import { PAV, arcs, pavilionShape } from './pavilion.js';
import { FC, buildFightScreens, updateFightScreens } from '../world/fightScreens.js';

// ================================================================= PHASE 1 — VT-03 COMBAT SPORTS ANALYTICS PAVILION
// Rebuilt from scratch to the user's reference photo (a packed Muay Thai stadium under a glowing red-gold
// sak yant dome; a jagged lit truss crown at the dome's edge; beams of white, blue and green light on a
// blue-lit ring; LED light towers round the rim; an ornate gold Thai gate with big screens over the fighters'
// entrance; gold-lit skyboxes). The greybox (pavilion.js) is only the placement guide: its layout data (PAV)
// and its walkable height field (pavilionShape) are reused, so collisions are unchanged.
// World coords: ring centre (120, 0); heights relative to the slab (Y 67); H = 25.

const { C, RING, RS, LOW, XA, UP, BACK, CONC, OUTER, VOMS, VOM_HALF, AISLE_HALF, WALK_HALF, ENTRY, STAIRS, CORRIDOR_Z, BACKSTAGE_X, FOCUS, lowTop, upTop } = PAV;
const TAU = Math.PI * 2;
const RO = OUTER.r0 + 0.3; // outer wall (inner face)
const DOME_R = RO, CONC_CEIL = CONC.y + 4.5, SKY = { y0: 12.1, y1: 13.8, top: BACK.top + 0.2 };
const P = (r, a, y = 0) => [C.x + r * Math.cos(a), y, C.z + r * Math.sin(a)];
const yawIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a));
const halfAng = (hw, r) => Math.asin(Math.min(0.99, hw / r));
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a, v) => a[Math.floor(v * a.length) % a.length];
const WALK_GAP = { a: 0, hw: WALK_HALF };
const vomGaps = (hw) => VOMS.map((a) => ({ a, hw }));
const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48c];
const HAIR = [0x111111, 0x2a1a10, 0x3a2a1a, 0x5a3a20, 0x111111];
const SHIRT = [0x1c1c22, 0x2a2a2a, 0xe8e4da, 0x1c1c22, 0x3a3f4a, 0x8a1c2b, 0x2b3a67, 0x111111, 0xd8d2c4, 0x4a3a2a, 0xb3172a, 0x23302a]; // mostly dark + white, a few colours (night crowd)

// ---------------------------------------------------------------- materials
let READY = false;
function initMaterials() {
  if (READY) return;
  READY = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const canvasT = (w, h, draw, repeat = false) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  // ring canvas: royal blue, faint gold Thai border, centre crest
  const canvasTex = canvasT(1024, 1024, (g, w) => {
    g.fillStyle = '#1d4fb0'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(242,181,68,0.85)'; g.lineWidth = 10; g.strokeRect(40, 40, w - 80, w - 80);
    g.lineWidth = 3; for (let i = 0; i < 24; i++) { const t = 60 + i * ((w - 120) / 24); for (const [x, y] of [[t, 52], [t, w - 52], [52, t], [w - 52, t]]) { g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke(); } }
    g.fillStyle = 'rgba(10,20,60,0.55)'; g.beginPath(); g.arc(w / 2, w / 2, 210, 0, TAU); g.fill();
    g.strokeStyle = '#f2b544'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#f2b544'; for (let i = 0; i < 3; i++) { const bw = 120 - i * 32, y = 520 - i * 50; g.beginPath(); g.moveTo(w / 2 - bw, y); g.lineTo(w / 2, y - 70); g.lineTo(w / 2 + bw, y); g.closePath(); g.fill(); }
    g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.fillText('PAVILION', w / 2, 610);
  });
  const lacquer = canvasT(512, 512, (g, w) => { // red lacquer panel with a gold lai-thai diamond lattice (texture = 2 m)
    g.fillStyle = '#5a0f12'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(217,164,65,0.55)'; g.lineWidth = 3;
    for (let i = -1; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 256, w); g.stroke(); g.beginPath(); g.moveTo(i * 128 + 256, 0); g.lineTo(i * 128, w); g.stroke(); }
    g.fillStyle = 'rgba(242,181,68,0.7)'; for (let x = 0; x <= w; x += 128) for (let y = 0; y <= w; y += 256) { g.beginPath(); g.arc(x, y + ((x / 128) % 2 ? 128 : 0), 9, 0, TAU); g.fill(); }
  }, true);
  Object.assign(LM, {
    cpConcrete: std({ map: graniteTex('cpConcrete', '#2b2527', [95, 85, 85]), roughness: 0.85 }),
    cpStone: std({ map: graniteTex('cpStone', '#231d1f', [120, 100, 95]), roughness: 0.25, metalness: 0.05 }),
    cpRingside: std({ color: 0x0c0e16, roughness: 0.2, metalness: 0.3 }),
    cpDark: std({ color: 0x17131a, roughness: 0.55, metalness: 0.45 }),
    cpRed: std({ map: lacquer, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.5 }), // satin, so grazing reflections don't flare
    cpRedPlain: std({ color: 0x4a0d10, roughness: 0.6, envMapIntensity: 0.5 }),
    cpGoldSatin: std({ color: 0xc9953a, roughness: 0.6, metalness: 0.7, envMapIntensity: 0.25 }), // hall trims (close to the eye)
    cpGold: std({ color: 0xd9a441, roughness: 0.34, metalness: 1, envMapIntensity: 0.4 }), // softer reflections: the pavilion's strong bloom turned env highlights into glare
    cpCanvas: std({ map: canvasTex, roughness: 0.8 }),
    cpSeat: std({ color: 0xffffff, roughness: 0.5 }),
    cpLedBlue: std({ color: 0x0b1a3a, emissive: 0x3a7bff, emissiveIntensity: 2.4 }),
    cpLedRed: std({ color: 0x3a0b0b, emissive: 0xff2a2a, emissiveIntensity: 2.4 }),
    cpLedWarm: std({ color: 0x3a2c1e, emissive: 0xffb860, emissiveIntensity: 1.9 }),
    cpLamp: std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 3.0 }),
    cpTower: std({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: 2.2 }),
    cpBoxGlow: std({ color: 0xffd28a, emissive: 0xffb54a, emissiveIntensity: 1.25 }),
    cpRopeRed: std({ color: 0xd22222, emissive: 0x6a0a0a, emissiveIntensity: 0.6, roughness: 0.5 }),
    cpRopeBlue: std({ color: 0x2244cc, emissive: 0x0a1a6a, emissiveIntensity: 0.6, roughness: 0.5 }),
    cpRopeWhite: std({ color: 0xf2f2f2, emissive: 0x404040, emissiveIntensity: 0.5, roughness: 0.5 }),
    cpPanelWarm: std({ color: 0xfff0d8, emissive: 0xffcf8a, emissiveIntensity: 0.6, roughness: 0.6 }),
    cpRunner: std({ color: 0x7a1218, roughness: 0.9 }),
  });
}

// The dome: deep maroon-black with glowing red-gold sak yant script (cartouches, rings of Thai numerals,
// unalome loops, nine spires in the centre). Drawn once; its glow "breathes" via the material colour.
function domeTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), m = S / 2, R = S / 2;
  const bg = g.createRadialGradient(m, m, 60, m, m, R); bg.addColorStop(0, '#3a0c08'); bg.addColorStop(0.55, '#1e0604'); bg.addColorStop(1, '#0a0202');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const thai = 'กขคงจฉชซญฎฐฑณดตถทธนบปผพฟภมยรลวศษสหอฮ', nums = '๑๒๓๔๕๖๗๘๙';
  const r = rng(53);
  const glow = (col, blur) => { g.shadowColor = col; g.shadowBlur = blur; };
  const RED = '#ff6a3a', GOLD = '#ffc261';
  g.lineCap = 'round';
  // concentric script rings near the edge (the reference's numbered band)
  for (const [rr, size, n, col] of [[R - 40, 44, 90, GOLD], [R - 110, 38, 80, RED], [R - 520, 30, 70, RED]]) {
    glow(col, 18); g.fillStyle = col; g.font = `bold ${size}px "Leelawadee UI", Tahoma, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.save(); g.translate(m + rr * Math.cos(a), m + rr * Math.sin(a)); g.rotate(a + Math.PI / 2); g.fillText(i % 6 === 0 ? nums[(i / 6) % 9] : thai[Math.floor(r() * thai.length)], 0, 0); g.restore(); }
  }
  glow(RED, 14); g.strokeStyle = RED;
  for (const [rr, lw] of [[R - 8, 6], [R - 75, 4], [R - 145, 5], [R - 480, 4], [R - 560, 4], [300, 5], [270, 3]]) { g.lineWidth = lw; g.beginPath(); g.arc(m, m, rr, 0, TAU); g.stroke(); }
  // oval cartouches with script between the rings
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13, rr = R - 320, x = m + rr * Math.cos(a), y = m + rr * Math.sin(a);
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
    glow(GOLD, 16); g.strokeStyle = GOLD; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, 150, 62, 0, 0, TAU); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 136, 50, 0, 0, TAU); g.stroke();
    g.fillStyle = GOLD; g.font = 'bold 40px "Leelawadee UI", Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let t = ''; for (let k = 0; k < 6; k++) t += thai[Math.floor(r() * thai.length)]; g.fillText(t, 0, 2);
    g.restore();
  }
  // unalome loops + small yantra glyphs scattered in the middle band
  glow(RED, 12); g.strokeStyle = RED; g.lineWidth = 4;
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, rr = 360 + r() * 300, x = m + rr * Math.cos(a), y = m + rr * Math.sin(a), s = 18 + r() * 16;
    g.beginPath(); g.moveTo(x, y + s * 2.2); for (let k = 0; k < 3; k++) g.arc(x + (k % 2 ? s * 0.5 : -s * 0.5), y + s * 1.2 - k * s * 0.9, s * 0.45, Math.PI / 2, Math.PI * 2.4); g.lineTo(x, y - s * 2); g.stroke();
    g.beginPath(); g.arc(x, y - s * 2.2, 4, 0, TAU); g.fillStyle = RED; g.fill();
  }
  // centre: spiral script + nine spires (gao yord)
  glow(GOLD, 20); g.fillStyle = GOLD; g.font = 'bold 30px "Leelawadee UI", Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 70; i++) { const a = i * 0.32, rr = 60 + i * 2.9; g.save(); g.translate(m + rr * Math.cos(a), m + rr * Math.sin(a)); g.rotate(a + Math.PI / 2); g.fillText(thai[i % thai.length], 0, 0); g.restore(); }
  g.strokeStyle = GOLD; g.lineWidth = 5;
  for (let i = -4; i <= 4; i++) { const x = m + i * 26, h = 170 - Math.abs(i) * 16; g.beginPath(); g.moveTo(x - 10, m + 80); g.quadraticCurveTo(x - 14, m + 80 - h * 0.6, x, m + 80 - h); g.quadraticCurveTo(x + 14, m + 80 - h * 0.6, x + 10, m + 80); g.stroke(); }
  g.shadowBlur = 0;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- surface helpers (bowl centred on C)
function surf(nu, nv, fn, uvFn, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i / nu, j / nv); pos.push(...p); uv.push(...uvFn(p, i / nu, j / nv)); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const segs = (r, a0, a1, s = 1.2) => Math.max(1, Math.ceil(((a1 - a0) * Math.max(r, 1)) / s));
const planar = (t) => (p) => [p[0] / t, p[2] / t];
const ring = (r0, r1, a0, a1, y, { down = false, tile = 2 } = {}) => surf(segs(r1, a0, a1), 1, (u, v) => P(r0 + (r1 - r0) * v, a0 + (a1 - a0) * u, y), planar(tile), down);
const wall = (r, a0, a1, y0, y1, { out = false, tile = 2 } = {}) => surf(segs(r, a0, a1), 1, (u, v) => P(r, a0 + (a1 - a0) * u, y0 + (y1 - y0) * v), (p, u, v) => [((a0 + (a1 - a0) * u) * r) / tile, (y0 + (y1 - y0) * v) / tile], out);
function radial(L, mat, a, r0, r1, yb0, yt0, yb1 = yb0, yt1 = yt0) {
  for (const flip of [false, true]) L.geo(surf(1, 1, (u, v) => P(r0 + (r1 - r0) * u, a, (1 - u) * (yb0 + (yt0 - yb0) * v) + u * (yb1 + (yt1 - yb1) * v)), (p, u, v) => [(u * (r1 - r0)) / 2, v], flip), mat);
}
const obox = (L, x, y, z, w, h, d, yaw, mat, color) => L.geo(new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z), mat, color);
function member(L, a, b, t, mat) { // a box from point a to point b (thickness t)
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const g = new THREE.BoxGeometry(t, t, len); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); L.geo(g, mat);
}

// ---------------------------------------------------------------- the floor
export function combatPavilion(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const e = ctx.e, H = ctx.floor.height, r = rng(707);
  const scr = []; // fight screens (world y)
  const seats = []; // [x, y, z, yaw, color]
  const crowd = (x, z, y, yaw) => L.person(x, z, { y, yaw, suit: pick(SHIRT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()) });
  const domeY = (rr) => H - 0.5 - 4.6 * (rr / DOME_R) ** 2;

  // ================================================================ ringside floor, the ring, the rig
  L.geo(ring(0.01, RS, 0, TAU, 0.012, { tile: 3 }), 'cpRingside');
  L.geo(ring(RS - 0.45, RS - 0.3, 0, TAU, 0.02), 'cpGold');
  const R = RING.half, top = RING.top;
  L.box(C.x - R, C.x + R, 0, top - 0.05, C.z - R, C.z + R, 'cpDark');
  for (const [x0, x1, z0, z1] of [[-R - 0.02, R + 0.02, -R - 0.02, -R + 0.02], [-R - 0.02, R + 0.02, R - 0.02, R + 0.02], [-R - 0.02, -R + 0.02, -R, R], [R - 0.02, R + 0.02, -R, R]]) {
    L.box(C.x + x0, C.x + x1, 0.08, 0.16, C.z + z0, C.z + z1, 'cpLedBlue'); L.box(C.x + x0, C.x + x1, top - 0.2, top - 0.12, C.z + z0, C.z + z1, 'cpLedBlue');
  }
  L.box(C.x - R + 0.15, C.x + R - 0.15, top - 0.05, top, C.z - R + 0.15, C.z + R - 0.15, 'cpCanvas');
  const rp = RING.ropes;
  for (const [sx, sz, m] of [[-1, -1, 'cpRopeRed'], [1, 1, 'cpRopeBlue'], [1, -1, 'cpRopeWhite'], [-1, 1, 'cpRopeWhite']]) {
    L.cyl(C.x + sx * rp, C.z + sz * rp, 0.1, top, top + 1.75, 'cpGold', { seg: 10 });
    L.cyl(C.x + sx * rp, C.z + sz * rp, 0.2, top + 0.3, top + 1.6, m, { seg: 10 }); // corner pad
  }
  [['cpRopeRed', 0.45], ['cpRopeWhite', 0.8], ['cpRopeBlue', 1.15], ['cpRopeWhite', 1.5]].forEach(([m, y]) => {
    const yy = top + y;
    L.box(C.x - rp, C.x + rp, yy, yy + 0.06, C.z - rp - 0.03, C.z - rp + 0.03, m); L.box(C.x - rp, C.x + rp, yy, yy + 0.06, C.z + rp - 0.03, C.z + rp + 0.03, m);
    L.box(C.x - rp - 0.03, C.x - rp + 0.03, yy, yy + 0.06, C.z - rp, C.z + rp, m); L.box(C.x + rp - 0.03, C.x + rp + 0.03, yy, yy + 0.06, C.z - rp, C.z + rp, m);
  });
  for (const [x0, x1, h] of [[R, R + 0.8, 0.8], [R + 0.8, R + 1.6, 0.4]]) { L.box(C.x + x0, C.x + x1, 0, h, C.z - 1, C.z + 1, 'cpDark'); L.box(C.x + x0, C.x + x1 - 0.7, h, h + 0.02, C.z - 1, C.z + 1, 'cpGold'); }
  // fighters, referee
  L.person(C.x - 1.4, C.z - 0.3, { y: top, yaw: Math.PI / 2, suit: 0xc8202a, skin: 0xc68c62, hair: 0x111111 });
  L.person(C.x + 1.4, C.z + 0.3, { y: top, yaw: -Math.PI / 2, suit: 0x2244cc, skin: 0xb07850, hair: 0x111111 });
  L.person(C.x, C.z + 2.2, { y: top, yaw: Math.PI, suit: 0xf2f2f2, skin: 0xd8a47f, hair: 0x2a1a10 });
  // square lighting rig over the ring (hung from the dome), lamps aimed down
  const RIG = 6.5, RY = 10.5;
  for (const [x0, x1, z0, z1] of [[-RIG, RIG, -RIG, -RIG + 0.5], [-RIG, RIG, RIG - 0.5, RIG], [-RIG, -RIG + 0.5, -RIG, RIG], [RIG - 0.5, RIG, -RIG, RIG]]) L.box(C.x + x0, C.x + x1, RY, RY + 0.5, C.z + z0, C.z + z1, 'cpDark');
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const t = -RIG + 1.2 + i * ((2 * RIG - 2.4) / 5);
    L.cyl(C.x + t, C.z + s * (RIG - 0.25), 0.2, RY - 0.3, RY, 'cpLamp', { seg: 10 }); L.cyl(C.x + s * (RIG - 0.25), C.z + t, 0.2, RY - 0.3, RY, 'cpLamp', { seg: 10 });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.cyl(C.x + sx * RIG, C.z + sz * RIG, 0.04, RY + 0.5, domeY(9.2), 'steel', { seg: 4 });
  // officials' table, pi-phat musicians, camera positions
  L.box(C.x - 4, C.x + 4, 0, 0.75, C.z - 10.2, C.z - 9.2, 'walnut', { collide: true }); L.box(C.x - 4.05, C.x + 4.05, 0.75, 0.8, C.z - 10.25, C.z - 9.15, 'cpGold');
  for (let i = 0; i < 5; i++) L.person(C.x - 3.2 + i * 1.6, C.z - 10.9, { yaw: 0, suit: 0x111111, skin: pick(SKIN, r()), hair: 0x111111 });
  L.box(C.x - 9.8, C.x - 7.2, 0, 0.4, C.z + 6.5, C.z + 9.5, 'walnut', { collide: true });
  for (let i = 0; i < 4; i++) L.person(C.x - 9.3 + (i % 2) * 1.5, C.z + 7.2 + Math.floor(i / 2) * 1.5, { y: 0.4, yaw: -Math.PI / 4, suit: 0xc0262d, skin: pick(SKIN, r()), hair: 0x111111 });
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) { const [x, , z] = P(11.5, a); L.box(x - 0.5, x + 0.5, 0, 1.5, z - 0.5, z + 0.5, 'cpDark', { collide: true }); L.person(x + 0.9, z, { yaw: yawIn(a), suit: 0x222222, skin: pick(SKIN, r()), hair: 0x111111 }); }

  // ================================================================ seating bowl
  const SEAT_COL = [0x9e1b24, 0xa8202a, 0x8a1620];
  const seatRow = (rFront, depth, y, gaps) => {
    const rr = rFront + depth * 0.6;
    for (const [a0, a1] of arcs(rr, gaps)) {
      const n = Math.floor(((a1 - a0) * rr) / 0.6);
      for (let i = 0; i < n; i++) {
        const a = a0 + ((i + 0.5) / n) * (a1 - a0), [x, , z] = P(rr, a);
        seats.push([x, y, z, yawIn(a), pick(SEAT_COL, r())]);
        if (r() < 0.34) { const [px, , pz] = P(rr - 0.18, a); crowd(px, pz, y, yawIn(a)); }
      }
    }
  };
  // front barrier: red lacquer riser to 1.6 m, glass, gold rail, ringside LED boards
  for (const [a0, a1] of arcs(RS, [WALK_GAP])) {
    L.geo(wall(RS, a0, a1, 0, LOW.y0), 'cpRedPlain');
    for (const out of [false, true]) L.geo(wall(RS + 0.03, a0, a1, LOW.y0, LOW.y0 + 1.0, { out }), 'glass');
    L.geo(ring(RS - 0.03, RS + 0.09, a0, a1, LOW.y0 + 1.02), 'cpGold');
    L.geo(wall(RS - 0.02, a0, a1, LOW.y0 - 0.12, LOW.y0 - 0.04), 'cpLedBlue');
  }
  for (let i = 0; i < 28; i++) {
    const a = ((i + 0.5) / 28) * TAU;
    if (Math.abs(Math.sin(a)) * RS < WALK_HALF + 0.8 && Math.cos(a) > 0) continue;
    const [x, , z] = P(RS - 0.04, a);
    scr.push({ x, y: e + 0.8, z, yaw: yawIn(a), w: 2.9, h: 1.0, cell: [FC.CARD, FC.BRAND, FC.FIGHT][i % 3] });
  }
  // lower bowl
  for (let k = 0; k < LOW.rows; k++) {
    const r0 = LOW.r0 + k * LOW.depth, r1 = k === LOW.rows - 1 ? XA.r0 : r0 + LOW.depth, y = LOW.y0 + k * LOW.rise;
    for (const [a0, a1] of arcs(r0, [WALK_GAP])) {
      L.geo(ring(r0 - 0.01, r1, a0, a1, y), 'cpConcrete');
      if (k) L.geo(wall(r0, a0, a1, y - LOW.rise - 0.02, y), 'cpDark');
      for (const a of [a0, a1]) radial(L, 'cpDark', a, r0, r1, -0.05, y);
    }
    for (const v of VOMS) { const d = halfAng(AISLE_HALF, r0 + 0.4); L.geo(ring(r0, r1, v - d, v + d, y + 0.006), 'cpStone'); L.geo(wall(r0 - 0.01, v - d, v + d, y - 0.05, y - 0.02), 'cpLedWarm'); } // stair aisles with step lights
    seatRow(r0, LOW.depth, y, [WALK_GAP, ...vomGaps(AISLE_HALF)]);
  }
  // cross-aisle
  for (const [a0, a1] of arcs(XA.r0, [WALK_GAP])) {
    L.geo(ring(XA.r0 - 0.01, XA.r1 + 0.01, a0, a1, XA.y, { tile: 2.4 }), 'cpStone');
    L.geo(wall(XA.r0, a0, a1, lowTop - 0.02, XA.y), 'cpDark');
    L.geo(wall(XA.r0 - 0.02, a0, a1, XA.y - 0.08, XA.y - 0.03), 'cpLedWarm');
    for (const a of [a0, a1]) { radial(L, 'cpDark', a, XA.r0, XA.r1, -0.05, XA.y); radial(L, 'glass', a, XA.r0, XA.r1, XA.y, XA.y + 1.05); }
  }
  // upper bowl (vomitories cut through it)
  for (let k = 0; k < UP.rows; k++) {
    const r0 = UP.r0 + k * UP.depth, r1 = k === UP.rows - 1 ? BACK.r0 : r0 + UP.depth, y = UP.y0 + k * UP.rise;
    for (const [a0, a1] of arcs(r0, [WALK_GAP, ...vomGaps(VOM_HALF)])) {
      L.geo(ring(r0 - 0.01, r1 + 0.01, a0, a1, y), 'cpConcrete');
      L.geo(wall(r0, a0, a1, (k ? y - UP.rise : XA.y) - 0.02, y), 'cpDark');
      for (const a of [a0, a1]) {
        const walkSide = Math.cos(a) > 0 && Math.abs(Math.sin(a)) < 0.2;
        radial(L, 'cpDark', a, r0, r1, walkSide ? -0.05 : XA.y - 0.05, y);
        radial(L, 'glass', a, r0, r1, y, y + 1.0);
      }
    }
    seatRow(r0, UP.depth, y, [WALK_GAP, ...vomGaps(VOM_HALF)]);
  }
  // vomitory floors + portals
  for (const v of VOMS) {
    const ca = Math.cos(v), sa = Math.sin(v), px = -sa, pz = ca;
    const pt = (along, side, y) => [C.x + ca * along + px * side, y, C.z + sa * along + pz * side];
    L.geo(surf(4, 1, (u, w) => pt(XA.r1 - 0.05 + (BACK.r1 + 0.3 - XA.r1) * u, -VOM_HALF + 2 * VOM_HALF * w, XA.y + 0.008), planar(2), true), 'cpStone');
    const d = halfAng(VOM_HALF, BACK.r0);
    L.geo(wall(BACK.r0, v - d, v + d, XA.y + 3.0, SKY.y0), 'cpRed', undefined);
    L.geo(wall(BACK.r0 - 0.03, v - d, v + d, XA.y + 2.92, XA.y + 3.0), 'cpGold');
    L.geo(ring(BACK.r0, BACK.r1, v - d, v + d, XA.y + 3.0, { down: true }), 'cpDark');
    for (const s of [-1, 1]) radial(L, 'cpDark', v + s * d, BACK.r0, BACK.r1, XA.y, XA.y + 3.0);
    const sec = 101 + Math.round((v - Math.PI + 2.4) / 0.8) * 4;
    const [sx, , sz] = P(BACK.r1 + 0.04, v);
    plaque(ctx, `SECTIONS ${sec}–${sec + 3}`, sx, XA.y + 3.5, sz, yawOut(v), { h: 0.38, color: '#f2c14a', bg: '#3a0a0c' });
  }
  // back wall (bowl face) above the top row, with the band of gold-lit skyboxes
  for (const [a0, a1] of arcs(BACK.r0, [WALK_GAP, ...vomGaps(VOM_HALF)])) L.geo(wall(BACK.r0, a0, a1, upTop - 0.05, SKY.y0), 'cpRed');
  const gateCut = { a: 0, hw: 10.5 };
  for (const [a0, a1] of arcs(BACK.r0, [gateCut])) {
    L.geo(ring(BACK.r0 - 0.02, BACK.r0 + 0.38, a0, a1, SKY.y0), 'cpDark');
    L.geo(ring(BACK.r0 - 0.02, BACK.r0 + 0.38, a0, a1, SKY.y1, { down: true }), 'cpDark');
    L.geo(wall(BACK.r0 + 0.36, a0, a1, SKY.y0, SKY.y1), 'cpBoxGlow'); // lit interiors
    for (const out of [false, true]) L.geo(wall(BACK.r0 - 0.01, a0, a1, SKY.y0, SKY.y1, { out }), 'glass');
    L.geo(wall(BACK.r0 - 0.04, a0, a1, SKY.y1, SKY.top), 'cpGold');
    L.geo(wall(BACK.r0 - 0.05, a0, a1, SKY.y0 - 0.12, SKY.y0), 'cpGold');
    for (let a = a0 + 2.6 / BACK.r0; a < a1 - 0.5 / BACK.r0; a += 3.2 / BACK.r0) { const [x, , z] = P(BACK.r0 - 0.02, a); obox(L, x, (SKY.y0 + SKY.y1) / 2, z, 0.14, SKY.y1 - SKY.y0, 0.1, yawOut(a), 'cpGold'); }
    for (let a = a0 + 1.0 / BACK.r0; a < a1 - 0.5 / BACK.r0; a += 3.2 / BACK.r0) if (r() < 0.6) { const [x, , z] = P(BACK.r0 + 0.2, a); L.person(x, z, { y: SKY.y0, yaw: yawIn(a), suit: pick(SHIRT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()) }); }
  }
  // skybox roof + the outer wall above it, up to the dome
  L.geo(ring(BACK.r0 - 0.05, RO + 0.2, 0, TAU, SKY.top), 'cpDark');
  L.geo(wall(RO, 0, TAU, SKY.top - 0.1, domeY(RO) + 0.3), 'cpRedPlain');

  // ================================================================ concourse (plain corridor behind the bowl)
  const entA = halfAng(ENTRY.half, RO);
  L.geo(ring(BACK.r1 - 0.05, RO + 0.2, 0, TAU, CONC.y + 0.008, { tile: 2.4 }), 'cpStone');
  L.geo(ring(BACK.r1 - 0.05, RO + 0.2, 0, TAU, CONC.y - 0.3, { down: true }), 'cpDark'); // tunnel ceiling below
  L.geo(ring(BACK.r1 - 0.05, RO + 0.2, 0, TAU, CONC_CEIL, { down: true }), 'cpDark');
  for (const [a0, a1] of arcs(BACK.r1, vomGaps(VOM_HALF))) {
    L.geo(wall(BACK.r1, a0, a1, CONC.y - 0.1, CONC_CEIL, { out: true }), 'cpRed');
    L.geo(wall(BACK.r1 + 0.03, a0, a1, CONC.y, CONC.y + 0.25, { out: true }), 'cpDark');
    L.geo(wall(BACK.r1 + 0.04, a0, a1, CONC_CEIL - 0.6, CONC_CEIL - 0.45, { out: true }), 'cpGold');
  }
  for (const v of VOMS) { const d = halfAng(VOM_HALF, BACK.r1); L.geo(wall(BACK.r1, v - d, v + d, CONC.y + 3.0, CONC_CEIL, { out: true }), 'cpRed'); }
  for (const [a0, a1] of arcs(RO, [{ a: Math.PI, hw: ENTRY.half }])) {
    L.geo(wall(RO, a0, a1, CONC.y - 0.1, CONC_CEIL), 'cpRed');
    L.geo(wall(RO - 0.03, a0, a1, CONC.y, CONC.y + 0.25), 'cpDark');
    L.geo(wall(RO - 0.04, a0, a1, CONC_CEIL - 0.6, CONC_CEIL - 0.45), 'cpGold');
    for (let a = a0 + 3 / RO; a < a1 - 1 / RO; a += 7 / RO) { const [x, , z] = P(RO - 0.12, a); L.box(x - 0.16, x + 0.16, CONC.y + 2.6, CONC.y + 3.1, z - 0.16, z + 0.16, 'lampWarm'); }
  }
  L.geo(wall(RO, Math.PI - entA, Math.PI + entA, CONC_CEIL - 0.2, domeY(RO) + 0.3), 'cpRedPlain');
  for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, [x, , z] = P((BACK.r1 + RO) / 2, a); L.cyl(x, z, 0.28, CONC_CEIL - 0.08, CONC_CEIL, 'cpPanelWarm', { seg: 10 }); }
  { const pts = Array.from({ length: 48 }, (_, i) => { const [x, , z] = P(47.2, (i / 48) * TAU); return [x, z]; });
    for (let j = 0; j < 22; j++) { const off = Math.floor(r() * 48), loop = [...pts.slice(off), ...pts.slice(0, off)]; L.person(loop[0][0], loop[0][1], { y: CONC.y, suit: pick(SHIRT, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()), walk: r() < 0.5 ? loop : loop.reverse(), speed: 0.9 + r() * 0.5 }); } }
  // outer face of the outer wall (seen from backstage and the service corridor)
  for (const [a0, a1] of arcs(RO + 0.3, [WALK_GAP, { a: Math.PI, hw: ENTRY.half }])) L.geo(wall(RO + 0.3, a0, a1, -0.05, domeY(RO) + 0.3, { out: true }), 'cpConcrete');
  { const d = halfAng(WALK_HALF, RO + 0.3); L.geo(wall(RO + 0.3, -d, d, CONC.y - 0.3, domeY(RO) + 0.3, { out: true }), 'cpConcrete'); }

  // ================================================================ entrance: corridor, ticket gates, grand stairs
  const EZ = ENTRY.half;
  L.floor(ENTRY.x0, STAIRS.x0, -EZ, EZ, 0.012, 'cpStone', 2.4);
  L.box(ENTRY.x0, STAIRS.x0, 0.012, 0.022, -1.2, 1.2, 'cpRunner');
  for (const sz of [-1, 1]) {
    const z0 = sz * EZ, z1 = sz * (EZ + 0.3);
    L.box(ENTRY.x0, STAIRS.x1 + 0.6, 0, 12, Math.min(z0, z1), Math.max(z0, z1), 'cpRed');
    L.box(ENTRY.x0, STAIRS.x1 + 0.6, 0, 0.9, Math.min(z0, z0 - sz * 0.04), Math.max(z0, z0 - sz * 0.04), 'walnut');
    L.box(ENTRY.x0, STAIRS.x1 + 0.6, 0.9, 0.97, Math.min(z0, z0 - sz * 0.06), Math.max(z0, z0 - sz * 0.06), 'cpGold');
    L.box(ENTRY.x0, STAIRS.x1 + 0.6, 4.4, 4.5, Math.min(z0, z0 - sz * 0.06), Math.max(z0, z0 - sz * 0.06), 'cpLedWarm');
    for (let x = ENTRY.x0 + 2; x < STAIRS.x1; x += 4) L.box(x - 0.18, x + 0.18, 0, 12, Math.min(z0, z0 - sz * 0.2), Math.max(z0, z0 - sz * 0.2), 'cpGold');
  }
  L.box(ENTRY.x0, STAIRS.x1 + 0.6, 12, 12.2, -EZ - 0.3, EZ + 0.3, 'cpDark');
  for (let x = ENTRY.x0 + 1.5; x < STAIRS.x1; x += 3) L.box(x - 0.6, x + 0.6, 11.9, 12, -1.2, 1.2, 'cpPanelWarm');
  for (let i = 0; i < 6; i++) { const z = -3.3 + i * 1.32; L.box(49.2, 50.2, 0, 1.0, z - 0.12, z + 0.12, 'steel', { collide: true }); L.box(49.15, 50.25, 1.0, 1.04, z - 0.14, z + 0.14, 'cpGold'); L.box(49.6, 49.8, 0.9, 0.95, z, z + 0.55, 'cpLedBlue'); }
  L.box(45, 47.5, 0, 1.1, EZ - 0.9, EZ - 0.1, 'walnut', { collide: true }); L.box(44.95, 47.55, 1.1, 1.15, EZ - 0.95, EZ - 0.05, 'cpGold');
  L.person(46.2, EZ - 0.4, { yaw: Math.PI, suit: 0x5a0f12, skin: 0xc68c62, hair: 0x111111 });
  L.box(51.8, 52.3, 5.2, 7.2, -EZ, EZ, 'cpGold');
  plaque(ctx, 'COMBAT SPORTS ANALYTICS PAVILION', 51.75, 6.2, 0, -Math.PI / 2, { h: 0.62, color: '#2a0a06', bg: '#d9a441', sub: 'Sections 101–128 upstairs' });
  const tread = (STAIRS.x1 - STAIRS.x0) / STAIRS.steps, rise = CONC.y / STAIRS.steps;
  for (let k = 0; k < STAIRS.steps; k++) {
    const x0 = STAIRS.x0 + k * tread, y = (k + 1) * rise;
    L.box(x0, x0 + tread, y - rise - 0.05, y, -EZ, EZ, 'cpStone');
    L.box(x0, x0 + 0.05, y - 0.02, y + 0.004, -EZ, EZ, 'cpGold');
    L.box(x0, x0 + tread, y, y + 0.01, -1.2, 1.2, 'cpRunner');
    for (const z of [-EZ + 0.15, EZ - 0.15]) L.box(x0, x0 + tread, y + 0.9, y + 0.96, z - 0.04, z + 0.04, 'cpGold');
  }

  // ================================================================ walkout: runway, tunnel, the gold gate, the focus room
  const xs = C.x + Math.sqrt(RS * RS - WALK_HALF * WALK_HALF), xt = C.x + Math.sqrt(BACK.r1 ** 2 - WALK_HALF ** 2);
  L.floor(xs, BACKSTAGE_X, -WALK_HALF, WALK_HALF, 0.014, 'cpRingside', 3);
  L.box(xs, FOCUS.x1 - 0.3, 0.014, 0.03, -WALK_HALF + 0.1, -WALK_HALF + 0.3, 'cpLedRed');
  L.box(xs, FOCUS.x1 - 0.3, 0.014, 0.03, WALK_HALF - 0.3, WALK_HALF - 0.1, 'cpLedBlue');
  for (let x = xs + 1; x < BACKSTAGE_X - 1; x += 3) L.box(x, x + 1.2, 0.014, 0.03, -0.12, 0.12, 'cpLedWarm');
  for (const sz of [-1, 1]) {
    L.box(xs, xt, 0.95, 1.05, Math.min(sz * (WALK_HALF - 0.02), sz * (WALK_HALF - 0.06)), Math.max(sz * (WALK_HALF - 0.02), sz * (WALK_HALF - 0.06)), sz < 0 ? 'cpLedRed' : 'cpLedBlue');
    L.box(xt, BACKSTAGE_X, 0, CONC.y - 0.3, Math.min(sz * WALK_HALF, sz * (WALK_HALF + 0.3)), Math.max(sz * WALK_HALF, sz * (WALK_HALF + 0.3)), 'cpDark');
    L.box(xt, BACKSTAGE_X, 1.0, 1.1, Math.min(sz * (WALK_HALF - 0.02), sz * WALK_HALF), Math.max(sz * (WALK_HALF - 0.02), sz * WALK_HALF), sz < 0 ? 'cpLedRed' : 'cpLedBlue');
  }
  for (let x = xt + 1; x < BACKSTAGE_X - 0.5; x += 2.5) L.box(x, x + 1.4, CONC.y - 0.42, CONC.y - 0.32, -1.2, 1.2, 'cpLamp');
  // the gate over the fighters' entrance: gold pillars + lintel, a lacquered panel with the big screen,
  // three tiers of pointed gold gables with chofa finials, red / blue corner banners either side
  const GX = C.x + BACK.r0 - 0.4, gx = (d) => GX + d; // gate plane (faces the ring, -x)
  for (const sz of [-1, 1]) {
    L.box(gx(-0.4), gx(0.4), 0, 9.6, Math.min(sz * (WALK_HALF - 0.5), sz * WALK_HALF), Math.max(sz * (WALK_HALF - 0.5), sz * WALK_HALF), 'cpGold', { collide: true });
    for (let y = 0.6; y < 9; y += 1.1) L.box(gx(-0.45), gx(-0.4), y, y + 0.5, Math.min(sz * (WALK_HALF - 0.45), sz * (WALK_HALF - 0.05)), Math.max(sz * (WALK_HALF - 0.45), sz * (WALK_HALF - 0.05)), 'cpRedPlain');
    L.box(gx(-0.47), gx(-0.44), 0.4, 9.2, Math.min(sz * (WALK_HALF - 0.4), sz * (WALK_HALF - 0.1)), Math.max(sz * (WALK_HALF - 0.4), sz * (WALK_HALF - 0.1)), sz < 0 ? 'cpLedRed' : 'cpLedBlue'); // red / blue corner light on each pillar
  }
  L.box(gx(-0.45), gx(0.45), CONC.y - 0.3, 9.6, -WALK_HALF, WALK_HALF, 'cpGold');
  L.box(gx(-0.3), gx(0.3), 9.6, 14.3, -4.6, 4.6, 'cpRed');
  L.box(gx(-0.4), gx(0.4), 9.6, 9.9, -4.8, 4.8, 'cpGold'); L.box(gx(-0.4), gx(0.4), 14.1, 14.4, -4.8, 4.8, 'cpGold');
  for (const sz of [-1, 1]) L.box(gx(-0.4), gx(0.4), 9.6, 14.4, Math.min(sz * 4.5, sz * 4.8), Math.max(sz * 4.5, sz * 4.8), 'cpGold');
  L.box(gx(-0.38), gx(-0.3), 10.0, 14.0, -3.5, 3.5, 'blackMetal');
  scr.push({ x: gx(-0.39), y: e + 12.0, z: 0, yaw: -Math.PI / 2, w: 6.8, h: 3.83, cell: FC.BRAND });
  // the centre stage screen, high above the gate between the two flanking screens (the reference's
  // three-screen stage), in a gold frame under a crown of three tiers of pointed gold gables
  const SC = 17.0;
  L.box(gx(-0.1), gx(0.15), SC - 2.45, SC + 2.45, -4.2, 4.2, 'cpGold');
  L.box(gx(-0.2), gx(-0.1), SC - 2.22, SC + 2.22, -3.95, 3.95, 'blackMetal');
  scr.push({ x: gx(-0.21), y: e + SC, z: 0, yaw: -Math.PI / 2, w: 7.6, h: 4.27, cell: FC.FIGHT });
  const gable = (w, h, y, d, mat) => { const sh = new THREE.Shape(); sh.moveTo(-w, 0); sh.lineTo(0, h); sh.lineTo(w, 0); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }); g.rotateY(Math.PI / 2).translate(gx(d), y, 0); L.geo(g, mat); };
  for (let i = 0; i < 3; i++) {
    const w = 4.6 - i * 1.2, y = SC + 2.45 + i * 0.5, d = 0.05 + i * 0.2;
    gable(w, 0.95, y, d, 'cpGold'); gable(w - 0.35, 0.7, y + 0.1, d - 0.06, 'cpRed');
    for (const sz of [-1, 1]) member(L, [gx(d - 0.1), y + 0.03, sz * w], [gx(d - 0.1), y + 0.45, sz * (w + 0.45)], 0.12, 'cpGold'); // hang hong finials at the eaves
  }
  member(L, [gx(0.45), SC + 3.4, 0], [gx(0.45), SC + 4.15, 0], 0.14, 'cpGold'); // chofa spire
  L.geo(new THREE.SphereGeometry(0.2, 10, 8).translate(gx(0.45), SC + 4.25, 0), 'cpLamp');
  // flanking big screens in ornate gold frames, high either side of the gate
  for (const sa of [-0.25, 0.25]) {
    const [x, , z] = P(BACK.r0 - 0.5, sa), yw = yawIn(sa), cy = 17.0;
    obox(L, x + 0.1 * Math.cos(sa), cy, z + 0.1 * Math.sin(sa), 8.4, 4.9, 0.25, yw, 'cpGold');
    obox(L, x + 0.05 * Math.cos(sa), cy, z + 0.05 * Math.sin(sa), 7.9, 4.45, 0.2, yw, 'blackMetal');
    scr.push({ x: x - 0.06 * Math.cos(sa), y: e + cy, z: z - 0.06 * Math.sin(sa), yaw: yw, w: 7.6, h: 4.27, cell: sa < 0 ? FC.CARD : FC.SCORE });
    const sh = new THREE.Shape(); sh.moveTo(-4.4, 0); sh.lineTo(0, 1.6); sh.lineTo(4.4, 0); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false }); g.translate(0, 0, -0.125).rotateY(yw).translate(x + 0.1 * Math.cos(sa), cy + 2.45, z + 0.1 * Math.sin(sa)); L.geo(g, 'cpGold');
  }
  // backstage wall (tunnel opening into the focus room), service corridor walls, focus room furniture
  for (const [z0, z1] of [[CORRIDOR_Z, -WALK_HALF - 0.3], [WALK_HALF + 0.3, 59]]) L.box(BACKSTAGE_X - 0.3, BACKSTAGE_X, 0, H - 0.25, z0, z1, 'cpConcrete');
  L.box(BACKSTAGE_X - 0.3, BACKSTAGE_X, CONC.y - 0.3, H - 0.25, -WALK_HALF - 0.3, WALK_HALF + 0.3, 'cpConcrete');
  L.box(ENTRY.x0, BACKSTAGE_X, 0, 6, CORRIDOR_Z, CORRIDOR_Z + 0.3, 'cpConcrete');
  L.box(ENTRY.x0 - 0.3, ENTRY.x0, 0, H - 0.25, CORRIDOR_Z, -40, 'cpConcrete');
  L.box(ENTRY.x0 - 0.3, ENTRY.x0, 0, H - 0.25, 30, 59, 'cpConcrete');
  for (let x = 50; x < BACKSTAGE_X; x += 6) L.box(x, x + 1.4, 5.4, 5.5, CORRIDOR_Z - 3.2, CORRIDOR_Z - 2.2, 'cpLamp');
  for (let i = 0; i < 4; i++) L.box(176 + i * 3, 177.5 + i * 3, 0, 1.8, 50, 52, 'cpDark', { collide: true });
  L.box((FOCUS.x0 + FOCUS.x1) / 2 - 0.6, (FOCUS.x0 + FOCUS.x1) / 2 + 0.6, FOCUS.h - 0.12, FOCUS.h - 0.05, -0.6, 0.6, 'cpLamp');
  for (const sz of [-1, 1]) L.box(FOCUS.x0 + 2.2, FOCUS.x1 - 1.0, 0, 0.45, Math.min(sz * (FOCUS.z1 - 0.95), sz * (FOCUS.z1 - 0.35)), Math.max(sz * (FOCUS.z1 - 0.95), sz * (FOCUS.z1 - 0.35)), 'cpDark', { collide: true });
  L.person(178, -1.6, { yaw: -Math.PI / 2, suit: 0xc8202a, skin: 0xc68c62, hair: 0x111111 }); L.person(178, 1.6, { yaw: -Math.PI / 2, suit: 0x2244cc, skin: 0xb07850, hair: 0x111111 });
  ctx.barrier(38.5, 41.5, -40.35, -39.65, 2.6, 'backstage', 'pavilion_backstage_door');
  ctx.barriers[ctx.barriers.length - 1].mesh.visible = false;
  plaque(ctx, 'COMPETITORS & OFFICIALS ONLY', 40, 3.3, -39.55, 0, { h: 0.26, color: '#f2c14a', bg: '#2a0a06' });

  // ================================================================ dome, truss crown, light towers, beams, hanging screens
  const domeTex = domeTexture();
  const domeMat = new THREE.MeshBasicMaterial({ map: domeTex, toneMapped: false });
  const domeGeo = surf(96, 24, (u, v) => { const rr = DOME_R * v + 0.01, a = TAU * u; return P(rr, a, domeY(rr)); }, (p) => [0.5 - (p[0] - C.x) / (2 * DOME_R), 0.5 - (p[2] - C.z) / (2 * DOME_R)], true); // u mirrored: the script reads correctly from below
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.position.y = e; ctx.add(dome, domeGeo, domeMat, domeTex);
  // jagged truss crown at the dome's edge: up/down triangles, top + bottom chords, a lamp at every low point
  const TR = 45.2, TN = 48, TY0 = 16.2, TY1 = 19.0, lamps = [];
  for (let i = 0; i < TN; i++) {
    const a0 = (i / TN) * TAU, a1 = ((i + 1) / TN) * TAU, lo = i % 2 === 0;
    member(L, P(TR, a0, lo ? TY0 : TY1), P(TR, a1, lo ? TY1 : TY0), 0.16, 'cpDark');
    member(L, P(TR + 0.5, a0, lo ? TY0 : TY1), P(TR + 0.5, a1, lo ? TY1 : TY0), 0.12, 'cpDark');
    if (lo) { const [x, , z] = P(TR, a0); L.cyl(x, z, 0.24, TY0 - 0.5, TY0, 'cpLamp', { seg: 10 }); lamps.push(a0); }
  }
  for (const [rr, y] of [[TR, TY0], [TR, TY1], [TR + 0.5, TY0], [TR + 0.5, TY1]]) L.geo(new THREE.TorusGeometry(rr, 0.1, 4, 192).rotateX(Math.PI / 2).translate(C.x, y, C.z), 'cpDark');
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, [x, , z] = P(TR + 0.25, a); L.cyl(x, z, 0.04, TY1, domeY(TR + 0.25), 'steel', { seg: 4 }); }
  // LED light towers round the rim (on the skybox roof), clear of the gate
  for (let i = 0; i < 20; i++) {
    const a = ((i + 0.5) / 20) * TAU; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.45) continue;
    const [x, , z] = P(BACK.r0 + 0.9, a), yw = yawIn(a);
    obox(L, x, (SKY.top + TY0) / 2, z, 0.6, TY0 - SKY.top, 0.4, yw, 'cpDark');
    const [lx, , lz] = P(BACK.r0 + 0.68, a); obox(L, lx, (SKY.top + TY0) / 2, lz, 0.22, TY0 - SKY.top - 0.4, 0.06, yw, 'cpTower');
  }
  // beams of light from the crown lamps onto the ring (white, blue, green)
  const beamMats = [0xfff1d0, 0x6aa0ff, 0x5cffb0].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.028, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const up = new THREE.Vector3(0, 1, 0);
  lamps.filter((_, i) => i % 3 !== 2).forEach((a, i) => {
    const [sx, , sz] = P(TR, a), from = new THREE.Vector3(sx, e + TY0 - 0.5, sz), to = new THREE.Vector3(C.x + Math.cos(a) * 2.5, e + RING.top, C.z + Math.sin(a) * 2.5);
    const len = from.distanceTo(to), bg = new THREE.CylinderGeometry(0.16, 1.5, len, 14, 1, true);
    const beam = new THREE.Mesh(bg, beamMats[i % 3]); beam.position.copy(from).add(to).multiplyScalar(0.5); beam.quaternion.setFromUnitVectors(up, from.clone().sub(to).normalize());
    beam.renderOrder = 8; ctx.add(beam, bg);
  });
  ctx.disposables.push(...beamMats);
  // big hanging screens high on the bowl (gold frames, steel hangers)
  for (const [a, cell] of [[Math.PI / 2 - 0.13, FC.FIGHT], [Math.PI / 2 + 0.13, FC.SCORE], [-Math.PI / 2 - 0.13, FC.SCORE], [-Math.PI / 2 + 0.13, FC.FIGHT], [Math.PI, FC.FIGHT]]) {
    const [x, , z] = P(BACK.r0 - 1.6, a), yw = yawIn(a), cy = 17.6;
    obox(L, x + 0.12 * Math.cos(a), cy, z + 0.12 * Math.sin(a), 8.9, 5.3, 0.2, yw, 'cpGold');
    obox(L, x + 0.06 * Math.cos(a), cy, z + 0.06 * Math.sin(a), 8.6, 5.0, 0.16, yw, 'blackMetal');
    scr.push({ x: x - 0.04 * Math.cos(a), y: e + cy, z: z - 0.04 * Math.sin(a), yaw: yw, w: 8.4, h: 4.73, cell });
    for (const o of [-3.2, 3.2]) { const [cx, , cz] = P(BACK.r0 - 1.5, a + o / (BACK.r0 - 1.5)); L.cyl(cx, cz, 0.035, cy + 2.65, domeY(BACK.r0 - 1.5), 'steel', { seg: 4 }); }
  }

  // ================================================================ the arrivals hall (shared Phase 1 lift-hall design, narrow)
  luxLiftHall(ctx, L, {
    s: 1, H: 10, depth: 14, z0: -39.65, z1: 29.65, portal: { half: ENTRY.half, top: 7 },
    endDoor: { side: -1, d0: 38.5, d1: 41.5, top: 2.8 },
    P: { wall: 'cpRed', wallDeep: 'cpDark', panel: 'cpPanelWarm', frame: 'cpGoldSatin', frameDark: 'cpDark', dado: 'walnut', cap: 'cpGoldSatin', floor: 'cpStone', floorTile: 2.4,
      runner: 'cpRunner', edge: 'cpGoldSatin', liner: 'brushedBronze', ink: '#f2c14a', kioskBg: '#2a0a06', kioskBtn: '#7a1218', kioskEdge: '#d9a441', hostSuit: 0x5a0f12 },
    ceo: 'ceo_vt',
    banks: [['vt_low', 'WELLNESS LOW-RISE · L · 1–2', true], ['vt_high', 'WELLNESS HIGH-RISE · L · 3–4', true], ['freight_vt', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['vt_high', ['L', '3', '4']]],
    link: null,
    portalText: 'COMBAT SPORTS ANALYTICS PAVILION', portalSub: 'Muay Thai tonight · Discipline, heritage, conviction',
    board: (c, x, y, z, yaw, w, h) => scr.push({ x: x + 0.02, y: e + y - 0.4, z, yaw, w: 3.4, h: 1.91, cell: FC.CARD }),
  });

  // ================================================================ seats (instanced, chunked by sector) + finish
  const seatGeo = (() => {
    const parts = [new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.42, 0.02), new THREE.BoxGeometry(0.46, 0.42, 0.06).translate(0, 0.66, -0.2), new THREE.BoxGeometry(0.08, 0.38, 0.08).translate(0, 0.19, -0.05)];
    const pos = [], nor = [];
    for (const g of parts) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
  })();
  const buckets = new Map();
  for (const s of seats) { const k = `${s[1] > XA.y ? 1 : 0}:${Math.floor((Math.atan2(s[2] - C.z, s[0] - C.x) + Math.PI) / (TAU / 16))}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(s); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  for (const list of buckets.values()) {
    const mesh = new THREE.InstancedMesh(seatGeo, LM.cpSeat, list.length);
    list.forEach(([x, y, z, yw, c], i) => { mesh.setMatrixAt(i, m4.compose(p.set(x, e + y, z), q.setFromAxisAngle(up, yw), one)); mesh.setColorAt(i, col.set(c)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); ctx.add(mesh);
  }
  ctx.disposables.push(seatGeo);
  for (const m of buildFightScreens(scr)) ctx.add(m, m.geometry);

  // breathing ceiling: the sak yant glow pulses slowly (~5 s per breath); the beams stay steady
  let tb = 0;
  ctx.breath = () => 0.35 + 0.8 * (0.5 - 0.5 * Math.cos((tb / 5) * TAU));
  ctx.onUpdate((dt) => { tb += dt; domeMat.color.setScalar(ctx.breath()); updateFightScreens(dt, ctx.group.visible); });
  ctx.shapes = [pavilionShape(e, H)];
  ctx.seatCount = seats.length;
  ctx.pavilionStats = { seats: seats.length, people: L.people.length, screens: scr.length };
  L.build();
}
