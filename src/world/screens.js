import * as THREE from 'three';
import { chunked } from './geom.js';

// A handful of shared "channels" rendered into ONE atlas texture, reused by every
// screen in the building (threejs-performance skill §4). All data here is fake (Phase 0).
export const CH = { TICKER: 0, CHART: 1, PNL: 2, SCORE: 3, ODDS: 4, FIGHT: 5, RACE: 6, LOTTO: 7 };
const COLS = 2, ROWS = 4, CW = 512, CHH = 128;

const canvas = document.createElement('canvas');
canvas.width = CW * COLS;
canvas.height = CHH * ROWS;
const g = canvas.getContext('2d');
export const atlas = new THREE.CanvasTexture(canvas);
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.generateMipmaps = true;
atlas.minFilter = THREE.LinearMipmapLinearFilter;

const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'JPM', 'GS', 'XOM'];
const prices = SYMBOLS.map(() => 100 + Math.random() * 400);
const chart = Array.from({ length: 60 }, () => 0);
let pnl = 1_250_000;
let t = 0;

function cell(ch) { return [(ch % COLS) * CW, Math.floor(ch / COLS) * CHH]; }

function draw() {
  t += 1;
  for (let i = 0; i < prices.length; i++) prices[i] *= 1 + (Math.random() - 0.5) * 0.004;
  chart.push(chart[chart.length - 1] + (Math.random() - 0.48) * 3);
  chart.shift();
  pnl += Math.round((Math.random() - 0.47) * 40_000);

  // TICKER
  let [x, y] = cell(CH.TICKER);
  g.fillStyle = '#05080c'; g.fillRect(x, y, CW, CHH);
  g.font = 'bold 30px monospace';
  let off = -((t * 6) % 900);
  for (let k = 0; k < 2; k++) {
    let cx = x + off + k * 900;
    for (let i = 0; i < 6; i++) {
      const up = Math.random() > 0.5;
      g.fillStyle = up ? '#3dff7a' : '#ff4d5e';
      const s = `${SYMBOLS[i]} ${prices[i].toFixed(2)} ${up ? '▲' : '▼'}`;
      if (cx > x - 200 && cx < x + CW) g.fillText(s, cx, y + 50);
      cx += 150;
    }
  }
  g.fillStyle = '#ffcc33'; g.font = '20px monospace';
  g.fillText('DEMO DATA — NOT REAL PRICES', x + 10, y + 105);

  // CHART
  [x, y] = cell(CH.CHART);
  g.fillStyle = '#081018'; g.fillRect(x, y, CW, CHH);
  g.strokeStyle = '#3dd6ff'; g.lineWidth = 3; g.beginPath();
  const mn = Math.min(...chart), mx = Math.max(...chart) + 0.001;
  chart.forEach((v, i) => {
    const px = x + 10 + (i / 59) * (CW - 20);
    const py = y + CHH - 10 - ((v - mn) / (mx - mn)) * (CHH - 30);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
  g.fillStyle = '#9ad'; g.font = '18px monospace'; g.fillText('FIRM BOOK — INTRADAY (DEMO)', x + 10, y + 20);

  // PNL
  [x, y] = cell(CH.PNL);
  g.fillStyle = pnl >= 0 ? '#062b12' : '#2b0608'; g.fillRect(x, y, CW, CHH);
  g.fillStyle = pnl >= 0 ? '#3dff7a' : '#ff4d5e'; g.font = 'bold 46px monospace';
  g.fillText(`P&L ${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}`, x + 20, y + 70);
  g.fillStyle = '#aaa'; g.font = '18px monospace'; g.fillText('NOTIONAL — DEMO', x + 20, y + 105);

  // SCORE
  [x, y] = cell(CH.SCORE);
  g.fillStyle = '#101a3a'; g.fillRect(x, y, CW, CHH);
  g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif';
  const min = 1 + (Math.floor(t / 10) % 90);
  g.fillText(`HOME  ${Math.floor(min / 30)} – ${Math.floor(min / 41)}  AWAY`, x + 30, y + 65);
  g.font = '24px sans-serif'; g.fillStyle = '#ffd34d'; g.fillText(`${min}'   PLACEHOLDER FIXTURE`, x + 30, y + 105);

  // ODDS
  [x, y] = cell(CH.ODDS);
  g.fillStyle = '#1b1405'; g.fillRect(x, y, CW, CHH);
  g.fillStyle = '#ffd34d'; g.font = 'bold 28px monospace';
  g.fillText('PRICING  1   X   2', x + 20, y + 40);
  g.fillStyle = '#fff';
  g.fillText(`        ${(1.8 + Math.sin(t / 20) * 0.1).toFixed(2)} 3.40 ${(4.2 - Math.sin(t / 20) * 0.2).toFixed(2)}`, x + 20, y + 85);

  // FIGHT
  [x, y] = cell(CH.FIGHT);
  g.fillStyle = '#2a0707'; g.fillRect(x, y, CW, CHH);
  g.fillStyle = '#ff6b6b'; g.font = 'bold 30px sans-serif'; g.fillText('RED CORNER', x + 20, y + 45);
  g.fillStyle = '#6bb5ff'; g.fillText('BLUE CORNER', x + 290, y + 45);
  g.fillStyle = '#fff'; g.font = '26px sans-serif'; g.fillText(`ROUND ${1 + (Math.floor(t / 60) % 5)} / 5   (SIMULATED)`, x + 90, y + 100);

  // RACE
  [x, y] = cell(CH.RACE);
  g.fillStyle = '#0b2410'; g.fillRect(x, y, CW, CHH);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsl(${i * 60},80%,60%)`;
    const p = ((t * (1 + i * 0.07)) % 400) / 400;
    g.fillRect(x + 10 + p * (CW - 40), y + 12 + i * 18, 26, 12);
  }
  g.fillStyle = '#fff'; g.font = '16px monospace'; g.fillText('RACE 4 — 1,200 m (SIMULATED)', x + 280, y + 122);

  // LOTTO heatmap
  [x, y] = cell(CH.LOTTO);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 8; j++) {
    const v = Math.random();
    g.fillStyle = `hsl(${240 - v * 240},90%,${30 + v * 30}%)`;
    g.fillRect(x + i * 16, y + j * 16, 16, 16);
  }
  g.fillStyle = '#fff'; g.font = 'bold 22px monospace'; g.fillText('P(DRAW) HEATMAP v9.1', x + 10, y + 120);

  atlas.needsUpdate = true;
}
draw();

let acc = 0;
let active = true;
export function setScreensActive(v) { active = v; }
export function updateScreens(dt) {
  if (!active) return;
  acc += dt;
  if (acc >= 0.1) { acc = 0; draw(); } // 10 Hz, never per-frame
}

// Shared material that offsets UVs per instance into the atlas.
export const screenMaterial = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
screenMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 channelOffset;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${1 / COLS}, ${1 / ROWS}) + channelOffset;\n#endif`);
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _eu = new THREE.Euler(0, 0, 0, 'YXZ');

// Build instanced screens (chunked for culling). items: {x,y,z,yaw,w,h,ch}
export function buildScreens(items) {
  return chunked(items, 40, (list) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const offs = new Float32Array(list.length * 2);
    list.forEach((s, i) => {
      offs[i * 2] = (s.ch % COLS) / COLS;
      offs[i * 2 + 1] = 1 - (Math.floor(s.ch / COLS) + 1) / ROWS;
    });
    geo.setAttribute('channelOffset', new THREE.InstancedBufferAttribute(offs, 2));
    const mesh = new THREE.InstancedMesh(geo, screenMaterial, list.length);
    list.forEach((s, i) => {
      if (s.tilt) _q.setFromEuler(_eu.set(-s.tilt, s.yaw, 0)); else _q.setFromAxisAngle(_up, s.yaw);
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1));
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  });
}

// Non-instanced screen of any shape (e.g. the round ceiling screen).
export function screenMesh(geometry, ch) {
  const n = geometry.attributes.position.count;
  const offs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    offs[i * 2] = (ch % COLS) / COLS;
    offs[i * 2 + 1] = 1 - (Math.floor(ch / COLS) + 1) / ROWS;
  }
  geometry.setAttribute('channelOffset', new THREE.BufferAttribute(offs, 2));
  return new THREE.Mesh(geometry, screenMaterial);
}

// ---------------------------------------------------------------- scrolling ticker strip
// Drawn once, scrolled by UV offset (redrawn only when data changes).
const tc = document.createElement('canvas');
tc.width = 2048; tc.height = 64;
const tg = tc.getContext('2d');
export const tickerTexture = new THREE.CanvasTexture(tc);
tickerTexture.wrapS = THREE.RepeatWrapping;
tickerTexture.colorSpace = THREE.SRGBColorSpace;
function drawTicker() {
  tg.fillStyle = '#000'; tg.fillRect(0, 0, 2048, 64);
  tg.font = 'bold 40px monospace';
  let x = 10;
  SYMBOLS.forEach((s, i) => {
    const ch = (Math.random() - 0.5) * 4;
    tg.fillStyle = ch >= 0 ? '#3dff7a' : '#ff4d5e';
    tg.fillText(`${s} ${prices[i].toFixed(2)} ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`, x, 46);
    x += 170;
  });
  tickerTexture.needsUpdate = true;
}
drawTicker();
setInterval(drawTicker, 60_000);
export const tickerMaterial = new THREE.MeshBasicMaterial({ map: tickerTexture, toneMapped: false, side: THREE.DoubleSide });
export function updateTicker(dt) { tickerTexture.offset.x = (tickerTexture.offset.x + dt * 0.04) % 1; }
