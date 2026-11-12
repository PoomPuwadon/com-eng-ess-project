import * as THREE from 'three';
import { chunked } from './geom.js';

// VT-04 Equine Performance Centre screens: ONE atlas (2 x 2 cells, 512 x 288 each) shared by every screen
// on the floor, redrawn at 5 Hz only while the floor is on screen. Every label is measured and fitted to its
// slot and each cell is clipped, so nothing overlaps.
// The race itself lives here too (one source of truth for the 3D runners and the screens).
// Phase 1: SIMULATED — invented, real-style runner names; the runners circle continuously in a bunched
// pack (race cadence is still to be decided by the user). Phase 4 swaps in real results if a free
// structured source exists (free-data-sources skill).
const COLS = 2, ROWS = 2, CW = 512, CH = 288;
export const RC = { RACE: 0, PRICING: 1, RESULTS: 2, BRAND: 3 };

const canvas = document.createElement('canvas');
canvas.width = CW * COLS; canvas.height = CH * ROWS;
const g = canvas.getContext('2d');
export const raceTexture = new THREE.CanvasTexture(canvas);
raceTexture.colorSpace = THREE.SRGBColorSpace;
raceTexture.anisotropy = 8;

function fit(text, maxW, size, weight = 'bold', family = 'sans-serif') {
  let px = size;
  do { g.font = `${weight} ${px}px ${family}`.trim(); px -= 1; } while (g.measureText(text).width > maxW && px > 7);
}

// ---------------------------------------------------------------- the race (simulated)
const NAMES = ['Golden Margin', 'Desert Liquidity', 'Silk Leverage', 'Royal Dividend', 'Sand Arbitrage', 'Emerald Yield', 'Night Synergy', 'Falcon Rally'];
const JOCKEYS = ['R. Al Haddad', 'T. Moreau', 'K. Sato', 'J. Whitcombe', 'P. Ruangsri', 'M. Okafor', 'L. Bianchi', 'S. Rahman'];
export const SILKS = ['#c8102e', '#1d4ed8', '#f2c14a', '#16a34a', '#7c3aed', '#f97316', '#e8e6e0', '#0f172a'];
export const RUNNERS = NAMES.map((name, i) => ({ name, jockey: JOCKEYS[i], silk: SILKS[i], no: i + 1, price: 0 }));
const N = RUNNERS.length;
export const RACE = { dist: new Float32Array(N), speed: new Float32Array(N), target: new Float32Array(N), no: 7, len: 272, order: [...Array(N).keys()] };
const results = [
  { no: 4, name: 'Saffron Equity', price: 3.4 }, { no: 5, name: 'Velvet Quarter', price: 6.0 },
  { no: 6, name: 'Marble Horizon', price: 2.2 }, { no: 3, name: 'Copper Covenant', price: 9.5 },
];
const reprice = () => { for (const r of RUNNERS) r.price = Math.round((1.8 + Math.random() * 9) * 10) / 10; };
reprice();
for (let i = 0; i < N; i++) { RACE.dist[i] = -i * 2.2; RACE.speed[i] = RACE.target[i] = 16; }
export function setTrackLength(len) { RACE.len = len; }
let tSpd = 0, laps = 0;
function step(dt) {
  let mean = 0;
  for (let i = 0; i < N; i++) mean += RACE.dist[i];
  mean /= N;
  tSpd -= dt;
  if (tSpd <= 0) { tSpd = 2.5 + Math.random() * 2; for (let i = 0; i < N; i++) RACE.target[i] = 15.2 + Math.random() * 1.8; }
  for (let i = 0; i < N; i++) {
    RACE.speed[i] += (RACE.target[i] + (mean - RACE.dist[i]) * 0.06 - RACE.speed[i]) * Math.min(1, dt * 0.8); // keep the field bunched
    RACE.dist[i] += RACE.speed[i] * dt;
  }
  RACE.order.sort((a, b) => RACE.dist[b] - RACE.dist[a]);
  const lead = RACE.dist[RACE.order[0]];
  if (lead > (laps + 2) * RACE.len) { // every two laps: a new race number, the leader is recorded, fresh pricing
    laps += 2;
    const w = RUNNERS[RACE.order[0]];
    results.unshift({ no: RACE.no, name: w.name, price: w.price }); results.length = 4;
    RACE.no++; reprice();
  }
}

// ---------------------------------------------------------------- cells
const BG0 = '#05070f', BG1 = '#141a33', GOLD = '#e3c27a';
function frame(cx, cy, title, sub) {
  const grd = g.createLinearGradient(cx, cy, cx, cy + CH); grd.addColorStop(0, BG0); grd.addColorStop(1, BG1);
  g.fillStyle = grd; g.fillRect(cx, cy, CW, CH);
  g.fillStyle = 'rgba(227,194,122,0.9)'; g.fillRect(cx, cy + 46, CW, 2);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = GOLD;
  fit(title, CW - 150, 22); g.fillText(title, cx + 16, cy + 24);
  if (sub) { g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.7)'; fit(sub, 130, 13, ''); g.fillText(sub, cx + CW - 14, cy + 24); }
}
function stadiumPath(x0, x1, cy, r) { g.beginPath(); g.moveTo(x0, cy - r); g.lineTo(x1, cy - r); g.arc(x1, cy, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x0, cy + r); g.arc(x0, cy, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); }
function drawRace(cx, cy) {
  frame(cx, cy, `NIGHT MEETING · RACE ${RACE.no}`, '');
  g.fillStyle = '#e11d48'; g.fillRect(cx + CW - 70, cy + 14, 56, 20); g.fillStyle = '#fff'; g.textAlign = 'center'; fit('LIVE', 48, 13); g.fillText('LIVE', cx + CW - 42, cy + 24.5);
  // mini track (left) with the runners as dots
  const x0 = cx + 70, x1 = cx + 190, my = cy + 160, r = 62;
  stadiumPath(x0, x1, my, r); g.strokeStyle = '#8a5a32'; g.lineWidth = 16; g.stroke();
  stadiumPath(x0, x1, my, r - 9); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect((x0 + x1) / 2 - 1, my - r - 9, 2, 18); // winning post
  const S = x1 - x0, arc = Math.PI * r, L = 2 * S + 2 * arc;
  for (let i = N - 1; i >= 0; i--) {
    let s = (((RACE.dist[i] % RACE.len) + RACE.len) % RACE.len) / RACE.len * L, px, py;
    if (s < S) { px = x0 + s; py = my - r; } else if ((s -= S) < arc) { const a = -Math.PI / 2 + s / r; px = x1 + Math.cos(a) * r; py = my + Math.sin(a) * r; }
    else if ((s -= arc) < S) { px = x1 - s; py = my + r; } else { s -= S; const a = Math.PI / 2 + s / r; px = x0 + Math.cos(a) * r; py = my + Math.sin(a) * r; }
    g.fillStyle = RUNNERS[i].silk; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  }
  // running order (right)
  g.textAlign = 'left';
  RACE.order.forEach((k, pos) => {
    const y = cy + 66 + pos * 26, ru = RUNNERS[k];
    g.fillStyle = pos % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; g.fillRect(cx + 282, y - 11, 216, 23);
    g.fillStyle = GOLD; fit(String(pos + 1), 22, 15); g.fillText(String(pos + 1), cx + 288, y + 1);
    g.fillStyle = ru.silk; g.fillRect(cx + 310, y - 7, 14, 14);
    g.fillStyle = '#fff'; fit(ru.name, 150, 15, '600'); g.fillText(ru.name, cx + 332, y + 1);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.6)'; fit(String(ru.no), 20, 12, ''); g.fillText(String(ru.no), cx + 494, y + 1); g.textAlign = 'left';
  });
  g.fillStyle = 'rgba(255,255,255,0.45)'; fit('SIMULATED FEED', 200, 11, ''); g.fillText('SIMULATED FEED', cx + 16, cy + CH - 12);
}
function drawPricing(cx, cy) {
  frame(cx, cy, `PRICING · RACE ${RACE.no}`, 'Open Position at any window');
  g.textAlign = 'left';
  RUNNERS.forEach((ru, i) => {
    const y = cy + 68 + i * 26;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; g.fillRect(cx + 12, y - 11, CW - 24, 23);
    g.fillStyle = ru.silk; g.fillRect(cx + 20, y - 8, 16, 16);
    g.fillStyle = GOLD; fit(String(ru.no), 22, 15); g.fillText(String(ru.no), cx + 44, y + 1);
    g.fillStyle = '#fff'; fit(ru.name, 180, 16, '600'); g.fillText(ru.name, cx + 70, y + 1);
    g.fillStyle = 'rgba(255,255,255,0.6)'; fit(ru.jockey, 130, 13, ''); g.fillText(ru.jockey, cx + 262, y + 1);
    g.textAlign = 'right'; g.fillStyle = '#7ee0a0'; const p = ru.price.toFixed(2); fit(p, 70, 17, 'bold', 'monospace'); g.fillText(p, cx + CW - 22, y + 1); g.textAlign = 'left';
  });
}
function drawResults(cx, cy) {
  frame(cx, cy, 'PREVIOUS PERFORMANCES', 'Realised outcomes');
  g.textAlign = 'left';
  results.forEach((r, i) => {
    const y = cy + 82 + i * 46;
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(cx + 14, y - 18, CW - 28, 38);
    g.fillStyle = GOLD; fit(`RACE ${r.no}`, 90, 15); g.fillText(`RACE ${r.no}`, cx + 26, y + 1);
    g.fillStyle = '#fff'; fit(r.name, 230, 19, '600'); g.fillText(r.name, cx + 126, y + 1);
    g.textAlign = 'right'; g.fillStyle = '#7ee0a0'; fit(r.price.toFixed(2), 80, 18, 'bold', 'monospace'); g.fillText(r.price.toFixed(2), cx + CW - 28, y + 1); g.textAlign = 'left';
  });
  g.fillStyle = 'rgba(255,255,255,0.45)'; fit('All balances are notional. No real currency is accepted, held or paid out.', CW - 32, 11, ''); g.fillText('All balances are notional. No real currency is accepted, held or paid out.', cx + 16, cy + CH - 12);
}
function drawBrand(cx, cy) {
  const grd = g.createLinearGradient(cx, cy, cx + CW, cy + CH); grd.addColorStop(0, '#05070f'); grd.addColorStop(1, '#1b1530');
  g.fillStyle = grd; g.fillRect(cx, cy, CW, CH);
  g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(cx + 14, cy + 14, CW - 28, CH - 28);
  // a stylised horse head in gold (simple polygon)
  g.fillStyle = GOLD; g.beginPath();
  const hx = cx + CW / 2, hy = cy + 60;
  g.moveTo(hx - 18, hy + 54); g.lineTo(hx - 22, hy + 10); g.lineTo(hx - 6, hy - 14); g.lineTo(hx + 4, hy - 26); g.lineTo(hx + 6, hy - 12); g.lineTo(hx + 30, hy + 12); g.lineTo(hx + 26, hy + 22); g.lineTo(hx + 6, hy + 16); g.lineTo(hx + 8, hy + 54); g.closePath(); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; fit('EQUINE PERFORMANCE CENTRE', CW - 60, 30, 'bold', 'Georgia, serif'); g.fillText('EQUINE PERFORMANCE CENTRE', cx + CW / 2, cy + 160);
  g.fillStyle = GOLD; fit('Velocity · Pedigree · Conviction', CW - 80, 18, 'italic', 'Georgia, serif'); g.fillText('Velocity · Pedigree · Conviction', cx + CW / 2, cy + 200);
  g.fillStyle = 'rgba(255,255,255,0.6)'; fit(`Night Meeting · Race ${RACE.no} now running`, CW - 80, 14, ''); g.fillText(`Night Meeting · Race ${RACE.no} now running`, cx + CW / 2, cy + 236);
  g.textBaseline = 'alphabetic';
}

function drawAll() {
  const cell = (i, fn) => { const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH; g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip(); fn(x, y); g.restore(); };
  cell(RC.RACE, drawRace); cell(RC.PRICING, drawPricing); cell(RC.RESULTS, drawResults); cell(RC.BRAND, drawBrand);
  raceTexture.needsUpdate = true;
}
drawAll();
let acc = 0;
// The race always advances (the 3D runners read it); the atlas is only redrawn while the floor is visible.
export function updateRaceScreens(dt, visible) {
  step(Math.min(dt, 0.1));
  if (!visible) return;
  acc += dt;
  if (acc >= 0.2) { acc = 0; drawAll(); }
}

// Instanced screens sampling the atlas (per-instance cell offset). items: {x, y, z, yaw, tilt?, w, h, cell} (world)
const mat = new THREE.MeshBasicMaterial({ map: raceTexture, toneMapped: false });
mat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${1 / COLS}, ${1 / ROWS}) + cellOffset;\n#endif`);
};
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function buildRaceScreens(items) {
  return chunked(items, 40, (list) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const offs = new Float32Array(list.length * 2);
    list.forEach((s, i) => { offs[i * 2] = (s.cell % COLS) / COLS; offs[i * 2 + 1] = 1 - (Math.floor(s.cell / COLS) + 1) / ROWS; });
    geo.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(offs, 2));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => { _q.setFromEuler(_e.set(s.tilt || 0, s.yaw, 0, 'YXZ')); _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1)); mesh.setMatrixAt(i, _m); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    return mesh;
  });
}
