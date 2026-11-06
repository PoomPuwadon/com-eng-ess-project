import { plaque, Lux } from '../world/lux.js';
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
// Phase 1: walnut-and-bronze glass bridge with a dark granite deck, glass roof on bronze ribs,
// warm LED strips and a bronze underside (it is seen from the Grand Lobby, 15 m below).
export function bridge(ctx) {
  const { x0, x1 } = ctx.floor.bounds;
  const L = new Lux(ctx);
  L.floor(x0, x1, -2.85, 2.85, 0.01, 'granite');
  L.box(x0, x1, 0.01, 0.025, -0.4, 0.4, 'walnut'); // centre runner
  for (const sz of [-1, 1]) {
    L.box(x0, x1, 0, 0.12, sz * 2.85 - 0.12, sz * 2.85 + 0.12, 'bronze'); // kick rail
    L.box(x0, x1, 0, 3.9, sz * 2.92 - 0.04, sz * 2.92 + 0.04, 'glass'); // side glazing
    ctx.colliders.push({ x0, x1, z0: sz > 0 ? 2.85 : -3, z1: sz > 0 ? 3 : -2.85, y0: ctx.e, y1: ctx.e + 4 });
    L.box(x0, x1, 1.05, 1.12, sz * 2.78 - 0.04, sz * 2.78 + 0.04, 'bronze'); // handrail
    L.box(x0, x1, 3.78, 3.82, sz * 2.7 - 0.04, sz * 2.7 + 0.04, 'ledStrip'); // LED cove strips (soft)
  }
  L.box(x0, x1, 3.92, 3.96, -2.95, 2.95, 'glass'); // glass roof
  for (let x = x0; x <= x1 + 0.01; x += 3) {
    for (const sz of [-1, 1]) L.box(x - 0.07, x + 0.07, 0, 4.0, sz * 2.95 - 0.08, sz * 2.95 + 0.08, 'bronze');
    L.box(x - 0.07, x + 0.07, 3.9, 4.06, -3, 3, 'bronze');
  }
  // bronze reveals through the atrium wall at both mouths (X ±28.85..±30), so no bare wall ends show
  // through the glass; the towers continue them to X ±31.14 (see luxHall.js)
  for (const sx of [-1, 1]) {
    const a = sx * 28.85, b = sx * 30.0;
    for (const sz of [-1, 1]) L.box(a, b, 0, 4.34, sz < 0 ? -3.34 : 2.96, sz < 0 ? -2.96 : 3.34, 'bronze');
    L.box(a, b, 3.96, 4.34, -3.34, 3.34, 'bronze');
  }
  L.box(x0, x1, -0.75, -0.02, -3.1, 3.1, 'bronze'); // underside seen from the lobby
  L.box(x0, x1, -0.78, -0.75, -0.3, 0.3, 'ledStrip');
  plaque(ctx, 'THE LINK — Authorised Synergy Only', 0, 3.4, 3.0, 0, { h: 0.3 });
  plaque(ctx, 'THE LINK — Authorised Synergy Only', 0, 3.4, -3.0, Math.PI, { h: 0.3 });
  L.person(-20, 1.5, { yaw: Math.PI / 2, suit: 0x141518, hair: 0x0e0e0e });
  L.person(20, -1.5, { yaw: -Math.PI / 2, suit: 0x141518, hair: 0x0e0e0e });
  L.build();
}
