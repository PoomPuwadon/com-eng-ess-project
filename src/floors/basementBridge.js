import { CH } from '../world/screens.js';
import { MAT, instancedBoxes, chunked } from '../world/geom.js';

// B1 — Treasury Reserve (vault), server room, cash robot depot.
// The CEO private lift and the Office freight lift open straight into the vault (west wall).
export function basement(ctx) {
  const e = ctx.e;
  const stacks = [];
  for (let x = -44; x <= -14; x += 3) for (let zz = -4; zz <= 30; zz += 3) {
    if (Math.abs(zz - 12.5) < 3.5 || Math.abs(zz - 23.5) < 3) continue; // aisles to the two lifts
    if (Math.abs(x + 34) < 3 && zz < 6) continue; // aisle to the north door
    const h = 1 + ((((x * 7 + zz * 13) % 5) + 5) % 5) * 0.4;
    stacks.push({ x, y: e + h / 2, z: zz, sx: 2, sy: h, sz: 1.6, color: (Math.abs(x + zz) % 2) ? 0x2f7a3a : 0xc9a23a });
    ctx.colliders.push({ x0: x - 1, x1: x + 1, z0: zz - 0.8, z1: zz + 0.8, y0: e, y1: e + h });
  }
  for (const m of chunked(stacks, 20, (list) => instancedBoxes(list, MAT.npc))) ctx.add(m, m.geometry);
  ctx.deco(-29, -28, 0, 8, -16, -8, 0x8c8c8c); // vault door, swung open
  ctx.sign('TREASURY RESERVE', -34, 8.2, 31, { size: 1.6, sub: 'Total: 1,000,000,000.00 — placeholder (live total in Phase 2)' });
  for (const x of [-38, -30]) ctx.npc(x, -5, 0x050505, Math.PI);
  // server room racks (long row colliders)
  for (let zz = 9; zz <= 31; zz += 3.5) {
    ctx.box(-104, -90, 0, 2.2, zz - 0.4, zz + 0.4, 0x1c1f24);
    ctx.box(-86, -72, 0, 2.2, zz - 0.4, zz + 0.4, 0x1c1f24);
  }
  ctx.screen(-88, 3.5, 34.6, Math.PI, 8, 2.5, CH.CHART);
  ctx.npc(-88, 20, 0x2f4f2f, 0); ctx.npc(-78, 13, 0x2f4f2f, Math.PI);
  // depot charging bays
  for (let i = 0; i < 5; i++) ctx.deco(13 + i * 5, 16 + i * 5, 0, 0.05, -34, -26, 0x3355aa);
  ctx.sign('ALC Charging Bays', 25, 3.5, -30, { size: 0.7, gold: false });
}

// The Link — glass skybridge across the atrium between the Trading Floor (OT-01) and the Leisure Suite (VT-01), 15 m up
export function bridge(ctx) {
  const { x0, x1 } = ctx.floor.bounds;
  ctx.glassBox(x0, x1, 0, 4, -3, -2.85);
  ctx.glassBox(x0, x1, 0, 4, 2.85, 3);
  ctx.glassBox(x0, x1, 3.9, 4, -3, 3, 0x9fd8ff, false);
  ctx.deco(x0, x1, -0.75, -0.5, -3.1, 3.1, 0xd8dde6); // slim deck edge (rev 10: The Link now crosses in front of the lobby screen)
  for (let x = x0; x <= x1; x += 5) {
    ctx.deco(x - 0.08, x + 0.08, 0, 4, -3.05, -2.85, 0xc9a23a);
    ctx.deco(x - 0.08, x + 0.08, 0, 4, 2.85, 3.05, 0xc9a23a);
    ctx.deco(x - 0.08, x + 0.08, 3.9, 4.05, -3, 3, 0xc9a23a);
  }
  ctx.sign('THE LINK — Authorised Synergy Only', 0, 3.2, 0, { size: 0.6 });
  ctx.npc(-20, 1.5, 0x050505, Math.PI / 2); ctx.npc(20, -1.5, 0x050505, -Math.PI / 2);
}
