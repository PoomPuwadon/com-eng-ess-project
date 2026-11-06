import * as THREE from 'three';
import { chunked } from './geom.js';

// VT-03 Combat Sports Analytics Pavilion screens: ONE atlas (2 x 2 cells, 512 x 288 each) shared by every
// screen in the pavilion, drawn at 6 Hz only while the pavilion is on screen. Every label is measured
// and fitted to its slot, and each cell is clipped, so nothing overlaps.
// Phase 1: the bouts are SIMULATED (invented, real-style Thai ring names and camps). Phase 4 swaps in
// real fight cards if a free structured source exists (free-data-sources skill).
const COLS = 2, ROWS = 2, CW = 512, CH = 288;
export const FC = { FIGHT: 0, CARD: 1, SCORE: 2, BRAND: 3 };

const canvas = document.createElement('canvas');
canvas.width = CW * COLS; canvas.height = CH * ROWS;
const g = canvas.getContext('2d');
export const fightTexture = new THREE.CanvasTexture(canvas);
fightTexture.colorSpace = THREE.SRGBColorSpace;
fightTexture.anisotropy = 8;

function fit(text, maxW, size, weight = 'bold', family = 'sans-serif') {
  let px = size;
  do { g.font = `${weight} ${px}px ${family}`.trim(); px -= 1; } while (g.measureText(text).width > maxW && px > 7);
}
const FIRST = ['Petchnamek', 'Rungsaeng', 'Yodkhunpon', 'Saknarin', 'Kongthoranee', 'Rittidech', 'Phetsiam', 'Chanasuk', 'Nongbua', 'Sitthichai', 'Thepthai', 'Kaimukkao', 'Detchai', 'Panpetch'];
const CAMP = ['Sor.Phetrung', 'Por.Thanachai', 'Kiatsakda', 'Sit.Boonmee', 'Lukbanyai', 'Chor.Wanida', 'Petchyindee Jr', 'Tor.Rattana'];
const rnd = (a, b) => a + Math.random() * (b - a);
const fighter = (i) => ({ name: FIRST[i % FIRST.length], camp: CAMP[(i * 3) % CAMP.length], kg: [57, 61, 63.5, 66.7, 70][i % 5] });
let boutNo = 0;
function newBout() {
  const k = boutNo++ * 2;
  return { red: fighter(k), blue: fighter(k + 5), round: 1, t: 0, rest: 0, score: [[], []], hits: [0, 0], x: [0.38, 0.62], tx: [0.38, 0.62], over: 0 };
}
let bout = newBout();
const ROUND_S = 45, REST_S = 10; // demo clock: a 3-minute round shown in 45 s
const card = Array.from({ length: 5 }, (_, i) => ({ red: fighter(i * 2 + 1), blue: fighter(i * 2 + 6), pr: [1.45 + (i * 0.37) % 1.2, 1.6 + (i * 0.53) % 1.4] }));

function step(dt) {
  const b = bout;
  if (b.over > 0) { b.over -= dt; if (b.over <= 0) bout = newBout(); return; }
  if (b.rest > 0) { b.rest -= dt; if (b.rest <= 0) { b.round++; b.t = 0; } return; }
  b.t += dt;
  for (let s = 0; s < 2; s++) { if (Math.random() < dt * 0.9) b.tx[s] = s ? rnd(0.5, 0.78) : rnd(0.22, 0.5); b.x[s] += (b.tx[s] - b.x[s]) * Math.min(1, dt * 3); if (Math.random() < dt * 0.7) b.hits[s]++; }
  if (b.t >= ROUND_S) {
    const r = b.hits[0] >= b.hits[1]; b.score[0].push(r ? 10 : 9); b.score[1].push(r ? 9 : 10); b.hits = [0, 0];
    if (b.round >= 5) b.over = 12; else b.rest = REST_S;
  }
}
const clock = () => { const s = bout.rest > 0 ? 0 : Math.max(0, 180 - (bout.t / ROUND_S) * 180); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

function drawFight(cx, cy) {
  const b = bout;
  const grd = g.createLinearGradient(cx, cy, cx, cy + CH); grd.addColorStop(0, '#120a0c'); grd.addColorStop(1, '#2a1014');
  g.fillStyle = grd; g.fillRect(cx, cy, CW, CH);
  // the ring from the broadcast camera: blue canvas trapezoid, ropes, two fighters
  const top = cy + 92, bot = cy + 250, L0 = cx + 120, R0 = cx + CW - 120, L1 = cx + 40, R1 = cx + CW - 40;
  g.fillStyle = '#1f4fa8'; g.beginPath(); g.moveTo(L0, top); g.lineTo(R0, top); g.lineTo(R1, bot); g.lineTo(L1, bot); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; for (let i = 1; i < 6; i++) { const t = i / 6; g.beginPath(); g.moveTo(L0 + (R0 - L0) * t, top); g.lineTo(L1 + (R1 - L1) * t, bot); g.stroke(); }
  for (const [k, col] of [[0, '#d22222'], [1, '#ffffff'], [2, '#2244cc']]) { g.strokeStyle = col; g.lineWidth = 2; const y = bot - 20 - k * 12; g.beginPath(); g.moveTo(L1 + 8, y); g.lineTo(R1 - 8, y); g.stroke(); }
  const ph = Math.sin(performance.now() / 160);
  for (let s = 0; s < 2; s++) {
    const x = L1 + (R1 - L1) * b.x[s], y = cy + 200, col = s ? '#2244cc' : '#d22222';
    g.fillStyle = '#d8a47f'; g.beginPath(); g.arc(x, y - 62, 11, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = '#c68c62'; g.fillRect(x - 12, y - 50, 24, 30); // torso
    g.fillStyle = col; g.fillRect(x - 12, y - 22, 24, 14); // shorts
    g.fillStyle = '#c68c62'; g.fillRect(x - 11, y - 8, 8, 26); g.fillRect(x + 3, y - 8 + (s ? ph : -ph) * 4, 8, 26); // legs
    const reach = (s ? -1 : 1) * (14 + Math.max(0, ph) * 16);
    g.fillStyle = col; g.beginPath(); g.arc(x + reach, y - 44, 7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x + reach * 0.4, y - 52, 7, 0, Math.PI * 2); g.fill(); // gloves
  }
  // header bar: RED name | ROUND n | clock | BLUE name (fixed slots)
  g.fillStyle = 'rgba(6,6,10,0.9)'; g.fillRect(cx + 10, cy + 10, CW - 20, 48);
  g.fillStyle = '#d22222'; g.fillRect(cx + 10, cy + 10, 8, 48); g.fillStyle = '#2244cc'; g.fillRect(cx + CW - 18, cy + 10, 8, 48);
  g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.textAlign = 'left'; fit(b.red.name, 150, 20); g.fillText(b.red.name, cx + 26, cy + 26);
  g.fillStyle = '#e8a0a0'; fit(b.red.camp, 150, 12, ''); g.fillText(b.red.camp, cx + 26, cy + 46);
  g.textAlign = 'right'; g.fillStyle = '#fff'; fit(b.blue.name, 150, 20); g.fillText(b.blue.name, cx + CW - 26, cy + 26);
  g.fillStyle = '#a0b8e8'; fit(b.blue.camp, 150, 12, ''); g.fillText(b.blue.camp, cx + CW - 26, cy + 46);
  g.textAlign = 'center'; g.fillStyle = '#f2c14a'; const rt = b.over > 0 ? 'DECISION' : b.rest > 0 ? 'BREAK' : `ROUND ${b.round}`;
  fit(rt, 110, 16); g.fillText(rt, cx + CW / 2, cy + 24);
  g.fillStyle = '#fff'; fit(clock(), 90, 18, 'bold', 'monospace'); g.fillText(clock(), cx + CW / 2, cy + 46);
  g.fillStyle = '#e11d48'; g.fillRect(cx + CW - 70, cy + 68, 56, 20); g.fillStyle = '#fff'; fit('LIVE', 48, 13); g.fillText('LIVE', cx + CW - 42, cy + 78.5);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.6)'; fit('MUAY THAI · SIMULATED', 240, 11, ''); g.fillText('MUAY THAI · SIMULATED', cx + 14, cy + CH - 12);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

function drawCard(cx, cy) {
  g.fillStyle = '#0d0a10'; g.fillRect(cx, cy, CW, CH);
  g.fillStyle = '#6a1420'; g.fillRect(cx, cy, CW, 40);
  g.textBaseline = 'middle'; g.fillStyle = '#f2c14a'; g.textAlign = 'center'; fit("TONIGHT'S CARD · POSITIONS OPEN", CW - 30, 18); g.fillText("TONIGHT'S CARD · POSITIONS OPEN", cx + CW / 2, cy + 21);
  card.forEach((c, i) => {
    const y = cy + 66 + i * 44;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; g.fillRect(cx + 8, y - 20, CW - 16, 40);
    const pr = c.pr.map((p, s) => p + Math.sin(performance.now() / 4000 + i + s) * 0.03);
    g.fillStyle = '#d22222'; g.fillRect(cx + 12, y - 14, 5, 28); g.fillStyle = '#2244cc'; g.fillRect(cx + CW - 17, y - 14, 5, 28);
    g.textAlign = 'left'; g.fillStyle = '#fff'; fit(c.red.name, 150, 16); g.fillText(c.red.name, cx + 24, y);
    g.textAlign = 'right'; fit(c.blue.name, 150, 16); g.fillText(c.blue.name, cx + CW - 24, y);
    g.textAlign = 'center'; g.fillStyle = '#9ca3af'; fit(`${c.red.kg} kg`, 60, 11, ''); g.fillText(`${c.red.kg} kg`, cx + CW / 2, y - 9);
    g.fillStyle = '#fca5a5'; fit(pr[0].toFixed(2), 52, 15, 'bold', 'monospace'); g.fillText(pr[0].toFixed(2), cx + CW / 2 - 40, y + 8);
    g.fillStyle = '#93c5fd'; fit(pr[1].toFixed(2), 52, 15, 'bold', 'monospace'); g.fillText(pr[1].toFixed(2), cx + CW / 2 + 40, y + 8);
  });
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.55)'; fit('PRICING · NOTIONAL · SIMULATED', 300, 11, ''); g.fillText('PRICING · NOTIONAL · SIMULATED', cx + 12, cy + CH - 10);
  g.textBaseline = 'alphabetic';
}

function drawScore(cx, cy) {
  const b = bout;
  g.fillStyle = '#08080c'; g.fillRect(cx, cy, CW, CH);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#f2c14a'; fit('OFFICIAL SCORECARD', 300, 18); g.fillText('OFFICIAL SCORECARD', cx + 16, cy + 24);
  const colW = 64, x0 = cx + 170;
  g.fillStyle = '#6b7280';
  for (let r = 0; r < 5; r++) { g.textAlign = 'center'; fit(`R${r + 1}`, 50, 13); g.fillText(`R${r + 1}`, x0 + r * colW + colW / 2, cy + 64); }
  [[b.red, '#d22222', 0], [b.blue, '#2244cc', 1]].forEach(([f, col, s]) => {
    const y = cy + 104 + s * 56;
    g.fillStyle = col; g.fillRect(cx + 14, y - 20, 6, 40);
    g.textAlign = 'left'; g.fillStyle = '#fff'; fit(f.name, 140, 17); g.fillText(f.name, cx + 28, y);
    for (let r = 0; r < 5; r++) {
      const v = b.score[s][r]; g.fillStyle = r % 2 ? '#141420' : '#1b1b2a'; g.fillRect(x0 + r * colW + 3, y - 20, colW - 6, 40);
      g.textAlign = 'center'; g.fillStyle = v === 10 ? '#f2c14a' : '#d1d5db'; fit(v ? String(v) : '–', 50, 20, 'bold', 'monospace'); g.fillText(v ? String(v) : '–', x0 + r * colW + colW / 2, y + 1);
    }
  });
  const tot = [0, 1].map((s) => b.score[s].reduce((a, c) => a + c, 0));
  g.textAlign = 'left'; g.fillStyle = '#9ca3af'; fit(`TOTAL  ${tot[0]} – ${tot[1]}`, 300, 16, 'bold', 'monospace'); g.fillText(`TOTAL  ${tot[0]} – ${tot[1]}`, cx + 28, cy + 236);
  g.fillStyle = 'rgba(255,255,255,0.5)'; fit('JUDGES · SIMULATED', 220, 11, ''); g.fillText('JUDGES · SIMULATED', cx + 28, cy + CH - 12);
  g.textBaseline = 'alphabetic';
}

function drawBrand(cx, cy) {
  const grd = g.createRadialGradient(cx + CW / 2, cy + CH / 2, 20, cx + CW / 2, cy + CH / 2, CW / 1.4);
  grd.addColorStop(0, '#5a1a10'); grd.addColorStop(1, '#120406');
  g.fillStyle = grd; g.fillRect(cx, cy, CW, CH);
  g.strokeStyle = '#f2b544'; g.lineWidth = 4; g.strokeRect(cx + 10, cy + 10, CW - 20, CH - 20);
  g.lineWidth = 2; g.strokeRect(cx + 18, cy + 18, CW - 36, CH - 36);
  // a Thai-style crest: tiered pointed gable over a shield
  const m = cx + CW / 2;
  g.fillStyle = '#f2b544';
  for (let i = 0; i < 3; i++) { const w = 90 - i * 24, y = cy + 108 - i * 22; g.beginPath(); g.moveTo(m - w, y); g.lineTo(m, y - 34); g.lineTo(m + w, y); g.closePath(); g.fill(); }
  g.fillStyle = '#2a0a06'; g.beginPath(); g.moveTo(m - 38, cy + 104); g.lineTo(m + 38, cy + 104); g.lineTo(m + 30, cy + 150); g.lineTo(m, cy + 168); g.lineTo(m - 30, cy + 150); g.closePath(); g.fill();
  g.strokeStyle = '#f2b544'; g.lineWidth = 3; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2b544';
  fit('COMBAT SPORTS ANALYTICS PAVILION', CW - 60, 24); g.fillText('COMBAT SPORTS ANALYTICS PAVILION', m, cy + 200);
  g.fillStyle = '#f5e6c8'; fit('Discipline · Heritage · Conviction', CW - 80, 15, 'italic'); g.fillText('Discipline · Heritage · Conviction', m, cy + 232);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

function drawAll() {
  const cell = (i, fn) => { const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH; g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip(); fn(x, y); g.restore(); };
  cell(FC.FIGHT, drawFight); cell(FC.CARD, drawCard); cell(FC.SCORE, drawScore); cell(FC.BRAND, drawBrand);
  fightTexture.needsUpdate = true;
}
drawAll();
let acc = 0;
export function updateFightScreens(dt, visible) {
  step(dt);
  if (!visible) return;
  acc += dt;
  if (acc >= 1 / 6) { acc = 0; drawAll(); }
}
export const fightState = () => ({ round: bout.round, red: bout.red.name, blue: bout.blue.name, over: bout.over > 0 });

// Instanced screens sampling the atlas (per-instance cell offset). items: {x, y, z, yaw, tilt?, w, h, cell} (world)
const mat = new THREE.MeshBasicMaterial({ map: fightTexture, toneMapped: false });
mat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${1 / COLS}, ${1 / ROWS}) + cellOffset;\n#endif`);
};
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function buildFightScreens(items) {
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
