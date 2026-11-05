import { CH } from '../world/screens.js';

const GOLD = 0xc9a23a, MARBLE = 0xf3efe6, DARK = 0x2a2a2a, WATER = 0x3d8fd6, SCREEN_WALL = 0xe9e1cf, GLASSWALL = 0xbfe6ff;

// L0 — Grand Lobby (rev 9): one open marble hall, 60 x 70 m, 48 m tall, glass roof.
//   Doors (south) → SECURITY: 2 scanner lanes in a full-width glass wall (z 24..25)
//   → OPEN HALL: seating areas either side, reflection pool under The Link in the middle
//   → RECEPTION + Concierge at the back (north) under the firm's name.
//   Access control only at the lifts: OFFICE TOWER LIFTS (west wall) fenced in glass, entered
//   through the staff turnstiles; WELLNESS TOWER LIFTS (east wall) behind open guest gates.
export function lobby(ctx) {
  // ---- security: 2 lanes, glass wall across the rest
  for (const x of [-4.4, 0, 4.4]) ctx.box(x - 0.4, x + 0.4, 0, 3, 24.1, 24.9, 0x707a88);
  ctx.deco(-4.8, 4.8, 3, 3.5, 24.1, 24.9, 0x707a88);
  for (const x of [-4.8, 4.8]) ctx.deco(x - 0.08, x + 0.08, 0, 4.5, 24.1, 24.9, GOLD);
  // glass side panels from the entrance doors to the scanners: the approach is a closed channel,
  // so no full-width glass wall is needed; the space either side is planted instead
  for (const x of [-4.8, 4.8]) {
    ctx.glassBox(x - 0.1, x + 0.1, 0, 3, 24.1, 28.6, GLASSWALL, true);
    ctx.deco(x - 0.12, x + 0.12, 3, 3.1, 24.1, 28.6, GOLD);
  }
  for (const sx of [-1, 1]) {
    for (const [a, b] of [[6.5, 13], [15, 21.5], [23.5, 28.5]]) {
      const x0 = sx < 0 ? -b : a, x1 = sx < 0 ? -a : b;
      ctx.box(x0, x1, 0, 0.7, 25.2, 28.6, 0xd9d2c3); // marble planter
      ctx.deco(x0 + 0.2, x1 - 0.2, 0.7, 0.75, 25.4, 28.4, 0x3b2a1a); // soil
      for (let x = x0 + 1; x < x1 - 0.5; x += 1.6) ctx.deco(x - 0.5, x + 0.5, 0.75, 1.6 + ((x * 7) % 3) * 0.3, 26.3, 27.5, 0x4f8a3f); // shrubs
      ctx.deco((x0 + x1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, 0.75, 3.6, 26.75, 27.05, 0x5a3a20); // small tree
      ctx.deco((x0 + x1) / 2 - 1.1, (x0 + x1) / 2 + 1.1, 3.0, 4.6, 25.8, 28.0, 0x3f7a35);
    }
  }
  for (const x of [-2.2, 2.2]) ctx.deco(x - 1.6, x + 1.6, 0.01, 0.03, 22, 27, 0x30384a); // lane mats
  ctx.sign('ASSET PROTECTION SCREENING', 0, 5.2, 24.5, { size: 0.8 });
  ctx.npc(-6.5, 23, 0x050505); ctx.npc(6.5, 23, 0x050505); // guards on the hall side
  for (const x of [-4.6, 4.6]) ctx.box(x - 0.45, x + 0.45, 0, 6, 28.6, 30, GOLD); // entrance portal
  ctx.deco(-5, 5, 6, 6.6, 28.6, 30, GOLD);

  // ---- red carpet: doors → screening → around the pool → reception
  ctx.deco(-2, 2, 0.01, 0.03, 5.5, 29.9, 0x8a1b1b);
  ctx.deco(-2, 2, 0.01, 0.03, -27, -5.5, 0x8a1b1b);

  // ---- two open seating areas (rugs, sofas, coffee tables, plants)
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -20 : 8, cx = x0 + 6;
    ctx.deco(x0, x0 + 12, 0.01, 0.025, 9, 19, sx < 0 ? 0x2b3a55 : 0x5a1a28);
    for (const [ax, az, w, d] of [[cx - 4.5, 14, 1.0, 5], [cx + 3.5, 14, 1.0, 5], [cx - 2.5, 10.2, 5, 1.0], [cx - 2.5, 16.8, 5, 1.0]]) ctx.box(ax, ax + w, 0, 0.5, az - d / 2, az + d / 2, 0x7a1f2b);
    ctx.box(cx - 1.5, cx + 1.5, 0, 0.45, 12.8, 15.2, 0x3b2414);
    for (const z of [9.5, 18.5]) { ctx.box(x0 + 0.2, x0 + 1, 0, 0.8, z - 0.4, z + 0.4, 0x5a3a20); ctx.deco(x0 + 0.1, x0 + 1.1, 0.8, 2.4, z - 0.5, z + 0.5, 0x4f8a3f); }
    for (const [x, z] of [[cx - 4, 12.5], [cx + 4, 15.5], [cx, 10.2]]) ctx.npc(x, z, 0xd0a070, 0);
  }

  // ---- reflection pool beneath The Link
  ctx.box(-8, 8, 0, 0.6, -5, 5, 0xd9d2c3);
  ctx.deco(-7.6, 7.6, 0.6, 0.62, -4.6, 4.6, WATER);
  ctx.box(-1, 1, 0, 6, -1, 1, MARBLE);
  ctx.deco(-0.3, 0.3, 6, 9, -0.3, 0.3, GLASSWALL);

  // ---- reception (back of the hall) + concierge
  ctx.box(-12, 12, 0, 1.1, -31, -29, MARBLE);
  ctx.box(-12, 12, 1.1, 1.2, -31, -29, GOLD);
  ctx.box(-10, 10, 0, 6, -36, -35.6, 0x2b1d4a); // backdrop wall
  ctx.sign('RECEPTION', 0, 4.8, -35.4, { size: 1.1 });
  for (const x of [-8, -4, 0, 4, 8]) ctx.npc(x, -32.5, 0x111111);
  ctx.box(13, 19, 0, 1.1, -31, -29, MARBLE); ctx.npc(16, -32.5, 0x111111);
  ctx.sign('Concierge', 16, 3.2, -30, { size: 0.6, gold: false });
  // ---- the massive screen: covers the north wall's glass (56 x 31.5 m, y 14.5..46); name below it
  ctx.deco(-29, 29, 14, 47.6, -39, -38.7, 0x0b0f18); // bezel over the whole glass band
  ctx.screen(0, 30.25, -38.65, 0, 56, 31.5, CH.CHART);
  ctx.deco(-29, 29, 13.7, 14, -39, -38.5, GOLD);
  ctx.sign('{FIRM NAME}', 0, 10.5, -38.4, { size: 3.2, sub: 'Excellence. Discretion. Liquidity.' });

  // ---- lift enclosures: glass fence lines with one entrance each
  for (const s of [-1, 1]) {
    const fx = s * 21.15; // fence line
    ctx.glassBox(fx - 0.15, fx + 0.15, 0, 2.2, -38.7, -25, GLASSWALL, true);
    ctx.glassBox(fx - 0.15, fx + 0.15, 0, 2.2, -19, -6.15, GLASSWALL, true);
    ctx.glassBox(Math.min(fx, s * 29), Math.max(fx, s * 29), 0, 2.2, -6.3, -6, GLASSWALL, true);
    for (const z of [-25, -19]) ctx.box(fx - 0.35, fx + 0.35, 0, 3.2, z - 0.35, z + 0.35, GOLD);
    ctx.deco(fx - 0.3, fx + 0.3, 3.2, 3.5, -25.35, -18.65, GOLD);
  }
  ctx.barrier(-21.3, -21, -25, -19, 1.2, 'staff_side', 'staff_turnstiles');
  for (let z = -24.2; z < -19; z += 1.5) ctx.deco(-21.8, -20.5, 0, 1.1, z - 0.1, z + 0.1, DARK);
  ctx.sign('OFFICE TOWER LIFTS — Staff only', -21.15, 4.3, -22, { size: 0.65 });
  ctx.sign('WELLNESS TOWER LIFTS — Guests', 21.15, 4.3, -22, { size: 0.65 });
  ctx.npc(-19.5, -20, 0x050505); ctx.npc(19.5, -24, 0x050505);

  // ---- columns, chandeliers, art, lift-lobby screens
  for (const x of [-16, 16]) for (const z of [-16, 20]) ctx.box(x - 1, x + 1, 0, 48, z - 1, z + 1, MARBLE);
  // chandeliers kept off the centre line so nothing blocks the screen from the entrance
  for (const [x, zz] of [[-23, 14], [23, 14], [-23, -16], [23, -16]]) { // clear of The Link (15 m, z ±3)
    ctx.deco(x - 3, x + 3, 18, 21, zz - 3, zz + 3, 0xffe9a8);
    ctx.deco(x - 2, x + 2, 15, 18, zz - 2, zz + 2, 0xffe9a8);
    ctx.deco(x - 0.1, x + 0.1, 21, 47.8, zz - 0.1, zz + 0.1, GOLD);
  }
  for (const zz of [-30.6, -14.6]) {
    ctx.screen(-28.9, 6.5, zz, Math.PI / 2, 10, 3, CH.TICKER);
    ctx.screen(28.9, 6.5, zz, -Math.PI / 2, 10, 3, CH.ODDS);
  }
  for (const [x, zz] of [[10, -12], [-10, 2], [14, 3], [-5, -20], [6, -24]]) ctx.npc(x, zz, 0xd0a070, (x * 7) % 6);
  for (const [x, zz] of [[-25, -14], [-25, -30]]) ctx.npc(x, zz, 0x2b3a55, 1.5);
}

// PLAZA — outdoor entrance forecourt in front of the main doors (z 30..62). The game starts here.
export function plaza(ctx) {
  const HEDGE = 0x3f6b35, STONE = 0xd8d0c0;
  ctx.box(-40, -38.8, 0, 1.3, 30, 62, HEDGE); // enclosing hedges
  ctx.box(38.8, 40, 0, 1.3, 30, 62, HEDGE);
  ctx.box(-40, 40, 0, 1.3, 60.8, 62, HEDGE);
  ctx.deco(-2.5, 2.5, 0.01, 0.03, 30, 49, 0x8a1b1b); // red carpet
  for (const x of [-6.5, 6.5]) ctx.box(x - 0.4, x + 0.4, 0, 6, 36.6, 37.4, GOLD); // canopy
  ctx.deco(-8, 8, 6, 6.4, 30, 38, 0x2a2a2a);
  ctx.deco(-8, 8, 6.4, 6.5, 30, 38, GOLD);
  ctx.sign('{FIRM NAME}', 0, 7.6, 37.5, { size: 1.5, sub: 'Main Entrance' });
  for (const [x0, x1] of [[-9, -4], [4, 9]]) { ctx.box(x0, x1, 0, 0.7, 40, 46, STONE); ctx.deco(x0 + 0.4, x1 - 0.4, 0.7, 0.72, 40.4, 45.6, WATER); }
  for (const x of [-6.5, 6.5]) ctx.box(x - 0.5, x + 0.5, 0, 3.5, 42.5, 43.5, MARBLE);
  for (const x of [-32, -24, -16, 16, 24, 32]) {
    ctx.box(x - 0.12, x + 0.12, 0, 12, 36.9, 37.1, 0xcccccc);
    ctx.deco(x + 0.12, x + 2.6, 10, 11.5, 36.95, 37.05, [0xc9a23a, 0x1f2a44, 0x8a1b1b][(Math.abs(x) / 8) % 3]);
  }
  ctx.deco(-34, 34, 0.01, 0.025, 49, 55, 0x2a2d33); // drop-off lane
  for (let x = -32; x <= 32; x += 4) ctx.deco(x, x + 2, 0.025, 0.035, 51.9, 52.1, 0xffffff);
  for (const [x, c] of [[-26, 0xd62839], [-14, 0x111111], [14, 0xfbbf24], [26, 0x1d4ed8]]) {
    ctx.box(x - 2.2, x + 2.2, 0, 1.1, 50.5, 52.5, c);
    ctx.deco(x - 1.2, x + 1.0, 1.1, 1.5, 50.8, 52.2, 0x1b2a3a);
  }
  ctx.box(-6, 6, 0, 2.2, 59.4, 60.8, STONE); // monument sign
  ctx.sign('{FIRM NAME} — Two Towers. One Vision.', 0, 3.2, 60, { size: 0.9 });
  for (const x of [-34, 34]) for (const z of [40, 46]) { ctx.box(x - 0.1, x + 0.1, 0, 5, z - 0.1, z + 0.1, DARK); ctx.deco(x - 0.4, x + 0.4, 5, 5.5, z - 0.4, z + 0.4, 0xfff2c0); }
  ctx.npc(-4.5, 32, 0x111111, Math.PI); ctx.npc(4.5, 32, 0x111111, Math.PI);
  for (const [x, z] of [[-12, 47], [13, 44], [-2, 54], [20, 56], [-20, 40]]) ctx.npc(x, z, 0xd0a070, Math.PI);
}
