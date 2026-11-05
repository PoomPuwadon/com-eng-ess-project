import * as THREE from 'three';
import { chunked } from './geom.js';

// Live sports "broadcast" feeds for the Sports Analytics Arena, drawn into ONE atlas texture
// and shared by every screen (threejs-performance skill §4).
// Phase 0: all matches/races are SIMULATED placeholders (fake clubs/drivers, fake results). In Phase 4
// the same cells will be driven by real fixtures/scores (free-data-sources skill).
//
// Cells (16:9, 384 x 216):  0..14 = football matches (95 % of what is on screen)
//                            15    = F1 Grand Prix with live timing tower + circuit map
//                            16    = live scores ticker (all matches)
const COLS = 4, ROWS = 5, CW = 384, CH_ = 216;
export const BC = { MATCHES: 15, RACE: 15, SCORES: 16, DASH: 17, DASHES: 3 };

// Events for the arena (box gain/loss pop-ups). One listener slot, replaced on floor rebuild.
let listener = null;
export const setFeedListener = (fn) => { listener = fn; };
const emit = (ev) => { if (listener) listener(ev); };

const canvas = document.createElement('canvas');
canvas.width = CW * COLS;
canvas.height = CH_ * ROWS;
const g = canvas.getContext('2d');
export const bcTexture = new THREE.CanvasTexture(canvas);
bcTexture.colorSpace = THREE.SRGBColorSpace;
bcTexture.minFilter = THREE.LinearMipmapLinearFilter;

// ------------------------------------------------------------ simulated football
const CLUBS = [
  ['NBR', 'Northbridge', '#d62839', '#ffffff'], ['ASH', 'Ashford Utd', '#1d4ed8', '#ffffff'], ['KIN', 'Kingsmere', '#fbbf24', '#111111'],
  ['RVL', 'Riverholt', '#16a34a', '#ffffff'], ['CAL', 'Calderon CF', '#7c3aed', '#ffffff'], ['MON', 'Montvale', '#0ea5e9', '#0b1d33'],
  ['STR', 'Strandmoor', '#111827', '#f59e0b'], ['VAL', 'Valmira', '#e11d48', '#fde68a'], ['HAR', 'Harrowgate', '#f97316', '#111111'],
  ['LUX', 'Luxmont', '#e5e7eb', '#1f2937'], ['OST', 'Ostervik', '#0f766e', '#ffffff'], ['BEL', 'Belcastro', '#991b1b', '#fef3c7'],
  ['GRY', 'Greyhaven', '#6b7280', '#ffffff'], ['POR', 'Portalegre', '#15803d', '#fde047'], ['ZEN', 'Zenburg', '#1e3a8a', '#fbbf24'],
  ['FAL', 'Falkenrode', '#b91c1c', '#000000'], ['SOL', 'Solmara', '#ca8a04', '#1f2937'], ['DUN', 'Dunmore', '#334155', '#93c5fd'],
  ['ELM', 'Elmstead', '#065f46', '#ecfccb'], ['QUA', 'Quaresma', '#9333ea', '#fef9c3'], ['TOR', 'Torvalla', '#dc2626', '#1e40af'],
  ['WES', 'Westcliffe', '#0369a1', '#f8fafc'], ['MAR', 'Marisol', '#f43f5e', '#ffffff'], ['IRV', 'Irvaldo', '#57534e', '#facc15'],
  ['CRN', 'Crownfield', '#4338ca', '#ffffff'], ['BRA', 'Bramwell', '#a16207', '#ffffff'], ['NOV', 'Novaro', '#be123c', '#e0f2fe'],
  ['HEL', 'Helmsdale', '#0e7490', '#fef08a'], ['PAL', 'Palmerino', '#166534', '#ffffff'], ['ARD', 'Ardentia', '#7f1d1d', '#d6d3d1'],
];
const COMPS = ['DEMO PREMIER', 'DEMO LIGA', 'DEMO BUNDES', 'DEMO SERIE', 'DEMO LIGUE', 'DEMO CHAMPIONS CUP'];
const FORM = [[0.04, 0.5], [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85], [0.42, 0.2], [0.42, 0.4], [0.42, 0.6], [0.42, 0.8], [0.62, 0.35], [0.62, 0.65]];
const rnd = (a, b) => a + Math.random() * (b - a);

function newMatch(i) {
  const h = (i * 2) % CLUBS.length, a = (i * 2 + 1 + Math.floor(Math.random() * 3) * 2) % CLUBS.length;
  return {
    home: CLUBS[h], away: CLUBS[a === h ? (a + 1) % CLUBS.length : a], comp: COMPS[i % COMPS.length],
    minute: rnd(1, 80), hs: Math.floor(rnd(0, 2.4)), as: Math.floor(rnd(0, 2)),
    ball: { x: 0.5, y: 0.5 }, target: { x: 0.5, y: 0.5 }, retarget: 0, goalFlash: 0, ft: 0,
  };
}
const matches = Array.from({ length: BC.MATCHES }, (_, i) => newMatch(i));
const MIN_PER_SEC = 0.25; // demo clock: 1 match minute every 4 s

function stepMatch(m, dt, i) {
  if (m.ft > 0) { m.ft -= dt; if (m.ft <= 0) Object.assign(m, newMatch(Math.floor(rnd(0, 99)))); return; }
  m.minute += dt * MIN_PER_SEC;
  if (m.minute >= 94) { m.ft = 12; return; }
  m.retarget -= dt;
  if (m.retarget <= 0) { m.target = { x: rnd(0.08, 0.92), y: rnd(0.1, 0.9) }; m.retarget = rnd(0.8, 2.2); }
  m.ball.x += (m.target.x - m.ball.x) * Math.min(1, dt * 1.8);
  m.ball.y += (m.target.y - m.ball.y) * Math.min(1, dt * 1.8);
  if (Math.random() < dt * MIN_PER_SEC * (2.7 / 90)) {
    const side = Math.random() < 0.55 ? 'home' : 'away';
    side === 'home' ? m.hs++ : m.as++;
    m.goalFlash = 3;
    emit({ type: 'goal', match: i, side, score: `${m.home[0]} ${m.hs}-${m.as} ${m.away[0]}` });
  }
  m.goalFlash = Math.max(0, m.goalFlash - dt);
}
const clock = (m) => (m.ft > 0 ? 'FT' : m.minute >= 45 && m.minute < 46 ? 'HT' : `${String(Math.floor(m.minute)).padStart(2, '0')}:${String(Math.floor((m.minute % 1) * 60)).padStart(2, '0')}`);

// broadcast-camera pitch: trapezoid, far touchline narrower
function pitchXY(x0, y0, u, v) {
  const top = y0 + 52, bot = y0 + CH_ - 12;
  const y = top + (bot - top) * v;
  const half = 140 + 50 * v;
  return [x0 + CW / 2 + (u - 0.5) * 2 * half, y];
}

function drawMatch(m, cx, cy) {
  g.fillStyle = '#0b1220'; g.fillRect(cx, cy, CW, CH_);
  // pitch with mowing stripes
  for (let s = 0; s < 10; s++) {
    const [ax, ay] = pitchXY(cx, cy, s / 10, 0), [bx] = pitchXY(cx, cy, (s + 1) / 10, 0);
    const [dx, dy] = pitchXY(cx, cy, s / 10, 1), [ex] = pitchXY(cx, cy, (s + 1) / 10, 1);
    g.fillStyle = s % 2 ? '#2f8f3f' : '#36a047';
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, ay); g.lineTo(ex, dy); g.lineTo(dx, dy); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5;
  const L = (u1, v1, u2, v2) => { const [a, b] = pitchXY(cx, cy, u1, v1), [c, d] = pitchXY(cx, cy, u2, v2); g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
  L(0, 0, 1, 0); L(1, 0, 1, 1); L(1, 1, 0, 1); L(0, 1, 0, 0); L(0.5, 0, 0.5, 1);
  L(0, 0.25, 0.14, 0.25); L(0.14, 0.25, 0.14, 0.75); L(0.14, 0.75, 0, 0.75);
  L(1, 0.25, 0.86, 0.25); L(0.86, 0.25, 0.86, 0.75); L(0.86, 0.75, 1, 0.75);
  const [ccx, ccy] = pitchXY(cx, cy, 0.5, 0.5);
  g.beginPath(); g.ellipse(ccx, ccy, 22, 13, 0, 0, Math.PI * 2); g.stroke();
  // players drift toward the ball around their formation slots
  const pull = 0.35;
  for (const [team, kit, flip] of [[m.home, m.home[2], false], [m.away, m.away[2], true]]) {
    g.fillStyle = kit;
    FORM.forEach(([fu, fv], k) => {
      let u = flip ? 1 - fu : fu;
      let v = fv;
      if (k) { u += (m.ball.x - 0.5) * pull + Math.sin(performance.now() / 700 + k) * 0.01; v += (m.ball.y - v) * 0.25; }
      const [px, py] = pitchXY(cx, cy, u, v);
      g.beginPath(); g.arc(px, py, 3 + 1.5 * v, 0, Math.PI * 2); g.fill();
    });
  }
  const [bx, by] = pitchXY(cx, cy, m.ball.x, m.ball.y);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 2.4, 0, Math.PI * 2); g.fill();
  // live scoreboard bug
  g.fillStyle = 'rgba(8,12,24,0.92)'; g.fillRect(cx + 8, cy + 8, 236, 32);
  g.fillStyle = m.home[2]; g.fillRect(cx + 8, cy + 8, 6, 32);
  g.fillStyle = m.away[2]; g.fillRect(cx + 132, cy + 8, 6, 32);
  g.font = 'bold 18px sans-serif'; g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.fillText(`${m.home[0]}  ${m.hs}`, cx + 20, cy + 25);
  g.fillText(`${m.as}  ${m.away[0]}`, cx + 144, cy + 25);
  g.fillStyle = '#ffc65a'; g.fillRect(cx + 196, cy + 8, 48, 32);
  g.fillStyle = '#111'; g.font = 'bold 15px monospace'; g.fillText(clock(m), cx + 200, cy + 25);
  g.fillStyle = '#e11d48'; g.fillRect(cx + CW - 52, cy + 10, 44, 18);
  g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText(m.ft > 0 ? 'FULL' : 'LIVE', cx + CW - 46, cy + 19);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '11px sans-serif'; g.fillText(`${m.comp} · SIMULATED`, cx + 10, cy + CH_ - 6);
  if (m.goalFlash > 0 && Math.floor(m.goalFlash * 4) % 2) {
    g.fillStyle = 'rgba(255,198,90,0.9)'; g.fillRect(cx + 110, cy + 90, 164, 40);
    g.fillStyle = '#111'; g.font = 'bold 28px sans-serif'; g.fillText('GOAL!', cx + 150, cy + 110);
  }
  g.textBaseline = 'alphabetic';
}

// ------------------------------------------------------------ simulated F1 Grand Prix + live timing
// 20 cars / 10 teams (fictional names, real-style), a 57-lap race on a demo clock (1 lap ≈ 3 s).
// Each car has its own pace, lap-to-lap noise, tyre wear and one pit stop; positions come from the
// cumulative race time, gaps are shown in race seconds like a real timing tower.
const TEAMS = [
  ['Meridian', '#00a19c'], ['Scarlatti', '#dc0000'], ['Vortex', '#1e41ff'], ['Arrowline', '#ff8700'], ['Kestrel', '#006f62'],
  ['Halcyon', '#0090ff'], ['Nordhaus', '#b6babd'], ['Solano', '#2b4562'], ['Bravura', '#52e252'], ['Corsair', '#ff2e8a'],
];
const DRIVERS = [
  ['VAL', 'Valenti'], ['HAR', 'Hartmann'], ['DEL', 'Delacroix'], ['OKO', 'Okonkwo'], ['SAN', 'Sandoval'], ['LIN', 'Lindqvist'],
  ['MOR', 'Moreau'], ['TAK', 'Takeda'], ['RAS', 'Rasmussen'], ['FER', 'Ferreira'], ['KOV', 'Kovac'], ['BRE', 'Brennan'],
  ['ALM', 'Almeida'], ['PET', 'Petrov'], ['GAR', 'Garrido'], ['HOL', 'Holloway'], ['NAK', 'Nakamura'], ['VOS', 'Vos'],
  ['RIC', 'Ricci'], ['ABE', 'Abernathy'],
];
const TYRES = { S: '#ff3b3b', M: '#ffd400', H: '#f2f2f2' };
const LAPS = 57, LAP_BASE = 92, SIM_LAP_SEC = 3; // real-time seconds of race per demo second = LAP_BASE / SIM_LAP_SEC
const GP_NAMES = ['SOLMARA', 'CASTELLANA', 'NORTHBRIDGE', 'VALMIRA', 'KINGSMERE', 'PORTALEGRE'];
// circuit outline (normalised), arc-length parametrised for the car dots
const TRACK = [[0.10, 0.70], [0.10, 0.35], [0.20, 0.18], [0.42, 0.14], [0.52, 0.30], [0.66, 0.22], [0.86, 0.20], [0.92, 0.38],
  [0.80, 0.52], [0.88, 0.70], [0.78, 0.86], [0.52, 0.84], [0.40, 0.66], [0.24, 0.86], [0.12, 0.84]];
const SEG = TRACK.map((p, i) => { const q = TRACK[(i + 1) % TRACK.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
const TRACK_LEN = SEG.reduce((a, b) => a + b, 0);
function trackAt(f) {
  let d = (((f % 1) + 1) % 1) * TRACK_LEN;
  for (let i = 0; i < TRACK.length; i++) {
    if (d <= SEG[i]) { const p = TRACK[i], q = TRACK[(i + 1) % TRACK.length], t = d / SEG[i]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
    d -= SEG[i];
  }
  return TRACK[0];
}

let race = null;
function newRace() {
  const order = DRIVERS.map((d, i) => i).sort(() => Math.random() - 0.5);
  return {
    no: Math.floor(rnd(1, 24)), name: GP_NAMES[Math.floor(rnd(0, GP_NAMES.length))], t: 0, done: 0, fastest: null,
    cars: order.map((di, grid) => {
      const team = TEAMS[Math.floor(di / 2)];
      return { code: DRIVERS[di][0], name: DRIVERS[di][1], team: team[0], col: team[1], no: di + 1,
        pace: LAP_BASE - 1.6 + (di % 2 ? 0.25 : 0) + Math.floor(di / 2) * 0.12 + rnd(-0.3, 0.3), // team strength + driver
        time: grid * 0.35, lap: 0, frac: -grid * 0.004, tyre: Math.random() < 0.6 ? 'M' : 'S', age: 0, pitLap: Math.floor(rnd(18, 34)), pitted: false, last: null, out: false };
    }),
  };
}
const lapTime = (c) => c.pace + c.age * (c.tyre === 'S' ? 0.07 : c.tyre === 'M' ? 0.045 : 0.03) + (c.tyre === 'S' ? -0.6 : c.tyre === 'H' ? 0.5 : 0) + rnd(-0.35, 0.35);
race = newRace();
race.cars.forEach((c) => { c.cur = lapTime(c); }); // so gaps are defined before the first lap completes
function stepRace(dt) {
  if (race.done > 0) { race.done -= dt; if (race.done <= 0) { race = newRace(); race.cars.forEach((c) => { c.cur = lapTime(c); }); } return; }
  race.t += dt;
  for (const c of race.cars) {
    if (c.lap >= LAPS) continue;
    c.frac += dt * (LAP_BASE / SIM_LAP_SEC) / c.cur;
    if (c.frac >= 1) { // completed a lap
      c.frac -= 1; c.lap++; c.age++;
      let lt = c.cur;
      if (!c.pitted && c.lap === c.pitLap) { lt += 21.5 + rnd(0, 2); c.pitted = true; c.tyre = c.tyre === 'S' ? 'M' : 'H'; c.age = 0; c.pit = 3; }
      c.time += lt; c.last = lt;
      if (!race.fastest || lt < race.fastest.t) race.fastest = { code: c.code, t: lt };
      c.cur = lapTime(c);
    }
    c.pit = Math.max(0, (c.pit || 0) - dt);
  }
  if (race.cars.every((c) => c.lap >= LAPS)) {
    race.done = 12;
    const win = [...race.cars].sort((a, b) => a.time - b.time)[0];
    emit({ type: 'race', winner: win.no, name: win.code });
  }
}
// running order: more laps first, then less elapsed race time (projected through the current lap)
const raceOrder = () => [...race.cars].sort((a, b) => (b.lap + b.frac) - (a.lap + a.frac) || a.time - b.time);
const fmtLap = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
function drawRace(cx, cy) {
  g.fillStyle = '#0d0f14'; g.fillRect(cx, cy, CW, CH_);
  const order = raceOrder(), lead = order[0];
  const leadLap = Math.min(LAPS, lead.lap + 1);
  // header
  g.fillStyle = '#e10600'; g.fillRect(cx, cy, CW, 22);
  g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textBaseline = 'middle';
  g.fillText(`F1 · ${race.name} GP`, cx + 8, cy + 11);
  g.fillText(race.done > 0 ? 'CHEQUERED FLAG' : `LAP ${leadLap}/${LAPS}`, cx + 270, cy + 11);
  // timing tower: top 10
  g.fillStyle = 'rgba(20,22,30,0.95)'; g.fillRect(cx + 4, cy + 26, 190, CH_ - 30);
  order.slice(0, 10).forEach((c, i) => {
    const y = cy + 36 + i * 17.2;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'; g.fillRect(cx + 6, y - 8, 186, 16);
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.fillText(String(i + 1).padStart(2, ' '), cx + 9, y);
    g.fillStyle = c.col; g.fillRect(cx + 26, y - 6, 3, 12);
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText(c.code, cx + 33, y);
    g.font = '11px monospace'; g.fillStyle = c.pit > 0 ? '#ffd400' : '#cfd3dc';
    const behind = (lead.lap + lead.frac) - (c.lap + c.frac);
    const gap = i === 0 ? (race.done > 0 ? 'WINNER' : 'LEADER') : c.pit > 0 ? 'IN PIT' : behind >= 1 ? `+${Math.floor(behind)} LAP` : `+${(behind * c.cur).toFixed(3)}`;
    g.fillText(gap, cx + 72, y);
    g.fillStyle = TYRES[c.tyre]; g.beginPath(); g.arc(cx + 176, y, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 8px sans-serif'; g.fillText(c.tyre, cx + 173, y + 1);
  });
  // circuit map with every car
  const mx = cx + 202, my = cy + 30, mw = 172, mh = 150;
  g.strokeStyle = '#3a3f4b'; g.lineWidth = 7; g.lineJoin = 'round';
  g.beginPath(); TRACK.forEach(([u, v], i) => (i ? g.lineTo(mx + u * mw, my + v * mh) : g.moveTo(mx + u * mw, my + v * mh))); g.closePath(); g.stroke();
  g.strokeStyle = '#6b7180'; g.lineWidth = 1.5; g.stroke();
  const [sx, sy] = trackAt(0); g.fillStyle = '#fff'; g.fillRect(mx + sx * mw - 6, my + sy * mh - 1, 12, 2); // start/finish
  for (const c of [...order].reverse()) {
    const [u, v] = trackAt(c.lap >= LAPS ? 0 : Math.max(0, c.frac));
    g.fillStyle = c.col; g.beginPath(); g.arc(mx + u * mw, my + v * mh, 3.6, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; const [lx, ly] = trackAt(Math.max(0, lead.frac));
  g.fillText(lead.code, mx + lx * mw + 6, my + ly * mh - 6);
  // fastest lap + footer
  g.fillStyle = '#a855f7'; g.font = 'bold 10px sans-serif';
  if (race.fastest) g.fillText(`FASTEST LAP ${race.fastest.code} ${fmtLap(race.fastest.t)}`, cx + 202, cy + CH_ - 22);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '10px sans-serif'; g.fillText('LIVE TIMING · SIMULATED', cx + 202, cy + CH_ - 8);
  g.fillStyle = '#e11d48'; g.fillRect(cx + CW - 50, cy + 28, 44, 16);
  g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.fillText(race.done > 0 ? 'RESULT' : 'LIVE', cx + CW - 44, cy + 36);
  g.textBaseline = 'alphabetic';
}

// ------------------------------------------------------------ live scores ticker
let tick = 0;
function drawScores(cx, cy) {
  g.fillStyle = '#060a14'; g.fillRect(cx, cy, CW, CH_);
  g.fillStyle = '#ffc65a'; g.font = 'bold 14px sans-serif'; g.fillText('LIVE SCORES', cx + 10, cy + 20);
  g.font = 'bold 13px monospace';
  const per = 9, start = Math.floor(tick / 3) % BC.MATCHES;
  for (let i = 0; i < per; i++) {
    const m = matches[(start + i) % BC.MATCHES];
    const y = cy + 42 + i * 19;
    g.fillStyle = m.goalFlash > 0 ? '#ffc65a' : '#e5e7eb';
    g.fillText(`${m.home[0]} ${m.hs}-${m.as} ${m.away[0]}`, cx + 10, y);
    g.fillStyle = '#9ca3af'; g.fillText(clock(m), cx + 150, y);
    g.fillStyle = '#6b7280'; g.fillText(m.comp.replace('DEMO ', ''), cx + 214, y);
  }
}

// Box position dashboards (shown under every box TV). Simulated stakes/prices.
function drawDash(d, cx, cy) {
  g.fillStyle = '#0a0f1c'; g.fillRect(cx, cy, CW, CH_);
  g.fillStyle = '#ffc65a'; g.font = 'bold 15px sans-serif'; g.fillText(`OPEN POSITIONS · DESK ${['A', 'B', 'C'][d]}`, cx + 10, cy + 22);
  g.fillStyle = '#6b7280'; g.font = '11px sans-serif'; g.fillText('MARKET            PRICE   STAKE    P&L', cx + 10, cy + 42);
  let total = 0;
  for (let j = 0; j < 6; j++) {
    const m = matches[(d * 5 + j * 2) % BC.MATCHES];
    const backHome = (d + j) % 2 === 0;
    const price = (backHome ? 1.6 + ((j * 0.37) % 1.4) : 2.1 + ((j * 0.29) % 1.6)) + Math.sin(tick / 7 + j) * 0.03;
    const stake = 1000 * (2 + ((d * 3 + j * 5) % 9));
    const lead = backHome ? m.hs - m.as : m.as - m.hs;
    const pnl = Math.round(lead > 0 ? stake * (price - 1) : lead < 0 ? -stake : stake * (price - 1) * 0.15 * Math.sin(tick / 9 + j));
    total += pnl;
    const y = cy + 62 + j * 21;
    g.font = 'bold 12px monospace';
    g.fillStyle = '#e5e7eb'; g.fillText(`${m.home[0]}-${m.away[0]} ${backHome ? 'HOME' : 'AWAY'}`, cx + 10, y);
    g.fillStyle = '#93c5fd'; g.fillText(price.toFixed(2), cx + 150, y);
    g.fillStyle = '#d1d5db'; g.fillText(stake.toLocaleString(), cx + 200, y);
    g.fillStyle = pnl >= 0 ? '#3dff7a' : '#ff4d5e'; g.fillText(`${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}`, cx + 270, y);
  }
  g.fillStyle = total >= 0 ? '#3dff7a' : '#ff4d5e'; g.font = 'bold 14px monospace';
  g.fillText(`NET ${total >= 0 ? '+' : ''}${total.toLocaleString()}`, cx + 230, cy + 22);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '10px sans-serif'; g.fillText('NOTIONAL · SIMULATED', cx + 10, cy + CH_ - 6);
}

function drawAll() {
  tick++;
  matches.forEach((m, i) => drawMatch(m, (i % COLS) * CW, Math.floor(i / COLS) * CH_));
  drawRace((BC.RACE % COLS) * CW, Math.floor(BC.RACE / COLS) * CH_);
  drawScores((BC.SCORES % COLS) * CW, Math.floor(BC.SCORES / COLS) * CH_);
  for (let d = 0; d < BC.DASHES; d++) drawDash(d, ((BC.DASH + d) % COLS) * CW, Math.floor((BC.DASH + d) / COLS) * CH_);
  bcTexture.needsUpdate = true;
}
drawAll();

// Simulation always runs (cheap); drawing + texture upload only while the arena is on screen.
let acc = 0;
export function updateBroadcast(dt, visible) {
  matches.forEach((m, i) => stepMatch(m, dt, i));
  stepRace(dt);
  if (!visible) return;
  acc += dt;
  if (acc >= 0.2) { acc = 0; drawAll(); } // 5 Hz
}
export const broadcastState = () => ({ matches: matches.map((m) => `${m.home[0]} ${m.hs}-${m.as} ${m.away[0]} ${clock(m)}`), race: { gp: race.name, lap: Math.min(LAPS, raceOrder()[0].lap + 1), laps: LAPS, top: raceOrder().slice(0, 6).map((c) => c.code), fastest: race.fastest && race.fastest.code } });

// Instanced screens that sample this atlas (per-instance cell offset).
const bcMaterial = new THREE.MeshBasicMaterial({ map: bcTexture, toneMapped: false });
bcMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${1 / COLS}, ${1 / ROWS}) + cellOffset;\n#endif`);
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// items: {x,y,z,yaw,w,h,cell}
export function buildBroadcastScreens(items) {
  return chunked(items, 40, (list) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const offs = new Float32Array(list.length * 2);
    list.forEach((s, i) => { offs[i * 2] = (s.cell % COLS) / COLS; offs[i * 2 + 1] = 1 - (Math.floor(s.cell / COLS) + 1) / ROWS; });
    geo.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(offs, 2));
    const mesh = new THREE.InstancedMesh(geo, bcMaterial, list.length);
    list.forEach((s, i) => { _q.setFromAxisAngle(_up, s.yaw); _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1)); mesh.setMatrixAt(i, _m); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  });
}

// Non-instanced mesh of any shape showing one cell (e.g. the round ceiling screen).
export function broadcastMesh(geometry, cell) {
  const n = geometry.attributes.position.count;
  const offs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { offs[i * 2] = (cell % COLS) / COLS; offs[i * 2 + 1] = 1 - (Math.floor(cell / COLS) + 1) / ROWS; }
  geometry.setAttribute('cellOffset', new THREE.BufferAttribute(offs, 2));
  return new THREE.Mesh(geometry, bcMaterial);
}
