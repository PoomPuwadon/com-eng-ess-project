import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LM, addLuxMaterials } from './lux.js';
import { CHIPS, chipsFor } from '../apps/rouletteBoard.js';

// VT-01 Leisure Suite: the fully modelled card and dice tables (everything except the roulette, which has
// its own live model in rouletteTable.js and is the quality bar for this kit).
//
// Every table is built in a LOCAL frame and placed with T = { x, z, yaw }:
//   the dealer (or boxman) stands on the -z side, the players sit on the +z side, felt layouts are
//   printed with the dealer at the top of the canvas so the text reads upright from the players' chairs.
// Static parts (bodies, padded rails, felts, shoes, trays, chips, chairs) merge into the floor's per-material
// meshes (a handful of draw calls for the whole room); the moving parts (dealt cards, dice) are two
// InstancedMeshes driven by a dealer timeline per table (TableLife).
// The same layouts (card spots, shoe, dice path, puck) are handed to the seated view (src/apps/tableSeat.js)
// through ctx.games[kind][i].layout, so what you see at the table and from the aisle is one model.

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const TAU = Math.PI * 2;
const ease3 = (u) => 1 - (1 - u) ** 3;
const mg = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.clearGroups(); return n; })); // merge mixed indexed / non-indexed parts
export const CHIP = { r: 0.02, h: 0.0066 };
export const CARD = { w: 0.07, h: 0.098 };
export const DIE = 0.032;
export const FELT_Y = { table: 0.806, craps: 0.722 };

// ---------------------------------------------------------------- canvas helpers
function canvasTex(w, h, draw, { srgb = true, repeat = false, mip = true, scale = 1 } = {}) { // scale: draw in w x h units on a sharper canvas
  const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d'); g.scale(scale, scale); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.anisotropy = 8;
  return t;
}
function fit(g, text, maxW, size, weight = '700', family = 'Georgia, serif') {
  let s = size; do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 6);
}
function feltBase(g, w, h, inner, outer) {
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.62);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const r = rng(5); // the nap of the cloth
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
/** text along a circle centred at (cx, cy), centred on angle th (canvas angles, y down), reading left to right */
function arcText(g, text, cx, cy, rad, th, px, color, weight = '700') {
  g.save(); g.fillStyle = color; g.font = `${weight} ${px}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const widths = [...text].map((ch) => g.measureText(ch).width + px * 0.06), total = widths.reduce((a, b) => a + b, 0);
  let a = th + total / rad / 2;
  [...text].forEach((ch, i) => {
    const da = widths[i] / rad; a -= da / 2;
    g.save(); g.translate(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); g.rotate(a - Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    a -= da / 2;
  });
  g.restore();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

// ---------------------------------------------------------------- playing cards (shared by the aisle and the seat)
const RED_SUIT = new Set(['♥', '♦']);
const PIP = {
  2: [[0, -1], [0, 1]], 3: [[0, -1], [0, 0], [0, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  7: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -0.5]], 8: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -0.5], [0, 0.5]],
  9: [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1], [0, 0]],
  10: [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1], [0, -2 / 3], [0, 2 / 3]],
};
/** draw a card face into (x, y, w, h). label like "10♥", "A♠", "T♣" (T = ten) */
export function drawCardFace(g, x, y, w, h, label) {
  const suit = label.slice(-1), rank = label.slice(0, -1).replace('T', '10'), ink = RED_SUIT.has(suit) ? '#c8102e' : '#15171c';
  g.save(); g.translate(x, y);
  rrect(g, 1, 1, w - 2, h - 2, w * 0.09); g.fillStyle = '#fbfaf4'; g.fill(); g.lineWidth = Math.max(1, w * 0.012); g.strokeStyle = '#cfc8b4'; g.stroke();
  const corner = () => {
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, rank, w * 0.2, w * 0.2, '800'); g.fillText(rank, w * 0.12, h * 0.085);
    g.font = `${w * 0.15}px "Segoe UI Symbol", Arial`; g.fillText(suit, w * 0.12, h * 0.19);
  };
  corner(); g.save(); g.translate(w, h); g.rotate(Math.PI); corner(); g.restore();
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = Number(rank);
  if (PIP[n]) {
    const ps = w * 0.2;
    for (const [px, py] of PIP[n]) {
      g.save(); g.translate(w / 2 + px * w * 0.22, h / 2 + py * h * 0.3); if (py > 0) g.rotate(Math.PI);
      g.font = `${ps}px "Segoe UI Symbol", Arial`; g.fillText(suit, 0, 0); g.restore();
    }
  } else if (rank === 'A') {
    g.font = `${w * 0.5}px "Segoe UI Symbol", Arial`; g.fillText(suit, w / 2, h / 2 + w * 0.02);
  } else { // court card: gold frame, big letter, suit above and below
    g.strokeStyle = '#c9a24a'; g.lineWidth = w * 0.02; rrect(g, w * 0.22, h * 0.15, w * 0.56, h * 0.7, w * 0.04); g.stroke();
    const grd = g.createLinearGradient(0, h * 0.15, 0, h * 0.85); grd.addColorStop(0, RED_SUIT.has(suit) ? '#fbe3e3' : '#e3e8f5'); grd.addColorStop(1, '#f7efd8');
    g.fillStyle = grd; rrect(g, w * 0.24, h * 0.16, w * 0.52, h * 0.68, w * 0.03); g.fill();
    g.fillStyle = ink; fit(g, rank, w * 0.4, w * 0.42, '800'); g.fillText(rank, w / 2, h / 2 + w * 0.02);
    g.font = `${w * 0.14}px "Segoe UI Symbol", Arial`; g.fillText(suit, w / 2, h * 0.25);
    g.save(); g.translate(w / 2, h * 0.75); g.rotate(Math.PI); g.fillText(suit, 0, 0); g.restore();
  }
  g.restore();
}
export function drawCardBack(g, x, y, w, h) {
  g.save(); g.translate(x, y);
  rrect(g, 1, 1, w - 2, h - 2, w * 0.09); g.fillStyle = '#fbfaf4'; g.fill();
  rrect(g, w * 0.07, w * 0.07, w - w * 0.14, h - w * 0.14, w * 0.05); g.fillStyle = '#13265a'; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(227,194,122,0.55)'; g.lineWidth = Math.max(1, w * 0.012);
  for (let k = -h; k < w + h; k += w * 0.09) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
  g.restore();
  g.fillStyle = '#13265a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, TAU); g.fill();
  g.strokeStyle = '#e3c27a'; g.lineWidth = w * 0.025; g.stroke();
  g.fillStyle = '#e3c27a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, 'FF', w * 0.3, w * 0.2, '800'); g.fillText('FF', w / 2, h / 2 + 1);
  g.restore();
}
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const ATLAS = { cols: 8, rows: 4, cw: 128, ch: 180 }; // 31 faces + the back in cell 31
let cardAtlasTex = null;
function cardAtlas() {
  if (cardAtlasTex) return cardAtlasTex;
  const r = rng(321);
  cardAtlasTex = canvasTex(ATLAS.cols * ATLAS.cw, ATLAS.rows * ATLAS.ch, (g) => {
    for (let i = 0; i < 32; i++) {
      const x = (i % ATLAS.cols) * ATLAS.cw, y = Math.floor(i / ATLAS.cols) * ATLAS.ch;
      if (i === 31) drawCardBack(g, x, y, ATLAS.cw, ATLAS.ch);
      else drawCardFace(g, x, y, ATLAS.cw, ATLAS.ch, RANKS[Math.floor(r() * 13)] + SUITS[Math.floor(r() * 4)]);
    }
  });
  return cardAtlasTex;
}

// ---------------------------------------------------------------- chips: vertex colour + an edge-insert pattern (one material)
function chipPatternTex() {
  return canvasTex(64, 64, (g, w, h) => { // R = white edge insert, G = shade (the groove between two chips)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = 1 - y / h;
      const ins = u > 0.34 && u < 0.66 && v > 0.22 && v < 0.78 ? 255 : 0;
      const sh = v < 0.07 || v > 0.93 ? 120 : 255;
      g.fillStyle = `rgb(${ins},${sh},0)`; g.fillRect(x, y, 1, 1);
    }
  }, { srgb: false, repeat: true });
}
/** a column of n chips as one cylinder (inserts and grooves come from the pattern) */
export function chipCyl(n = 1, r = CHIP.r, h = CHIP.h, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, h * n, seg, 1);
  const uv = g.attributes.uv, p = g.attributes.position, [side, top, bot] = g.groups;
  for (let i = side.start; i < side.start + side.count; i++) { const k = g.index.getX(i); uv.setXY(k, (Math.atan2(p.getZ(k), p.getX(k)) / TAU + 0.5) * 8, (p.getY(k) / (h * n) + 0.5) * n); }
  for (const grp of [top, bot]) {
    const seen = new Set(); let c = 0;
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const k = g.index.getX(i); if (seen.has(k)) continue; seen.add(k);
      const rr = Math.hypot(p.getX(k), p.getZ(k));
      if (rr < 1e-6) { uv.setXY(k, ((c + 0.5) / seg) * 8, 0.12); c++; } else uv.setXY(k, (Math.atan2(p.getZ(k), p.getX(k)) / TAU + 0.5) * 8, 0.5);
    }
  }
  return g;
}
/** a mixed stack (bottom first) as one geometry with per-chip vertex colours, base at y = 0 */
export function chipStackGeometry(colours, r = CHIP.r, h = CHIP.h) {
  const parts = []; let y = 0;
  for (let i = 0; i < colours.length;) {
    let j = i; while (j < colours.length && colours[j] === colours[i]) j++;
    const n = j - i, g = chipCyl(n, r, h).toNonIndexed(); g.translate(0, y + (n * h) / 2, 0);
    const c = new THREE.Color(colours[i]), a = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); y += n * h; i = j;
  }
  return parts.length ? mergeGeometries(parts) : null;
}
function chipMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: chipPatternTex(), roughness: 0.42, metalness: 0.02 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '').replace('#include <color_fragment>',
      '#if defined( USE_COLOR ) && defined( USE_MAP )\n vec4 chipT = texture2D( map, vMapUv );\n diffuseColor.rgb = mix( vColor.rgb, vec3( 0.95 ), chipT.r ) * ( 0.45 + 0.55 * chipT.g );\n#endif');
  };
  m.customProgramCacheKey = () => 'leisureChip';
  return m;
}

// ---------------------------------------------------------------- dice: rounded cubes, red translucent look, one atlas
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export const DIE_FACES = [2, 5, 1, 6, 3, 4]; // +x, -x, +y, -y, +z, -z (opposite faces sum to 7)
export const DIE_UP = [null, [0, 0, 0], [0, 0, Math.PI / 2], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0], [0, 0, -Math.PI / 2], [Math.PI, 0, 0]]; // euler bringing face n to +y
let dieKit = null;
export function dieAssets() {
  if (dieKit) return dieKit;
  const tex = canvasTex(384, 256, (g) => {
    for (let n = 1; n <= 6; n++) {
      const x = ((n - 1) % 3) * 128, y = Math.floor((n - 1) / 3) * 128;
      const grd = g.createRadialGradient(x + 50, y + 44, 8, x + 64, y + 64, 96); grd.addColorStop(0, '#f0364a'); grd.addColorStop(1, '#9e0b1c');
      g.fillStyle = grd; g.fillRect(x, y, 128, 128);
      for (const [px, py] of PIPS[n]) {
        const cx = x + 64 + px * 32, cy = y + 64 + py * 32;
        g.fillStyle = 'rgba(70,0,8,0.55)'; g.beginPath(); g.arc(cx + 1.5, cy + 2, 12.5, 0, TAU); g.fill();
        g.fillStyle = '#fbf8ef'; g.beginPath(); g.arc(cx, cy, 11.5, 0, TAU); g.fill();
      }
    }
  });
  const geo = new RoundedBoxGeometry(DIE, DIE, DIE, 3, DIE * 0.14);
  const uv = geo.attributes.uv;
  geo.groups.forEach((grp, gi) => {
    const n = DIE_FACES[gi], cx = (n - 1) % 3, cy = Math.floor((n - 1) / 3), seen = new Set();
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const k = geo.index ? geo.index.getX(i) : i; if (seen.has(k)) continue; seen.add(k);
      uv.setXY(k, (cx + Math.min(1, Math.max(0, uv.getX(k)))) / 3, 1 - (cy + 1) / 2 + Math.min(1, Math.max(0, uv.getY(k))) / 2);
    }
  });
  geo.clearGroups();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0.0, envMapIntensity: 1.2 });
  dieKit = { geo, mat };
  return dieKit;
}
export const dieQuat = (n, yaw = 0, out = new THREE.Quaternion()) => out.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...DIE_UP[n])));

// ---------------------------------------------------------------- felt layouts (canvas top = dealer side, -z)
const FELTS = {};
function feltBJ() {
  const R = 1.78, W = 1024, k = W / (2 * R);
  return canvasTex(W, Math.round(R * k), (g, w, h) => {
    feltBase(g, w, h, '#1c8250', '#0c4a2b');
    const cx = w / 2, P = (r) => r * k, gold = '#e8c779';
    g.strokeStyle = gold; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, 0, P(1.7), 0, Math.PI); g.stroke(); // inner border
    for (const r of [0.6, 0.72]) { g.beginPath(); g.arc(cx, 0, P(r), 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
    arcText(g, 'DOUBLE ON ANY TWO CARDS · TWENTY-ONE ADVISORY', cx, 0, P(0.66), Math.PI / 2, 12, gold, '600');
    arcText(g, 'BLACKJACK PAYS 3 TO 2', cx, 0, P(0.94), Math.PI / 2, 22, gold, '800');
    arcText(g, 'DEALER MUST STAND ON ALL 17s', cx, 0, P(0.85), Math.PI / 2, 14, '#f4eedc', '600');
    for (let s = 0; s < 6; s++) { // betting circles in front of the six chairs
      const a = ((s + 0.5) / 6) * Math.PI, x = cx + Math.cos(a) * P(1.42), y = Math.sin(a) * P(1.42);
      g.lineWidth = 4; g.strokeStyle = gold; g.beginPath(); g.arc(x, y, P(0.12), 0, TAU); g.stroke();
      g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, P(0.095), 0, TAU); g.stroke();
      g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2); g.fillStyle = 'rgba(232,199,121,0.8)'; g.font = '700 10px Georgia, serif'; g.textAlign = 'center'; g.fillText(String(6 - s), 0, P(0.16)); g.restore();
    }
    g.fillStyle = 'rgba(232,199,121,0.5)'; g.strokeStyle = gold; g.lineWidth = 2; // dealer's card spot
    rrect(g, cx - P(0.2), P(0.28), P(0.4), P(0.16), 8); g.stroke();
  }, { scale: 2 });
}
function feltBaccarat() {
  const rx = 1.98, rz = 0.93, W = 1024, k = W / (2 * rx), H = Math.round(2 * rz * k);
  return canvasTex(W, H, (g, w, h) => {
    feltBase(g, w, h, '#8c1426', '#480812');
    const gold = '#efcf86', X = (x) => (x + rx) * k, Y = (z) => (z + rz) * k;
    g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 10, h / 2 - 10, 0, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 18, h / 2 - 18, 0, 0, TAU); g.stroke();
    for (let s = 0; s < 7; s++) { // numbered positions: banker / player / tie boxes facing each chair
      const a = -Math.PI / 2 + ((s + 1) / 8) * TAU, px = Math.cos(a) * rx * 0.74, pz = Math.sin(a) * rz * 0.66;
      if (s === 0 || s === 6) continue; // the two places beside the dealer stay for the hands
      g.save(); g.translate(X(px), Y(pz)); g.rotate(a - Math.PI / 2);
      g.lineWidth = 2.5; g.strokeStyle = gold; g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 1.5; rrect(g, -32, -20, 64, 18, 4); g.stroke(); rrect(g, -32, 1, 64, 18, 4); g.stroke();
      g.font = '700 10px Georgia, serif'; g.fillText('BANKER', 0, -11); g.fillText('PLAYER', 0, 10);
      g.beginPath(); g.arc(0, 32, 9, 0, TAU); g.stroke(); g.font = '700 9px Georgia, serif'; g.fillText(String(s + 1), 0, 32);
      g.restore();
    }
    g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'PUNTO BANCO', 260, 26, '800'); g.fillText('PUNTO BANCO', w / 2, Y(0.02));
    fit(g, 'BANKER PAYS 0.95 TO 1 · TIE PAYS 8 TO 1', 300, 12, '600'); g.fillText('BANKER PAYS 0.95 TO 1 · TIE PAYS 8 TO 1', w / 2, Y(0.13));
    for (const [t, x] of [['PLAYER', -0.42], ['BANKER', 0.42]]) { // the two hands, by the dealer
      g.lineWidth = 3; g.strokeStyle = gold; rrect(g, X(x) - 0.27 * k, Y(-0.52), 0.54 * k, 0.24 * k, 10); g.stroke();
      g.font = '700 12px Georgia, serif'; g.fillText(t, X(x), Y(-0.24));
    }
  }, { scale: 2 });
}
function feltPoker(inner, outer, a, R) {
  const rx = a + R - 0.12, rz = R - 0.12, W = 1024, k = W / (2 * rx), H = Math.round(2 * rz * k);
  return canvasTex(W, H, (g, w, h) => {
    feltBase(g, w, h, inner, outer);
    const gold = '#e9cf8e', X = (x) => (x + rx) * k, Y = (z) => (z + rz) * k;
    const track = (inset) => { const r = (R - 0.12 - inset) * k; g.beginPath(); g.moveTo(X(-a), Y(-(R - 0.12 - inset))); g.lineTo(X(a), Y(-(R - 0.12 - inset))); g.arc(X(a), Y(0), r, -Math.PI / 2, Math.PI / 2); g.lineTo(X(-a), Y(R - 0.12 - inset)); g.arc(X(-a), Y(0), r, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
    g.strokeStyle = gold; g.lineWidth = 3; track(0.24); g.stroke(); g.lineWidth = 1.2; track(0.27); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(233,207,142,0.75)';
    for (let i = 0; i < 5; i++) { rrect(g, X(-0.38 + i * 0.16) - 0.06 * k, Y(-0.05) - 0.075 * k, 0.12 * k, 0.15 * k, 6); g.stroke(); }
    g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'PRIVATE CARD SALON', 260, 20, '800'); g.fillText('PRIVATE CARD SALON', w / 2, Y(-0.34));
    fit(g, 'STRATEGIC NEGOTIATION · NOTIONAL CREDITS ONLY', 300, 11, '600'); g.fillText('STRATEGIC NEGOTIATION · NOTIONAL CREDITS ONLY', w / 2, Y(0.2));
  }, { scale: 2 });
}
function feltCraps() {
  const rx = 2.6, rz = 1.0, W = 1024, k = W / (2 * rx), H = Math.round(2 * rz * k);
  return canvasTex(W, H, (g, w, h) => {
    feltBase(g, w, h, '#1a7d4c', '#0d4a2c');
    const line = '#f4f0e2', gold = '#f2cf6e', X = (x) => (x + rx) * k, Y = (z) => (z + rz) * k;
    g.strokeStyle = line; g.fillStyle = line; g.lineWidth = 3; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const sx of [-1, 1]) { // the two identical ends
      const x0 = sx > 0 ? 0.86 : -2.56, x1 = sx > 0 ? 2.56 : -0.86, xi = sx > 0 ? x0 : x1, xo = sx > 0 ? x1 : x0;
      ['4', '5', 'SIX', '8', 'NINE', '10'].forEach((n, i) => { // place numbers, in front of the base dealers
        const bx = x0 + i * ((x1 - x0) / 6); g.strokeRect(X(bx), Y(-0.95), ((x1 - x0) / 6) * k, 0.4 * k);
        g.fillStyle = n === 'SIX' || n === 'NINE' ? gold : line; fit(g, n, ((x1 - x0) / 6) * k - 10, 24, '800'); g.fillText(n, X(bx + (x1 - x0) / 12), Y(-0.75)); g.fillStyle = line;
      });
      g.strokeRect(X(x0), Y(-0.52), (x1 - x0) * k, 0.33 * k); fit(g, 'COME', 200, 28, '800'); g.fillStyle = '#e04848'; g.fillText('COME', X((x0 + x1) / 2), Y(-0.355)); g.fillStyle = line;
      g.strokeRect(X(x0), Y(-0.16), (x1 - x0) * k, 0.34 * k);
      g.fillStyle = gold; fit(g, '2 · 3 · 4 · 9 · 10 · 11 · 12', (x1 - x0) * k - 90, 22, '800'); g.fillText('2 · 3 · 4 · 9 · 10 · 11 · 12', X((x0 + x1) / 2), Y(-0.02));
      g.fillStyle = line; fit(g, 'FIELD', 120, 18, '700'); g.fillText('FIELD', X((x0 + x1) / 2), Y(0.12));
      g.strokeRect(X(x0), Y(0.21), (x1 - x0) * k, 0.22 * k); fit(g, "DON'T PASS BAR", 300, 18, '700'); g.fillText("DON'T PASS BAR", X((x0 + x1) / 2), Y(0.32));
      // the pass line runs along the players' edge and up the outer end
      g.lineWidth = 3; g.beginPath(); g.moveTo(X(xi), Y(0.47)); g.lineTo(X(xo - sx * 0.32), Y(0.47)); g.lineTo(X(xo - sx * 0.32), Y(-0.52)); g.lineTo(X(xo), Y(-0.52)); g.lineTo(X(xo), Y(0.95)); g.lineTo(X(xi), Y(0.95)); g.closePath(); g.stroke();
      fit(g, 'PASS LINE', 300, 32, '800'); g.fillText('PASS LINE', X((x0 + x1) / 2 - sx * 0.14), Y(0.72));
    }
    // centre: the proposition box in front of the stickman (+z)
    g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(X(-0.78), Y(-0.95), 1.56 * k, 1.9 * k);
    g.fillStyle = '#e04848'; fit(g, 'SEVEN · 4 FOR 1', 290, 30, '800'); g.fillText('SEVEN · 4 FOR 1', w / 2, Y(-0.8));
    const die = (cx, cy, n) => { g.fillStyle = '#f4f0e2'; rrect(g, cx - 14, cy - 14, 28, 28, 5); g.fill(); g.fillStyle = '#c0141f'; for (const [px, py] of PIPS[n]) { g.beginPath(); g.arc(cx + px * 7, cy + py * 7, 3, 0, TAU); g.fill(); } };
    [[2, 2], [3, 3], [4, 4], [5, 5]].forEach(([a, b], i) => { const cx = X(-0.58 + (i % 2) * 0.78), cy = Y(-0.48 + Math.floor(i / 2) * 0.42); g.strokeStyle = line; g.strokeRect(cx - 10, cy - 34, 0.72 * k, 0.36 * k); die(cx + 24, cy - 6, a); die(cx + 56, cy - 6, b); g.fillStyle = line; fit(g, i < 2 ? '9 FOR 1' : '7 FOR 1', 70, 16, '700'); g.fillText(i < 2 ? '9 FOR 1' : '7 FOR 1', cx + 0.55 * k, cy - 6); });
    g.fillStyle = gold; fit(g, 'ANY 2 · 3 · 12 — 8 FOR 1', 290, 22, '700'); g.fillText('ANY 2 · 3 · 12 — 8 FOR 1', w / 2, Y(0.38));
    g.fillStyle = line; fit(g, 'KINETIC PROBABILITY PIT', 290, 22, '800'); g.fillText('KINETIC PROBABILITY PIT', w / 2, Y(0.72));
  }, { scale: 2 });
}
function bumperTex() { // rubber pyramids lining the walls, so the dice bounce fairly
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#0c2a1c'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 32 + 16, cy = y * 32 + 16;
      g.fillStyle = '#1f5a3e'; g.beginPath(); g.moveTo(cx, cy - 15); g.lineTo(cx + 15, cy); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.fillStyle = '#0a2216'; g.beginPath(); g.moveTo(cx, cy + 15); g.lineTo(cx - 15, cy); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.fillStyle = '#2f7552'; g.beginPath(); g.moveTo(cx, cy - 15); g.lineTo(cx - 15, cy); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.fillStyle = '#123828'; g.beginPath(); g.moveTo(cx, cy + 15); g.lineTo(cx + 15, cy); g.lineTo(cx, cy); g.closePath(); g.fill();
    }
  }, { repeat: true });
}
function mahoganyTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(19); g.fillStyle = '#5a2416'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const y = r() * h, a = 0.05 + r() * 0.12; g.strokeStyle = r() < 0.5 ? `rgba(30,8,4,${a})` : `rgba(140,60,36,${a})`; g.lineWidth = 0.8 + r() * 3;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 6 + (r() - 0.5) * 2); g.stroke();
    }
  }, { repeat: true });
}
function signAtlas() { // table limit plaques: 4 rows
  return canvasTex(512, 512, (g) => {
    [['TWENTY-ONE ADVISORY', 'MIN 100 · MAX 10,000'], ['PRIVATE BANKING', 'MIN 500 · MAX 50,000'], ['STRATEGIC NEGOTIATION', 'ANTE 100 · ONE RAISE'], ['KINETIC PROBABILITY', 'MIN 100 · MAX 10,000']].forEach(([a, b], i) => {
      const y = i * 128; const grd = g.createLinearGradient(0, y, 0, y + 128); grd.addColorStop(0, '#2a0d44'); grd.addColorStop(1, '#12051f');
      g.fillStyle = grd; g.fillRect(0, y, 512, 128); g.strokeStyle = '#f2c14a'; g.lineWidth = 6; g.strokeRect(6, y + 6, 500, 116);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd877'; fit(g, a, 470, 38, '800'); g.fillText(a, 256, y + 44);
      g.fillStyle = '#f4eedc'; fit(g, b, 470, 34, '700', 'Consolas, monospace'); g.fillText(b, 256, y + 90);
    });
  });
}
function roadTex() { // the Private Banking results board (bead road)
  return canvasTex(256, 384, (g) => {
    const r = rng(88); g.fillStyle = '#0b0d14'; g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#ffd877'; g.textAlign = 'center'; fit(g, 'RESULTS', 220, 30, '800'); g.fillText('RESULTS', 128, 30);
    g.strokeStyle = '#2a2f3d'; g.lineWidth = 1;
    for (let c = 0; c < 8; c++) for (let rr = 0; rr < 10; rr++) {
      const x = 20 + c * 29 + 14, y = 56 + rr * 31 + 14; g.strokeRect(x - 14, y - 15, 29, 31);
      if (c * 10 + rr > 61) continue;
      const v = r(); g.fillStyle = v < 0.46 ? '#e0283c' : v < 0.91 ? '#2f6fe0' : '#2bb05a'; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
    }
    g.fillStyle = '#9aa3b2'; fit(g, 'B 46 · P 45 · T 9', 220, 20, '700', 'Consolas, monospace'); g.fillText('B 46 · P 45 · T 9', 128, 372);
  });
}

let READY = false;
function initKit() {
  if (READY) return; READY = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  FELTS.bj = feltBJ(); FELTS.bac = feltBaccarat(); FELTS.poker = feltPoker('#167068', '#0a3c38', 0.85, 1.05); FELTS.high = feltPoker('#8c1426', '#480812', 1.0, 1.2); FELTS.craps = feltCraps();
  const signs = signAtlas(), road = roadTex(), bump = bumperTex(); bump.repeat.set(1, 1);
  addLuxMaterials({
    lkFeltBJ: std({ map: FELTS.bj, roughness: 0.96 }), lkFeltBac: std({ map: FELTS.bac, roughness: 0.96 }),
    lkFeltPoker: std({ map: FELTS.poker, roughness: 0.96 }), lkFeltHigh: std({ map: FELTS.high, roughness: 0.96 }), lkFeltCraps: std({ map: FELTS.craps, roughness: 0.96 }),
    lkMahogany: std({ map: mahoganyTex(), roughness: 0.3, metalness: 0.06 }),
    lkLeather: std({ color: 0x2a120c, roughness: 0.42, metalness: 0.0 }),
    lkLacquer: std({ color: 0x121217, roughness: 0.16, metalness: 0.35 }),
    lkChrome: std({ color: 0xe8e8ee, roughness: 0.12, metalness: 1.0 }),
    lkCardStack: std({ color: 0xf2ecdc, roughness: 0.7 }),
    lkBumper: std({ map: bump, roughness: 0.55 }),
    lkSign: std({ map: signs, emissive: 0xffffff, emissiveMap: signs, emissiveIntensity: 0.8, roughness: 0.4 }),
    lkRoad: std({ map: road, emissive: 0xffffff, emissiveMap: road, emissiveIntensity: 0.9, roughness: 0.4 }),
    lkChip: chipMaterial(),
  }, { lkMahogany: 1.6, lkBumper: 0.24 });
}

// ---------------------------------------------------------------- geometry helpers (local frame → world)
const toWorld = (T, lx, lz) => [T.x + lx * Math.cos(T.yaw) + lz * Math.sin(T.yaw), T.z - lx * Math.sin(T.yaw) + lz * Math.cos(T.yaw)];
const put = (L, g, mat, T, color) => L.geo(g.rotateY(T.yaw).translate(T.x, 0, T.z), mat, color);
function box(x0, x1, y0, y1, z0, z1) { return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
function rbox(x0, x1, y0, y1, z0, z1, r, seg = 2) { return new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, seg, r).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
function cyl(x, z, r, y0, y1, seg = 16, rTop = r) { return new THREE.CylinderGeometry(rTop, r, y1 - y0, seg).translate(x, (y0 + y1) / 2, z); }
/** extrude a Shape (x, y = -z) upward from y0 to y1 */
function slab(shape, y0, y1, seg = 24) { return new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: seg }).rotateX(-Math.PI / 2).translate(0, y0, 0); }
function flat(shape, y, seg = 48) { return new THREE.ShapeGeometry(shape, seg).rotateX(-Math.PI / 2).translate(0, y, 0); }
function feltUV(g, x0, x1, z0, z1) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x0) / (x1 - x0), 1 - (p.getZ(i) - z0) / (z1 - z0));
  return g;
}
class Loop extends THREE.Curve { constructor(fn, y) { super(); this.fn = fn; this.y = y; } getPoint(t, o = new THREE.Vector3()) { const [x, z] = this.fn(t); return o.set(x, this.y, z); } }
const tube = (fn, y, rad, segs = 96, radial = 8) => new THREE.TubeGeometry(new Loop(fn, y), segs, rad, radial, true);
const ellipseFn = (rx, rz) => (t) => [Math.cos(t * TAU) * rx, Math.sin(t * TAU) * rz];
/** a point on a stadium outline (half straight a, end radius R), t in [0, 1), and its outward normal */
function stadiumAt(a, R, t) {
  const L = 4 * a + TAU * R; let d = ((t % 1) + 1) % 1 * L;
  if (d < 2 * a) return { p: [-a + d, -R], n: [0, -1] }; d -= 2 * a;
  if (d < Math.PI * R) { const ang = -Math.PI / 2 + d / R; return { p: [a + Math.cos(ang) * R, Math.sin(ang) * R], n: [Math.cos(ang), Math.sin(ang)] }; } d -= Math.PI * R;
  if (d < 2 * a) return { p: [a - d, R], n: [0, 1] }; d -= 2 * a;
  const ang = Math.PI / 2 + d / R; return { p: [-a + Math.cos(ang) * R, Math.sin(ang) * R], n: [Math.cos(ang), Math.sin(ang)] };
}
const stadiumFn = (a, R) => (t) => stadiumAt(a, R, t).p;
function stadiumShape(a, R) { const s = new THREE.Shape(); s.moveTo(-a, -R); s.lineTo(a, -R); s.absarc(a, 0, R, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-a, R); s.absarc(-a, 0, R, Math.PI / 2, Math.PI * 1.5, false); return s; }
function ellipseShape(rx, rz) { const s = new THREE.Shape(); s.absellipse(0, 0, rx, rz, 0, TAU, false, 0); return s; }
function halfDisc(R) { const s = new THREE.Shape(); s.moveTo(R, 0); s.absarc(0, 0, R, 0, -Math.PI, true); s.lineTo(R, 0); return s; } // y <= 0 (→ z >= 0)

/** a gaming chair: gold pedestal base, footrest ring, upholstered seat and a padded back (faces yaw) */
function tableChair(L, x, z, yaw, back = 'lsRed') {
  const T = { x, z, yaw };
  put(L, cyl(0, 0, 0.25, 0, 0.035, 10, 0.22), 'lsGold', T);
  put(L, cyl(0, 0, 0.045, 0.035, 0.44, 8), 'lkLacquer', T);
  put(L, new THREE.TorusGeometry(0.17, 0.011, 3, 12).rotateX(Math.PI / 2).translate(0, 0.24, 0), 'lsGold', T);
  put(L, rbox(-0.25, 0.25, 0.44, 0.56, -0.24, 0.24, 0.045, 1), 'lsChair', T);
  put(L, rbox(-0.23, 0.23, 0.6, 1.08, -0.04, 0.04, 0.035, 1).rotateX(-0.12).translate(0, 0, -0.27), back, T);
  put(L, box(-0.03, 0.03, 0.5, 0.66, -0.29, -0.24), 'lsGold', T);
}
const limitSign = (L, T, lx, lz, row, yaw = 0) => { // a small lit plaque on a gold stand, on the table
  const W = 0.34, H = 0.085, g = new THREE.PlaneGeometry(W, H), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) * 0.25);
  const tilt = new THREE.Matrix4().makeRotationX(-0.35);
  put(L, g.applyMatrix4(tilt).rotateY(yaw).translate(lx, FELT_Y.table + 0.11, lz), 'lkSign', T);
  put(L, box(-W / 2 - 0.01, W / 2 + 0.01, FELT_Y.table, FELT_Y.table + 0.065, -0.025, 0.0).rotateY(yaw).translate(lx, 0, lz), 'lkLacquer', T);
};
const SEAT_COL = ['lsRed', 'lsRed', 'lsVelvet'];

/** chips: a mixed stack for an amount, at local (lx, lz) */
function betStack(L, T, lx, lz, y, amount, r) {
  const cols = chipsFor(amount).slice(0, 10).reverse();
  let yy = y;
  for (let i = 0; i < cols.length;) { let j = i; while (j < cols.length && cols[j] === cols[i]) j++; const n = j - i; const jit = (r() - 0.5) * 0.003; put(L, chipCyl(n).translate(lx + jit, yy + (n * CHIP.h) / 2, lz + jit), 'lkChip', T, cols[i]); yy += n * CHIP.h; i = j; }
}
/** a dealer's tray: lacquer well, columns of chips lying in it */
function chipTray(L, T, x0, x1, z0, z1, y) {
  put(L, box(x0 - 0.02, x1 + 0.02, y - 0.012, y + 0.012, z0 - 0.02, z1 + 0.02), 'lkLacquer', T);
  const order = [3, 3, 2, 2, 1, 1, 1, 0, 0, 4], n = order.length, step = (x1 - x0) / n, len = z1 - z0 - 0.02;
  order.forEach((ci, i) => put(L, chipCyl(Math.floor(len / CHIP.h)).rotateX(Math.PI / 2).translate(x0 + step * (i + 0.5), y + CHIP.r * 0.55, (z0 + z1) / 2), 'lkChip', T, CHIPS[ci][1]));
}
/** the card shoe: black lacquer wedge with a gold front plate and the deck inside */
function shoe(L, T, lx, lz, yaw, y) {
  const s = new THREE.Shape(); s.moveTo(-0.17, 0); s.lineTo(0.17, 0); s.lineTo(0.17, 0.06); s.lineTo(0.12, 0.11); s.lineTo(-0.17, 0.11); s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 }).translate(0, 0, -0.075).rotateY(-Math.PI / 2);
  put(L, body.rotateY(yaw).translate(lx, y, lz), 'lkLacquer', T);
  const front = box(-0.065, 0.065, 0.012, 0.07, -0.002, 0.002).rotateX(-0.9).translate(0, y + 0.03, 0.17).rotateY(yaw).translate(lx, 0, lz); put(L, front, 'lsGold', T);
  put(L, box(-0.04, 0.04, y + 0.02, y + 0.1, -0.16, 0.12).rotateY(yaw).translate(lx, 0, lz), 'lkCardStack', T);
}
function discard(L, T, lx, lz, yaw, y) {
  put(L, box(-0.055, 0.055, y, y + 0.09, -0.075, 0.075).rotateY(yaw).translate(lx, 0, lz), 'glass', T);
  put(L, box(-0.047, 0.047, y + 0.002, y + 0.03, -0.065, 0.065).rotateY(yaw).translate(lx, 0, lz), 'lkCardStack', T);
  put(L, box(-0.058, 0.058, y - 0.004, y + 0.004, -0.078, 0.078).rotateY(yaw).translate(lx, 0, lz), 'lsGold', T);
}
const pedestal = (L, T, lx, lz, top, r = 0.2) => {
  put(L, cyl(lx, lz, r * 1.7, 0, 0.05, 14, r * 1.5), 'lsGold', T);
  put(L, cyl(lx, lz, r * 1.25, 0.05, top, 12, r), 'lkLacquer', T);
  put(L, cyl(lx, lz, r * 1.35, top - 0.06, top, 12), 'lsGold', T);
};
function collideLocal(ctx, T, x0, x1, z0, z1, y1) {
  const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([a, b]) => toWorld(T, a, b));
  ctx.colliders.push({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])), y0: ctx.e, y1: ctx.e + y1 });
}

// ================================================================= the tables
/** Twenty-One Advisory Table (half-moon). people = { seated(x, z, yaw), dealer(x, z, yaw) } (world) */
export function blackjackTable(L, ctx, r, T, people, life) {
  initKit();
  const R = 1.84, Y = FELT_Y.table;
  put(L, slab(halfDisc(R), Y - 0.13, Y - 0.006, 32), 'lkMahogany', T);
  put(L, new THREE.TorusGeometry(R, 0.012, 5, 40, Math.PI).rotateX(Math.PI / 2).translate(0, Y - 0.12, 0), 'lsGold', T);
  put(L, feltUV(flat(halfDisc(1.78), Y, 64), -1.78, 1.78, 0, 1.78), 'lkFeltBJ', T);
  put(L, new THREE.TorusGeometry(R, 0.072, 8, 32, Math.PI).rotateX(Math.PI / 2).translate(0, Y + 0.035, 0), 'lkLeather', T);
  for (const sx of [-1, 1]) put(L, new THREE.SphereGeometry(0.072, 10, 8).translate(sx * R, Y + 0.035, 0), 'lkLeather', T);
  put(L, new THREE.TorusGeometry(R + 0.07, 0.01, 4, 48, Math.PI).rotateX(Math.PI / 2).translate(0, Y + 0.0, 0), 'lsGold', T);
  put(L, box(-R - 0.06, R + 0.06, Y - 0.13, Y + 0.025, -0.07, 0.01), 'lkMahogany', T); // the dealer's edge
  put(L, box(-R - 0.06, R + 0.06, Y + 0.025, Y + 0.032, -0.07, 0.01), 'brushedBronze', T);
  pedestal(L, T, 0, 0.78, Y - 0.13, 0.26);
  chipTray(L, T, -0.46, 0.46, 0.05, 0.25, Y);
  shoe(L, T, 1.12, 0.3, -0.5, Y); discard(L, T, -1.12, 0.3, 0.5, Y);
  limitSign(L, T, -0.72, 0.1, 0);
  collideLocal(ctx, T, -R - 0.1, R + 0.1, -0.08, R + 0.1, 0.9);
  const [dx, dz] = toWorld(T, 0, -0.45); people.dealer(dx, dz, T.yaw);
  const HOME = 2, seats = [];
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * Math.PI, lx = Math.cos(a) * 2.42, lz = Math.sin(a) * 2.42, [wx, wz] = toWorld(T, lx, lz), yaw = Math.atan2(-lx, -lz) + T.yaw;
    tableChair(L, wx, wz, yaw);
    const occ = k !== HOME && r() < 0.72; seats.push({ a, occ });
    if (occ) { people.seated(wx, wz, yaw); betStack(L, T, Math.cos(a) * 1.42, Math.sin(a) * 1.42, Y, [500, 1200, 2500, 6000][Math.floor(r() * 4)], r); }
  }
  const spot = (a, i) => ({ x: Math.cos(a) * (1.13 - i * 0.03) - Math.sin(a) * i * 0.024, z: Math.sin(a) * (1.13 - i * 0.03) + Math.cos(a) * i * 0.024, yaw: Math.PI / 2 - a });
  const ha = seats[HOME].a;
  const layout = {
    feltY: Y, shoe: [1.12, 0.3], discard: [-1.12, 0.3],
    player: (i) => spot(ha, i), dealer: (i) => ({ x: -0.06 + i * 0.075, z: 0.37, yaw: 0 }),
    bet: [Math.cos(ha) * 1.42, Math.sin(ha) * 1.42],
    cam: [Math.cos(ha) * 2.62, 1.5, Math.sin(ha) * 2.62], look: [Math.cos(ha) * 0.6, Y, Math.sin(ha) * 0.6], fov: 46,
  };
  life.table(T, 'blackjack', layout, { seats: seats.map((s, i) => ({ ...s, i })).filter((s) => s.occ), spot });
  return layout;
}

/** Private Banking Table (punto banco, oval) */
export function baccaratTable(L, ctx, r, T, people, life) {
  initKit();
  const rx = 2.1, rz = 1.05, Y = FELT_Y.table;
  put(L, slab(ellipseShape(rx - 0.02, rz - 0.02), Y - 0.13, Y - 0.006, 40), 'lkMahogany', T);
  put(L, tube(ellipseFn(rx - 0.02, rz - 0.02), Y - 0.12, 0.012, 48, 3), 'lsGold', T);
  put(L, feltUV(flat(ellipseShape(rx - 0.12, rz - 0.12), Y, 64), -(rx - 0.12), rx - 0.12, -(rz - 0.12), rz - 0.12), 'lkFeltBac', T);
  put(L, tube(ellipseFn(rx - 0.05, rz - 0.05), Y + 0.035, 0.07, 72, 8), 'lkLeather', T);
  put(L, tube(ellipseFn(rx + 0.03, rz + 0.03), Y + 0.0, 0.01, 48, 3), 'lsGold', T);
  for (const sx of [-1, 1]) pedestal(L, T, sx * 0.9, 0, Y - 0.13, 0.18);
  chipTray(L, T, -0.36, 0.36, -0.86, -0.68, Y);
  shoe(L, T, 0.92, -0.62, -0.35, Y); discard(L, T, -0.92, -0.62, 0.35, Y);
  { // results board on a gold pole by the dealer's left
    const [bx, bz] = [rx + 0.15, -1.15];
    put(L, cyl(bx, bz, 0.035, 0, 1.7, 8), 'lsGold', T); put(L, cyl(bx, bz, 0.22, 0, 0.04, 14), 'lsGold', T);
    put(L, box(bx - 0.3, bx + 0.3, 1.55, 2.5, bz - 0.04, bz + 0.03), 'lkLacquer', T);
    put(L, new THREE.PlaneGeometry(0.54, 0.84).translate(bx, 2.025, bz + 0.032), 'lkRoad', T);
  }
  limitSign(L, T, 0, -0.5, 1);
  collideLocal(ctx, T, -rx, rx, -rz, rz, 0.9);
  const [dx, dz] = toWorld(T, 0, -rz - 0.35); people.dealer(dx, dz, T.yaw);
  const HOME = 3, seats = [];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + ((k + 1) / 8) * TAU, lx = Math.cos(a) * (rx + 0.55), lz = Math.sin(a) * (rz + 0.55), [wx, wz] = toWorld(T, lx, lz), yaw = Math.atan2(-lx, -lz) + T.yaw;
    tableChair(L, wx, wz, yaw, 'lsVelvet');
    const occ = k !== HOME && r() < 0.75; seats.push({ a, occ });
    if (occ && k !== 0 && k !== 6) { people.seated(wx, wz, yaw); betStack(L, T, Math.cos(a) * rx * 0.74, Math.sin(a) * rz * 0.66 + 0.02, Y, [1000, 2500, 5000, 12500][Math.floor(r() * 4)], r); }
    else if (occ) people.seated(wx, wz, yaw);
  }
  const layout = {
    feltY: Y, shoe: [0.92, -0.62], discard: [-0.92, -0.62],
    playerHand: (i) => ({ x: -0.58 + i * 0.1, z: -0.42, yaw: 0 }), bankerHand: (i) => ({ x: 0.26 + i * 0.1, z: -0.42, yaw: 0 }),
    bet: [0, rz * 0.66 - 0.05], cam: [0, 1.42, rz + 0.78], look: [0, Y, -0.32], fov: 44,
  };
  life.table(T, 'baccarat', layout, {});
  return layout;
}

/** Private Card Salon table (hold'em, stadium). high = the High-Conviction Salon's bigger red table */
export function pokerTable(L, ctx, r, T, people, life, { high = false } = {}) {
  initKit();
  const a = high ? 1.0 : 0.85, R = high ? 1.2 : 1.05, Y = FELT_Y.table;
  put(L, slab(stadiumShape(a, R - 0.02), Y - 0.13, Y - 0.006, 24), 'lkMahogany', T);
  put(L, tube(stadiumFn(a, R - 0.02), Y - 0.12, 0.012, 48, 3), 'lsGold', T);
  put(L, feltUV(flat(stadiumShape(a, R - 0.12), Y, 32), -(a + R - 0.12), a + R - 0.12, -(R - 0.12), R - 0.12), high ? 'lkFeltHigh' : 'lkFeltPoker', T);
  put(L, tube(stadiumFn(a, R - 0.05), Y + 0.035, 0.072, 72, 8), 'lkLeather', T);
  put(L, tube(stadiumFn(a, R + 0.03), Y, 0.01, 48, 3), 'lsGold', T);
  for (const sx of [-1, 1]) pedestal(L, T, sx * a * 0.85, 0, Y - 0.13, 0.2);
  chipTray(L, T, -0.3, 0.3, -R + 0.16, -R + 0.34, Y);
  put(L, rbox(0.5, 0.74, Y, Y + 0.12, -R + 0.15, -R + 0.38, 0.02), 'lkLacquer', T); // the shuffler
  put(L, box(0.53, 0.71, Y + 0.12, Y + 0.124, -R + 0.18, -R + 0.35), 'lsGold', T);
  limitSign(L, T, -0.62, -R + 0.26, 2);
  collideLocal(ctx, T, -a - R, a + R, -R, R, 0.9);
  const [dx, dz] = toWorld(T, 0, -R - 0.35); people.dealer(dx, dz, T.yaw);
  // seven places: three along the players' straight (+z, the middle one is yours), two round each end
  const places = [[0.8, R, 0, 1], [0, R, 0, 1], [-0.8, R, 0, 1]];
  for (const ang of [0.62, -0.42]) { places.push([a + R * Math.cos(ang), R * Math.sin(ang), Math.cos(ang), Math.sin(ang)]); places.push([-a - R * Math.cos(ang), R * Math.sin(ang), -Math.cos(ang), Math.sin(ang)]); }
  const HOME = 1, seats = [];
  places.forEach(([px, pz, nx, nz], k) => {
    const p = [px, pz], n = [nx, nz], lx = p[0] + n[0] * 0.58, lz = p[1] + n[1] * 0.58, [wx, wz] = toWorld(T, lx, lz), yaw = Math.atan2(-n[0], -n[1]) + T.yaw;
    tableChair(L, wx, wz, yaw, high ? 'lsVelvet' : 'lsRed');
    const occ = k !== HOME && r() < 0.78; seats.push({ p, n, occ });
    if (occ) { people.seated(wx, wz, yaw); betStack(L, T, p[0] - n[0] * 0.3 + n[1] * 0.12, p[1] - n[1] * 0.3 - n[0] * 0.12, Y, [2500, 6000, 12500, 30000][Math.floor(r() * 4)], r); }
  });
  const home = seats[HOME];
  const hole = (s, i) => ({ x: s.p[0] - s.n[0] * 0.36 + (i - 0.5) * 0.06 * -s.n[1], z: s.p[1] - s.n[1] * 0.36 + (i - 0.5) * 0.06 * s.n[0], yaw: Math.atan2(s.n[0], s.n[1]) });
  const layout = {
    feltY: Y, shoe: [0.62, -R + 0.26], discard: [-0.62, -R + 0.5],
    hole: (i) => hole(home, i), board: (i) => ({ x: -0.38 + i * 0.16, z: -0.05, yaw: 0 }), bot: (i) => ({ x: -0.06 + i * 0.12, z: -R + 0.55, yaw: Math.PI }),
    bet: [home.p[0] + 0.22, home.p[1] - 0.52], pot: [0, 0.24], button: [home.p[0] - 0.22, home.p[1] - 0.3],
    cam: [home.p[0], 1.55, home.p[1] + 0.72], look: [0, Y, -0.1], fov: 46,
  };
  life.table(T, 'poker', layout, { seats: seats.filter((s) => s.occ), hole });
  return layout;
}

/** Kinetic Probability Pit (the dice table) */
export function crapsTable(L, ctx, r, T, people, life) {
  initKit();
  const X = 2.8, Z = 1.2, Y = FELT_Y.craps, WALL = 0.98, RAIL = 1.05;
  put(L, rbox(-X, X, 0.08, Y - 0.005, -Z, Z, 0.05), 'lkMahogany', T);
  put(L, box(-X + 0.12, X - 0.12, 0, 0.08, -Z + 0.12, Z - 0.12), 'lkLacquer', T); // recessed toe kick
  put(L, box(-X - 0.005, X + 0.005, 0.5, 0.52, -Z - 0.005, Z + 0.005), 'lsGold', T);
  put(L, feltUV(box(-2.6, 2.6, Y - 0.01, Y, -1.0, 1.0), -2.6, 2.6, -1.0, 1.0), 'lkFeltCraps', T);
  for (const [x0, x1, z0, z1] of [[-2.6, 2.6, -1.04, -1.0], [-2.6, 2.6, 1.0, 1.04], [-2.64, -2.6, -1.04, 1.04], [2.6, 2.64, -1.04, 1.04]]) {
    const b = box(x0, x1, Y, WALL, z0, z1), p = b.attributes.position, uv = b.attributes.uv; // inner walls lined with rubber pyramids (uv in 8 cm tiles)
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 0.08, p.getY(i) / 0.08);
    put(L, b, 'lkBumper', T);
  }
  for (const [x0, x1, z0, z1] of [[-X, X, -Z, -1.04], [-X, X, 1.04, Z], [-X, -2.64, -1.04, 1.04], [2.64, X, -1.04, 1.04]]) put(L, box(x0, x1, Y - 0.1, WALL, z0, z1), 'lkMahogany', T);
  // the padded rail and the chip groove along it
  put(L, rbox(-X - 0.06, X + 0.06, WALL, RAIL, -Z - 0.06, -Z + 0.08, 0.035), 'lkLeather', T);
  put(L, rbox(-X - 0.06, X + 0.06, WALL, RAIL, Z - 0.08, Z + 0.06, 0.035), 'lkLeather', T);
  put(L, rbox(-X - 0.06, -X + 0.08, WALL, RAIL, -Z + 0.08, Z - 0.08, 0.035), 'lkLeather', T);
  put(L, rbox(X - 0.08, X + 0.06, WALL, RAIL, -Z + 0.08, Z - 0.08, 0.035), 'lkLeather', T);
  put(L, box(-X + 0.08, X - 0.08, WALL - 0.005, WALL + 0.012, -Z + 0.08, -1.04), 'lkLacquer', T);
  put(L, box(-X + 0.08, X - 0.08, WALL - 0.005, WALL + 0.012, 1.04, Z - 0.08), 'lkLacquer', T);
  put(L, box(-X, X, 0.88, 0.9, Z, Z + 0.16), 'lkLacquer', T); put(L, box(-X, X, 0.88, 0.9, -Z - 0.16, -Z), 'lkLacquer', T); // drink shelves
  for (let i = 0; i < 14; i++) { // players' chips lying in the groove
    const lx = -2.5 + r() * 5, side = r() < 0.5 ? -1 : 1; if (Math.abs(lx) < 0.5) continue;
    put(L, chipCyl(6 + Math.floor(r() * 14)).rotateZ(Math.PI / 2).translate(lx, WALL + 0.012 + CHIP.r * 0.6, side * 1.12), 'lkChip', T, CHIPS[Math.floor(r() * 4)][1]);
  }
  chipTray(L, T, -0.45, 0.45, -0.98, -0.8, Y);
  // the stick, resting by the stickman
  put(L, cyl(0, 0, 0.007, -0.7, 0.7, 6).rotateZ(Math.PI / 2).translate(0.1, Y + 0.008, 0.82), 'lkMahogany', T);
  put(L, new THREE.TorusGeometry(0.03, 0.007, 5, 10, Math.PI).rotateX(-Math.PI / 2).translate(-0.6, Y + 0.008, 0.85), 'lkMahogany', T);
  // the puck (OFF, black side up) and the dice bowl
  put(L, cyl(2.05, -0.35, 0.04, Y, Y + 0.014, 18), 'lkLacquer', T);
  put(L, cyl(0.52, 0.78, 0.09, Y, Y + 0.03, 16, 0.11), 'lsGold', T);
  // bets on the pass line in front of the crowd
  for (let i = 0; i < 9; i++) { const lx = (r() < 0.5 ? -1 : 1) * (0.95 + r() * 1.55); betStack(L, T, lx, 0.7 + (r() - 0.5) * 0.12, Y, [500, 1000, 2500, 5000][Math.floor(r() * 4)], r); }
  limitSign(L, T, -0.42, -0.62, 3);
  collideLocal(ctx, T, -X - 0.06, X + 0.06, -Z - 0.16, Z + 0.16, 1.1);
  for (const sx of [-1, 1]) { const [px, pz] = toWorld(T, sx * 0.8, -1.6); people.dealer(px, pz, T.yaw); }
  { const [px, pz] = toWorld(T, 0, 1.6); people.dealer(px, pz, T.yaw + Math.PI); }
  const HOME = [1.55, 1.68];
  for (let k = 0; k < 14; k++) { // a crowd round the rail, bouncing
    const t = k / 14, side = k % 2 ? 1 : -1, lx = (t - 0.5) * 6.4, lz = side * (1.68 + r() * 0.35);
    if ((Math.abs(lx) < 1.2 && side < 0) || (Math.abs(lx) < 0.45) || (side > 0 && Math.abs(lx - HOME[0]) < 1.15)) continue;
    const [wx, wz] = toWorld(T, lx, lz); people.standing(wx, wz, T.yaw + (side > 0 ? Math.PI : 0));
  }
  for (const sx of [-1, 1]) { const [wx, wz] = toWorld(T, sx * 3.4, (r() - 0.5)); people.standing(wx, wz, T.yaw + (sx > 0 ? -Math.PI / 2 : Math.PI / 2)); }
  const POINT = { 4: 0, 5: 1, 6: 2, 8: 3, 9: 4, 10: 5 };
  const layout = {
    feltY: Y, wall: -1.0,
    bet: [HOME[0], 0.72], throwFrom: [HOME[0] + 0.1, 1.08, 1.15], puckOff: [2.05, -0.35],
    point: (n) => (POINT[n] == null ? null : [0.86 + (POINT[n] + 0.5) * (1.7 / 6), -0.75]),
    cam: [HOME[0] + 0.1, 2.65, 2.25], look: [0.45, Y, -0.3], fov: 54,
  };
  life.table(T, 'craps', layout, {});
  return layout;
}

// ================================================================= TableLife: dealers dealing, dice rolling (two InstancedMeshes)
export class TableLife {
  constructor(ctx, capacity = 520) {
    initKit();
    this.ctx = ctx; this.tables = []; this.cap = capacity; this.n = 0;
    // a card = face plane (atlas cell per instance) + back plane (fixed back cell)
    const face = new THREE.PlaneGeometry(CARD.w, CARD.h).rotateX(-Math.PI / 2).translate(0, 0.0006, 0);
    const back = new THREE.PlaneGeometry(CARD.w, CARD.h).rotateX(Math.PI / 2);
    const g = mergeGeometries([face, back]);
    const isBack = new Float32Array(g.attributes.position.count); isBack.fill(1, face.attributes.position.count); g.setAttribute('back', new THREE.BufferAttribute(isBack, 1));
    this.cells = new Float32Array(capacity * 2); g.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(this.cells, 2));
    const m = new THREE.MeshStandardMaterial({ map: cardAtlas(), roughness: 0.5, alphaTest: 0.5 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;\nattribute float back;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * vec2(0.125, 0.25) + (back > 0.5 ? vec2(0.875, 0.0) : cellOffset);\n#endif');
    };
    m.customProgramCacheKey = () => 'leisureCards';
    this.cards = new THREE.InstancedMesh(g, m, capacity); this.cards.frustumCulled = false; this.cards.castShadow = false;
    const d = dieAssets(); this.dice = new THREE.InstancedMesh(d.geo, d.mat, 16); this.dice.frustumCulled = false;
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.cards.setMatrixAt(i, this.zero);
    for (let i = 0; i < 16; i++) this.dice.setMatrixAt(i, this.zero);
    this.nd = 0;
    ctx.disposables.push(m, g);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._a = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._z = new THREE.Vector3(0, 0, 1);
  }
  /** register a table: kind = blackjack | baccarat | poker | craps */
  table(T, kind, layout, extra) {
    const t = { T, kind, layout, ...extra, phase: Math.random() * 40, round: -1, plan: null };
    T.layout = layout; T.kind = kind; T.setBusy = (b) => { T.busy = b; }; // the seated view (tableSeat.js) reads the layout and pauses this table's dealer
    if (kind === 'craps') { t.dice = [this.nd, this.nd + 1]; this.nd += 2; t.len = 9.5; }
    else { t.slots = []; const need = kind === 'blackjack' ? 6 + (extra.seats.length * 4) : kind === 'baccarat' ? 6 : 5 + extra.seats.length * 2; for (let i = 0; i < need && this.n < this.cap; i++) t.slots.push(this.n++); t.len = kind === 'blackjack' ? 17 : kind === 'baccarat' ? 15 : 26; }
    this.tables.push(t); return t;
  }
  build() {
    this.cards.count = this.n; this.dice.count = this.nd;
    this.ctx.add(this.cards, this.cards.geometry); this.ctx.add(this.dice, this.dice.geometry);
    this.ctx.onUpdate((dt) => this.update(dt));
    this.time = 0;
  }
  // ---- one round's plan: [{ to: {x, z, yaw}, t, down, flip }], plus sweep time
  plan(t, round) {
    const r = rng(1 + round * 7919 + this.tables.indexOf(t) * 104729), cell = () => Math.floor(r() * 31), ev = [];
    const L = t.layout;
    const add = (to, time, down = false, flip = null) => ev.push({ to, t: time, down, flip, cell: cell() });
    let tt = 0.6;
    if (t.kind === 'blackjack') {
      const S = t.seats.length ? t.seats : [];
      for (const s of S) { add(t.spot(s.a, 0), tt); tt += 0.5; }
      add(L.dealer(0), tt); tt += 0.5;
      for (const s of S) { add(t.spot(s.a, 1), tt); tt += 0.5; }
      add(L.dealer(1), tt, true); tt += 0.9;
      for (const s of S) if (r() < 0.45) { add(t.spot(s.a, 2), tt); tt += 0.9; }
      ev.forEach((e) => { if (e.down) e.flip = tt; }); tt += 0.8;
      if (r() < 0.5) { add(L.dealer(2), tt); tt += 0.6; }
    } else if (t.kind === 'baccarat') {
      const P = L.playerHand, B = L.bankerHand;
      add(P(0), tt, true); add(B(0), tt + 0.5, true); add(P(1), tt + 1.0, true); add(B(1), tt + 1.5, true); tt += 2.6;
      ev.forEach((e, i) => { e.flip = tt + i * 0.8; }); tt += 3.6;
      if (r() < 0.4) { add(P(2), tt); tt += 0.7; } if (r() < 0.35) { add(B(2), tt); tt += 0.7; }
    } else {
      const holes = [];
      for (let k = 0; k < 2; k++) t.seats.forEach((s, si) => { add(t.hole(s, k), tt, true); holes.push([ev[ev.length - 1], si]); tt += 0.3; });
      tt += 1.5; for (let i = 0; i < 3; i++) add(L.board(i), tt + i * 0.25); tt += 4; add(L.board(3), tt); tt += 4; add(L.board(4), tt); tt += 3;
      const showA = Math.floor(r() * Math.max(1, t.seats.length)), showB = (showA + 1) % Math.max(1, t.seats.length); // the showdown
      for (const [e, si] of holes) if (si === showA || si === showB) e.flip = tt;
    }
    return { ev: ev.slice(0, t.slots.length), sweep: Math.min(t.len - 0.8, tt + 2.6) };
  }
  update(dt) {
    if (!this.ctx.group.visible) return;
    this.time += dt;
    const e = this.ctx.e, m = this._m, q = this._q, p = this._p, s = this._s;
    let cellsDirty = false;
    for (const t of this.tables) {
      const busy = t.T.busy;
      const tau = this.time + t.phase, round = Math.floor(tau / t.len), u = tau - round * t.len;
      const cosY = Math.cos(t.T.yaw), sinY = Math.sin(t.T.yaw);
      const W = (lx, lz, y) => p.set(t.T.x + lx * cosY + lz * sinY, e + y, t.T.z - lx * sinY + lz * cosY);
      if (t.kind === 'craps') { this.dice2(t, round, u, busy, W); continue; }
      if (round !== t.round) { t.round = round; t.plan = this.plan(t, round); t.plan.ev.forEach((ev, i) => { const c = ev.cell; this.cells[t.slots[i] * 2] = (c % 8) * 0.125; this.cells[t.slots[i] * 2 + 1] = 1 - (Math.floor(c / 8) + 1) * 0.25; }); cellsDirty = true; }
      const { ev, sweep } = t.plan, L = t.layout, Y = L.feltY + 0.001;
      t.slots.forEach((slot, i) => {
        const c = ev[i];
        if (!c || busy || u < c.t || u > sweep + 0.55) { this.cards.setMatrixAt(slot, this.zero); return; }
        let x = c.to.x, z = c.to.z, y = Y + i * 0.00025, yaw = c.to.yaw, flip = c.down ? Math.PI : 0;
        const k = (u - c.t) / 0.42;
        if (k < 1) { const q3 = ease3(k); x = L.shoe[0] + (x - L.shoe[0]) * q3; z = L.shoe[1] + (z - L.shoe[1]) * q3; y += Math.sin(Math.PI * q3) * 0.05 + (1 - q3) * 0.05; yaw += (1 - q3) * 1.1; }
        if (c.flip != null && u > c.flip) { const f = Math.min(1, (u - c.flip) / 0.35); flip = c.down ? Math.PI * (1 - f) : 0; y += Math.sin(Math.PI * f) * 0.035; }
        if (u > sweep) { const w = ease3(Math.min(1, (u - sweep) / 0.5)); x += (L.discard[0] - x) * w; z += (L.discard[1] - z) * w; y += w * 0.03; }
        q.setFromAxisAngle(this._up, yaw + t.T.yaw).multiply(this._q2.setFromAxisAngle(this._z, flip));
        this.cards.setMatrixAt(slot, m.compose(W(x, z, y), q, s));
      });
    }
    this.cards.instanceMatrix.needsUpdate = true;
    if (cellsDirty) this.cards.geometry.attributes.cellOffset.needsUpdate = true;
    this.dice.instanceMatrix.needsUpdate = true;
  }
  // dice: thrown from one end, off the far wall, bounce back, rest, then the stick sweeps them in
  dice2(t, round, u, busy, W) {
    if (t.round !== round) {
      t.round = round; const r = rng(7 + round * 31 + this.tables.indexOf(t) * 977), dir = round % 2 ? 1 : -1;
      t.throw = { dir, z0: -0.2 + r() * 0.8, zw: -0.6 + r() * 1.2, rest: [[-dir * (1.55 + r() * 0.5), -0.5 + r() * 0.9], [-dir * (1.45 + r() * 0.5), -0.5 + r() * 0.9]], val: [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)], yaw: [r() * 6.28, r() * 6.28], axis: [new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()] };
    }
    const th = t.throw, Y = t.layout.feltY + DIE / 2, m = this._m, q = this._q;
    t.dice.forEach((slot, i) => {
      if (busy || u > 7.0) { this.dice.setMatrixAt(slot, this.zero); return; }
      const [rx, rz] = th.rest[i]; let x, z, y, spin;
      const x0 = th.dir * 2.35, z0 = th.z0 + i * 0.05, xw = -th.dir * 2.56, zw = th.zw + i * 0.06;
      if (u < 0.75) { const k = u / 0.75; x = x0 + (xw - x0) * k; z = z0 + (zw - z0) * k; y = 1.12 + (Y + 0.05 - 1.12) * k + Math.sin(Math.PI * k) * 0.22; spin = 1 - k * 0.5; }
      else if (u < 1.55) { const k = (u - 0.75) / 0.8, e3 = ease3(k); x = xw + (rx - xw) * e3; z = zw + (rz - zw) * e3; y = Y + Math.abs(Math.sin(k * Math.PI * 3)) * 0.07 * (1 - k) ** 1.5; spin = 0.5 * (1 - e3); }
      else if (u < 6.2) { x = rx; z = rz; y = Y; spin = 0; }
      else { const k = ease3(Math.min(1, (u - 6.2) / 0.7)); x = rx + (0 - rx) * k; z = rz + (0.75 - rz) * k; y = Y; spin = 0; }
      dieQuat(th.val[i], th.yaw[i], q).multiply(this._q2.setFromAxisAngle(th.axis[i], spin * 14));
      this.dice.setMatrixAt(slot, m.compose(W(x, z, y), q, this._s));
    });
  }
}

// ================================================================= Automated Yield Terminals (slot cabinets, instanced)
function slotAtlas() { // 4 x 2 cells of 256 x 512: screen (title, 3 reels, credits) over belly art
  const games = [['LIQUIDITY 7s', '#1d4fd6', '#7a3cff'], ['DIAMOND DIVIDEND', '#7a1fd1', '#ff3cac'], ['BULL RUN', '#0f7a6a', '#2dd4bf'], ['GOLDEN HEDGE', '#a5550a', '#ffc94a'],
    ['MEGA RESERVE', '#5b0f8a', '#ff9f1c'], ['TRIPLE ALPHA', '#0b3c91', '#3db7ff'], ['YIELD STARS', '#8a0f3c', '#ff5a7a'], ['DELTA DELUXE', '#1b5e20', '#a3e635']];
  const SYM = [['7', '#ff3b3b', 'Georgia, serif'], ['BAR', '#1b1b1b', 'Georgia, serif'], ['◆', '#2f8fff', 'Arial'], ['★', '#f5b800', 'Arial'], ['♣', '#20a64a', 'Arial'], ['$', '#13803e', 'Georgia, serif']];
  return canvasTex(1024, 1024, (g) => {
    games.forEach(([name, c0, c1], i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 512;
      g.save(); g.beginPath(); g.rect(x, y, 256, 512); g.clip();
      let grd = g.createLinearGradient(x, y, x, y + 256); grd.addColorStop(0, c1); grd.addColorStop(1, c0); g.fillStyle = grd; g.fillRect(x, y, 256, 256);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, 256, 46);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = c1; g.shadowBlur = 10; fit(g, name, 236, 30, '900', 'Arial Black, Arial'); g.fillText(name, x + 128, y + 24); g.shadowBlur = 0;
      for (let k = 0; k < 3; k++) { // reel windows: exactly three symbols (48 px pitch) per reel, so the scroll wraps seamlessly
        const rx = x + 14 + k * 78;
        g.fillStyle = '#0b0b10'; g.fillRect(rx - 3, y + 49, 78, 150);
        const rg = g.createLinearGradient(0, y + 52, 0, y + 196); rg.addColorStop(0, '#d9d2bf'); rg.addColorStop(0.5, '#fffdf4'); rg.addColorStop(1, '#d9d2bf'); g.fillStyle = rg; g.fillRect(rx, y + 52, 72, 144);
        for (let j = 0; j < 3; j++) { const [sy, col, fam] = SYM[(i * 2 + k * 3 + j) % SYM.length]; g.fillStyle = col; fit(g, sy, 62, sy === 'BAR' ? 30 : 40, '900', fam); g.fillText(sy, rx + 36, y + 52 + 24 + j * 48); }
      }
      g.fillStyle = '#0b0b10'; g.fillRect(x, y + 204, 256, 52);
      g.fillStyle = '#ffd23f'; fit(g, 'CREDITS 1,000', 120, 20, '700', 'Consolas, monospace'); g.fillText('CREDITS 1,000', x + 70, y + 222);
      g.fillStyle = '#7df9ff'; fit(g, 'BET 5', 80, 20, '700', 'Consolas, monospace'); g.fillText('BET 5', x + 200, y + 222);
      g.fillStyle = '#ff9f1c'; fit(g, 'LINKED · MEGA RESERVE', 230, 14, '700'); g.fillText('LINKED · MEGA RESERVE', x + 128, y + 244);
      // belly art (lower half of the cell)
      grd = g.createRadialGradient(x + 128, y + 384, 10, x + 128, y + 384, 180); grd.addColorStop(0, c1); grd.addColorStop(1, '#0a0614'); g.fillStyle = grd; g.fillRect(x, y + 256, 256, 256);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 6; for (let a = 0; a < 16; a++) { g.beginPath(); g.moveTo(x + 128, y + 384); g.lineTo(x + 128 + Math.cos(a / 16 * TAU) * 200, y + 384 + Math.sin(a / 16 * TAU) * 200); g.stroke(); }
      g.fillStyle = '#ffffff'; g.shadowColor = c1; g.shadowBlur = 18; fit(g, name, 232, 46, '900', 'Arial Black, Arial'); g.fillText(name, x + 128, y + 384); g.shadowBlur = 0;
      g.fillStyle = '#ffd877'; fit(g, 'AUTOMATED YIELD TERMINAL', 220, 16, '700'); g.fillText('AUTOMATED YIELD TERMINAL', x + 128, y + 440);
      g.restore();
    });
  });
}
// local-cell geometry of the reels (cell uv: u 0..1 across 256 px, v 0..1 up 512 px)
const RB0 = 1 - 196 / 512, RB1 = 1 - 52 / 512, REELS = [[14 / 256, 86 / 256], [92 / 256, 164 / 256], [170 / 256, 242 / 256]];

/** list: [{ x, z, yaw, cell, color, tall, active }]. Returns a controller; slots are split north / south so each half can be culled. */
export function buildSlotCabinets(ctx, list) {
  initKit();
  const atlas = slotAtlas();
  const B = (x0, x1, y0, y1, z0, z1) => box(x0, x1, y0, y1, z0, z1);
  const tiltAt = (g, a, y, z) => g.translate(0, -y, -z).rotateX(a).translate(0, y, z);
  const parts = {
    body: mg([B(-0.37, 0.37, 0, 0.1, -0.32, 0.32), B(-0.35, 0.35, 0.1, 0.72, -0.31, 0.25), tiltAt(B(-0.35, 0.35, 0.72, 0.78, 0.12, 0.38), 0.14, 0.75, 0.25), B(-0.35, 0.35, 0.78, 1.64, -0.31, 0.19), tiltAt(B(-0.31, 0.31, 0.86, 1.46, 0.18, 0.22), -0.1, 1.16, 0.2), B(-0.375, -0.345, 0.1, 1.66, -0.31, 0.26), B(0.345, 0.375, 0.1, 1.66, -0.31, 0.26)]),
    trim: mg([B(-0.375, 0.375, 0.1, 0.12, -0.325, 0.325), tiltAt(B(-0.35, 0.35, 0.775, 0.79, 0.37, 0.39), 0.14, 0.75, 0.25), B(-0.37, 0.37, 1.64, 1.67, -0.29, 0.22)]),
    chrome: mg([new THREE.CylinderGeometry(0.012, 0.012, 0.38, 4, 1, true).rotateZ(-0.12).translate(0.405, 1.2, 0.02), B(0.375, 0.41, 0.95, 1.05, -0.04, 0.08), B(-0.2, 0.2, 0.38, 0.43, 0.25, 0.34)]),
    glow: mg([new THREE.CylinderGeometry(0.27, 0.27, 0.72, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.75, 0.85).translate(0, 1.67, -0.04), B(-0.37, -0.345, 0.12, 1.64, 0.255, 0.275), B(0.345, 0.37, 0.12, 1.64, 0.255, 0.275), new THREE.OctahedronGeometry(0.038, 0).translate(0.43, 1.4, 0.04), tiltAt(B(-0.24, 0.24, 0.79, 0.81, 0.27, 0.33), 0.14, 0.75, 0.25)]),
    stoolBase: mg([new THREE.CylinderGeometry(0.06, 0.2, 0.05, 6, 1, true).translate(0, 0.025, 0.8), new THREE.CylinderGeometry(0.028, 0.028, 0.52, 4, 1, true).translate(0, 0.31, 0.8)]),
    stool: new THREE.CylinderGeometry(0.21, 0.19, 0.09, 8).translate(0, 0.6, 0.8),
  };
  // screen + game sign + belly glass: one geometry, uv = cell-local, attribute zone (1 = reels)
  const screen = (() => {
    const s = tiltAt(new THREE.PlaneGeometry(0.58, 0.58 * 256 / 290).translate(0, 1.16, 0.226), -0.1, 1.16, 0.2), su = s.attributes.uv;
    for (let i = 0; i < su.count; i++) su.setY(i, 0.5 + su.getY(i) * 0.5);
    const sign = new THREE.PlaneGeometry(0.62, 0.13).translate(0, 1.75, 0.21), gu = sign.attributes.uv;
    for (let i = 0; i < gu.count; i++) gu.setY(i, 1 - 46 / 512 + gu.getY(i) * (46 / 512));
    const belly = new THREE.PlaneGeometry(0.6, 0.48).translate(0, 0.46, 0.252), bu = belly.attributes.uv;
    for (let i = 0; i < bu.count; i++) bu.setY(i, 0.04 + bu.getY(i) * 0.42);
    const g = mergeGeometries([s, sign, belly]), zone = new Float32Array(g.attributes.position.count); zone.fill(1, 0, s.attributes.position.count);
    g.setAttribute('zone', new THREE.BufferAttribute(zone, 1)); return g;
  })();
  const scrMat = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
  const uTime = { value: 0 };
  scrMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 cellOffset; attribute vec2 phase; attribute float zone;
uniform float uTime; varying vec2 vLocal; varying vec2 vCell; varying float vZone; varying vec3 vOff; varying vec3 vSpd;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vLocal = vMapUv; vCell = cellOffset; vZone = zone;
float P = 7.0 + phase.x * 7.0, tc = uTime + phase.x * 97.0, cyc = floor(tc / P), t = tc - cyc * P;
vec3 st = vec3(1.3, 1.75, 2.2), D = vec3(10.0, 11.0, 13.0);
vec3 u = clamp(vec3(t) / st, 0.0, 1.0), e = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
vec3 sym = mod(cyc * mod(D, 3.0), 3.0) + D * e;
vec3 still = vec3(floor(phase.x * 3.0), floor(fract(phase.x * 7.0) * 3.0), floor(fract(phase.x * 13.0) * 3.0));
vOff = (phase.y > 0.5 ? sym : still) / 3.0 * ${(RB1 - RB0).toFixed(5)};
vSpd = phase.y > 0.5 ? 3.0 * (1.0 - u) * (1.0 - u) : vec3(0.0);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLocal; varying vec2 vCell; varying float vZone; varying vec3 vOff; varying vec3 vSpd;')
      .replace('#include <map_fragment>', `
vec2 lu = vLocal; float o = 0.0, sp = 0.0; bool reel = false;
if (vZone > 0.5 && lu.y > ${RB0.toFixed(5)} && lu.y < ${RB1.toFixed(5)}) {
  if (lu.x > ${REELS[0][0].toFixed(5)} && lu.x < ${REELS[0][1].toFixed(5)}) { o = vOff.x; sp = vSpd.x; reel = true; }
  else if (lu.x > ${REELS[1][0].toFixed(5)} && lu.x < ${REELS[1][1].toFixed(5)}) { o = vOff.y; sp = vSpd.y; reel = true; }
  else if (lu.x > ${REELS[2][0].toFixed(5)} && lu.x < ${REELS[2][1].toFixed(5)}) { o = vOff.z; sp = vSpd.z; reel = true; }
}
vec2 gx = dFdx(vLocal) * vec2(0.25, 0.5), gy = dFdy(vLocal) * vec2(0.25, 0.5);
vec4 tc = vec4(0.0);
if (reel) {
  float H = ${(RB1 - RB0).toFixed(5)};
  for (int i = 0; i < 3; i++) { vec2 q = lu; q.y = ${RB0.toFixed(5)} + mod(lu.y - ${RB0.toFixed(5)} + o + float(i) * sp * 0.012, H); tc += textureGrad(map, q * vec2(0.25, 0.5) + vCell, gx, gy); }
  tc /= 3.0;
  float mid = ${((RB0 + RB1) / 2).toFixed(5)};
  if (abs(vLocal.y - mid) < 0.0045) tc.rgb = mix(tc.rgb, vec3(1.0, 0.12, 0.08), 0.8);
  tc.rgb *= 0.78 + 0.22 * (1.0 - pow(abs(vLocal.y - mid) / (H * 0.5), 2.0));
} else tc = textureGrad(map, lu * vec2(0.25, 0.5) + vCell, gx, gy);
diffuseColor *= tc;`);
  };
  scrMat.customProgramCacheKey = () => 'slotReels';
  const mats = { body: new THREE.MeshStandardMaterial({ color: 0x1c1530, roughness: 0.28, metalness: 0.55 }), trim: LM.lsGold, chrome: LM.lkChrome,
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), stoolBase: LM.lkChrome, stool: new THREE.MeshStandardMaterial({ color: 0xb3172a, roughness: 0.55 }) };
  ctx.disposables.push(scrMat, mats.body, mats.glow, mats.stool, screen, ...Object.values(parts));
  const halves = [list.filter((s) => s.z < 0), list.filter((s) => s.z >= 0)];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const chunks = halves.filter((h) => h.length).map((h) => {
    const n = h.length, scr = screen.clone();
    const offs = new Float32Array(n * 2), ph = new Float32Array(n * 2);
    h.forEach((s, i) => { offs[i * 2] = (s.cell % 4) * 0.25; offs[i * 2 + 1] = 1 - (Math.floor(s.cell / 4) + 1) * 0.5; ph[i * 2] = Math.random(); ph[i * 2 + 1] = s.active ? 1 : 0; });
    scr.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(offs, 2)); scr.setAttribute('phase', new THREE.InstancedBufferAttribute(ph, 2));
    const meshes = { screen: new THREE.InstancedMesh(scr, scrMat, n) };
    for (const k of Object.keys(parts)) meshes[k] = new THREE.InstancedMesh(parts[k], mats[k], n);
    h.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw); m4.compose(p.set(s.x, ctx.e, s.z), q, sc.set(1, s.tall || 1, 1));
      for (const me of Object.values(meshes)) me.setMatrixAt(i, m4);
      meshes.glow.setColorAt(i, c.set(s.color));
      s.chunk = meshes; s.i = i; s.matrix = m4.clone();
    });
    for (const me of Object.values(meshes)) { me.instanceMatrix.needsUpdate = true; me.computeBoundingSphere(); me.castShadow = false; ctx.add(me, me === meshes.screen ? scr : me.geometry); }
    ctx.disposables.push(scr);
    return { h, meshes, base: h.map((s) => new THREE.Color(s.color)) };
  });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const s of list) {
    s.setBusy = (b) => { s.busy = b; s.chunk.screen.setMatrixAt(s.i, b ? zero : s.matrix); s.chunk.screen.instanceMatrix.needsUpdate = true; };
    s.flash = (sec = 2.5) => { s.flashUntil = performance.now() + sec * 1000; };
  }
  let acc = 0, step = 0;
  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    uTime.value += dt; acc += dt; if (acc < 0.16) return; acc = 0; step++;
    const now = performance.now();
    for (const ch of chunks) {
      ch.h.forEach((s, i) => {
        const win = s.flashUntil > now;
        ch.meshes.glow.setColorAt(i, win ? c.setHSL((step * 0.13) % 1, 1, 0.6) : c.copy(ch.base[i]).multiplyScalar((i + step) % 4 === 0 ? 1.0 : 0.62));
      });
      ch.meshes.glow.instanceColor.needsUpdate = true;
    }
  });
  return { count: list.length };
}
