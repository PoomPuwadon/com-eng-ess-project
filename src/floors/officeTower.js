import * as THREE from 'three';
import { CH, tickerMaterial } from '../world/screens.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Office Tower: X -110..-30. The lift hall is the strip X -50..-30; main spaces are X -110..-50.
// Everything here is in world coordinates except control() (old tower coords, shifted +30).
const DESK = 0x5a4632, SUIT = 0x1f2a44, SCREENCASE = 0x111111, GOLD = 0xc9a23a;
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a)); // screen facing away from a centre

function deskRows(ctx, x0, x1, z0, z1, { pitchX = 2, pitchZ = 5, channels = [CH.TICKER, CH.CHART], npcEvery = 3, aisleX = null } = {}) {
  let n = 0;
  for (let zz = z0; zz <= z1; zz += pitchZ) {
    for (let x = x0; x <= x1; x += pitchX) {
      if (aisleX != null && Math.abs(x - aisleX) < 3) continue;
      ctx.box(x - 0.8, x + 0.8, 0, 0.75, zz - 0.45, zz + 0.45, DESK);
      ctx.deco(x - 0.8, x + 0.8, 0.75, 1.3, zz - 0.42, zz - 0.36, SCREENCASE);
      ctx.screen(x - 0.4, 1.05, zz - 0.35, 0, 0.75, 0.45, channels[n % channels.length]);
      ctx.screen(x + 0.4, 1.05, zz - 0.35, 0, 0.75, 0.45, channels[(n + 1) % channels.length]);
      if (n % npcEvery === 0) ctx.npc(x, zz + 1.0, SUIT, Math.PI);
      n++;
    }
  }
  return n;
}

// OT-01 Trading Floor: Phase 1, see tradingFloor.js

// ---------------------------------------------------------------- OT-03 / OT-04 department floors
// Open plan behind the lift hall portal (X -109..-50.5); a clear aisle runs west from the portal.
export function department(ctx) {
  const id = ctx.floor.id;
  const I = { x0: -109, x1: -50.5, z0: -39, z1: 39 };
  if (id === 'OT-04') {
    // Asset Protection HQ: CCTV desks (north), lockers, roll-call benches + standing guards (south)
    deskRows(ctx, -104, -56, -32, -10, { pitchX: 2.4, pitchZ: 5.5, channels: [CH.SCORE, CH.TICKER], npcEvery: 2, aisleX: -80 });
    for (let i = 0; i < 16; i++) { const x = I.x0 + 2 + i * 3.4; ctx.box(x, x + 2, 0, 2.2, I.z0 + 0.2, I.z0 + 1.2, 0x3b4048); }
    for (let i = 0; i < 5; i++) ctx.box(-100, -62, 0, 0.5, 12 + i * 4, 12.8 + i * 4, 0x555);
    for (let i = 0; i < 30; i++) ctx.npc(-96 + (i % 10) * 3.6, 33 + Math.floor(i / 10) * 1.6, 0x050505, Math.PI);
    for (let i = 0; i < 8; i++) ctx.screen(-105 + i * 7, 2.8, I.z1 + 0.1, Math.PI, 6, 2.5, i % 8);
    ctx.sign('Roll-call assembly area', -81, 3.6, 22, { size: 0.8, gold: false });
  } else {
    const ch = [CH.FIGHT, CH.LOTTO, CH.RACE];
    deskRows(ctx, -105, -56, -33, -6, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    deskRows(ctx, -105, -56, 6, 33, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z0 - 0.1, 0, 6, 2.6, ch[i % 3]);
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z1 + 0.1, Math.PI, 6, 2.6, ch[(i + 1) % 3]);
  }
}

// ---------------------------------------------------------------- OT-02 Probability Research Institute
// Thai lottery run like a quant shop: rows of quants at triple monitors, walls of equations,
// probability heat-maps and "predictive models" — all dead serious. X -109..-50.5, 10 m tall.
let eqTex = null;
function equationTexture() {
  if (eqTex) return eqTex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f8f8f4'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#1b2a6b'; g.font = 'italic 34px Georgia, serif';
  const eqs = ['P(N=n) = 1/10⁶', 'E[R] = Σ pᵢ·vᵢ = 0.60', 'σ² = E[X²] − μ²', '∂L/∂θ = 0 (vibes)', 'H = −Σ p log p',
    'P(last2 | moon) ≈ 0.01', 'β = Cov(r, lotto)/Var', 'lim n→∞ hope = 0', 'Bayes: P(A|B)P(B)=P(B|A)P(A)', '6,000,000 × 10⁻⁶'];
  eqs.forEach((t, i) => g.fillText(t, 30 + (i % 2) * 500, 60 + Math.floor(i / 2) * 95));
  eqTex = new THREE.CanvasTexture(c);
  eqTex.colorSpace = THREE.SRGBColorSpace;
  return eqTex;
}
export function lottery(ctx) {
  const e = ctx.e;
  ctx.deco(-109, -50.5, 0.012, 0.025, -39, 39, 0xdfe5ec);
  let quants = 0;
  for (let zz = -32; zz <= 32; zz += 5) {
    if (Math.abs(zz) < 4) continue; // aisle from the lift hall portal
    for (let x = -103; x <= -57; x += 3.3) {
      ctx.box(x - 1.3, x + 1.3, 0, 0.75, zz - 0.5, zz + 0.5, 0x444b55);
      for (let k = -1; k <= 1; k++) ctx.screen(x + k * 0.8, 1.15, zz - 0.4, 0, 0.75, 0.5, [CH.LOTTO, CH.CHART, CH.LOTTO][k + 1]);
      ctx.npc(x, zz + 1.0, 0x2b3a55, Math.PI);
      quants++;
    }
  }
  const mat = new THREE.MeshBasicMaterial({ map: equationTexture() });
  for (const [x, zz, yaw, w] of [[-108.9, 0, Math.PI / 2, 70], [-80, -38.9, 0, 54]]) {
    const g = new THREE.PlaneGeometry(w, 6);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, e + 5, zz); m.rotation.y = yaw;
    ctx.add(m, g);
  }
  ctx.screen(-88, 5.4, 38.9, Math.PI, 34, 6.5, CH.LOTTO); // draw results wall
  // probability heat-map (south wall, east end)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
    const v = Math.abs(Math.sin(i * 1.7 + j * 2.3));
    ctx.deco(-68 + i * 1.5, -66.6 + i * 1.5, 2.5 + j * 1.1, 3.5 + j * 1.1, 38.85, 38.95, v > 0.8 ? 0xd62839 : v > 0.55 ? 0xf28c28 : v > 0.3 ? 0xf6d55c : 0x3d8fd6);
  }
  ctx.sign('Probability Heat-Map — last two digits', -61, 9.4, 38.4, { size: 0.6, gold: false });
  // free-standing whiteboards along the aisle
  for (const x of [-96, -82, -68]) for (const zz of [-3.6, 3.6]) ctx.box(x - 2, x + 2, 0.6, 2.6, zz - 0.05, zz + 0.05, 0xffffff, { collide: false });
  ctx.sign(`${quants} quants · 1 lottery · 0 doubts`, -80, 7.6, 0, { size: 1.0, gold: false });
  ctx.sign('Next draw: 1st & 16th · Results: Government Lottery Office (placeholder)', -88, 9.2, 38.4, { size: 0.6, gold: false });
}

// ---------------------------------------------------------------- OT-05 Executive Floor (old tower coords, shifted +30)
export function control(ctx) {
  // CEO office
  ctx.box(-130, -122, 0, 0.8, 30, 33, 0x3b2414);
  ctx.box(-127, -125, 0, 1.4, 34, 35, 0x111);
  ctx.npc(-126, 34.5, 0xc9a23a, 0); // the one and only CEO marker (gold)
  ctx.screen(-125.5, 3, 37.6, Math.PI, 10, 3.5, CH.PNL);
  // boardroom table
  ctx.box(-104, -86, 0, 0.8, 28, 33, 0x3b2414);
  for (let i = 0; i < 7; i++) { ctx.npc(-102 + i * 2.6, 26.8, 0x1f2a44, 0); ctx.npc(-102 + i * 2.6, 34.2, 0x1f2a44, Math.PI); }
  // CFO desk (CFO office: world X -62..-52, Z -38..-26)
  ctx.box(-89, -83, 0, 0.8, -33, -31, 0x3b2414); ctx.npc(-86, -34.5, 0x1f2a44, 0);
  // legal / IT / HR desks
  for (const [zz, c] of [[-31, 0x1f2a44], [-12, 0x2f4f2f], [6, 0x4f2f4f]]) {
    for (let i = 0; i < 3; i++) { ctx.box(-135 + i * 6, -131 + i * 6, 0, 0.75, zz - 1, zz + 1, 0x5a4632); ctx.npc(-133 + i * 6, zz + 2, c, Math.PI); }
  }
  ctx.box(-126, -120, 0, 3, 9, 13.7, 0xcccccc); // HR exit-interview booth
  ctx.sign('Exit Interview', -123, 3.6, 8.5, { size: 0.5, gold: false });
  // security monitoring: wall of camera feeds (4 x 8, shared channels)
  for (let rr = 0; rr < 4; rr++) for (let c = 0; c < 8; c++) ctx.screen(-112.4 + c * 2.15, 1 + rr * 1.1, -37.55, 0, 2.0, 1.0, (rr * 8 + c) % 8);
  for (let i = 0; i < 4; i++) ctx.npc(-110 + i * 4, -31, 0x050505, 0);
  // cigar lounge bar
  ctx.box(-112, -96, 0, 1.15, -10, -9, 0x3b2414);
  for (let i = 0; i < 4; i++) ctx.box(-111 + i * 4, -109 + i * 4, 0, 0.5, -19, -16, 0x6b2b1b);
  // master dashboards wall
  [-112, -108.5, -105, -98, -94.5, -91].forEach((x, i) => ctx.screen(x, 3.2, -1.6, 0, 3.2, 2.2, [CH.PNL, CH.CHART, CH.ODDS, CH.SCORE, CH.FIGHT, CH.LOTTO][i])); // door kept clear
  // trophy & art wall
  ctx.box(-113, -98, 0, 4.5, 20.5, 21, 0x2b1d4a);
  for (let i = 0; i < 6; i++) ctx.deco(-111 + i * 2.2, -110.4 + i * 2.2, 1, 2.2 + (i % 3) * 0.4, 20.1, 20.5, GOLD);
}
