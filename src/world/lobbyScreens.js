import * as THREE from 'three';

// Phase 1 displays: each screen gets its own canvas at the screen's real aspect ratio and a
// resolution that matches its size (no stretched atlas cells). Redrawn a few times a second.
// Data is still simulated until Phase 3 (real delayed US stock prices) — labelled DEMO on screen.

// Dev switch (Perf tests panel): 'live' = normal, 'frozen' = no redraws/uploads, 'hidden' = not drawn at all.
export const SCREEN_CTRL = { mode: 'live', meshes: new Set() };
export function setScreenMode(mode) { SCREEN_CTRL.mode = mode; for (const m of SCREEN_CTRL.meshes) m.visible = mode !== 'hidden'; }

const SYMS = [['SPX', 'S&P 500', 5321], ['NDX', 'NASDAQ 100', 18710], ['DJI', 'DOW JONES', 39120], ['AAPL', 'Apple', 213.4], ['MSFT', 'Microsoft', 441.2], ['NVDA', 'NVIDIA', 124.8],
  ['AMZN', 'Amazon', 186.1], ['GOOGL', 'Alphabet', 176.3], ['META', 'Meta', 502.7], ['JPM', 'JPMorgan', 199.4], ['GS', 'Goldman Sachs', 468.9], ['TSLA', 'Tesla', 182.5],
  ['XOM', 'Exxon', 113.2], ['BRK.B', 'Berkshire', 410.6], ['V', 'Visa', 274.0], ['WMT', 'Walmart', 66.9]];
const quotes = SYMS.map(([sym, name, p]) => ({ sym, name, open: p, p, hist: Array.from({ length: 48 }, () => p) }));
const pnl = { v: 1_842_000, hist: Array.from({ length: 160 }, (_, i) => 1_600_000 + i * 1500 + Math.sin(i / 7) * 40000) };
let lastTick = 0;
function tickData(now) {
  if (now - lastTick < 450) return;
  lastTick = now;
  for (const q of quotes) { q.p *= 1 + (Math.random() - 0.495) * 0.0016; q.hist.push(q.p); q.hist.shift(); }
  pnl.v += (Math.random() - 0.46) * 22000; pnl.hist.push(pnl.v); pnl.hist.shift();
}
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const UP = '#3ddc84', DN = '#ff5468', GOLD = '#e3c27a', INK = '#0b0e14';

function spark(g, x, y, w, h, arr, col) {
  const lo = Math.min(...arr), hi = Math.max(...arr), r = hi - lo || 1;
  g.strokeStyle = col; g.lineWidth = Math.max(1.5, h / 20); g.beginPath();
  arr.forEach((v, i) => { const px = x + (i / (arr.length - 1)) * w, py = y + h - ((v - lo) / r) * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.stroke();
}

// Upload scheduler: copying a canvas to the GPU can stall the frame, so displays that are due for a
// redraw wait in a queue and at most ONE is redrawn + uploaded per frame (drained by the first
// display's updater each frame). Spreads the cost so no single frame takes several uploads.
const QUEUE = [];
let drainedAt = -1, frameNo = 0;
function drain() {
  if (drainedAt === frameNo) return;
  drainedAt = frameNo;
  const job = QUEUE.shift();
  if (job) { job.queued = false; tickData(performance.now()); job.redraw(); }
}

// A display surface: plane + canvas texture + redraw callback (throttled, queued).
function display(ctx, x, y, z, yaw, w, h, pxPerM, draw, hz = 3) {
  const c = document.createElement('canvas');
  c.width = Math.min(2048, Math.round(w * pxPerM)); c.height = Math.min(2048, Math.round(h * pxPerM));
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; // no mip rebuild on every upload (stutter)
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, ctx.e + y, z); mesh.rotation.y = yaw;
  ctx.add(mesh, mesh.geometry, mat, tex);
  SCREEN_CTRL.meshes.add(mesh); mesh.visible = SCREEN_CTRL.mode !== 'hidden';
  let acc = Math.random() / hz; // random phase so displays don't fall due together
  const job = { queued: false, paused: false, redraw: () => { if (draw(g, c.width, c.height, performance.now()) !== false) tex.needsUpdate = true; } }; // draw() returns false = nothing changed, no upload
  job.redraw();
  ctx.onUpdate((dt) => {
    frameNo++;
    if (!ctx.group.visible || SCREEN_CTRL.mode !== 'live' || job.paused) { drain(); return; }
    acc += dt;
    if (acc >= 1 / hz && !job.queued) { acc = 0; job.queued = true; QUEUE.push(job); }
    drain();
  });
  mesh.userData.job = job;
  return mesh;
}

// Scrolling price band: drawn once every few seconds into a long strip, scrolled by UV offset each
// frame (no per-frame canvas work or texture upload). Sits 1 cm in front of its screen.
function crawlStrip(ctx, x, y, z, yaw, w, h, speed) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  tex.repeat.x = Math.max(1, (w / h) * 64 / 2048);
  const draw = () => {
    g.fillStyle = '#05070b'; g.fillRect(0, 0, 2048, 64); g.fillStyle = GOLD; g.fillRect(0, 0, 2048, 2);
    g.font = '600 34px monospace'; g.textBaseline = 'middle';
    let px = 10;
    for (const q of quotes) {
      const ch = (q.p / q.open - 1) * 100, t = `${q.sym} ${fmt(q.p)} ${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(2)}%`;
      const tw = g.measureText(t).width + 54;
      if (px + tw > 2040) break;
      g.fillStyle = ch >= 0 ? UP : DN; g.fillText(t, px, 34); px += tw;
    }
    tex.needsUpdate = true;
  };
  draw();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x + Math.sin(yaw) * 0.01, ctx.e + y, z + Math.cos(yaw) * 0.01); mesh.rotation.y = yaw;
  ctx.add(mesh, mesh.geometry, mat, tex);
  SCREEN_CTRL.meshes.add(mesh); mesh.visible = SCREEN_CTRL.mode !== 'hidden';
  let acc = 0;
  ctx.onUpdate((dt) => { if (!ctx.group.visible || SCREEN_CTRL.mode !== 'live') return; tex.offset.x = (tex.offset.x + dt * speed) % 1; acc += dt; if (acc > 3) { acc = 0; draw(); } });
}

// Market board for the lift-lobby walls: header, two columns of quotes with sparklines, crawl.
export function marketBoard(ctx, x, y, z, yaw, w, h, title = 'MARKETS') {
  crawlStrip(ctx, x, y - h / 2 + (h * 0.16 * 1.05) / 2, z, yaw, w, h * 0.16 * 1.05, 0.06);
  return display(ctx, x, y, z, yaw, w, h, 110, (g, W, Ht) => {
    g.fillStyle = INK; g.fillRect(0, 0, W, Ht);
    const head = Ht * 0.16;
    g.fillStyle = '#141924'; g.fillRect(0, 0, W, head);
    g.fillStyle = GOLD; g.font = `600 ${head * 0.52}px Georgia, serif`; g.textBaseline = 'middle';
    g.fillText(`{FIRM NAME} · ${title}`, W * 0.015, head / 2);
    g.fillStyle = '#8b93a5'; g.font = `${head * 0.34}px sans-serif`; g.textAlign = 'right';
    g.fillText('15-MIN DELAYED · DEMO DATA', W * 0.985, head / 2); g.textAlign = 'left';
    const rows = 5, cols = 3, rowH = (Ht - head * 2.1) / rows, colW = W / cols;
    for (let i = 0; i < rows * cols; i++) {
      const q = quotes[i % quotes.length], cx = Math.floor(i / rows) * colW, cy = head + 6 + (i % rows) * rowH;
      const ch = (q.p / q.open - 1) * 100, col = ch >= 0 ? UP : DN;
      g.fillStyle = i % 2 ? '#0f131c' : '#121722'; g.fillRect(cx + 4, cy + 2, colW - 8, rowH - 4);
      g.fillStyle = '#ffffff'; g.font = `700 ${rowH * 0.42}px sans-serif`; g.fillText(q.sym, cx + colW * 0.04, cy + rowH * 0.5);
      g.fillStyle = '#e8ecf3'; g.font = `500 ${rowH * 0.38}px monospace`; g.textAlign = 'right';
      g.fillText(fmt(q.p), cx + colW * 0.56, cy + rowH * 0.5);
      g.fillStyle = col; g.fillText(`${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%`, cx + colW * 0.79, cy + rowH * 0.5); g.textAlign = 'left';
      spark(g, cx + colW * 0.81, cy + rowH * 0.18, colW * 0.16, rowH * 0.64, q.hist, col);
    }
    g.fillStyle = '#05070b'; g.fillRect(0, Ht - head * 1.05, W, head * 1.05); // band area (the crawl strip sits on top)
  }, 0.5);
}

// The giant lobby screen (16:9): firm P&L chart, index tiles, market crawl, clock.
// The big screen can play a real video (hardware-decoded; the browser copies frames GPU-to-GPU, far
// cheaper than canvas uploads). The dashboard is the fallback. Call playBigScreenVideo(url) — e.g.
// from the console: __debug.bigScreenVideo('/media/lobby.mp4'). Plays only while the lobby is visible.
const BIG = { mesh: null, canvasMap: null, video: null, url: null };
export function playBigScreenVideo(url) {
  BIG.url = url;
  if (!BIG.mesh) return 'big screen not built yet';
  if (!url) { // back to the dashboard
    if (BIG.video) { BIG.video.pause(); BIG.mesh.material.map.dispose(); BIG.video = null; }
    BIG.mesh.material.map = BIG.canvasMap; BIG.mesh.material.needsUpdate = true; BIG.mesh.userData.job.paused = false;
    return 'dashboard';
  }
  const v = Object.assign(document.createElement('video'), { src: url, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous' });
  v.play().catch(() => {});
  const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; vt.generateMipmaps = false; vt.minFilter = THREE.LinearFilter;
  if (BIG.video) { BIG.video.pause(); if (BIG.mesh.material.map !== BIG.canvasMap) BIG.mesh.material.map.dispose(); }
  BIG.video = v; BIG.mesh.material.map = vt; BIG.mesh.material.needsUpdate = true; BIG.mesh.userData.job.paused = true;
  return 'playing ' + url;
}

export function lobbyDashboard(ctx, x, y, z, yaw, w, h) {
  ctx.onUpdate(() => { if (!BIG.video) return; if (ctx.group.visible && BIG.video.paused) BIG.video.play().catch(() => {}); else if (!ctx.group.visible && !BIG.video.paused) BIG.video.pause(); });
  crawlStrip(ctx, x, y - h / 2 + h * 0.04 + (h * 0.09) / 2, z, yaw, w, h * 0.09, 0.025);
  const dash = display(ctx, x, y, z, yaw, w, h, 1280 / w, (g, W, Ht) => {
    const bg = g.createLinearGradient(0, 0, 0, Ht); bg.addColorStop(0, '#0d1220'); bg.addColorStop(1, '#05070c');
    g.fillStyle = bg; g.fillRect(0, 0, W, Ht);
    g.textBaseline = 'middle';
    g.fillStyle = GOLD; g.font = `600 ${Ht * 0.055}px Georgia, serif`; g.fillText('{FIRM NAME}', W * 0.035, Ht * 0.075);
    g.fillStyle = '#9aa3b5'; g.font = `${Ht * 0.026}px sans-serif`; g.fillText('Excellence. Discretion. Liquidity.  ·  Firm Performance (notional, demo)', W * 0.035, Ht * 0.13);
    const t = new Date(); g.textAlign = 'right'; g.fillStyle = '#e8ecf3'; g.font = `500 ${Ht * 0.05}px monospace`;
    g.fillText(t.toTimeString().slice(0, 5), W * 0.965, Ht * 0.085); g.textAlign = 'left';
    // P&L chart
    const cx = W * 0.035, cy = Ht * 0.2, cw = W * 0.6, chh = Ht * 0.56;
    g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(cx, cy, cw, chh);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(cx, cy + (chh * i) / 5); g.lineTo(cx + cw, cy + (chh * i) / 5); g.stroke(); }
    const lo = Math.min(...pnl.hist) * 0.98, hi = Math.max(...pnl.hist) * 1.01;
    const P = (i, v) => [cx + (i / (pnl.hist.length - 1)) * cw, cy + chh - ((v - lo) / (hi - lo)) * chh];
    const grd = g.createLinearGradient(0, cy, 0, cy + chh); grd.addColorStop(0, 'rgba(61,220,132,0.35)'); grd.addColorStop(1, 'rgba(61,220,132,0)');
    g.beginPath(); pnl.hist.forEach((v, i) => { const [px, py] = P(i, v); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.lineTo(cx + cw, cy + chh); g.lineTo(cx, cy + chh); g.closePath(); g.fillStyle = grd; g.fill();
    g.beginPath(); pnl.hist.forEach((v, i) => { const [px, py] = P(i, v); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.strokeStyle = UP; g.lineWidth = Ht * 0.005; g.stroke();
    g.fillStyle = '#9aa3b5'; g.font = `${Ht * 0.03}px sans-serif`; g.fillText('FIRM P&L TODAY', cx + 14, cy + Ht * 0.035);
    g.fillStyle = pnl.v >= 0 ? UP : DN; g.font = `700 ${Ht * 0.075}px sans-serif`; g.fillText(`${pnl.v >= 0 ? '+' : '−'}$${fmt(Math.abs(pnl.v), 0)}`, cx + 14, cy + Ht * 0.1);
    // index tiles
    const tx = W * 0.665, tw = W * 0.3, th = (chh - 3 * 12) / 4;
    quotes.slice(0, 4).concat([quotes[5]]).slice(0, 4).forEach((q, i) => {
      const ty = cy + i * (th + 12), ch = (q.p / q.open - 1) * 100, col = ch >= 0 ? UP : DN;
      g.fillStyle = '#121828'; g.fillRect(tx, ty, tw, th);
      g.fillStyle = col; g.fillRect(tx, ty, 6, th);
      g.fillStyle = '#c8cfdc'; g.font = `600 ${th * 0.22}px sans-serif`; g.fillText(q.name.toUpperCase(), tx + 24, ty + th * 0.28);
      g.fillStyle = '#ffffff'; g.font = `700 ${th * 0.34}px monospace`; g.fillText(fmt(q.p), tx + 24, ty + th * 0.68);
      g.fillStyle = col; g.font = `600 ${th * 0.24}px monospace`; g.textAlign = 'right'; g.fillText(`${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%`, tx + tw - 18, ty + th * 0.68); g.textAlign = 'left';
      spark(g, tx + tw * 0.55, ty + th * 0.12, tw * 0.4, th * 0.3, q.hist, col);
    });
    // crawl
    const band = Ht * 0.09, by = Ht - band - Ht * 0.04;
    g.fillStyle = '#0a0d14'; g.fillRect(0, by, W, band); g.fillStyle = GOLD; g.fillRect(0, by, W, 3);
    g.fillStyle = '#6b7385'; g.font = `${Ht * 0.022}px sans-serif`; g.fillText('All figures notional · simulated until live delayed prices are connected', W * 0.035, Ht - Ht * 0.02);
  }, 0.25);
  BIG.mesh = dash; BIG.canvasMap = dash.material.map; BIG.video = null;
  if (BIG.url) playBigScreenVideo(BIG.url); // keep playing after the floor is rebuilt
  return dash;
}

// Lift floor indicator above a landing door: car label, current floor, direction arrow.
export function liftIndicator(ctx, x, y, z, yaw, getState) {
  let last = '';
  return display(ctx, x, y, z, yaw, 0.9, 0.32, 300, (g, W, Ht) => {
    const s = getState() || { label: '', floor: '', dir: '' };
    const key = s.label + s.floor + s.dir;
    if (key === last) return false; last = key;
    g.fillStyle = '#07080b'; g.fillRect(0, 0, W, Ht);
    g.fillStyle = '#e8b45a'; g.textBaseline = 'middle';
    g.font = `700 ${Ht * 0.62}px monospace`; g.textAlign = 'center'; g.fillText(s.floor, W * 0.5, Ht * 0.55);
    g.font = `700 ${Ht * 0.55}px sans-serif`; g.fillText(s.dir, W * 0.82, Ht * 0.55);
    g.fillStyle = '#7c6a48'; g.font = `600 ${Ht * 0.26}px sans-serif`; g.textAlign = 'left'; g.fillText(s.label, W * 0.05, Ht * 0.5);
    g.textAlign = 'left';
  }, 4);
}

// Small monitors (reception desk, x-ray operator): simple, legible layouts, fully redrawn each time.
export function miniMonitor(ctx, x, y, z, yaw, w, h, kind) {
  let n = 0;
  return display(ctx, x, y, z, yaw, w, h, 600, (g, W, Ht) => {
    n++;
    if (kind === 'xray') {
      g.fillStyle = '#e9edf2'; g.fillRect(0, 0, W, Ht);
      const off = (n * 9) % (W + 200) - 100;
      g.fillStyle = '#1f6fb5'; g.fillRect(off, Ht * 0.3, W * 0.38, Ht * 0.42); // bag outline
      g.fillStyle = '#e08a2e'; g.fillRect(off + W * 0.06, Ht * 0.38, W * 0.12, Ht * 0.16); g.fillRect(off + W * 0.22, Ht * 0.45, W * 0.1, Ht * 0.2);
      g.fillStyle = '#2b9a4a'; g.fillRect(off + W * 0.05, Ht * 0.6, W * 0.26, Ht * 0.06);
      g.fillStyle = '#20252e'; g.font = `600 ${Ht * 0.11}px sans-serif`; g.textBaseline = 'top'; g.fillText('SCREENING · LANE ' + (x < 0 ? 'A' : 'B'), W * 0.04, Ht * 0.05);
    } else {
      g.fillStyle = '#0d1220'; g.fillRect(0, 0, W, Ht);
      g.fillStyle = GOLD; g.font = `600 ${Ht * 0.12}px Georgia, serif`; g.textBaseline = 'top'; g.fillText('Guest Register', W * 0.05, Ht * 0.05);
      const names = ['Arrival · Level 1 Suite', 'Arrival · Members Mezzanine', 'Courier · Treasury', 'Visitor · Leisure Suite', 'Tour · Executive'];
      g.font = `${Ht * 0.085}px sans-serif`;
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#c8cfdc' : '#e8ecf3'; g.fillText(`${String(9 + i).padStart(2, '0')}:${String((n + i * 7) % 60).padStart(2, '0')}  ${names[(i + Math.floor(n / 8)) % names.length]}`, W * 0.05, Ht * (0.25 + i * 0.14)); }
    }
  }, 1);
}
