import * as THREE from 'three';
import { CH } from '../world/screens.js';
import { Lux, LM, addLuxMaterials, plaque } from '../world/lux.js';
import { kitMaterials } from './luxKit.js';
import { luxLiftHall } from './luxHall.js';
import { FLOOR_BY_ID, findRoom } from '../layout/building.js';
import { QUALITY } from '../quality.js';
import { api } from '../net/api.js';

// ---------------------------------------------------------------- OT-05 Executive Command Centre
// Redesign (user, 2026-11-17): a sealed NORAD-style bunker in black, gold and money-green. Every
// executive function is an open station on tiers that step down by rank, all facing one Big Board:
//
//   deck  y  0    X -64..-50.5   CEO chair (dais), command table, trophy wall (N), members' lounge (S)
//   tier  y -1.25 X -70..-64     Treasury Operations · Office of the CFO · Budget Discipline
//   tier  y -2.5  X -76..-70     Legal & Compliance · Narrative Management · Human Capital
//   tier  y -3.75 X -82..-76     Information Technology · Liquidity Flow Control · Surveillance Operations
//   pit   y -5    X -109..-82    the 1:11 model of both towers, money streams into the Treasury Column
//
// From the CEO's chair (X -61.8, Z 0, facing west) the model, the streams, the Big Board (west wall:
// inflow by venue, Treasury Reserve, proprietary trading), the camera wall (south) and the master
// dashboards (north) line up in one view. Entry: lift hall -> airlock -> blast door onto the deck.
// The Chief Executive Lift has a private passage (Z -23.4) straight onto the deck.
// All y below are relative to the floor slab (99 m); the pit sinks into the gap above OT-04.

const DECK = { x0: -64, x1: -50.5 };
const TIERS = [
  { x0: -70, x1: -64, y: -1.25 },
  { x0: -76, x1: -70, y: -2.5 },
  { x0: -82, x1: -76, y: -3.75 },
];
const PIT = { x0: -109, x1: -82, y: -5 };
const ZW = 39; // inner faces of the north/south walls
const STAIRS = [-9, 9]; // 3 m stairs down through every tier
const BANKS = [[-33, -11], [-7, 7], [11, 33]];
const DOOR = { x: -57.4, half: 3.2, top: 4.2 }; // blast door (leaf centre plane)
const CEO_Z = -23.4; // the Chief Executive's private passage
const THRONE = { x: -61.8, z: 0 };

// the tower model: building (bx, by, bz) -> room (MX + bz/S, MY + by/S, (bx - 50)/S)
const S = 11, MX = -96, MY = -3.2;
const mx = (bz) => MX + bz / S, my = (by) => MY + by / S, mz = (bx) => (bx - 50) / S;
const TOTEM = { x: -86.3, z: 0, r: 1.25, top: -0.9 };

// ---------------------------------------------------------------- copy (voice-and-satire glossary)
const STATIONS = [
  ['TREASURY OPERATIONS', 'OFFICE OF THE CFO', 'BUDGET DISCIPLINE'],
  ['LEGAL & COMPLIANCE', 'NARRATIVE MANAGEMENT', 'HUMAN CAPITAL'],
  ['INFORMATION TECHNOLOGY', 'LIQUIDITY FLOW CONTROL', 'SURVEILLANCE OPERATIONS'],
];
const STATION_CH = [
  [[CH.PNL, CH.CHART], [CH.PNL, CH.TICKER], [CH.CHART, CH.PNL]],
  [[CH.TICKER, CH.ODDS], [CH.SCORE, CH.FIGHT], [CH.RACE, CH.LOTTO]],
  [[CH.CHART, CH.TICKER], [CH.ODDS, CH.PNL], [CH.FIGHT, CH.RACE]],
];
// revenue streams: one per venue (+ the trading desk). by = height on the floor, rate = $/min baseline
const VENUES = [
  { id: 'slots', name: 'Automated Yield Terminals', tag: 'YIELD TERMINALS', floor: 'VT-01', bx: 84, dy: 5, rate: 2300 },
  { id: 'roulette', name: 'Rotational Variance Instruments', tag: 'ROTATIONAL VARIANCE', floor: 'VT-01', bx: 163, dy: 5, rate: 1550 },
  { id: 'blackjack', name: 'Twenty-One Advisory Tables', tag: 'TWENTY-ONE ADVISORY', floor: 'VT-01', bx: 70, dy: 15, rate: 1100 },
  { id: 'baccarat', name: 'Private Banking Tables', tag: 'PRIVATE BANKING', floor: 'VT-01', bx: 111, dy: 15, rate: 1350 },
  { id: 'craps', name: 'Kinetic Probability Pit', tag: 'KINETIC PIT', floor: 'VT-01', bx: 137, dy: 10, rate: 600 },
  { id: 'poker', name: 'Private Card Salon', tag: 'CARD SALON', floor: 'VT-01', bx: 186, dy: 12, rate: 450 },
  { id: 'football', name: 'Sports Analytics Arena', tag: 'SPORTS ANALYTICS', floor: 'VT-02', bx: 108, dy: 6, rate: 1900 },
  { id: 'muaythai', name: 'Combat Sports Analytics Pavilion', tag: 'COMBAT PAVILION', floor: 'VT-03', bx: 120, dy: 10, rate: 800 },
  { id: 'racing', name: 'Equine Performance Centre', tag: 'EQUINE CENTRE', floor: 'VT-04', bx: 130, dy: 8, rate: 1050 },
  { id: 'lottery', name: 'Probability Research Institute', tag: 'PROBABILITY RESEARCH', floor: 'OT-02', bx: -80, dy: 4, rate: 400 },
  { id: 'trading', name: 'Proprietary Trading', tag: 'PROPRIETARY TRADING', floor: 'OT-01', bx: -80, dy: 6, rate: 0, trading: true },
];
const DEPTS = ['Trading Floor', 'Probability Research Institute', 'Global Client Outreach', 'Asset Protection HQ',
  'Executive Leisure Suite', 'Sports Analytics Arena', 'Combat Sports Pavilion', 'Equine Performance Centre'];
const CAMS = ['L0 GRAND LOBBY', 'L0 WELLNESS SCREENING', 'PLAZA FORECOURT', 'THE LINK', 'OT-01 TRADING FLOOR', 'OT-01 BELL BALCONY',
  'OT-02 REHEARSAL THEATRE', 'OT-02 DRAW CAM', 'OT-03 ARRIVALS', 'OT-03 TERRACE 2', 'OT-04 ALIGNMENT YARD', 'OT-04 TRANSITION SUITE',
  'OT-05 COMMAND DECK', 'B1 ARRIVAL HALL', 'B1 LASER CORRIDOR', 'B1 TREASURY DOOR', 'VT-01 PROMENADE', 'VT-01 YIELD TERMINALS',
  'VT-01 ROTATIONAL', 'VT-01 CARD SALON', 'VT-02 PORTAL', 'VT-02 PIT LEVEL', 'VT-03 RINGSIDE', 'VT-03 CONCOURSE',
  'VT-04 CHAMPIONS COURT', 'VT-04 PARADE RING', 'VT-04 HOME STRAIGHT', 'FREIGHT OT-F1', 'FREIGHT VT-F1', 'CEO LIFT OT-X1',
  'ROOF PLANT', 'LOADING DOCK'];

// ---------------------------------------------------------------- materials
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
let ready = false;
function materials() {
  if (ready) return;
  ready = true;
  kitMaterials();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = rng(57);
  g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) { const k = r(); g.fillStyle = `rgba(${30 + k * 30},${30 + k * 28},${32 + k * 26},0.25)`; g.fillRect(r() * 512, r() * 512, 3 + r() * 24, 3 + r() * 24); }
  for (let v = 0; v < 9; v++) { // thin gold veins
    let x = r() * 512, y = r() * 512; const a = r() * Math.PI;
    g.strokeStyle = `rgba(${170 + r() * 50},${130 + r() * 40},${60 + r() * 30},${0.25 + r() * 0.3})`; g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 16; s++) { x += Math.cos(a + (r() - 0.5) * 1.5) * 36; y += Math.sin(a + (r() - 0.5) * 1.5) * 36; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.6)'; for (const p of [0, 256]) { g.fillRect(p, 0, 2, 512); g.fillRect(0, p, 512, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  addLuxMaterials({
    cmdMarble: std({ map: t, roughness: 0.14, metalness: 0.1, envMapIntensity: 0.9 }),
    cmdBlack: std({ color: 0x0d0e10, roughness: 0.35, metalness: 0.35 }),
    cmdBlack2: std({ color: 0x18191c, roughness: 0.4, metalness: 0.5 }),
    cmdFloor: std({ color: 0x040506, roughness: 0.1, metalness: 0.55, envMapIntensity: 1 }),
    cmdPanel: std({ color: 0x1a1408, emissive: 0xffcf8a, emissiveIntensity: 0.3, roughness: 0.6 }),
    cmdGreen: new THREE.MeshBasicMaterial({ color: 0x2dff8a, toneMapped: false }),
    cmdGreenDim: new THREE.MeshBasicMaterial({ color: 0x0c5a32, toneMapped: false }),
    cmdRed: new THREE.MeshBasicMaterial({ color: 0xff3344, toneMapped: false }),
    cmdGoldLed: new THREE.MeshBasicMaterial({ color: 0xffc766, toneMapped: false }),
    cmdSmoke: std({ color: 0x0a1410, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.4, depthWrite: false }),
    cmdModelGlass: std({ color: 0xb8e8d4, emissive: 0x010604, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }),
    cmdSlab: std({ color: 0x3a4640, emissive: 0x050a08, roughness: 0.35, metalness: 0.7 }),
    cmdVault: std({ color: 0xd9b25c, emissive: 0xffb347, emissiveIntensity: 0.9, roughness: 0.25, metalness: 1 }),
    cmdLiquid: std({ color: 0x0f5a34, emissive: 0x2dff8a, emissiveIntensity: 0.35, roughness: 0.2, transparent: true, opacity: 0.8 }),
  }, { cmdMarble: 2.4 });
}

// ---------------------------------------------------------------- live state (simulated, real where the server has it)
const ST = {
  t: 0, vault: 98_400_000, vaultReal: false, nav: 1_000_000, navStart: 1_000_000, // dollars (the server sends minor units)
   navHist: [], positions: [], navRate: 0, navReal: false,
  rates: VENUES.map((v) => v.rate), today: null, inflowHist: [], depts: null, lastPoll: -1e9,
};
function minutesToday() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
function initState() {
  if (ST.today) return;
  const m = minutesToday();
  ST.today = VENUES.map((v) => v.rate * m * (0.9 + Math.random() * 0.2));
  ST.depts = DEPTS.map((_, i) => { const budget = 4e5 + ((i * 7919) % 9) * 1.5e5; return { budget, spent: budget * (0.35 + Math.random() * 0.5), earn: (Math.random() - 0.25) * budget * 0.6 }; });
  for (let i = 0; i < 60; i++) ST.navHist.push(ST.nav * (1 + (Math.random() - 0.5) * 0.002 * i / 10));
}
async function poll() {
  try {
    const f = await api('/api/firm/book');
    const nav = Number(f?.book?.nav) / 100; // ledger amounts are minor units (1/100)
    if (Number.isFinite(nav) && nav > 0) {
      const dtMin = ST.navReal ? Math.max(0.5, (ST.t - ST.navAt) / 60) : 1;
      ST.navRate = ST.navReal ? (nav - ST.nav) / dtMin : 0;
      ST.nav = nav; ST.navReal = true; ST.navAt = ST.t;
      if (Array.isArray(f.navHistory) && f.navHistory.length > 1) ST.navHist = f.navHistory.slice(-120).map((p) => Number(p.nav) / 100 || nav);
      const pos = f.book.positions;
      if (Array.isArray(pos)) ST.positions = pos.slice(0, 6).map((p) => ({ sym: p.symbol || p.sym || '?', qty: Number(p.qty ?? p.quantity ?? 0), val: Number(p.value ?? 0) / 100, pnl: Number(p.unrealized ?? 0) / 100 }));
    }
  } catch { /* server offline: keep simulating */ }
  try {
    const o = await api('/api/ops');
    const v = Number(o?.vault?.balance ?? o?.vault) / 100;
    if (Number.isFinite(v) && v > 0) { ST.vault = v; ST.vaultReal = true; }
  } catch { /* server offline */ }
}
// smooth per-venue rate: baseline x slow waves + rare surges
function stepState(dt) {
  ST.t += dt;
  let total = 0;
  VENUES.forEach((v, i) => {
    if (v.trading) {
      if (!ST.navReal) { ST.navRate = Math.sin(ST.t * 0.05 + 1) * 600 + Math.sin(ST.t * 0.31) * 250; ST.nav += ST.navRate * dt / 60; }
      ST.rates[i] = ST.navRate;
    } else {
      const w = 0.78 + 0.18 * Math.sin(ST.t * (0.07 + i * 0.013) + i * 1.7) + 0.08 * Math.sin(ST.t * (0.41 + i * 0.05) + i);
      ST.rates[i] = v.rate * w;
    }
    ST.today[i] += ST.rates[i] * dt / 60;
    total += ST.rates[i];
  });
  if (!ST.vaultReal) ST.vault += total * dt / 60;
  for (const d of ST.depts) { d.spent += d.budget * 0.00002 * dt * (0.5 + Math.random()); if (d.spent > d.budget * 1.02) d.spent = d.budget * 0.4; d.earn += (Math.random() - 0.45) * d.budget * 0.0001 * dt; }
  return total;
}

// ---------------------------------------------------------------- canvas boards
const money = (v, dp = 0) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;
const C = { bg: '#020604', grid: '#0b2416', green: '#2dff8a', dim: '#1f7a4c', gold: '#e3c27a', red: '#ff4d5a', amber: '#ffb347', ink: '#d8ffe9' };
function board(ctx, cw, chh, w, h, x, y, z, yaw) {
  const c = document.createElement('canvas'); c.width = cw; c.height = chh;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, ctx.e + y, z); m.rotation.y = yaw;
  ctx.add(m, geo, mat, tex);
  return { g: c.getContext('2d'), w: cw, h: chh, tex };
}
function frame(b, title, sub) {
  const { g, w, h } = b;
  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = C.grid; g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  if (title) {
    g.fillStyle = '#06301c'; g.fillRect(0, 0, w, 64);
    g.fillStyle = C.gold; g.font = 'bold 34px monospace'; g.textBaseline = 'middle'; g.fillText(title, 20, 33);
    if (sub) { g.fillStyle = C.green; g.font = '22px monospace'; g.textAlign = 'right'; g.fillText(sub, w - 20, 34); g.textAlign = 'left'; }
  }
  g.strokeStyle = C.gold; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
}
function fit(g, text, maxW, px, weight = 'bold') { let s = px; do { g.font = `${weight} ${s}px monospace`; s -= 2; } while (g.measureText(text).width > maxW && s > 10); }

function drawBanner(b, total) {
  const { g, w, h } = b;
  frame(b);
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.gold; g.font = 'bold 40px monospace'; g.fillText('TREASURY RESERVE', 40, 70);
  g.fillStyle = C.dim; g.font = '24px monospace'; g.fillText(ST.vaultReal ? 'LEDGER · LIVE' : 'LEDGER · SIMULATED', 470, 70);
  g.fillStyle = C.green; fit(g, money(ST.vault), 1180, 150); g.fillText(money(ST.vault), 36, 230);
  g.fillStyle = C.gold; g.font = 'bold 36px monospace'; g.fillText('NET INFLOW / MIN', 1290, 70);
  g.fillStyle = total >= 0 ? C.green : C.red; fit(g, money(total), 720, 96); g.fillText(money(total), 1290, 170);
  const sum = ST.today.reduce((a, v) => a + v, 0);
  g.fillStyle = C.gold; g.font = 'bold 30px monospace'; g.fillText('TODAY', 1290, 228);
  g.fillStyle = C.ink; fit(g, money(sum), 560, 54); g.fillText(money(sum), 1430, 230);
  g.fillStyle = '#06301c'; g.fillRect(4, h - 72, w - 8, 68);
  const now = new Date();
  const zones = [['NEW YORK', 'America/New_York'], ['LONDON', 'Europe/London'], ['BANGKOK', 'Asia/Bangkok'], ['HONG KONG', 'Asia/Hong_Kong']];
  g.font = 'bold 30px monospace';
  zones.forEach(([n, tz], i) => {
    let tt = '--:--:--'; try { tt = now.toLocaleTimeString('en-GB', { timeZone: tz }); } catch { /* old browser */ }
    g.fillStyle = C.dim; g.fillText(n, 40 + i * 420, h - 26); g.fillStyle = C.green; g.fillText(tt, 40 + i * 420 + 180, h - 26);
  });
  g.fillStyle = C.gold; g.textAlign = 'right'; g.fillText('SITUATIONAL AWARENESS: TOTAL', w - 36, h - 26); g.textAlign = 'left';
  b.tex.needsUpdate = true;
}
function drawVenues(b) {
  const { g, w } = b;
  frame(b, 'INFLOW BY VENUE', '● LIVE');
  g.textBaseline = 'middle';
  g.fillStyle = C.dim; g.font = 'bold 20px monospace';
  g.fillText('VENUE', 24, 92); g.textAlign = 'right'; g.fillText('PER MIN', 800, 92); g.fillText('TODAY', w - 24, 92); g.textAlign = 'left';
  const max = Math.max(...VENUES.map((v) => v.rate)) * 1.15;
  VENUES.forEach((v, i) => {
    const y = 128 + i * 64, r = ST.rates[i], neg = r < 0;
    g.fillStyle = i % 2 ? 'rgba(45,255,138,0.03)' : 'rgba(45,255,138,0.07)'; g.fillRect(8, y - 30, w - 16, 60);
    g.fillStyle = v.trading ? C.gold : C.ink; fit(g, v.name.toUpperCase(), 470, 24); g.fillText(v.name.toUpperCase(), 24, y - 8);
    const bw = Math.min(1, Math.abs(r) / max) * 440;
    g.fillStyle = neg ? C.red : C.green; g.fillRect(24, y + 14, bw, 10);
    g.fillStyle = neg ? C.red : C.green; g.font = 'bold 28px monospace'; g.textAlign = 'right'; g.fillText(money(r), 800, y);
    g.fillStyle = C.gold; g.font = 'bold 24px monospace'; g.fillText(money(ST.today[i]), w - 24, y); g.textAlign = 'left';
  });
  b.tex.needsUpdate = true;
}
function drawTrading(b) {
  const { g, w } = b;
  frame(b, 'PROPRIETARY TRADING', ST.navReal ? '● FIRM BOOK · LIVE' : '○ SIMULATED');
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.dim; g.font = 'bold 24px monospace'; g.fillText('NET ASSET VALUE', 24, 112);
  g.fillStyle = C.ink; fit(g, money(ST.nav), w - 48, 84); g.fillText(money(ST.nav), 24, 196);
  const pnl = ST.nav - ST.navStart;
  g.fillStyle = C.dim; g.font = 'bold 24px monospace'; g.fillText('P&L SINCE INCEPTION', 24, 244);
  g.fillStyle = pnl >= 0 ? C.green : C.red; g.font = 'bold 52px monospace'; g.fillText(`${pnl >= 0 ? '+' : ''}${money(pnl)}`, 24, 302);
  // NAV history
  const hist = ST.navHist.length ? ST.navHist : [ST.nav];
  const lo = Math.min(...hist, ST.navStart), hi = Math.max(...hist, ST.navStart), X0 = 24, X1 = w - 24, Y0 = 340, Y1 = 580;
  const yv = (v) => Y1 - ((v - lo) / (hi - lo || 1)) * (Y1 - Y0);
  g.strokeStyle = C.dim; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(X0, yv(ST.navStart)); g.lineTo(X1, yv(ST.navStart)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = pnl >= 0 ? C.green : C.red; g.lineWidth = 4; g.beginPath();
  hist.forEach((v, i) => { const x = X0 + (i / Math.max(1, hist.length - 1)) * (X1 - X0); i ? g.lineTo(x, yv(v)) : g.moveTo(x, yv(v)); });
  g.stroke(); g.lineWidth = 1;
  // positions
  g.fillStyle = C.gold; g.font = 'bold 24px monospace'; g.fillText('TOP POSITIONS', 24, 630);
  const rows = ST.positions.length ? ST.positions : [{ sym: 'NVDA', val: 182e3, pnl: 4120 }, { sym: 'AAPL', val: 149e3, pnl: -880 }, { sym: 'MSFT', val: 114e3, pnl: 1200 }, { sym: 'JPM', val: 62e3, pnl: 310 }];
  rows.slice(0, 5).forEach((p, i) => {
    const y = 672 + i * 36;
    g.fillStyle = C.ink; g.font = 'bold 26px monospace'; g.fillText(p.sym, 24, y);
    g.textAlign = 'right'; g.fillText(money(p.val), 640, y);
    g.fillStyle = p.pnl >= 0 ? C.green : C.red; g.fillText(`${p.pnl >= 0 ? '+' : ''}${money(p.pnl)}`, w - 24, y); g.textAlign = 'left';
  });
  b.tex.needsUpdate = true;
}
function drawTimeline(b) {
  const { g, w, h } = b;
  frame(b);
  const hist = ST.inflowHist, max = Math.max(1, ...hist) * 1.1;
  g.fillStyle = 'rgba(45,255,138,0.12)'; g.strokeStyle = C.green; g.lineWidth = 3;
  g.beginPath(); g.moveTo(10, h - 10);
  hist.forEach((v, i) => g.lineTo(10 + (i / 239) * (w - 20), h - 10 - (v / max) * (h - 70)));
  g.lineTo(10 + ((hist.length - 1) / 239) * (w - 20), h - 10); g.closePath(); g.fill();
  g.beginPath(); hist.forEach((v, i) => { const x = 10 + (i / 239) * (w - 20), y = h - 10 - (v / max) * (h - 70); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  g.fillStyle = C.gold; g.font = 'bold 26px monospace'; g.textBaseline = 'top'; g.fillText('AGGREGATE INFLOW · LAST 2 MIN', 20, 16);
  b.tex.needsUpdate = true;
}
function drawDash(b) {
  const { g } = b;
  frame(b, 'ENTERPRISE PERFORMANCE · ALL DEPARTMENTS', 'BUDGETS SET BY THE CHIEF EXECUTIVE');
  g.textBaseline = 'alphabetic';
  ST.depts.forEach((d, i) => {
    const x = 16 + (i % 4) * 508, y = 80 + Math.floor(i / 4) * 208, pct = d.spent / d.budget;
    const status = pct > 1 ? ['FISCAL DISCIPLINE ADVISORY', C.red] : pct > 0.85 ? ['WATCH', C.amber] : ['NOMINAL', C.green];
    g.fillStyle = 'rgba(45,255,138,0.05)'; g.fillRect(x, y, 492, 196); g.strokeStyle = C.dim; g.strokeRect(x, y, 492, 196);
    g.fillStyle = C.gold; fit(g, DEPTS[i].toUpperCase(), 380, 26); g.fillText(DEPTS[i].toUpperCase(), x + 14, y + 38);
    g.fillStyle = status[1]; g.beginPath(); g.arc(x + 470, y + 28, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.dim; g.font = 'bold 20px monospace'; g.fillText('BUDGET', x + 14, y + 78); g.fillText('EARNINGS', x + 260, y + 78);
    g.fillStyle = C.ink; g.font = 'bold 30px monospace'; g.fillText(money(d.budget), x + 14, y + 112);
    g.fillStyle = d.earn >= 0 ? C.green : C.red; g.fillText(`${d.earn >= 0 ? '+' : ''}${money(d.earn)}`, x + 260, y + 112);
    g.fillStyle = '#0b2416'; g.fillRect(x + 14, y + 134, 464, 18); g.fillStyle = status[1]; g.fillRect(x + 14, y + 134, Math.min(1, pct) * 464, 18);
    g.fillStyle = C.ink; g.font = '18px monospace'; g.fillText(`SPEND ${(pct * 100).toFixed(1)}%`, x + 14, y + 180);
    g.fillStyle = status[1]; g.font = 'bold 18px monospace'; g.textAlign = 'right'; g.fillText(status[0], x + 478, y + 180); g.textAlign = 'left';
  });
  b.tex.needsUpdate = true;
}
// camera wall: 8 x 4 feeds, a few redrawn per tick (each feed ~1 Hz)
const CAM_DOTS = CAMS.map((_, i) => { const r = rng(100 + i); return Array.from({ length: 3 + (i % 5) }, () => ({ x: r(), y: 0.45 + r() * 0.5, vx: (r() - 0.5) * 0.06, ph: r() * 6 })); });
function drawCam(b, i, t) {
  const { g } = b, cw = 256, chh = 128, x = (i % 8) * cw, y = Math.floor(i / 8) * chh, r = rng(1 + i * 31 + Math.floor(t * 3));
  g.save(); g.beginPath(); g.rect(x, y, cw, chh); g.clip();
  g.fillStyle = '#0d1410'; g.fillRect(x, y, cw, chh);
  g.strokeStyle = 'rgba(140,200,160,0.25)'; g.lineWidth = 1; // floor grid in perspective
  const hz = y + 40 + (i % 3) * 6, vp = x + cw * (0.35 + (i % 4) * 0.1);
  for (let k = -6; k <= 6; k++) { g.beginPath(); g.moveTo(vp, hz); g.lineTo(vp + k * 60, y + chh); g.stroke(); }
  for (let k = 1; k < 6; k++) { const yy = hz + (y + chh - hz) * (k * k) / 36; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + cw, yy); g.stroke(); }
  g.fillStyle = 'rgba(160,210,180,0.18)'; for (let k = 0; k < 4; k++) g.fillRect(x + 20 + k * 62, y + 12, 10, hz - y - 12); // columns
  for (const d of CAM_DOTS[i]) { // people
    const px = x + (((d.x + d.vx * t) % 1) + 1) % 1 * cw, py = y + d.y * chh, s = 4 + d.y * 8;
    g.fillStyle = 'rgba(210,240,220,0.7)'; g.fillRect(px - s / 3, py - s * 1.8, s * 0.66, s * 1.8); g.beginPath(); g.arc(px, py - s * 2.1, s * 0.33, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(x + r() * cw, y + r() * chh, 2, 1); } // grain
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + chh - 20, cw, 20);
  g.fillStyle = '#d8ffe9'; g.font = 'bold 12px monospace'; g.textBaseline = 'middle'; g.fillText(`CAM ${String(i + 1).padStart(2, '0')} ${CAMS[i]}`, x + 6, y + chh - 10);
  const now = new Date(); g.fillText(now.toLocaleTimeString('en-GB'), x + cw - 64, y + 10);
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#ff3344'; g.beginPath(); g.arc(x + 10, y + 10, 4, 0, Math.PI * 2); g.fill(); g.fillText('REC', x + 18, y + 10); }
  g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, cw - 2, chh - 2);
  g.restore();
}

// ---------------------------------------------------------------- money streams (tube + scrolling shader)
const STREAM_VS = `uniform float uR; varying float vS;
void main() { vS = uv.x; vec3 p = position + normal * (uR - 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const STREAM_FS = `uniform float uT, uSpeed, uLen; uniform vec3 uC; varying float vS;
void main() {
  float f = fract(vS * uLen * 0.7 - uT * uSpeed);
  float pulse = smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.3, 1.0, f));
  float ends = smoothstep(0.0, 0.04, vS) * (1.0 - smoothstep(0.96, 1.0, vS) * 0.5);
  gl_FragColor = vec4(uC * (0.18 + 0.95 * pulse), (0.18 + 0.6 * pulse) * ends);
}`;
const GREEN = new THREE.Color(0x2dff8a), RED = new THREE.Color(0xff3344), GOLD = new THREE.Color(0xffc766);
function streams(ctx) {
  const out = [];
  const tTop = new THREE.Vector3(TOTEM.x, ctx.e + TOTEM.top + 0.05, TOTEM.z);
  VENUES.forEach((v) => {
    const f = FLOOR_BY_ID[v.floor], ot = f.tower === 'OT';
    const sx = mx(ot ? 40 : 60) + 0.08, sy = my(f.elevation + v.dy), sz = mz(v.bx);
    const p0 = new THREE.Vector3(sx, ctx.e + sy, sz);
    const pts = [p0, new THREE.Vector3(sx + 1.4, ctx.e + sy + 0.25, sz),
      new THREE.Vector3((sx + TOTEM.x) / 2 + 0.6, ctx.e + Math.max(sy, TOTEM.top) + 1.0, sz * 0.55),
      new THREE.Vector3(TOTEM.x, ctx.e + TOTEM.top + 1.8, sz * 0.08), tTop];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const geo = new THREE.TubeGeometry(curve, 72, 1, 8, false);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0.1 }, uT: { value: 0 }, uSpeed: { value: 1 }, uLen: { value: len }, uC: { value: (v.trading ? GOLD : GREEN).clone() } },
      vertexShader: STREAM_VS, fragmentShader: STREAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 7; m.frustumCulled = false;
    ctx.add(m, geo, mat);
    plaque(ctx, v.tag, sx + 0.9, sy + 0.42, sz, Math.PI / 2, { h: 0.22, color: v.trading ? '#ffd58a' : '#bfffd8', font: 'bold 64px "Segoe UI", sans-serif' });
    out.push({ v, mat });
  });
  return out;
}

// ---------------------------------------------------------------- helpers
function balustrade(L, x, z0, z1, y, gaps = []) { // glass rail along Z at x
  let cur = z0;
  for (const [ga, gb] of [...gaps].sort((a, b) => a[0] - b[0]).concat([[z1, z1]])) {
    if (ga - cur > 0.1) {
      L.box(x - 0.015, x + 0.015, y + 0.06, y + 1.0, cur, ga, 'cmdSmoke', { collide: true });
      L.box(x - 0.05, x + 0.05, y + 1.0, y + 1.07, cur, ga, 'gold');
      L.box(x - 0.05, x + 0.05, y, y + 0.06, cur, ga, 'cmdBlack2');
    }
    cur = Math.max(cur, gb);
  }
}
function stair(L, xEdge, yTop, zc, w = 3) { // down westward from a tier edge: 5 risers of 0.25
  const z0 = zc - w / 2, z1 = zc + w / 2;
  for (let k = 1; k <= 4; k++) {
    const top = yTop - k * 0.25, xa = xEdge - k * 0.3, xb = xEdge - (k - 1) * 0.3;
    L.box(xa, xb, yTop - 1.25, top, z0, z1, 'cmdMarble', { collide: true });
    L.box(xa, xa + 0.04, top - 0.02, top + 0.004, z0 + 0.08, z1 - 0.08, 'cmdGreen');
  }
  for (const zz of [z0, z1]) L.box(xEdge - 1.25, xEdge, yTop - 1.25 + 0.9, yTop - 1.25 + 0.96, zz - 0.04, zz + 0.04, 'gold'); // handrails
}
function chair(L, x, y, z, big = false) {
  const s = big ? 0.42 : 0.28, back = big ? 0.8 : 0.75; // the CEO's back stays under eye height (you look over it)
  L.box(x - s, x + s, y + 0.38, y + 0.46, z - s, z + s, 'leather', { collide: true });
  L.box(x + s - 0.08, x + s, y + 0.46, y + 0.46 + back, z - s, z + s, 'leather');
  L.cyl(x, z, 0.05, y, y + 0.38, 'cmdBlack2', { seg: 6 });
  if (big) for (const zz of [z - s - 0.06, z + s]) L.box(x - s, x + s, y + 0.46, y + 0.75, zz, zz + 0.06, 'gold');
}
// a console bank facing west (screens toward the operator on the east side)
function consoleBank(ctx, L, xF, y, z0, z1, chs, people, label) {
  L.box(xF, xF + 0.8, y, y + 0.74, z0, z1, 'cmdBlack', { collide: true });
  L.box(xF - 0.03, xF + 0.84, y + 0.74, y + 0.78, z0 - 0.03, z1 + 0.03, 'cmdMarble');
  L.box(xF - 0.04, xF - 0.01, y + 0.74, y + 0.78, z0 - 0.03, z1 + 0.03, 'gold');
  L.box(xF + 0.02, xF + 0.04, y + 0.1, y + 0.13, z0, z1, 'cmdGreenDim'); // toe-kick LED (pit side)
  L.box(xF + 0.06, xF + 0.18, y + 0.78, y + 1.36, z0 + 0.05, z1 - 0.05, 'cmdBlack2');
  let n = 0;
  for (let z = z0 + 0.4; z <= z1 - 0.35; z += 0.62) { ctx.screen(xF + 0.185, y + 1.06, z, Math.PI / 2, 0.56, 0.36, chs[n % chs.length]); n++; }
  for (const zz of people) { chair(L, xF + 1.35, y, zz); L.person(xF + 1.3, zz, { y, sit: true, yaw: -Math.PI / 2, suit: 0x101215, skin: [0xd8a47f, 0x8d5a3b, 0xc68c62, 0xf0c8a0][Math.abs(Math.round(zz)) % 4], hair: 0x1a1410 }); }
  // name rail on top of the monitor riser, readable from the deck (east) and from the pit (west);
  // kept below the CEO's sightline to the model
  const zc = (z0 + z1) / 2, sy = y + 1.55, hw = Math.min(4.2, (z1 - z0) / 2);
  L.box(xF + 0.06, xF + 0.18, y + 1.36, y + 1.74, zc - hw, zc + hw, 'cmdBlack');
  L.box(xF + 0.05, xF + 0.19, y + 1.74, y + 1.77, zc - hw, zc + hw, 'cmdGreen');
  plaque(ctx, label, xF + 0.19, sy, zc, Math.PI / 2, { h: 0.26, color: '#e3c27a', font: 'bold 72px "Segoe UI", sans-serif' });
  plaque(ctx, label, xF + 0.05, sy, zc, -Math.PI / 2, { h: 0.26, color: '#e3c27a', font: 'bold 72px "Segoe UI", sans-serif' });
}
function light(ctx, x, y, z, intensity, distance, color, decay = 1.5) {
  const l = new THREE.PointLight(color, intensity, distance, decay); l.position.set(x, ctx.e + y, z); ctx.add(l); return l;
}

// ---------------------------------------------------------------- builder
export function commandCentre(ctx) {
  materials();
  initState();
  const L = new Lux(ctx);
  const H = ctx.floor.height;
  hall(ctx, L);
  shell(ctx, L, H);
  tiers(ctx, L);
  deck(ctx, L);
  blastDoor(ctx, L);
  model(ctx, L);
  L.build();
  const live = walls(ctx, L);
  const flows = streams(ctx);
  light(ctx, MX, 12, 0, 22, 40, 0xbfffe0);
  light(ctx, -56, 8, 0, 30, 22, 0xffc98a);

  // tick: streams every frame (uniforms only); boards at 2 Hz, cameras 8 feeds per tick at 4 Hz
  let acc = 0, camAcc = 0, cam = 0, sample = 0;
  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    const total = stepState(dt);
    const maxRate = Math.max(...VENUES.map((v) => v.rate));
    flows.forEach(({ v, mat }, i) => {
      const r = ST.rates[i], u = mat.uniforms, k = Math.min(1.6, Math.abs(r) / maxRate);
      u.uT.value = ST.t;
      u.uR.value = 0.025 + 0.11 * Math.sqrt(k);
      u.uSpeed.value = (r < 0 ? -1 : 1) * (0.5 + 1.6 * k);
      if (v.trading) u.uC.value.copy(r < 0 ? RED : GOLD);
    });
    live.liquid.scale.y = 0.75 + 0.2 * Math.sin(ST.t * 0.2) + 0.05 * Math.sin(ST.t * 1.3);
    if (ST.t - ST.lastPoll > 30) { ST.lastPoll = ST.t; poll(); }
    acc += dt; camAcc += dt; sample += dt;
    if (sample >= 0.5) { sample = 0; ST.inflowHist.push(Math.max(0, total)); if (ST.inflowHist.length > 240) ST.inflowHist.shift(); }
    if (acc >= (QUALITY.low ? 1 : 0.5)) {
      acc = 0;
      drawBanner(live.banner, total); drawVenues(live.venues); drawTrading(live.trading); drawTimeline(live.timeline); drawDash(live.dash);
    }
    if (camAcc >= (QUALITY.low ? 0.5 : 0.25)) {
      camAcc = 0;
      for (let k = 0; k < 8; k++) { drawCam(live.cams, cam, ST.t); cam = (cam + 1) % CAMS.length; }
      live.cams.tex.needsUpdate = true;
    }
  });
}

// ---- lift hall: a black-and-gold security lobby; airlock portal (Z 0) and the CEO's passage (Z -23.4)
const HALLP = { wall: 'cmdBlack', wallDeep: 'cmdBlack2', panel: 'cmdPanel', frame: 'gold', frameDark: 'cmdBlack2', dado: 'cmdMarble', cap: 'gold',
  floor: 'cmdMarble', floorTile: 2.4, runner: 'cmdBlack2', edge: 'cmdGreen', liner: 'cmdBlack2', ink: '#e3c27a', kioskBg: '#020604', kioskBtn: '#06301c', kioskEdge: '#2dff8a', hostSuit: 0x101215 };
function hall(ctx, L) {
  luxLiftHall(ctx, L, {
    s: -1, H: ctx.floor.height, P: HALLP, ceo: 'ceo',
    banks: [['ot_high', 'OFFICE HIGH-RISE · L · 3–5', false], ['freight_ot', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [], host: false, planters: [-12, 12, 30],
    portals: [
      { z: 0, half: DOOR.half, top: DOOR.top, text: 'EXECUTIVE COMMAND CENTRE', sub: 'Total Situational Awareness · By Invitation Only', textH: 0.9 },
      { z: CEO_Z, half: 2.2, top: 3.4, text: 'CHIEF EXECUTIVE', textH: 0.45, runner: false },
    ],
  });
  // the Chief Executive's private passage: smoked glass from the private lift to its portal
  for (const z of [-25.72, -21.08]) {
    L.box(-49.6, -39.12, 0, 3.4, z - 0.03, z + 0.03, 'cmdSmoke', { collide: true });
    L.box(-49.6, -39.12, 3.4, 3.48, z - 0.06, z + 0.06, 'gold');
  }
  L.box(-49.6, -39.2, 0.014, 0.024, -24.2, -22.6, 'gold'); // gold runner
  // guards flanking the airlock, a green status strip over it
  for (const z of [-4.6, 4.6]) L.person(-48.2, z, { yaw: Math.PI / 2, suit: 0x0b0c0e, skin: z < 0 ? 0xc68c62 : 0x8d5a3b, hair: 0x111111 });
  L.box(-49.58, -49.54, 4.3, 4.38, -DOOR.half, DOOR.half, 'cmdGreen');
}

// ---- shell: pit walls, cladding on the side walls, ceiling grid, the ring light over the model
function shell(ctx, L, H) {
  L.floor(PIT.x0, PIT.x1, -ZW, ZW, PIT.y + 0.004, 'cmdFloor', 4);
  L.box(PIT.x0, PIT.x1, PIT.y - 0.3, PIT.y, -ZW, ZW, 'cmdBlack', { collide: true });
  for (let x = -106; x <= -84; x += 6) L.box(x - 0.03, x + 0.03, PIT.y + 0.004, PIT.y + 0.01, -ZW, ZW, 'cmdGreenDim'); // inlaid grid
  for (let z = -36; z <= 36; z += 6) L.box(PIT.x0, PIT.x1, PIT.y + 0.004, PIT.y + 0.01, z - 0.03, z + 0.03, 'cmdGreenDim');
  // pit walls (below the slab) and side-wall cladding above
  for (const s of [-1, 1]) {
    const zf = s * ZW;
    L.box(PIT.x0, DECK.x1, PIT.y, 0, Math.min(zf, zf + s * 0.3), Math.max(zf, zf + s * 0.3), 'cmdMarble', { collide: true });
    L.box(PIT.x0, DECK.x1, 0, H, Math.min(zf, zf - s * 0.1), Math.max(zf, zf - s * 0.1), 'cmdBlack');
    for (const y of [1.2, 13.2]) L.box(PIT.x0, DECK.x1, y, y + 0.06, Math.min(zf - s * 0.1, zf - s * 0.14), Math.max(zf - s * 0.1, zf - s * 0.14), 'gold');
    L.box(PIT.x0, DECK.x1, H - 0.6, H - 0.55, Math.min(zf - s * 0.1, zf - s * 0.2), Math.max(zf - s * 0.1, zf - s * 0.2), 'cmdGreen'); // cove
  }
  L.box(PIT.x0 - 0.3, PIT.x0, PIT.y, H, -ZW, ZW, 'cmdBlack', { collide: true });
  // ceiling: black beams on a 6 m grid with warm downlights; a ring light over the model
  for (let x = -106; x <= -52; x += 6) L.box(x - 0.2, x + 0.2, H - 1.0, H - 0.2, -ZW, ZW, 'cmdBlack2');
  for (let z = -36; z <= 36; z += 6) L.box(PIT.x0, DECK.x1, H - 0.8, H - 0.2, z - 0.15, z + 0.15, 'cmdBlack2');
  for (let x = -103; x <= -55; x += 6) for (let z = -33; z <= 33; z += 6) L.cyl(x, z, 0.22, H - 0.82, H - 0.8, 'downlight', { seg: 10 });
  const ring = new THREE.TorusGeometry(13, 0.12, 6, 96).rotateX(Math.PI / 2).translate(MX, H - 2.2, 0);
  L.geo(ring, 'cmdGreen');
  const ring2 = new THREE.TorusGeometry(13.6, 0.06, 6, 96).rotateX(Math.PI / 2).translate(MX, H - 2.25, 0);
  L.geo(ring2, 'cmdGoldLed');
  for (let a = 0; a < 8; a++) { const x = MX + Math.cos(a * Math.PI / 4) * 13, z = Math.sin(a * Math.PI / 4) * 13; L.box(x - 0.02, x + 0.02, H - 2.2, H - 0.8, z - 0.02, z + 0.02, 'cmdBlack2'); }
}

// ---- tiers by rank: solid steps, glass rails, stairs, console banks
function tiers(ctx, L) {
  const levels = [{ x0: DECK.x0, y: 0 }, ...TIERS, { x0: PIT.x1, y: PIT.y }];
  TIERS.forEach((t, i) => {
    L.box(t.x0, t.x1, PIT.y, t.y, -ZW, ZW, 'cmdMarble', { collide: true });
    L.box(t.x0, t.x0 + 0.05, t.y - 0.03, t.y + 0.003, -ZW, ZW, 'cmdGreen'); // nosing
    L.box(t.x0 - 0.01, t.x0, t.y - 0.9, t.y - 0.86, -ZW, ZW, 'cmdGreenDim'); // riser LED
    const zs = BANKS;
    zs.forEach(([z0, z1], k) => {
      const people = k === 1 ? (i === 0 ? [0] : [-2, 2]) : [(z0 + z1) / 2 + (k ? 2 : -2)];
      consoleBank(ctx, L, t.x0 + 0.45, t.y, z0, z1, STATION_CH[i][k], people, STATIONS[i][k]);
    });
  });
  // rails along each upper level's front edge (gaps at the stairs), stairs down through every tier
  levels.slice(0, -1).forEach((lv) => {
    balustrade(L, lv.x0 + 0.06, -ZW + 0.3, ZW - 0.3, lv.y, STAIRS.map((z) => [z - 1.55, z + 1.55]));
    for (const z of STAIRS) stair(L, lv.x0, lv.y, z);
  });
  // the pit-facing riser of the lowest tier carries the room's name
  for (const z of [-22, 22]) plaque(ctx, 'LIQUIDITY THEATRE', PIT.x1 - 0.02, -4.35, z, -Math.PI / 2, { h: 0.5, color: '#e3c27a', font: '600 72px Georgia, serif' });
}

// ---- the CEO deck: dais + chair, command table, trophy wall (N), members' lounge (S), CEO walkway
function deck(ctx, L) {
  L.box(DECK.x0, DECK.x1, -0.3, 0, -ZW, ZW, 'cmdBlack', { collide: true });
  L.floor(DECK.x0, DECK.x1, -ZW, ZW, 0.004, 'cmdMarble', 2.4);
  // dais and the chair: the one spot where everything lines up
  L.box(-63.7, -60.3, 0, 0.42, -4.2, 4.2, 'cmdMarble', { collide: true });
  L.box(-63.72, -60.28, 0.42, 0.45, -4.22, 4.22, 'gold');
  L.box(-60.32, -60.28, 0.02, 0.06, -4.2, 4.2, 'cmdGreen');
  L.box(-63.5, -62.7, 0.45, 1.1, -3.2, 3.2, 'cmdBlack', { collide: true }); // CEO console (kept low: the view goes over it)
  L.box(-63.55, -62.6, 1.1, 1.14, -3.3, 3.3, 'gold');
  // no monitors on the CEO's console: the room is the display. A glass top with a glowing inlay instead.
  L.box(-63.4, -62.8, 1.14, 1.16, -3.0, 3.0, 'cmdSmoke');
  L.box(-63.3, -62.9, 1.141, 1.145, -2.8, 2.8, 'cmdGreenDim');
  chair(L, THRONE.x, 0.42, THRONE.z, true);
  plaque(ctx, 'CHIEF EXECUTIVE', -63.56, 0.85, 0, -Math.PI / 2, { h: 0.2, color: '#e3c27a' });
  // CEO walkway: gold-edged runner from the private passage to the dais
  for (const [x0, x1, z0, z1] of [[-60.5, -50.5, CEO_Z - 1, CEO_Z + 1], [-61.6, -59.6, CEO_Z - 1, -4.2]]) {
    L.box(x0, x1, 0.004, 0.012, z0, z1, 'cmdBlack2');
    for (const zz of [z0, z1 - 0.06]) L.box(x0, x1, 0.004, 0.014, zz, zz + 0.06, 'gold');
  }
  plaque(ctx, 'CHIEF EXECUTIVE', -50.56, 3.9, CEO_Z, -Math.PI / 2, { h: 0.32, color: '#e3c27a' });
  // command table (the meeting room): black glass top, green ring, 8 chairs
  L.cyl(-55.5, -14, 2.4, 0, 0.74, 'cmdBlack', { seg: 40, collide: true });
  L.cyl(-55.5, -14, 2.5, 0.74, 0.78, 'cmdMarble', { seg: 40 });
  L.cyl(-55.5, -14, 2.3, 0.78, 0.79, 'cmdGreenDim', { seg: 40 });
  L.cyl(-55.5, -14, 0.9, 0.79, 0.8, 'cmdGreen', { seg: 40 });
  for (let a = 0; a < 8; a++) { const x = -55.5 + Math.cos(a * Math.PI / 4) * 3.1, z = -14 + Math.sin(a * Math.PI / 4) * 3.1; L.box(x - 0.3, x + 0.3, 0, 0.46, z - 0.3, z + 0.3, 'leather', { collide: true }); }
  plaque(ctx, 'COMMAND TABLE', -55.5, 0.5, -16.55, Math.PI, { h: 0.16, color: '#e3c27a' });
  // trophy wall (north): three shelves of gold
  const zf = -ZW + 0.12;
  L.box(-58, -51, 0, 4.2, -ZW, zf, 'cmdBlack2');
  for (const y of [1.1, 2.1, 3.1]) {
    L.box(-57.8, -51.2, y, y + 0.05, zf, zf + 0.45, 'gold');
    L.box(-57.8, -51.2, y + 0.9, y + 0.92, zf, zf + 0.04, 'cmdGoldLed');
    for (let x = -57.4; x <= -51.6; x += 0.85) {
      const k = Math.round((x + 60) * 7 + y * 3) % 3;
      if (k === 0) { L.cyl(x, zf + 0.22, 0.12, y + 0.05, y + 0.12, 'gold', { seg: 10 }); L.cyl(x, zf + 0.22, 0.06, y + 0.12, y + 0.3, 'gold', { seg: 8 }); L.cyl(x, zf + 0.22, 0.17, y + 0.3, y + 0.62, 'gold', { seg: 12, rTop: 0.22 }); }
      else if (k === 1) { L.box(x - 0.14, x + 0.14, y + 0.05, y + 0.12, zf + 0.1, zf + 0.34, 'cmdMarble'); L.geo(new THREE.OctahedronGeometry(0.2).translate(x, y + 0.36, zf + 0.22), 'gold'); }
      else { L.box(x - 0.2, x + 0.2, y + 0.05, y + 0.6, zf + 0.02, zf + 0.06, 'gold'); L.box(x - 0.16, x + 0.16, y + 0.09, y + 0.56, zf + 0.06, zf + 0.07, 'cmdBlack'); }
    }
  }
  plaque(ctx, 'HALL OF ACHIEVEMENT', -54.5, 4.7, zf + 0.02, 0, { h: 0.45, color: '#e3c27a', sub: 'Records set. Records kept. Records sealed.' });
  // members' lounge (south): bar against the back wall, armchairs, humidor
  const bx = -52.4;
  L.box(-50.6, -50.5, 0, 4.6, 14, 30, 'cmdBlack2');
  for (const y of [1.3, 2.1, 2.9, 3.7]) {
    L.box(-50.9, -50.5, y, y + 0.04, 14.4, 29.6, 'gold');
    for (let z = 14.7; z < 29.4; z += 0.32) L.box(-50.82, -50.68, y + 0.04, y + 0.36 + ((z * 13) % 3) * 0.05, z - 0.05, z + 0.05, 'glow', { color: [0xffb347, 0x9f6a2a, 0x2dff8a, 0xffe2a8][Math.round(z * 3) % 4] });
  }
  L.box(bx - 0.7, bx, 0, 1.1, 14.6, 29.4, 'walnut', { collide: true });
  L.box(bx - 0.8, bx + 0.1, 1.1, 1.15, 14.5, 29.5, 'gold');
  L.box(bx - 0.72, bx - 0.68, 0.12, 0.16, 14.6, 29.4, 'cmdGoldLed');
  for (let z = 15.6; z < 29; z += 1.6) { L.cyl(bx - 1.35, z, 0.22, 0.72, 0.8, 'leather', { seg: 12 }); L.cyl(bx - 1.35, z, 0.04, 0, 0.72, 'gold', { seg: 6 }); }
  L.person(-51.3, 21, { yaw: -Math.PI / 2, suit: 0xe8e2d4, skin: 0xc68c62, hair: 0x111111 });
  plaque(ctx, "PRIVATE MEMBERS' LOUNGE", -50.62, 5.2, 22, -Math.PI / 2, { h: 0.5, color: '#e3c27a', sub: 'Cuban. Aged. Expensed.' });
  for (const [x, z] of [[-56.5, 18], [-56.5, 25], [-56.5, 32]]) {
    L.cyl(x, z, 0.5, 0, 0.5, 'cmdMarble', { seg: 20, collide: true }); L.cyl(x, z, 0.52, 0.5, 0.53, 'gold', { seg: 20 });
    for (const dz of [-1.2, 1.2]) { L.box(x - 0.45, x + 0.45, 0, 0.45, z + dz - 0.45, z + dz + 0.45, 'leather', { collide: true }); L.box(x - 0.45, x + 0.45, 0.45, 1.05, dz < 0 ? z + dz - 0.45 : z + dz + 0.3, dz < 0 ? z + dz - 0.3 : z + dz + 0.45, 'leather'); }
  }
  L.box(-57.4, -52.6, 0, 2.6, ZW - 0.7, ZW - 0.1, 'cmdSmoke', { collide: true }); // humidor
  for (const y of [0.7, 1.3, 1.9]) L.box(-57.3, -52.7, y, y + 0.04, ZW - 0.65, ZW - 0.15, 'walnut');
  L.box(-57.4, -52.6, 2.6, 2.66, ZW - 0.7, ZW - 0.1, 'gold');
  // a runner pacing behind the tiers
  L.person(-58.8, -30, { walk: [[-58.8, -30], [-58.8, 30]], speed: 0.9, suit: 0x101215, skin: 0xd8a47f, hair: 0x2a1a10 });
}

// ---- airlock + blast door (opens as you approach, either side)
function blastDoor(ctx, L) {
  const X0 = -56.9, X1 = -50.5, Zi = DOOR.half, T = 4.4;
  L.floor(X0, X1, -Zi, Zi, 0.006, 'plate', 0.6);
  for (const s of [-1, 1]) {
    L.box(X0, X1, 0, T, s < 0 ? -Zi - 0.3 : Zi, s < 0 ? -Zi : Zi + 0.3, 'cmdBlack', { collide: true });
    L.box(X0, X1, 0.25, 0.28, s < 0 ? -Zi : Zi - 0.03, s < 0 ? -Zi + 0.03 : Zi, 'cmdRed');
    L.box(X0, X1, T - 0.5, T - 0.47, s < 0 ? -Zi : Zi - 0.03, s < 0 ? -Zi + 0.03 : Zi, 'cmdRed');
  }
  L.box(X0, X1, T, T + 0.3, -Zi - 0.3, Zi + 0.3, 'cmdBlack');
  for (let x = X0 + 0.8; x < X1; x += 1.4) L.box(x - 0.3, x + 0.3, T - 0.05, T - 0.02, -1.2, 1.2, 'cmdPanel');
  plaque(ctx, 'AIRLOCK · HOLD FOR WELLNESS SCREENING', -53.7, 3.6, -Zi + 0.03, 0, { h: 0.18, color: '#ff8890', font: 'bold 64px monospace' });
  // the door housing (1 m thick) and two 0.7 m leaves that slide into it
  const HX0 = -57.9, HX1 = -56.9, HZ = 7.2;
  for (const s of [-1, 1]) L.box(HX0, HX1, 0, 5.4, s < 0 ? -HZ : Zi, s < 0 ? -Zi : HZ, 'blackMetal', { collide: true });
  L.box(HX0, HX1, DOOR.top, 5.4, -Zi, Zi, 'blackMetal');
  L.box(HX0 - 0.02, HX1 + 0.02, 5.4, 5.5, -HZ, HZ, 'gold');
  for (const s of [-1, 1]) L.box(HX0 - 0.02, HX0, 0.2, 5.2, s < 0 ? -HZ + 0.2 : Zi + 0.1, s < 0 ? -Zi - 0.1 : HZ - 0.2, 'hazard');
  plaque(ctx, 'COMMAND CENTRE', HX0 - 0.03, 4.8, 0, -Math.PI / 2, { h: 0.34, color: '#e3c27a' });
  const leafGeo = new THREE.BoxGeometry(0.7, DOOR.top, Zi), leaves = [];
  const edgeGeo = new THREE.BoxGeometry(0.72, DOOR.top - 0.4, 0.08);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(leafGeo, LM.steel); m.position.set(DOOR.x, ctx.e + DOOR.top / 2, s * Zi / 2); m.castShadow = true;
    const st = new THREE.Mesh(edgeGeo, LM.cmdGreen); st.position.set(0, 0, -s * (Zi / 2 - 0.06)); m.add(st);
    ctx.add(m); leaves.push([m, s, st]);
  }
  ctx.disposables.push(leafGeo, edgeGeo);
  let open = 0;
  ctx.colliders.push({ x0: DOOR.x - 0.35, x1: DOOR.x + 0.35, z0: -Zi, z1: Zi, y0: ctx.e, y1: ctx.e + DOOR.top, openFn: () => open > 0.85 });
  ctx.onUpdate((dt, t, viewer) => {
    const near = viewer && Math.abs(viewer.y - ctx.e) < 2 && Math.abs(viewer.x - DOOR.x) < 5.5 && Math.abs(viewer.z) < Zi + 2;
    open = Math.max(0, Math.min(1, open + (near ? dt * 0.55 : -dt * 0.7))); // heavy: ~2 s to open
    const e = open * open * (3 - 2 * open);
    for (const [m, s, st] of leaves) { m.position.z = s * (Zi / 2 + e * (Zi + 0.2)); st.material = open > 0.85 ? LM.cmdGreen : LM.cmdRed; }
  });
}

// ---- the 1:11 model of both towers on a glass-topped plinth, the Treasury Column in front of it
function model(ctx, L) {
  const PX0 = mx(-64) , PX1 = mx(64), PZ0 = mz(-116), PZ1 = mz(216);
  L.box(PX0, PX1, PIT.y, MY - 0.06, PZ0, PZ1, 'cmdBlack', { collide: true });
  L.box(PX0 - 0.03, PX1 + 0.03, MY - 0.06, MY - 0.02, PZ0 - 0.03, PZ1 + 0.03, 'gold');
  L.box(PX0, PX1, MY - 0.02, MY, PZ0, PZ1, 'cmdModelGlass');
  for (const s of [-1, 1]) L.box(PX0 - 0.02, PX1 + 0.02, PIT.y + 0.3, PIT.y + 0.34, s < 0 ? PZ0 - 0.02 : PZ1, s < 0 ? PZ0 : PZ1 + 0.02, 'cmdGreen');
  // the vault (B1), glowing gold through the plinth's glass top
  const v = findRoom('vault')?.room;
  if (v) L.box(mx(v.z0), mx(v.z1), MY - 1.0, MY - 0.1, mz(v.x0), mz(v.x1), 'cmdVault');
  // floors: thin slabs; venue floors get a green edge on the viewer's side
  const venueFloors = new Set(VENUES.map((q) => q.floor));
  for (const f of Object.values(FLOOR_BY_ID)) {
    if (!['OT', 'VT', 'BRIDGE', 'L0'].includes(f.tower) && f.id !== 'L0') continue;
    const b = f.bounds, y = my(f.elevation);
    if (f.id === 'L0') { L.box(mx(b.z0), mx(b.z1), MY, MY + 0.03, mz(b.x0), mz(b.x1), 'cmdSlab'); continue; }
    L.box(mx(b.z0), mx(b.z1), y - 0.04, y + 0.02, mz(b.x0), mz(b.x1), 'cmdSlab');
    L.box(mx(b.z1) - 0.02, mx(b.z1) + 0.01, y - 0.04, y + 0.02, mz(b.x0), mz(b.x1), venueFloors.has(f.id) ? 'cmdGreen' : 'cmdGoldLed');
    if (f.id === 'OT-05') L.box(mx(b.z0) + 0.3, mx(b.z1) - 0.3, y + 0.02, y + 0.06, mz(b.x0) + 0.3, mz(-50) - 0.2, 'cmdRed'); // you are here
  }
  // glass shells: Office Tower, Wellness Tower, the atrium; roofs in gold
  for (const [x0, x1, z0, z1, top] of [[-110, -30, -40, 40, 114], [30, 210, -60, 60, 112], [-30, 30, -40, 30, 48]]) {
    L.box(mx(z0), mx(z1), MY, my(top), mz(x0), mz(x1), 'cmdModelGlass');
    L.box(mx(z0), mx(z1), my(top), my(top) + 0.06, mz(x0), mz(x1), 'cmdBlack2');
    for (const [a, b] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) L.box(mx(b) - 0.03, mx(b) + 0.03, MY, my(top), mz(a) - 0.03, mz(a) + 0.03, 'gold');
  }
  plaque(ctx, 'THE FIRM · 1:11', mx(64) + 0.03, MY - 0.55, mz(50), Math.PI / 2, { h: 0.3, color: '#e3c27a' });
  // Treasury Column: glass cylinder, rising green liquidity, gold rings
  const T = TOTEM;
  L.cyl(T.x, T.z, T.r + 0.2, PIT.y, PIT.y + 0.4, 'cmdMarble', { seg: 32, collide: true });
  L.cyl(T.x, T.z, T.r, PIT.y + 0.4, T.top, 'cmdModelGlass', { seg: 32, collide: true, open: true });
  for (const y of [PIT.y + 0.4, (PIT.y + T.top) / 2, T.top]) L.cyl(T.x, T.z, T.r + 0.06, y - 0.05, y + 0.05, 'gold', { seg: 32 });
  plaque(ctx, 'TREASURY COLUMN', T.x + T.r + 0.25, PIT.y + 0.2, T.z, Math.PI / 2, { h: 0.18, color: '#e3c27a' });
}

// ---- the walls: Big Board (west), master dashboards (north), camera wall (south)
function walls(ctx, L) {
  const xw = PIT.x0 + 0.06, yaw = Math.PI / 2;
  L.box(PIT.x0, PIT.x0 + 0.05, -4.7, 14.7, -38.4, 38.4, 'blackMetal');
  const bezel = (z0, z1, y0, y1) => {
    for (const [a, b, c, d] of [[z0 - 0.15, z1 + 0.15, y0 - 0.15, y0], [z0 - 0.15, z1 + 0.15, y1, y1 + 0.15], [z0 - 0.15, z0, y0, y1], [z1, z1 + 0.15, y0, y1]]) L.box(PIT.x0 + 0.05, PIT.x0 + 0.12, c, d, a, b, 'gold');
  };
  bezel(-37.6, -17.4, -4.2, 12.8); bezel(17.4, 37.6, -4.2, 12.8); bezel(-16.6, 16.6, 9.4, 14.3); bezel(-16.6, 16.6, -4.2, 8.9);
  const venues = board(ctx, 1024, 870, 20.2, 17, xw, 4.3, -27.5, yaw);
  const trading = board(ctx, 1024, 870, 20.2, 17, xw, 4.3, 27.5, yaw);
  const banner = board(ctx, 2048, 340, 33.2, 4.9, xw, 11.85, 0, yaw);
  const timeline = board(ctx, 1024, 340, 33.2, 13.1, xw, 2.35, 0, yaw);
  // north: master dashboards; south: the camera wall (each in a gold bezel)
  const side = (s) => {
    const zf = s * (ZW - 0.12);
    L.box(-107, -66, 1.3, 11.7, Math.min(zf, zf - s * 0.06), Math.max(zf, zf - s * 0.06), 'blackMetal');
    for (const [x0, x1, y0, y1] of [[-107.15, -65.85, 11.7, 11.82], [-107.15, -65.85, 1.18, 1.3], [-107.15, -107, 1.3, 11.7], [-66, -65.85, 1.3, 11.7]]) L.box(x0, x1, y0, y1, Math.min(zf, zf - s * 0.1), Math.max(zf, zf - s * 0.1), 'gold');
  };
  side(-1); side(1);
  const dash = board(ctx, 2048, 500, 40.8, 10.2, -86.5, 6.5, -ZW + 0.2, 0);
  const cams = board(ctx, 2048, 512, 40.8, 10.2, -86.5, 6.5, ZW - 0.2, Math.PI);
  plaque(ctx, 'ENTERPRISE PERFORMANCE', -86.5, 12.5, -ZW + 0.2, 0, { h: 0.6, color: '#e3c27a' });
  plaque(ctx, 'SURVEILLANCE OPERATIONS', -86.5, 12.5, ZW - 0.2, Math.PI, { h: 0.6, color: '#e3c27a' });
  for (let i = 0; i < CAMS.length; i++) drawCam(cams, i, 0);
  cams.tex.needsUpdate = true;
  drawBanner(banner, 0); drawVenues(venues); drawTrading(trading); drawTimeline(timeline); drawDash(dash);
  // the liquid inside the Treasury Column (scaled by the tick)
  const lg = new THREE.CylinderGeometry(TOTEM.r - 0.08, TOTEM.r - 0.08, TOTEM.top - PIT.y - 0.5, 32).translate(0, (TOTEM.top - PIT.y - 0.5) / 2, 0);
  const liquid = new THREE.Mesh(lg, LM.cmdLiquid); liquid.position.set(TOTEM.x, ctx.e + PIT.y + 0.42, TOTEM.z); liquid.renderOrder = 4;
  ctx.add(liquid, lg);
  return { venues, trading, banner, timeline, dash, cams, liquid };
}
