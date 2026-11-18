import * as THREE from 'three';
import { chunked } from './geom.js';

// VT-04 Equine Performance Centre screens: ONE atlas (2 x 2 cells, 512 x 288 each) shared by every screen
// on the floor, redrawn at 5 Hz only while the floor is on screen. Every label is measured and fitted to its
// slot and each cell is clipped, so nothing overlaps.
// The race itself lives here too (one source of truth for the 3D runners and the screens).
// Only LIVE player races are shown (no simulated field): see setLiveRace / recordRaceResult below.
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

// ---------------------------------------------------------------- the race: LIVE player races only (user, 2026-11-18)
// No placeholder field: the track is empty until a Chief Executive starts a race with players. The
// arena HUD (multiplayer/arenaHud.js) feeds the live state in with setLiveRace(); between races the
// screens show "awaiting riders" and the record of real finished races.
export const SILKS = ['#c0392b', '#1d4ed8', '#f59e0b', '#16a34a', '#7c3aed', '#e5e7eb']; // = arenaHud COLOURS
export const RACE = { len: 272, no: 1 };
let live = null; // { phase, goIn, racers: [{ name, d, price }] }
const results = []; // real finished races, newest first
export function setTrackLength(len) { RACE.len = len; }
/** called by the arena HUD: null = no race on */
export function setLiveRace(state) { live = state; }
/** a player race finished: record it and number the next one */
export function recordRaceResult(winner, price) {
  results.unshift({ no: RACE.no, name: winner || 'No result (void)', price: Number.isFinite(price) ? price : null });
  results.length = Math.min(results.length, 4);
  RACE.no++;
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
function idle(cx, cy, line1, line2) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; fit(line1, CW - 60, 26); g.fillText(line1, cx + CW / 2, cy + 140);
  g.fillStyle = 'rgba(255,255,255,0.6)'; fit(line2, CW - 60, 14, ''); g.fillText(line2, cx + CW / 2, cy + 178);
  g.textAlign = 'left';
}
function drawRace(cx, cy) {
  const on = live && live.racers.length;
  frame(cx, cy, `NIGHT MEETING · RACE ${RACE.no}`, '');
  if (!on) { idle(cx, cy, 'AWAITING RIDERS', 'A Chief Executive selects the riders. The fastest clicker wins.'); return; }
  const tag = live.phase === 'countdown' ? `GO IN ${live.goIn}` : 'LIVE';
  g.fillStyle = '#e11d48'; g.fillRect(cx + CW - 92, cy + 14, 78, 20); g.fillStyle = '#fff'; g.textAlign = 'center'; fit(tag, 70, 13); g.fillText(tag, cx + CW - 53, cy + 24.5);
  // mini track (left) with the riders as dots
  const x0 = cx + 70, x1 = cx + 190, my = cy + 160, r = 62;
  stadiumPath(x0, x1, my, r); g.strokeStyle = '#8a5a32'; g.lineWidth = 16; g.stroke();
  stadiumPath(x0, x1, my, r - 9); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect((x0 + x1) / 2 - 1, my - r - 9, 2, 18); // winning post
  const S = x1 - x0, arc = Math.PI * r, L = 2 * S + 2 * arc;
  live.racers.forEach((ru, i) => {
    let s = (((ru.d % RACE.len) + RACE.len) % RACE.len) / RACE.len * L, px, py;
    if (s < S) { px = x0 + s; py = my - r; } else if ((s -= S) < arc) { const a = -Math.PI / 2 + s / r; px = x1 + Math.cos(a) * r; py = my + Math.sin(a) * r; }
    else if ((s -= arc) < S) { px = x1 - s; py = my + r; } else { s -= S; const a = Math.PI / 2 + s / r; px = x0 + Math.cos(a) * r; py = my + Math.sin(a) * r; }
    g.fillStyle = SILKS[i % SILKS.length]; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  });
  // running order (right)
  g.textAlign = 'left';
  live.racers.map((ru, i) => ({ ru, i })).sort((a, b) => b.ru.d - a.ru.d).forEach(({ ru, i }, pos) => {
    const y = cy + 66 + pos * 26;
    g.fillStyle = pos % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; g.fillRect(cx + 282, y - 11, 216, 23);
    g.fillStyle = GOLD; fit(String(pos + 1), 22, 15); g.fillText(String(pos + 1), cx + 288, y + 1);
    g.fillStyle = SILKS[i % SILKS.length]; g.fillRect(cx + 310, y - 7, 14, 14);
    g.fillStyle = '#fff'; fit(ru.name, 120, 15, '600'); g.fillText(ru.name, cx + 332, y + 1);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.6)'; const m = `${Math.round(ru.d)} m`; fit(m, 48, 12, ''); g.fillText(m, cx + 494, y + 1); g.textAlign = 'left';
  });
}
function drawPricing(cx, cy) {
  frame(cx, cy, `PRICING · RACE ${RACE.no}`, live && live.racers.length ? 'Open a position on the panel' : '');
  if (!live || !live.racers.length) { idle(cx, cy, 'NO RACE OPEN', 'Pricing opens when riders take the gate.'); return; }
  g.textAlign = 'left';
  live.racers.forEach((ru, i) => {
    const y = cy + 68 + i * 30;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; g.fillRect(cx + 12, y - 13, CW - 24, 27);
    g.fillStyle = SILKS[i % SILKS.length]; g.fillRect(cx + 20, y - 8, 16, 16);
    g.fillStyle = '#fff'; fit(ru.name, 300, 17, '600'); g.fillText(ru.name, cx + 46, y + 1);
    g.textAlign = 'right'; g.fillStyle = '#7ee0a0'; const p = ru.price ? `${ru.price.toFixed(2)}x` : '—'; fit(p, 90, 18, 'bold', 'monospace'); g.fillText(p, cx + CW - 22, y + 1); g.textAlign = 'left';
  });
}
function drawResults(cx, cy) {
  frame(cx, cy, 'PREVIOUS PERFORMANCES', 'Realised outcomes');
  if (!results.length) { idle(cx, cy, 'NO RACES RUN YET', 'Finished races appear here.'); return; }
  g.textAlign = 'left';
  results.forEach((r, i) => {
    const y = cy + 82 + i * 46;
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(cx + 14, y - 18, CW - 28, 38);
    g.fillStyle = GOLD; fit(`RACE ${r.no}`, 90, 15); g.fillText(`RACE ${r.no}`, cx + 26, y + 1);
    g.fillStyle = '#fff'; fit(r.name, 230, 19, '600'); g.fillText(r.name, cx + 126, y + 1);
    if (r.price) { g.textAlign = 'right'; g.fillStyle = '#7ee0a0'; fit(`${r.price.toFixed(2)}x`, 80, 18, 'bold', 'monospace'); g.fillText(`${r.price.toFixed(2)}x`, cx + CW - 28, y + 1); g.textAlign = 'left'; }
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
  const st = live && live.racers.length ? `Night Meeting · Race ${RACE.no} now running` : `Night Meeting · Race ${RACE.no} · awaiting riders`;
  g.fillStyle = 'rgba(255,255,255,0.6)'; fit(st, CW - 80, 14, ''); g.fillText(st, cx + CW / 2, cy + 236);
  g.textBaseline = 'alphabetic';
}

function drawAll() {
  const cell = (i, fn) => { const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH; g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip(); fn(x, y); g.restore(); };
  cell(RC.RACE, drawRace); cell(RC.PRICING, drawPricing); cell(RC.RESULTS, drawResults); cell(RC.BRAND, drawBrand);
  raceTexture.needsUpdate = true;
}
drawAll();
let acc = 0;
// The atlas is only redrawn (5 Hz) while the floor is visible.
export function updateRaceScreens(dt, visible) {
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
