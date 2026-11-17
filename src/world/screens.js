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

// Live feed from the game server (real delayed quotes, the firm's real book, real lottery history).
const LIVE = { quotes: null, source: '', firm: null, nav: null, lotto: null };
export function setLiveFeed(d) { Object.assign(LIVE, d); if (d.quotes) drawTicker(); }

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
  const tq = LIVE.quotes || SYMBOLS.slice(0, 6).map((s, i) => ({ symbol: s, price: prices[i], change: Math.sin(t / 30 + i) * 0.01 }));
  const span = tq.length * 190;
  let off = -((t * 6) % span);
  g.save(); g.beginPath(); g.rect(x, y, CW, CHH); g.clip();
  for (let k = 0; k < 2; k++) {
    let cx = x + off + k * span;
    for (const q of tq) {
      const up = q.change >= 0;
      g.fillStyle = up ? '#3dff7a' : '#ff4d5e';
      if (cx > x - 220 && cx < x + CW) g.fillText(`${q.symbol} ${q.price.toFixed(2)} ${up ? '▲' : '▼'}`, cx, y + 50);
      cx += 190;
    }
  }
  g.restore();
  g.fillStyle = '#ffcc33'; g.font = '20px monospace';
  g.fillText(LIVE.quotes ? `DELAYED · ${LIVE.source.toUpperCase().slice(0, 34)}` : 'CONNECTING TO MARKET DATA…', x + 10, y + 105);

  // CHART
  [x, y] = cell(CH.CHART);
  g.fillStyle = '#081018'; g.fillRect(x, y, CW, CHH);
  const series = LIVE.nav && LIVE.nav.length > 1 ? LIVE.nav : chart;
  g.strokeStyle = '#3dd6ff'; g.lineWidth = 3; g.beginPath();
  const mn = Math.min(...series), mx = Math.max(...series) + 0.001;
  series.forEach((v, i) => {
    const px = x + 10 + (i / (series.length - 1)) * (CW - 20);
    const py = y + CHH - 10 - ((v - mn) / (mx - mn)) * (CHH - 30);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
  g.fillStyle = '#9ad'; g.font = '18px monospace'; g.fillText(LIVE.nav ? 'FIRM BOOK — NAV (LIVE)' : 'FIRM BOOK — AWAITING DATA', x + 10, y + 20);

  // PNL
  [x, y] = cell(CH.PNL);
  const livePnl = LIVE.firm ? Math.round((LIVE.firm.nav - 100_000_000) / 100) : pnl;
  g.fillStyle = livePnl >= 0 ? '#062b12' : '#2b0608'; g.fillRect(x, y, CW, CHH);
  g.fillStyle = livePnl >= 0 ? '#3dff7a' : '#ff4d5e'; g.font = 'bold 46px monospace';
  g.fillText(`P&L ${livePnl >= 0 ? '+' : ''}${livePnl.toLocaleString()}`, x + 20, y + 70);
  g.fillStyle = '#aaa'; g.font = '18px monospace'; g.fillText(LIVE.firm ? `NOTIONAL · ${LIVE.firm.positions.length} POSITIONS` : 'NOTIONAL — AWAITING DATA', x + 20, y + 105);

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

  // LOTTO heatmap (real last-2 frequencies once the Institute has run)
  [x, y] = cell(CH.LOTTO);
  if (LIVE.lotto) {
    const gr = LIVE.lotto.grid, flat = gr.flat(), lo = Math.min(...flat), hi = Math.max(...flat) || 1;
    g.fillStyle = '#05080c'; g.fillRect(x, y, CW, CHH);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const v = (gr[i][j] - lo) / (hi - lo || 1);
      g.fillStyle = `hsl(${240 - v * 240},90%,${30 + v * 30}%)`;
      g.fillRect(x + 4 + j * 22, y + 4 + i * 12, 21, 11);
    }
    g.fillStyle = '#fff'; g.font = 'bold 18px monospace'; g.fillText('LAST-2 FREQUENCY', x + 240, y + 30);
    g.font = '16px monospace'; g.fillStyle = '#ffd34d'; g.fillText(`NEXT DRAW ${LIVE.lotto.next}`, x + 240, y + 60);
    g.fillStyle = '#bff9ff'; g.fillText(`PICKS ${LIVE.lotto.picks.join(' ')}`, x + 240, y + 88);
    g.fillStyle = '#aaa'; g.font = '13px monospace'; g.fillText(`${LIVE.lotto.draws} OFFICIAL DRAWS · GLO`, x + 240, y + 112);
  } else { // never a made-up heat-map: say what it is waiting for
    g.fillStyle = '#05080c'; g.fillRect(x, y, CW, CHH);
    g.fillStyle = '#ffd34d'; g.font = 'bold 20px monospace'; g.fillText('LAST-2 FREQUENCY', x + 12, y + 40);
    g.fillStyle = '#9fb3d9'; g.font = '15px monospace'; g.fillText('awaiting the Institute run · GLO official results', x + 12, y + 72);
  }

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
  if (!tg) return;
  tg.fillStyle = '#000'; tg.fillRect(0, 0, 2048, 64);
  tg.font = 'bold 34px monospace';
  let x = 10;
  const list = LIVE.quotes ? LIVE.quotes.map((q) => [q.symbol, q.price, q.change * 100]) : SYMBOLS.map((s, i) => [s, prices[i], 0]);
  for (const [s, p, ch] of list) {
    if (x > 2040) break;
    tg.fillStyle = ch >= 0 ? '#3dff7a' : '#ff4d5e';
    const txt = `${s} ${p.toFixed(2)} ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
    tg.fillText(txt, x, 44);
    x += tg.measureText(txt).width + 36;
  }
  tickerTexture.needsUpdate = true;
}
drawTicker();
setInterval(drawTicker, 60_000);
export const tickerMaterial = new THREE.MeshBasicMaterial({ map: tickerTexture, toneMapped: false, side: THREE.DoubleSide });
export function updateTicker(dt) { tickerTexture.offset.x = (tickerTexture.offset.x + dt * 0.04) % 1; }
