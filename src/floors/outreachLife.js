import * as THREE from 'three';
import { peopleInstanced, LM } from '../world/lux.js';
import { SKIN, HAIR } from './outreachDesks.js';

// ================================================================= OT-03 — the floor's life (step 3, 2026-11-12)
//  · the live world map on the light-well wall: dot-matrix continents, call arcs from HQ, live counters
//  · LED ribbon screens on the step faces: scrolling outreach stats, flashing on every onboarded client
//  · operators on calls (a handset raised to the ear), reshuffled every few seconds
//  · "client onboarded" moments: a row of operators stands up behind their desks, cheering
//  · an accompanied offboarding: two guards walk an underperformer (with a box) out to the freight lift
//  · arrivals queues, the reception's staff, guards and waiting partners
// Every figure is notional. Plain names in comments only: the scam call centre.

const F = -15, CEIL = 9.75;
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { c, g: c.getContext('2d'), t };
}

// ---------------------------------------------------------------- world map
// rough continent outlines [lon, lat] (equirectangular); drawn as a dot matrix so the outline stays soft
const LAND = [
  [[-168, 65], [-140, 70], [-110, 73], [-80, 73], [-62, 60], [-55, 50], [-66, 44], [-75, 35], [-80, 26], [-90, 29], [-97, 26], [-97, 19], [-88, 15], [-83, 9], [-78, 8], [-88, 13], [-96, 16], [-106, 22], [-112, 30], [-118, 33], [-124, 40], [-125, 48], [-134, 57], [-150, 60], [-165, 61]],
  [[-52, 60], [-22, 70], [-18, 81], [-60, 83], [-72, 77], [-56, 67]], // Greenland
  [[-80, 11], [-60, 11], [-50, 0], [-35, -6], [-40, -22], [-56, -35], [-66, -55], [-75, -50], [-71, -18], [-81, -5]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [1, 51], [8, 54], [11, 57], [5, 61], [15, 69], [28, 71], [41, 67], [45, 55], [40, 46], [29, 41], [23, 37], [16, 40], [12, 44], [8, 44], [3, 43], [-2, 37]],
  [[-17, 15], [-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 24], [43, 12], [51, 12], [41, -2], [40, -15], [33, -26], [20, -35], [15, -28], [12, -15], [9, -1], [5, 5], [-8, 4], [-15, 10]],
  [[29, 41], [40, 46], [45, 55], [41, 67], [60, 70], [80, 73], [105, 78], [140, 72], [170, 68], [178, 65], [160, 58], [140, 50], [131, 43], [122, 40], [122, 30], [110, 20], [108, 11], [100, 13], [102, 2], [97, 16], [91, 22], [80, 15], [77, 8], [72, 21], [62, 25], [57, 25], [52, 27], [48, 30], [44, 38], [36, 36], [30, 37]],
  [[35, 30], [43, 13], [52, 15], [59, 22], [52, 25], [48, 30]], // Arabia
  [[95, 5], [105, -6], [115, -8], [126, -9], [141, -8], [131, -2], [119, 4], [110, -2], [100, 0]], // Indonesia
  [[114, -22], [122, -18], [132, -12], [142, -11], [146, -19], [153, -27], [150, -37], [140, -38], [132, -32], [115, -35]],
  [[130, 31], [135, 34], [141, 39], [142, 45], [139, 41], [133, 35]], [[-5, 50], [2, 52], [-2, 57], [-5, 58], [-6, 55]],
  [[43, -12], [50, -15], [48, -25], [44, -23]], [[167, -45], [175, -37], [178, -40], [171, -46]],
];
const HQ = [100.5, 13.75];
const CITIES = [['NEW YORK', -74, 40.7], ['LOS ANGELES', -118, 34], ['TORONTO', -79.4, 43.7], ['CHICAGO', -87.6, 41.9], ['HOUSTON', -95.4, 29.8], ['MEXICO CITY', -99.1, 19.4], ['SÃO PAULO', -46.6, -23.5],
  ['LONDON', -0.1, 51.5], ['PARIS', 2.3, 48.8], ['BERLIN', 13.4, 52.5], ['MADRID', -3.7, 40.4], ['MOSCOW', 37.6, 55.7], ['DUBAI', 55.3, 25.2], ['JOHANNESBURG', 28, -26.2],
  ['MUMBAI', 72.8, 19], ['SINGAPORE', 103.8, 1.3], ['HONG KONG', 114.2, 22.3], ['SEOUL', 127, 37.6], ['TOKYO', 139.7, 35.7], ['SYDNEY', 151.2, -33.9], ['MELBOURNE', 145, -37.8]];
function worldMap(ctx) {
  const W = 1536, H = 558, MX0 = 250, MX1 = W - 250, MY0 = 70, MY1 = H - 60; // map area inside the side panels
  const proj = (lon, lat) => [MX0 + ((lon + 180) / 360) * (MX1 - MX0), MY0 + ((84 - lat) / 140) * (MY1 - MY0)]; // lat 84..-56
  // base layer (drawn once): dot-matrix continents, graticule
  const base = document.createElement('canvas'); base.width = W; base.height = H; const b = base.getContext('2d');
  const grd = b.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#04101c'); grd.addColorStop(1, '#020812'); b.fillStyle = grd; b.fillRect(0, 0, W, H);
  b.strokeStyle = 'rgba(63,169,255,0.10)'; b.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) { const [x] = proj(lon, 0); b.beginPath(); b.moveTo(x, MY0); b.lineTo(x, MY1); b.stroke(); }
  for (let lat = -40; lat <= 80; lat += 20) { const [, y] = proj(0, lat); b.beginPath(); b.moveTo(MX0, y); b.lineTo(MX1, y); b.stroke(); }
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H; const m = mask.getContext('2d');
  m.fillStyle = '#fff'; for (const poly of LAND) { m.beginPath(); poly.forEach(([lo, la], i) => { const [x, y] = proj(lo, la); i ? m.lineTo(x, y) : m.moveTo(x, y); }); m.closePath(); m.fill(); }
  const px = m.getImageData(0, 0, W, H).data;
  for (let y = MY0; y < MY1; y += 7) for (let x = MX0; x < MX1; x += 7) if (px[(y * W + x) * 4] > 128) { b.fillStyle = `rgba(90,180,255,${0.55 + ((x * 13 + y * 7) % 10) / 30})`; b.beginPath(); b.arc(x, y, 2.1, 0, Math.PI * 2); b.fill(); }
  // side panels
  b.fillStyle = 'rgba(8,20,36,0.9)'; b.fillRect(0, 0, MX0 - 20, H); b.fillRect(MX1 + 20, 0, W - MX1 - 20, H);
  b.fillStyle = '#3fa9ff'; b.fillRect(MX0 - 22, 0, 3, H); b.fillRect(MX1 + 19, 0, 3, H);
  b.font = '300 34px "Segoe UI", sans-serif'; b.fillStyle = '#e8eef4'; b.textAlign = 'center'; b.fillText('GLOBAL CLIENT OUTREACH · LIVE', W / 2, 44);
  b.font = '400 15px "Segoe UI", sans-serif'; b.fillStyle = 'rgba(200,220,240,0.6)'; b.fillText('All figures notional', W / 2, H - 22);
  const { c, g, t } = canvasTex(W, H);
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(63.2, 22.95), mat);
  plane.position.set(-107.17, ctx.e + (F + 0.6 + CEIL - 1.2) / 2, 0); plane.rotation.y = Math.PI / 2; // just proud of the chamfered frame (its face is at X -107.2)
  ctx.add(plane, plane.geometry, mat, t);
  // live state
  const r = rng(5), hq = proj(...HQ);
  const city = CITIES.map(([n, lo, la]) => ({ n, p: proj(lo, la), count: 20 + Math.floor(r() * 120), pulse: 0 }));
  const arcs = [];
  const stat = { onboarded: 1284, liquidity: 48.2e6, convos: 3912 };
  const SECT = [['REGULATORY & BANKING', 0.71], ['RELATIONSHIP DEV.', 0.86], ['REMOTE DEVICE ASSIST.', 0.64]];
  const fmt = (v) => Math.round(v).toLocaleString('en-US');
  function draw(time) {
    g.drawImage(base, 0, 0);
    // arcs: HQ -> city, a bright head travelling along a soft trail
    g.lineCap = 'round';
    for (const a of arcs) {
      const [x0, y0] = hq, [x1, y1] = a.c.p, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 40 - Math.abs(x1 - x0) * 0.18;
      const at = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1];
      g.strokeStyle = 'rgba(255,176,96,0.25)'; g.lineWidth = 1.5; g.beginPath();
      for (let k = 0; k <= 30; k++) { const [x, y] = at((k / 30) * Math.min(1, a.u)); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      const [hx, hy] = at(Math.min(1, a.u)); g.fillStyle = '#ffd9a8'; g.beginPath(); g.arc(hx, hy, 3.2, 0, Math.PI * 2); g.fill();
    }
    // cities + pulses
    g.textAlign = 'left'; g.font = '600 11px "Segoe UI", sans-serif';
    for (const ct of city) {
      const [x, y] = ct.p; const pr = ct.pulse;
      if (pr > 0) { g.strokeStyle = `rgba(255,190,110,${pr})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5 + (1 - pr) * 22, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = pr > 0 ? '#ffd9a8' : '#9fd8ff'; g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(220,235,250,0.85)'; g.fillText(`${ct.n} ${ct.count}`, x + 6, y - 5);
    }
    g.fillStyle = '#ffb060'; g.beginPath(); g.arc(hq[0], hq[1], 6 + Math.sin(time * 4) * 1.5, 0, Math.PI * 2); g.fill();
    g.font = '700 13px "Segoe UI", sans-serif'; g.fillText('HQ', hq[0] + 9, hq[1] + 4);
    // left panel: live counters + sector progress
    g.textAlign = 'left';
    const rows = [['CLIENTS ONBOARDED TODAY', fmt(stat.onboarded)], ['LIQUIDITY RECEIVED', fmt(stat.liquidity)], ['ACTIVE CONVERSATIONS', fmt(stat.convos)]];
    rows.forEach(([k, v], i) => { const y = 120 + i * 92; g.font = '500 14px "Segoe UI", sans-serif'; g.fillStyle = 'rgba(180,210,240,0.8)'; g.fillText(k, 20, y); g.font = '300 38px "Segoe UI", sans-serif'; g.fillStyle = '#ffffff'; g.fillText(v, 20, y + 42); });
    SECT.forEach(([n, p], i) => { const y = 410 + i * 42; g.font = '500 12px "Segoe UI", sans-serif'; g.fillStyle = 'rgba(180,210,240,0.8)'; g.fillText(`${n}  ${Math.round(p * 100)}% OF TARGET`, 20, y); g.fillStyle = '#122a44'; g.fillRect(20, y + 8, 190, 10); g.fillStyle = '#3fa9ff'; g.fillRect(20, y + 8, 190 * Math.min(1, p), 10); });
    // right panel: top regions
    const top = [...city].sort((p, q) => q.count - p.count).slice(0, 9);
    g.font = '500 14px "Segoe UI", sans-serif'; g.fillStyle = 'rgba(180,210,240,0.8)'; g.fillText('TOP REGIONS · TODAY', MX1 + 40, 110);
    top.forEach((ct, i) => { const y = 148 + i * 40; g.font = '400 17px "Segoe UI", sans-serif'; g.fillStyle = '#e8eef4'; g.fillText(ct.n, MX1 + 40, y); g.textAlign = 'right'; g.fillStyle = '#ffb060'; g.fillText(String(ct.count), W - 24, y); g.textAlign = 'left'; });
    t.needsUpdate = true;
  }
  let acc = 0, spawn = 0, time = 0;
  return {
    onboard(n = 1) { stat.onboarded += n; stat.liquidity += 2500 + r() * 60000; },
    update(dt) {
      time += dt; acc += dt; spawn -= dt;
      if (spawn <= 0) { spawn = 0.25 + r() * 0.5; arcs.push({ c: city[Math.floor(r() * city.length)], u: 0, v: 0.35 + r() * 0.35 }); stat.convos += Math.round((r() - 0.45) * 6); }
      for (const a of arcs) { a.u += dt * a.v; if (a.u >= 1 && !a.done) { a.done = true; a.c.pulse = 1; a.c.count += 1; if (r() < 0.3) this.onboard(1); } }
      for (let i = arcs.length - 1; i >= 0; i--) if (arcs[i].u > 1.6) arcs.splice(i, 1);
      for (const ct of city) ct.pulse = Math.max(0, ct.pulse - dt * 0.8);
      if (acc >= 1 / 6) { acc = 0; draw(time); }
    },
    draw,
  };
}

// ---------------------------------------------------------------- ribbon screens on the step faces
function ribbons(ctx) {
  const W = 2048, H = 96;
  const { g, t } = canvasTex(W, H);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  for (const [x, y0, y1] of [[-74, 1.1, 3.2], [-88, -0.5, 0.8]]) {
    const h = y1 - y0 - 0.3, pl = new THREE.Mesh(new THREE.PlaneGeometry(77.6, h), mat);
    pl.position.set(x + 0.03, ctx.e + (y0 + y1) / 2, 0); pl.rotation.y = Math.PI / 2; ctx.add(pl, pl.geometry);
  }
  ctx.disposables.push(mat, t);
  const msgs = ['RELATIONSHIP DEVELOPMENT  ▲ 412 ONBOARDED TODAY', 'REGULATORY & BANKING LIAISON  ▲ 287 VERIFICATIONS', 'REMOTE DEVICE ASSISTANCE  ▲ 1,904 DEVICES SECURED', 'AVERAGE LIQUIDITY EVENT  3,850', 'TOP CLOSER  ASSOCIATE #4471  ★★★', 'EVERY "NO" IS A "NOT YET"'];
  let flash = 0, flashMsg = '';
  const draw = () => {
    g.fillStyle = flash > 0 ? '#2a1606' : '#020812'; g.fillRect(0, 0, W, H);
    g.font = '600 46px "Segoe UI", sans-serif'; g.textBaseline = 'middle';
    if (flash > 0) { g.fillStyle = '#ffb060'; g.textAlign = 'center'; let fs = 46; do { g.font = `600 ${fs}px "Segoe UI", sans-serif`; fs -= 2; } while (g.measureText(flashMsg).width > W * 0.92 && fs > 16); g.fillText(flashMsg, W / 2, H / 2); } // one copy per repeat, sized to fit
    else { g.textAlign = 'left'; let x = 30; msgs.forEach((ms, i) => { g.fillStyle = i % 2 ? '#9fd8ff' : '#ffffff'; g.fillText(ms, x, H / 2); x += g.measureText(ms).width + 60; g.fillStyle = '#3fa9ff'; g.fillRect(x - 36, H / 2 - 4, 8, 8); }); }
    t.needsUpdate = true;
  };
  draw();
  return {
    flash(text) { flash = 3.5; flashMsg = text; draw(); },
    update(dt) { t.offset.x = (t.offset.x + dt * 0.012) % 1; if (flash > 0) { flash -= dt; if (flash <= 0) draw(); } },
  };
}

// ---------------------------------------------------------------- operators on calls: a handset raised to the ear
function onCalls(ctx, seats) {
  const live = seats.filter((s) => !s.empty && s.sector !== 'sup');
  const share = { police: 0.38, tech: 0.28, romance: 0.12 };
  const armGeo = new THREE.BoxGeometry(0.09, 0.36, 0.1).translate(0, 0.18, 0), phoneGeo = new THREE.BoxGeometry(0.03, 0.15, 0.075);
  const arm = new THREE.InstancedMesh(armGeo, LM.people, live.length), ph = new THREE.InstancedMesh(phoneGeo, new THREE.MeshBasicMaterial({ color: 0xcfe8ff, toneMapped: false }), live.length);
  arm.frustumCulled = ph.frustumCulled = false;
  const c = new THREE.Color(); live.forEach((s, i) => arm.setColorAt(i, c.set(SKIN[i % SKIN.length])));
  ctx.add(arm, armGeo); ctx.add(ph, phoneGeo, ph.material);
  const r = rng(31), on = live.map((s) => r() < (share[s.sector] || 0));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const place = (i) => {
    const s = live[i], d = s.dir, sideZ = -d * 0.25; // the operator's right hand side
    if (!on[i]) { m4.compose(p.set(s.x, ctx.e + s.y, s.z), q.identity(), zero); arm.setMatrixAt(i, m4); ph.setMatrixAt(i, m4); return; }
    // forearm from the shoulder up to the ear (seated shoulder ~1.1 m, ear ~1.28 m)
    q.setFromEuler(e.set(d * 0.5, 0, 0.0)); m4.compose(p.set(s.x + d * 0.04, ctx.e + s.y + 0.98, s.z + sideZ), q, one); arm.setMatrixAt(i, m4);
    q.identity(); m4.compose(p.set(s.x + d * 0.03, ctx.e + s.y + 1.3, s.z + sideZ * 0.6), q, one); ph.setMatrixAt(i, m4);
  };
  live.forEach((_, i) => place(i));
  arm.instanceMatrix.needsUpdate = ph.instanceMatrix.needsUpdate = true;
  if (arm.instanceColor) arm.instanceColor.needsUpdate = true;
  let acc = 0;
  return {
    update(dt) {
      acc += dt; if (acc < 0.4) return; acc = 0;
      for (let k = 0; k < 6; k++) { const i = Math.floor(r() * live.length); on[i] = r() < (share[live[i].sector] || 0) * 1.1; place(i); }
      arm.instanceMatrix.needsUpdate = ph.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- "client onboarded": a row stands and cheers
function celebrations(ctx, seats, onEvent) {
  const N = 8, P = peopleInstanced(ctx, N), r = rng(77);
  for (let i = 0; i < N; i++) P.color(i, [0x1f2f5a, 0x2b2f38, 0x3a3f47, 0x5a3a2a][i % 4], SKIN[i % 6], HAIR[i % 6]);
  const rows = new Map(); // seats grouped by row (same hall, same x)
  for (const s of seats) if (s.sector !== 'sup' && !s.empty) { const k = `${s.sector}:${s.x.toFixed(2)}`; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(s); }
  const keys = [...rows.keys()];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), up = new THREE.Vector3(0, 1, 0);
  let active = null, wait = 6, t = 0;
  const hide = () => { for (let i = 0; i < N; i++) P.set(i, m4.compose(p.set(0, ctx.e, 0), q.identity(), zero)); P.commit(); };
  hide();
  return {
    update(dt) {
      t += dt;
      if (!active) {
        wait -= dt; if (wait > 0) return;
        const row = rows.get(keys[Math.floor(r() * keys.length)]).sort((a, b) => a.z - b.z), st = Math.floor(r() * Math.max(1, row.length - N));
        active = { list: row.slice(st, st + N), t: 0 };
        onEvent(active.list[0]);
      }
      active.t += dt;
      active.list.forEach((s, i) => {
        const bob = Math.abs(Math.sin(active.t * 7 + i * 1.3)) * 0.12, x = s.x - s.dir * 0.72; // standing in the aisle behind the chair
        q.setFromAxisAngle(up, (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(active.t * 3 + i) * 0.5);
        P.set(i, m4.compose(p.set(x, ctx.e + s.y + 0.85 + bob, s.z), q, one));
      });
      P.commit();
      if (active.t > 4.5) { active = null; wait = 14 + r() * 16; hide(); }
    },
  };
}

// ---------------------------------------------------------------- accompanied offboarding: guards walk an associate out
// from the tech-support hall, up the north side stairs, across terrace 1, up the grand stair, through
// the secure door and the reception, through an immigration lane, to the freight lift
const ROUTE = [[-66, -15, -24], [-87.5, -15, -24], [-89.6, -15, -30], [-95.6, -15, -36.5], [-88.2, -10, -36.5], [-81.2, -10, -36.5], [-74.2, -5, -36.5],
  [-68.6, -5, -35.5], [-68.6, -5, -3], [-72.6, -5, -1], [-65.0, 0, -1], [-58.0, 0, -1], [-51.5, 0, -1], [-47.0, 0, 21], [-41.0, 0, 21], [-36.2, 0, 23.4]];
function offboarding(ctx) {
  const P = peopleInstanced(ctx, 3);
  P.color(0, 0x111418, SKIN[2], 0x111111); P.color(1, 0x2b2f38, SKIN[0], HAIR[2]); P.color(2, 0x111418, SKIN[4], 0x111111);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4), new THREE.MeshStandardMaterial({ color: 0xa07a4a, roughness: 0.8 }));
  ctx.add(box, box.geometry, box.material);
  const seg = ROUTE.slice(1).map((b, i) => { const a = ROUTE[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) }; });
  const LEN = seg.reduce((s, x) => s + x.len, 0);
  const at = (d) => { d = Math.max(0, Math.min(LEN, d)); for (const s of seg) { if (d <= s.len) { const u = d / s.len; return { x: s.a[0] + (s.b[0] - s.a[0]) * u, y: s.a[1] + (s.b[1] - s.a[1]) * u, z: s.a[2] + (s.b[2] - s.a[2]) * u, yaw: Math.atan2(s.b[0] - s.a[0], s.b[2] - s.a[2]) }; } d -= s.len; } const l = ROUTE[ROUTE.length - 1]; return { x: l[0], y: l[1], z: l[2], yaw: 0 }; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), up = new THREE.Vector3(0, 1, 0);
  ctx.doorUsers = ctx.doorUsers || [];
  let d = 0, pause = 8;
  return {
    update(dt) {
      if (pause > 0) { pause -= dt; ctx.doorUsers.length = 0; for (let i = 0; i < 3; i++) P.set(i, m4.compose(p.set(0, ctx.e, 0), q.identity(), zero)); box.visible = false; P.commit(); if (pause <= 0) d = 0; return; }
      d += dt * 1.15;
      ctx.doorUsers.length = 0;
      [1.4, 0, -1.4].forEach((off, i) => { // guard in front, the associate, guard behind
        const s = at(d + off), bob = Math.abs(Math.sin((d + off) * 3.2)) * 0.03;
        q.setFromAxisAngle(up, s.yaw); P.set(i, m4.compose(p.set(s.x, ctx.e + s.y + 0.85 + bob, s.z), q, one));
        ctx.doorUsers.push(s);
        if (i === 1) { box.visible = true; box.position.set(s.x + Math.sin(s.yaw) * 0.38, ctx.e + s.y + 1.05 + bob, s.z + Math.cos(s.yaw) * 0.38); box.rotation.y = s.yaw; }
      });
      P.commit();
      if (d - 1.4 > LEN) pause = 60 + Math.random() * 40;
    },
  };
}

// ---------------------------------------------------------------- static people (before L.build): queues, reception, guards
export function lifeStatic(ctx, L) {
  const r = rng(13), pick = (a) => a[Math.floor(r() * a.length)];
  const person = (x, z, o = {}) => L.person(x, z, { skin: pick(SKIN), hair: pick(HAIR), ...o });
  // arrivals: people queueing in the serpentine lanes, facing the booths (west); some at the booth windows
  for (const [za, zb] of [[-31, -8], [8, 31]]) for (const x of [-40.85, -39.55, -38.25]) for (let z = za; z <= zb; z += 0.9) if (r() < 0.45) person(x + (r() - 0.5) * 0.2, z, { yaw: -Math.PI / 2 + (r() - 0.5) * 0.6, suit: pick([0x2b2f38, 0x3a3f47, 0x6a6e76, 0x1f2f5a, 0x5a3a2a, 0x8a6d3b]), fidget: 0.3 });
  for (let z = -31; z <= 31.01; z += 4) if (Math.abs(z) > 6 && r() < 0.7) person(-42.4, z, { yaw: -Math.PI / 2, suit: pick([0x2b2f38, 0x3a3f47, 0x8a6d3b]) });
  for (const z of [-5, -1, 3]) person(-43.6, z + 1, { yaw: -Math.PI / 2, suit: 0x1f2a44, walk: [[-38, z + 1], [-50.5, z + 1], [-50.5, z + 1.2], [-38, z + 1.2]], speed: 1.0 }); // through the e-gates
  for (const z of [-7.2, 7.2]) person(-48.6, z, { yaw: Math.PI / 2, suit: 0x111418 }); // guards at the portal
  // reception: two receptionists, guards at the secure door, partners waiting in the lounges
  for (const z of [-9.5, -6.5]) person(-56.0, z, { yaw: Math.PI / 2, suit: 0xf0f0f0 });
  for (const z of [-4.8, 4.8]) person(-58.4, z, { yaw: Math.PI / 2, suit: 0x111418 });
  for (const zc of [-19, 19]) for (let i = 0; i < 3; i++) if (r() < 0.7) person(-56.8 + i * 1.4, zc, { yaw: zc > 0 ? Math.PI : 0, sit: true, suit: pick([0x8a6d3b, 0x5a3a2a, 0x2b2f38]) });
  person(-53.5, 2, { yaw: Math.PI / 2, suit: 0x8a6d3b, walk: [[-52, 2], [-57.5, 1.5], [-57.5, -1.5], [-52, -2]], speed: 0.9 }); // a partner being shown round
}

// ---------------------------------------------------------------- the reception's marketing screen
function marketing(ctx) {
  const { g, t } = canvasTex(1024, 512);
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  for (const z of [-24.68, 24.68]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), mat);
    pl.position.set(-55.25, ctx.e + 2.3, z); pl.rotation.y = z < 0 ? 0 : Math.PI; ctx.add(pl, pl.geometry);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 3.4, 0.1), LM.gunDarkO); frame.position.set(-55.25, ctx.e + 2.3, z + (z < 0 ? -0.06 : 0.06)); ctx.add(frame, frame.geometry);
  }
  ctx.disposables.push(mat, t);
  const pts = []; let v = 100;
  for (let i = 0; i < 90; i++) { v *= 1 + 0.012 + (Math.sin(i * 1.7) * 0.01); pts.push(v); }
  return {
    update(dt, time) {
      const k = Math.floor(time * 2);
      g.fillStyle = '#04101c'; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#e8eef4'; g.font = '300 52px "Segoe UI", sans-serif'; g.fillText('Your partner in global yield', 60, 100);
      g.font = '400 26px "Segoe UI", sans-serif'; g.fillStyle = '#9fd8ff'; g.fillText('Personal relationship managers · 24/7 · every time zone', 60, 150);
      const n = 30 + (k % 60), mx = pts[n - 1];
      g.strokeStyle = '#ffb060'; g.lineWidth = 5; g.beginPath();
      for (let i = 0; i < n; i++) { const x = 60 + (i / 89) * 900, y = 450 - (pts[i] / pts[89]) * 240; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.fillStyle = '#ffffff'; g.font = '600 44px "Segoe UI", sans-serif'; g.fillText(`+${Math.round((mx / 100 - 1) * 100)}%`, 820, 230);
      g.font = '400 18px "Segoe UI", sans-serif'; g.fillStyle = 'rgba(200,220,240,0.6)'; g.fillText('Illustrative. All balances are notional.', 60, 495);
      t.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- animated life (after L.build)
export function life(ctx, seats) {
  const map = worldMap(ctx), rib = ribbons(ctx), calls = onCalls(ctx, seats), mk = marketing(ctx);
  const SECT = { police: 'REGULATORY & BANKING LIAISON', romance: 'RELATIONSHIP DEVELOPMENT', tech: 'REMOTE DEVICE ASSISTANCE' };
  const cheer = celebrations(ctx, seats, (s) => { map.onboard(1); rib.flash(`★  CLIENT ONBOARDED  ·  ${SECT[s.sector] || ''}  ·  +${(2500 + Math.round(Math.random() * 60000)).toLocaleString('en-US')}  ★`); });
  const escort = offboarding(ctx);
  map.draw(0);
  let time = 0, mAcc = 0;
  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    time += dt; mAcc += dt;
    map.update(dt); rib.update(dt); calls.update(dt); cheer.update(dt); escort.update(dt);
    if (mAcc > 0.5) { mAcc = 0; mk.update(dt, time); }
  });
}
