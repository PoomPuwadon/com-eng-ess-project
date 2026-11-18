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

// OT-05 Executive Command Centre: see commandCentre.js

// OT-03 Global Client Outreach Centre: see outreach.js
