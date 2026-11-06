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
  // (OT-04 Asset Protection HQ has its own builder since the 2026-11-06 redesign: securityHQ.js)
  if (id) {
    const ch = [CH.FIGHT, CH.LOTTO, CH.RACE];
    deskRows(ctx, -105, -56, -33, -6, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    deskRows(ctx, -105, -56, 6, 33, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z0 - 0.1, 0, 6, 2.6, ch[i % 3]);
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z1 + 0.1, Math.PI, 6, 2.6, ch[(i + 1) % 3]);
  }
}

// OT-02 Probability Research Institute: see probability.js

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

// ---------------------------------------------------------------- OT-03 Global Client Outreach Centre
// Greybox from the user's reference images (2026-11-06). The floor slab (52 m) is only the lift
// hall: the whole main space (X -109..-50, Z -39..39) is a pit sunk 15 m. From the portal a bridge
// (Z -6..6) runs straight onto the TOP tier of a four-level operator structure standing in the pit:
// tiers at 0 / -5 / -10 and the pit floor at -15, linked by zig-zag stairs down its east face
// (mirrored north and south of the bridge). A Liquidity Transfer Core rises through the central void
// to a four-sided Global Outreach Status screen under the ceiling. All y are relative to 52 m.
export function outreach(ctx) {
  const TW = { x0: -100, x1: -62, z0: -26, z1: 26 }; // the structure's footprint
  const VOID = { x0: -88, x1: -74, z0: -9, z1: 9 }; // atrium through every tier
  const PIT = { x0: -109, x1: -50, z0: -39, z1: 39, y: -15 };
  const TIERS = [0, -5, -10]; // walkable plates (the pit floor is the fourth level)
  const BW = 6; // bridge half-width (matches the 12 m portal)
  const A = [-62, -59], B = [-59, -56]; // stair columns hanging off the east face
  const RISE = 0.25, TREAD = 7 / 19, N = 20; // 20 risers = 5 m per flight, 19 treads = 7 m run
  const NEON = [0x2fe0e0, 0xff3fb4, 0x5a7bff, 0xffa53f];
  const OP = 0x26324a, DESKC = 0x3a4252, SLAB = 0x3a4150, COL = 0x4a5163;
  const DARK = { gold: false, bg: 'rgba(10,30,40,0.92)', color: '#2fe0e0' };
  const HOT = { gold: false, bg: 'rgba(40,12,30,0.92)', color: '#ff7ad0' };
  const rail = (x0, x1, z0, z1, y) => ctx.glassBox(x0, x1, y, y + 1.1, z0, z1, 0xbfe6ff, true);
  // run of rail along one edge with gaps [[a, b], ...]
  const railRun = (axis, a0, a1, fixed0, fixed1, y, gaps = []) => {
    let cur = a0;
    for (const [ga, gb] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[a1, a1]])) {
      if (ga - cur > 0.05) axis === 'x' ? rail(cur, ga, fixed0, fixed1, y) : rail(fixed0, fixed1, cur, ga, y);
      cur = Math.max(cur, gb);
    }
  };

  // ---- the pit: floor, walls (the shell only builds walls above 52 m), and its dressing
  ctx.box(PIT.x0, PIT.x1, PIT.y - 0.3, PIT.y, PIT.z0, PIT.z1, 0x20252f);
  for (const [x0, x1, z0, z1] of [[-110, -50, -40, -39], [-110, -50, 39, 40], [-110, -109, -39, 39], [-50.5, -50, -39, 39]]) ctx.box(x0, x1, PIT.y, 0, z0, z1, 0x2c3240);
  ctx.deco(-50.5, -50, -0.4, 0, -39, 39, 0x2fe0e0); // neon lip round the pit edge under the hall
  for (const [x0, x1, z0, z1] of [[-109, -50.5, -39, -38.6], [-109, -50.5, 38.6, 39]]) ctx.deco(x0, x1, -0.4, 0, z0, z1, 0x2fe0e0);
  ctx.deco(-109, -108.6, -0.4, 0, -39, 39, 0x2fe0e0);

  // ---- the arrival bridge: portal (X -50) -> top tier (X -62)
  ctx.box(-62, -50, -0.3, 0, -BW, BW, 0x30384a);
  for (const zz of [-BW, BW]) ctx.deco(-62, -50, -0.36, -0.3, zz - 0.1, zz + 0.1, 0x2fe0e0);
  railRun('x', -62, -50, BW - 0.12, BW, 0, [A]); // stair gaps on both sides of the bridge
  railRun('x', -62, -50, -BW, -BW + 0.12, 0, [A]);

  // ---- the tiers: slabs with the central void, neon fascias, rails, columns
  TIERS.forEach((y, k) => {
    for (const rc of [
      { x0: TW.x0, x1: TW.x1, z0: TW.z0, z1: VOID.z0 }, { x0: TW.x0, x1: TW.x1, z0: VOID.z1, z1: TW.z1 },
      { x0: TW.x0, x1: VOID.x0, z0: VOID.z0, z1: VOID.z1 }, { x0: VOID.x1, x1: TW.x1, z0: VOID.z0, z1: VOID.z1 },
    ]) ctx.box(rc.x0, rc.x1, y - 0.4, y, rc.z0, rc.z1, SLAB);
    const c = NEON[k % NEON.length];
    ctx.deco(TW.x1, TW.x1 + 0.08, y - 0.4, y - 0.1, TW.z0, TW.z1, c); // east fascia
    ctx.deco(TW.x0 - 0.08, TW.x0, y - 0.4, y - 0.1, TW.z0, TW.z1, c);
    for (const zz of [TW.z0 - 0.08, TW.z1]) ctx.deco(TW.x0, TW.x1, y - 0.4, y - 0.1, zz, zz + 0.08, c);
    // edge rails: east edge open at the bridge (top) or at the stair landings (lower tiers)
    const eastGaps = y === 0 ? [[-BW, BW]] : y === -5 ? [[13, 16], [-16, -13]] : [[3, 6], [-6, -3]];
    railRun('z', TW.z0, TW.z1, TW.x1 - 0.12, TW.x1, y, eastGaps);
    railRun('z', TW.z0, TW.z1, TW.x0, TW.x0 + 0.12, y);
    railRun('x', TW.x0, TW.x1, TW.z0, TW.z0 + 0.12, y);
    railRun('x', TW.x0, TW.x1, TW.z1 - 0.12, TW.z1, y);
    // round the void
    railRun('x', VOID.x0, VOID.x1, VOID.z0 - 0.12, VOID.z0, y);
    railRun('x', VOID.x0, VOID.x1, VOID.z1, VOID.z1 + 0.12, y);
    railRun('z', VOID.z0, VOID.z1, VOID.x0 - 0.12, VOID.x0, y);
    railRun('z', VOID.z0, VOID.z1, VOID.x1, VOID.x1 + 0.12, y);
    for (const zz of [VOID.z0, VOID.z1]) ctx.deco(VOID.x0, VOID.x1, y - 0.4, y - 0.1, zz - 0.04, zz + 0.04, 0xff3fb4);
  });
  for (const x of [TW.x0 + 0.5, -81, TW.x1 - 0.5]) for (const z of [TW.z0 + 0.5, TW.z1 - 0.5]) ctx.box(x - 0.4, x + 0.4, PIT.y, 5, z - 0.4, z + 0.4, COL);
  for (const z of [-16, 16]) for (const x of [TW.x0 + 0.5, TW.x1 - 0.5]) ctx.box(x - 0.4, x + 0.4, PIT.y, 5, z - 0.4, z + 0.4, COL);
  // crown: a canopy over the top tier (open over the void) with the floor name facing the portal
  for (const rc of [{ z0: TW.z0 - 1, z1: VOID.z0 }, { z0: VOID.z1, z1: TW.z1 + 1 }]) ctx.deco(TW.x0 - 1, TW.x1 + 1, 4.7, 5.0, rc.z0, rc.z1, 0x2a3140);
  for (const x of [TW.x0 - 1, TW.x1 + 1]) ctx.deco(Math.min(x, x + 0.1), Math.max(x, x + 0.1), 4.7, 5.0, VOID.z0, VOID.z1, 0x2a3140);
  ctx.deco(TW.x1 + 1, TW.x1 + 1.1, 4.7, 5.0, TW.z0 - 1, TW.z1 + 1, 0x2fe0e0);
  ctx.sign('GLOBAL CLIENT OUTREACH CENTRE', TW.x1 + 1.3, 6.1, 0, { size: 1.3, ...DARK });
  ctx.sign('REVENUE GENERATION', TW.x1 + 1.3, 6.0, -19, { size: 0.6, ...HOT });
  ctx.sign('GLOBAL FINANCE', TW.x1 + 1.3, 6.0, 19, { size: 0.6, ...HOT });

  // ---- zig-zag stairs down the east face, mirrored north (s = -1) and south (s = 1) of the bridge
  // F1 col A: tier 0 (z 6) -> tier -5 (z 13) · landing z 13..16 · F2 col B back to z 6 -> tier -10
  // · landing z 3..6 · F3 col A: z 6 -> pit floor (z 13)
  const flight = ([x0, x1], s, za, zb, yTop) => {
    const dir = Math.sign(zb - za);
    for (let i = 0; i < N; i++) {
      const top = yTop - (i + 1) * RISE;
      if (top <= yTop - 5 + 0.001) break; // the last riser lands on the landing / floor
      const a = s * (za + dir * i * TREAD), b = s * (za + dir * (i + 1) * TREAD);
      ctx.box(x0, x1, yTop - 5, top, Math.min(a, b), Math.max(a, b), 0x5a6275);
    }
    const z0 = s * za, z1 = s * zb;
    for (const x of [x0, x1 - 0.06]) ctx.deco(x, x + 0.06, yTop - 4.2, yTop - 4.1, Math.min(z0, z1), Math.max(z0, z1), 0x2fe0e0); // lit stringers
  };
  const landing = (za, zb, y, s) => {
    const a = s * za, b = s * zb;
    ctx.box(A[0], B[1], y - 0.3, y, Math.min(a, b), Math.max(a, b), SLAB);
    ctx.glassBox(B[1] - 0.12, B[1], y, y + 1.1, Math.min(a, b), Math.max(a, b), 0xbfe6ff, true); // outer rail
  };
  for (const s of [1, -1]) {
    flight(A, s, BW, BW + N * TREAD, 0);
    landing(13, 16, -5, s);
    flight(B, s, 13, 6, -5);
    landing(3, 6, -10, s);
    flight(A, s, 6, 13, -10);
    // tall glass panes along the flights: between the two stair columns, on the tower side and
    // outside column B (so nobody steps off a flight into the gap), and at the landings' far ends
    const [fz0, fz1] = s > 0 ? [6, 13] : [-13, -6];
    ctx.glassBox(A[1] - 0.06, A[1] + 0.06, PIT.y, 1.1, fz0, fz1, 0xbfe6ff, true);
    ctx.glassBox(A[0] - 0.12, A[0], PIT.y, 1.1, fz0, fz1, 0xbfe6ff, true);
    ctx.glassBox(B[1] - 0.12, B[1], -10, -3.9, fz0, fz1, 0xbfe6ff, true);
    ctx.glassBox(A[0], B[1], -5, -3.9, s * 16 - 0.06, s * 16 + 0.06, 0xbfe6ff, true);
    ctx.glassBox(A[0], B[1], -10, -8.9, s * 3 - 0.06, s * 3 + 0.06, 0xbfe6ff, true);
    for (const y of [-5, -10]) for (const zz of [3, 16]) ctx.box(B[1] - 0.4, B[1], PIT.y, y - 0.3, s * zz - 0.2, s * zz + 0.2, COL);
  }

  // ---- operators on every tier (+ glass manager offices on the top tier)
  let ops = 0;
  const deskOk = (x, z, y) => {
    if (x > VOID.x0 - 2.5 && x < VOID.x1 + 2.5 && z > VOID.z0 - 2.5 && z < VOID.z1 + 2.5) return false;
    if (y === 0 && Math.abs(z) < BW + 1.5 && x > VOID.x1) return false; // aisle from the bridge
    if (x > TW.x1 - 4 && Math.abs(z) > 1 && Math.abs(z) < 18) return false; // stair landings
    if (y === 0 && x < -91) return false; // managers' offices
    return x > TW.x0 + 1.5 && x < TW.x1 - 1.5 && z > TW.z0 + 1.5 && z < TW.z1 - 2;
  };
  for (const y of [...TIERS, PIT.y]) {
    const zs = y === PIT.y ? [] : [-23, -18, -13, 12, 17, 22, -4, 4];
    for (const zz of zs) for (let x = -97; x <= -65; x += 3.2) {
      if (!deskOk(x, zz, y)) continue;
      ctx.box(x - 1.3, x + 1.3, y, y + 0.75, zz - 0.5, zz + 0.5, DESKC);
      for (let k = -1; k <= 1; k++) ctx.screen(x + k * 0.8, y + 1.15, zz - 0.4, 0, 0.75, 0.5, [CH.CHART, CH.TICKER, CH.PNL][k + 1]);
      ctx.npc(x, zz + 1.0, OP, Math.PI, y);
      ops++;
    }
  }
  for (const [z0, z1] of [[-24, -12], [-6, 6], [12, 24]]) {
    const x0 = -99.5, x1 = -91.5, h = 3, cz = (z0 + z1) / 2;
    railRun('z', z0, z1, x1 - 0.1, x1, 0, [[cz - 1.2, cz + 1.2]]); // glass front with a doorway
    ctx.glassBox(x1 - 0.1, x1, 1.1, h, z0, z1, 0xbfe6ff, false);
    for (const zz of [z0, z1 - 0.1]) ctx.glassBox(x0, x1, 0, h, zz, zz + 0.1, 0xbfe6ff, true);
    ctx.box(x0 + 1.5, x0 + 2.5, 0, 0.75, cz - 1.6, cz + 1.6, 0x3b2414);
    ctx.screen(x0 + 2.6, 1.2, cz, Math.PI / 2, 1.4, 0.8, CH.PNL);
    ctx.npc(x0 + 0.8, cz, 0x111111, -Math.PI / 2);
  }
  ctx.sign('Senior Relationship Management', -95.5, 3.6, 0, { size: 0.6 });
  // level signs on the east face (clear of the bridge and the stairs)
  ctx.sign('CALL CENTRE 7 · CLIENT OUTREACH', TW.x1 + 0.3, -1.6, -20, { size: 0.7, ...HOT });
  ctx.sign('REMOTE DEVICE ASSISTANCE', TW.x1 + 0.3, -6.6, 20, { size: 0.7, ...DARK });
  ctx.sign('REVENUE GENERATION · LIQUIDITY OPERATIONS', TW.x1 + 0.3, -11.6, -20, { size: 0.7, ...HOT });

  // ---- pit floor: Liquidity Transfer Core through the void, server racks round the moat, desks
  ctx.box(-84, -78, PIT.y, 9.6, -3, 3, 0x3b4766);
  for (let y = PIT.y + 2; y < 9; y += 2.5) ctx.deco(-84.15, -77.85, y, y + 0.25, -3.15, 3.15, 0x2fe0e0);
  for (const [x, z, yaw] of [[-77.9, 0, Math.PI / 2], [-84.1, 0, -Math.PI / 2], [-81, 3.1, 0], [-81, -3.1, Math.PI]]) {
    for (const y of [PIT.y + 3, -7, -2]) ctx.screen(x, y, z, yaw, 2.8, 1.4, CH.PNL);
  }
  ctx.sign('LIQUIDITY TRANSFER IN PROGRESS', -77.6, 2.3, 0, { size: 0.6, ...DARK });
  // Global Outreach Status: four-sided screen round the top of the core, under the ceiling
  ctx.deco(-87, -75, 9.5, 9.75, -6, 6, 0x111111);
  for (const [x, z, yaw, w] of [[-74.9, 0, Math.PI / 2, 11.6], [-87.1, 0, -Math.PI / 2, 11.6], [-81, 6.1, 0, 11.6], [-81, -6.1, Math.PI, 11.6]]) {
    ctx.screen(x, 7.6, z, yaw, w, 3.2, CH.CHART);
  }
  ctx.deco(-87, -75, 5.9, 9.5, -6, 6, 0x111111);
  ctx.sign('GLOBAL OUTREACH STATUS', -74.6, 9.65, 0, { size: 0.55, ...DARK });
  // racks round the moat (north, south, west), cable runs on the pit floor towards the core
  for (const zz of [-37.5, 37.5]) for (let x = -106; x <= -54; x += 1.4) {
    ctx.box(x - 0.6, x + 0.6, PIT.y, PIT.y + 2.2, zz - 0.5, zz + 0.5, 0x15181f);
    ctx.deco(x - 0.5, x + 0.5, PIT.y + 0.4, PIT.y + 2.0, zz + (zz < 0 ? 0.5 : -0.52), zz + (zz < 0 ? 0.52 : -0.5), (x * 7) % 3 < 1 ? 0x2fe0e0 : 0x5a7bff);
  }
  for (let z = -34; z <= 34; z += 1.4) ctx.box(-108.5, -107.3, PIT.y, PIT.y + 2.2, z - 0.6, z + 0.6, 0x15181f);
  NEON.slice(0, 3).forEach((c, i) => {
    const o = (i - 1) * 0.5;
    ctx.deco(-62, -51, PIT.y + 0.01, PIT.y + 0.04, o - 0.15, o + 0.15, c);
    ctx.deco(-81 + o - 0.15, -81 + o + 0.15, PIT.y + 0.01, PIT.y + 0.04, -36, -26, c);
    ctx.deco(-81 + o - 0.15, -81 + o + 0.15, PIT.y + 0.01, PIT.y + 0.04, 26, 36, c);
    ctx.deco(-107, -100, PIT.y + 0.01, PIT.y + 0.04, o - 0.15, o + 0.15, c);
  });
  // moat desks (east side, under the bridge) and people milling about
  for (const zz of [-30, -22, 22, 30]) for (let x = -58; x <= -52; x += 3.2) {
    ctx.box(x - 1.3, x + 1.3, PIT.y, PIT.y + 0.75, zz - 0.5, zz + 0.5, DESKC);
    ctx.screen(x, PIT.y + 1.15, zz - 0.4, 0, 0.9, 0.55, CH.CHART);
    ctx.npc(x, zz + 1.0, OP, Math.PI, PIT.y); ops++;
  }
  for (let i = 0; i < 40; i++) {
    const t = (i * 0.618) % 1, side = i % 4; // people milling round the moat
    const [x, z] = side === 0 ? [-104 + t * 40, -31] : side === 1 ? [-104 + t * 40, 31] : side === 2 ? [-104, -24 + t * 48] : [-90 + t * 24, side === 3 && i % 8 === 3 ? -29 : 29];
    ctx.npc(x, z, [0x6b2b1b, 0x2f4f2f, 0x4f2f4f, 0x1f2a44][i % 4], i * 1.3, PIT.y);
  }
  // Operator Assistance booth at the foot of the south stairs
  ctx.box(-58, -53, PIT.y, PIT.y + 1.1, 18, 18.8, 0x2a3140);
  ctx.deco(-58.05, -52.95, PIT.y + 1.1, PIT.y + 1.16, 17.95, 18.85, 0x2fe0e0);
  ctx.npc(-55.5, 19.8, 0x1f2a44, Math.PI, PIT.y);
  ctx.sign('OPERATOR ASSISTANCE', -55.5, PIT.y + 2.4, 17.9, { size: 0.5, ...DARK });

  // ---- pit walls: the Client Journey board (north) and Top Closers (west), seen from the bridge
  ctx.deco(-100, -62, -13.8, -8.8, -38.9, -38.8, 0xf4f4f0);
  const stages = ['FIRST CONTACT', 'RAPPORT', 'OPPORTUNITY', 'URGENCY', 'ONBOARDING', 'LIQUIDITY EVENT'];
  stages.forEach((t, i) => {
    const x = -96.5 + i * 6.2, y = i % 2 ? -12.2 : -10.4;
    ctx.deco(x - 2.2, x + 2.2, y - 0.5, y + 0.5, -38.78, -38.74, [0xffd9e8, 0xd9f1ff, 0xe8ffd9][i % 3]);
    ctx.sign(t, x, y, -38.5, { size: 0.32, gold: false });
    if (i < stages.length - 1) ctx.deco(x + 2.2, x + 4, -11.32, -11.28, -38.78, -38.74, 0xd62839);
  });
  ctx.sign('THE CLIENT JOURNEY: FIRST CONTACT → LIQUIDITY EVENT', -81, -8.0, -38.5, { size: 0.7, gold: false });
  ctx.deco(-108.9, -108.8, -6, 2, -14, 14, 0x101420);
  ctx.screen(-108.75, -2, 0, Math.PI / 2, 26, 6.5, CH.PNL);
  ctx.sign('TOP CLOSERS — THIS WEEK', -108.3, 3.2, 0, { size: 1.0 });
  ctx.sign(`${ops} relationship associates · 24/7 · every time zone`, -108.3, -6.8, 0, { size: 0.6, gold: false });
  [-31, -21, 21, 31].forEach((z, i) => ctx.screen(-108.75, -2, z, Math.PI / 2, 8.5, 4, [CH.CHART, CH.TICKER, CH.TICKER, CH.CHART][i]));
}
