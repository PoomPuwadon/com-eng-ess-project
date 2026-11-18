import * as THREE from 'three';
import { chunked } from './geom.js';

// Phase 1 trading-floor screens: ONE sharp atlas (2048 x 1024, 8 x 6 cells of 256 x 170) of blue
// market graphics in the reference style — charts, bars, candles, single quotes, heat-maps, order
// books. Every cell is clipped to its own rectangle and every text is measured to fit, so nothing
// overlaps or bleeds into a neighbour. Redrawn only when new data arrives: no per-frame uploads.
// Real delayed prices and the firm's real book once the server feed arrives (setTradingData);
// seeded placeholder graphics until then.

const COLS = 8, ROWS = 6, CW = 256, CHH = 170, W = COLS * CW, H = 1024;
export const TCELLS = COLS * ROWS;
export const TKIND = { CHART: [0, 12], BARS: [12, 8], CANDLES: [20, 8], QUOTE: [28, 8], HEAT: [36, 6], BOOK: [42, 6] };
export const tcell = (kind, i) => TKIND[kind][0] + (((i % TKIND[kind][1]) + TKIND[kind][1]) % TKIND[kind][1]);

let atlas = null;
const SYMS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'GS', 'TSLA', 'XOM', 'BRK.B', 'V', 'WMT', 'KO', 'DIS', 'BA'];
function rnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

// fit text into a width by shrinking the font
function fitText(g, text, x, y, maxW, size, weight = '700', family = 'sans-serif') {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 8);
  g.fillText(text, x, y);
}

function drawCell(g, k, x, y) {
  const r = rnd(k * 97 + 13);
  g.save();
  g.beginPath(); g.rect(x, y, CW, CHH); g.clip();
  const bg = g.createLinearGradient(x, y, x, y + CHH);
  bg.addColorStop(0, '#0d4a9e'); bg.addColorStop(1, '#082e6b');
  g.fillStyle = bg; g.fillRect(x, y, CW, CHH);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + 10, y + (CHH * i) / 4); g.lineTo(x + CW - 10, y + (CHH * i) / 4); g.stroke(); }
  const pad = 16, ix = x + pad, iy = y + 34, iw = CW - pad * 2, ih = CHH - 50;
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const label = SYMS[k % SYMS.length];
  if (k < 12) { // area / line chart
    fitText(g, `${label} · INTRADAY`, ix, y + 18, iw, 18, '600');
    const pts = []; let v = 0.5;
    for (let i = 0; i <= 40; i++) { v = Math.min(0.95, Math.max(0.05, v + (r() - 0.47) * 0.12)); pts.push([ix + (i / 40) * iw, iy + ih - v * ih]); }
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.lineTo(ix + iw, iy + ih); g.lineTo(ix, iy + ih); g.closePath();
    g.fillStyle = 'rgba(120,200,255,0.28)'; g.fill();
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.strokeStyle = '#ffffff'; g.lineWidth = 3.5; g.stroke();
  } else if (k < 20) { // bars
    fitText(g, `${label} · VOLUME`, ix, y + 18, iw, 18, '600');
    const n = 9;
    for (let i = 0; i < n; i++) { const h = (0.2 + r() * 0.8) * ih, bw = iw / n - 6; g.fillStyle = i % 3 ? '#e8f2ff' : '#7cc4ff'; g.fillRect(ix + i * (iw / n) + 3, iy + ih - h, bw, h); }
  } else if (k < 28) { // candles
    fitText(g, `${label} · 5 MIN`, ix, y + 18, iw, 18, '600');
    let v = 0.5;
    for (let i = 0; i < 12; i++) {
      const o = v; v = Math.min(0.9, Math.max(0.1, v + (r() - 0.48) * 0.18)); const c = v, hi = Math.max(o, c) + r() * 0.08, lo = Math.min(o, c) - r() * 0.08;
      const cx = ix + (i + 0.5) * (iw / 12), up = c >= o;
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, iy + ih - hi * ih); g.lineTo(cx, iy + ih - lo * ih); g.stroke();
      g.fillStyle = up ? '#5df2a0' : '#ff6b7d'; g.fillRect(cx - 6, iy + ih - Math.max(o, c) * ih, 12, Math.max(3, Math.abs(c - o) * ih));
    }
  } else if (k < 36) { // single quote + small chart
    const price = (60 + r() * 400).toFixed(2), ch = (r() - 0.45) * 4, up = ch >= 0;
    g.fillStyle = '#ffffff'; fitText(g, label, ix, y + 34, iw * 0.5, 40, '800');
    g.textAlign = 'right'; fitText(g, price, x + CW - pad, y + 34, iw * 0.5, 34, '700', 'monospace');
    g.fillStyle = up ? '#5df2a0' : '#ff6b7d'; fitText(g, `${up ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%`, x + CW - pad, y + 74, iw * 0.6, 26, '700', 'monospace');
    g.textAlign = 'left';
    let v = 0.5; g.beginPath();
    for (let i = 0; i <= 30; i++) { v = Math.min(0.95, Math.max(0.05, v + (r() - (up ? 0.44 : 0.56)) * 0.12)); const px = ix + (i / 30) * iw, py = y + CHH - 14 - v * 60; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.strokeStyle = up ? '#5df2a0' : '#ff6b7d'; g.lineWidth = 3; g.stroke();
  } else if (k < 42) { // heat-map
    fitText(g, 'SECTOR HEAT-MAP', ix, y + 18, iw, 18, '600');
    const cs = 6, rs = 4, cw = iw / cs, rh = ih / rs;
    for (let i = 0; i < cs; i++) for (let j = 0; j < rs; j++) { const t = r(); g.fillStyle = t > 0.55 ? `rgba(93,242,160,${0.35 + t * 0.5})` : `rgba(255,107,125,${0.35 + (1 - t) * 0.5})`; g.fillRect(ix + i * cw + 2, iy + j * rh + 2, cw - 4, rh - 4); }
  } else { // order book: 5 rows, fixed columns, measured
    fitText(g, `${label} · BOOK`, ix, y + 18, iw, 18, '600');
    const mid = 80 + r() * 300;
    for (let i = 0; i < 5; i++) {
      const yy = iy + 8 + i * (ih / 5);
      g.fillStyle = i < 2 ? '#ff9aa6' : i === 2 ? '#ffffff' : '#8ff5bd';
      fitText(g, (mid + (2 - i) * 0.05).toFixed(2), ix, yy, iw * 0.45, 20, '600', 'monospace');
      g.textAlign = 'right'; fitText(g, String(Math.round(100 + r() * 900) * 10), x + CW - pad, yy, iw * 0.4, 20, '500', 'monospace'); g.textAlign = 'left';
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- live data (Phase 3: real delayed prices)
// live = { quotes: [{symbol, price, change, ...}], wall: { SYM: { spark: [close], candles: [[o,h,l,c]] } }, book: { positions, nav } }
let live = null;
function bgCell(g, x, y) {
  const bg = g.createLinearGradient(x, y, x, y + CHH);
  bg.addColorStop(0, '#0d4a9e'); bg.addColorStop(1, '#082e6b');
  g.fillStyle = bg; g.fillRect(x, y, CW, CHH);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + 10, y + (CHH * i) / 4); g.lineTo(x + CW - 10, y + (CHH * i) / 4); g.stroke(); }
}
function spark(g, pts, ix, iy, iw, ih, color, fill) {
  if (!pts || pts.length < 2) return;
  const mn = Math.min(...pts), mx = Math.max(...pts) || 1, rng = mx - mn || mx * 0.01;
  const P = pts.map((v, i) => [ix + (i / (pts.length - 1)) * iw, iy + ih - ((v - mn) / rng) * ih]);
  g.beginPath(); P.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  if (fill) { g.save(); g.lineTo(ix + iw, iy + ih); g.lineTo(ix, iy + ih); g.closePath(); g.fillStyle = fill; g.fill(); g.restore(); g.beginPath(); P.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); }
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
}
function drawLiveCell(g, k, x, y) {
  const Q = live.quotes, n = Q.length;
  if (!n) return false;
  g.save(); g.beginPath(); g.rect(x, y, CW, CHH); g.clip();
  bgCell(g, x, y);
  const pad = 16, ix = x + pad, iy = y + 40, iw = CW - pad * 2, ih = CHH - 56;
  g.textBaseline = 'middle'; g.textAlign = 'left';
  const q = Q[k % n], w = live.wall?.[q.symbol], up = q.change >= 0, col = up ? '#5df2a0' : '#ff6b7d';
  const head = (label) => { g.fillStyle = 'rgba(255,255,255,0.8)'; fitText(g, label, ix, y + 18, iw * 0.62, 18, '600'); g.textAlign = 'right'; g.fillStyle = col; fitText(g, `${up ? '▲' : '▼'}${Math.abs(q.change * 100).toFixed(2)}%`, x + CW - pad, y + 18, iw * 0.36, 18, '700', 'monospace'); g.textAlign = 'left'; };
  if (k < 12) { // intraday line
    head(`${q.symbol} ${q.price.toFixed(2)}`);
    spark(g, w?.spark, ix, iy, iw, ih, '#ffffff', 'rgba(120,200,255,0.28)');
  } else if (k < 20) { // day movers: 6 bars around a zero line
    g.fillStyle = 'rgba(255,255,255,0.8)'; fitText(g, 'DAY MOVERS', ix, y + 18, iw, 18, '600');
    const set = [...Q].sort((a, b) => b.change - a.change);
    const pickSet = (k - 12) % 2 ? set.slice(-6).reverse() : set.slice(0, 6);
    const mx = Math.max(...pickSet.map((s) => Math.abs(s.change)), 0.005), mid = iy + ih / 2, bw = iw / 6;
    pickSet.forEach((s, i) => {
      const h = (Math.abs(s.change) / mx) * (ih / 2 - 4);
      g.fillStyle = s.change >= 0 ? '#5df2a0' : '#ff6b7d'; g.fillRect(ix + i * bw + 4, s.change >= 0 ? mid - h : mid, bw - 8, h);
      g.fillStyle = '#fff'; g.textAlign = 'center'; fitText(g, s.symbol, ix + i * bw + bw / 2, s.change >= 0 ? mid + 12 : mid - 12, bw - 2, 13, '700'); g.textAlign = 'left';
    });
  } else if (k < 28) { // daily candles
    head(`${q.symbol} · DAILY`);
    const c = w?.candles || [];
    if (c.length) {
      const lo = Math.min(...c.map((b) => b[2])), hi = Math.max(...c.map((b) => b[1])), r = hi - lo || 1, Yp = (v) => iy + ih - ((v - lo) / r) * ih;
      c.forEach(([o, h, l, cl], i) => {
        const cx = ix + (i + 0.5) * (iw / c.length);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, Yp(h)); g.lineTo(cx, Yp(l)); g.stroke();
        g.fillStyle = cl >= o ? '#5df2a0' : '#ff6b7d'; g.fillRect(cx - 6, Yp(Math.max(o, cl)), 12, Math.max(3, Math.abs(Yp(o) - Yp(cl))));
      });
    }
  } else if (k < 36) { // single quote
    g.fillStyle = '#ffffff'; fitText(g, q.symbol, ix, y + 34, iw * 0.5, 40, '800');
    g.textAlign = 'right'; fitText(g, q.price.toFixed(2), x + CW - pad, y + 34, iw * 0.5, 34, '700', 'monospace');
    g.fillStyle = col; fitText(g, `${up ? '▲' : '▼'} ${Math.abs(q.change * 100).toFixed(2)}%`, x + CW - pad, y + 74, iw * 0.6, 26, '700', 'monospace'); g.textAlign = 'left';
    spark(g, w?.spark, ix, y + CHH - 74, iw, 60, col);
  } else if (k < 42) { // heat-map of the whole universe
    g.fillStyle = 'rgba(255,255,255,0.8)'; fitText(g, 'US EQUITIES · TODAY', ix, y + 18, iw, 18, '600');
    const cs = 6, rs = 5, cw = iw / cs, rh = (CHH - 40) / rs;
    Q.slice(0, cs * rs).forEach((s, i) => {
      const t = Math.max(-1, Math.min(1, s.change / 0.03));
      g.fillStyle = t >= 0 ? `rgba(93,242,160,${0.25 + t * 0.65})` : `rgba(255,107,125,${0.25 - t * 0.65})`;
      const cx = ix + (i % cs) * cw, cy = y + 32 + Math.floor(i / cs) * rh;
      g.fillRect(cx + 1, cy + 1, cw - 2, rh - 2);
      g.fillStyle = '#fff'; g.textAlign = 'center'; fitText(g, s.symbol, cx + cw / 2, cy + rh / 2, cw - 4, 12, '700'); g.textAlign = 'left';
    });
  } else { // the firm's real book
    const pos = live.book?.positions || [];
    g.fillStyle = 'rgba(255,255,255,0.8)'; fitText(g, `FIRM BOOK · NAV ${live.book ? Math.round(live.book.nav / 100).toLocaleString() : '—'}`, ix, y + 18, iw, 18, '600');
    const rows = pos.slice(((k - 42) * 5) % Math.max(pos.length, 1)).concat(pos).slice(0, 5);
    if (!rows.length) { g.fillStyle = '#fff'; fitText(g, 'ORDERS QUEUED FOR THE OPEN', ix, iy + ih / 2, iw, 18, '700'); }
    rows.forEach((p, i) => {
      const yy = iy + 4 + i * (ih / 5);
      { // stripe by owning desk / model: Desk A (Claude) orange, Desk B (Gemini) blue, both split, none = rule-book grey
        const own = p.owners || [], hh = ih / 5 - 4, a = own.includes('head_trader'), b = own.includes('co_head_trader');
        if (a && b) { g.fillStyle = '#ff8a5c'; g.fillRect(x + 3, yy - 14, 6, hh / 2); g.fillStyle = '#5aa2ff'; g.fillRect(x + 3, yy - 14 + hh / 2, 6, hh / 2); }
        else { g.fillStyle = a ? '#ff8a5c' : b ? '#5aa2ff' : '#9aa3b2'; g.fillRect(x + 3, yy - 14, 6, hh); }
      }
      g.fillStyle = '#fff'; fitText(g, `${p.symbol} ${p.qty}`, ix, yy, iw * 0.5, 18, '700', 'monospace');
      g.textAlign = 'right'; g.fillStyle = p.unrealized >= 0 ? '#8ff5bd' : '#ff9aa6'; fitText(g, `${p.unrealized >= 0 ? '+' : '−'}${Math.abs(Math.round(p.unrealized / 100)).toLocaleString()}`, x + CW - pad, yy, iw * 0.48, 18, '700', 'monospace'); g.textAlign = 'left';
    });
  }
  g.restore();
  return true;
}

let atlasCanvas = null;
function paintAtlas() {
  const g = atlasCanvas.getContext('2d');
  g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < TCELLS; k++) {
    const x = (k % COLS) * CW, y = Math.floor(k / COLS) * CHH;
    if (!(live && drawLiveCell(g, k, x, y))) drawCell(g, k, x, y);
  }
}
/** Feed real data to every trading-floor screen (redrawn at most when data changes, never per frame). */
export function setTradingData(data) {
  live = { ...(live || {}), ...data };
  if (!atlas) return;
  paintAtlas();
  atlas.needsUpdate = true;
}

export function tradingAtlas() {
  if (atlas) return atlas;
  atlasCanvas = document.createElement('canvas'); atlasCanvas.width = W; atlasCanvas.height = H;
  paintAtlas();
  atlas = new THREE.CanvasTexture(atlasCanvas); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; // mips rebuilt only when data changes
  return atlas;
}

// Instanced screens sampling the atlas. items: { x, y (world), z, yaw, w, h, cell, tilt }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
let MAT = null;
function material() {
  if (MAT) return MAT;
  MAT = new THREE.MeshBasicMaterial({ map: tradingAtlas(), toneMapped: false });
  const su = CW / W, sv = CHH / H;
  MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${su.toFixed(6)}, ${sv.toFixed(6)}) + cellOffset;\n#endif`);
  };
  MAT.customProgramCacheKey = () => 'tradingAtlas';
  return MAT;
}
export function buildTradingScreens(items) {
  const su = CW / W, sv = CHH / H;
  return chunked(items, 30, (list) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const offs = new Float32Array(list.length * 2);
    list.forEach((s, i) => { offs[i * 2] = (s.cell % COLS) * su; offs[i * 2 + 1] = 1 - (Math.floor(s.cell / COLS) + 1) * sv; });
    geo.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(offs, 2));
    const mesh = new THREE.InstancedMesh(geo, material(), list.length);
    list.forEach((s, i) => {
      if (s.tilt) _q.setFromEuler(_e.set(-s.tilt, s.yaw, 0)); else _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      mesh.setMatrixAt(i, _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    return mesh;
  });
}
