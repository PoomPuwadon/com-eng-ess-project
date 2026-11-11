import * as THREE from 'three';
import { CH } from '../world/screens.js';
import { Lux, peopleInstanced } from '../world/lux.js';
import { luxProxy } from './luxKit.js';
import { luxLiftHall, planter } from './luxHall.js';

// OT-04 Asset Protection HQ — greybox redesign (user, 2026-11-06). 62 m, 12 m tall.
// One floor, two faces:
//   LUXURY (north, Z -39..-3.3): a five-star private-security agency for "normal people" — client
//     reception, a waiting salon with a window onto the yard, the guards' lounge + bar, the guard
//     deployment bay (threat board) and the cash-robot escort depot.
//   PRISON (south, Z -3..39): exit processing (box issue, badge shredder, alumni wall) opening
//     straight into the roll-call yard (numbered spots, CFO podium), a beating area, a row of glass
//     "luxury" holding cells and steel catwalks at 6 m with patrolling guards.
// The lift hall has two portals: luxury (Z -14) and processing (Z 14).
// Plain names (security HQ, firing, roll call, beating, cells) appear in code comments only.
// World coordinates; y relative to the slab (62 m). Main space X -109..-50, Z -39..39.

const STEEL = 0x4b5058, STEEL_D = 0x2f333a, CONC = 0x8b8f95, YEL = 0xffd400, GOLD = 0xc9a23a;
const MARBLE = 0xeee6d6, ONYX = 0x2a2420, WALNUT = 0x5a3a22, LEATHER = 0x6b2b1b, VELVET = 0x5b2a6e;
const GUARD = 0x050505, SUIT = 0x2b3a55, CLIENT = 0x8a6d3b, CFO = 0x1f2a44;
const CW_Y = 6; // catwalk level

// ---- Phase 1 look (2026-11-09): every greybox call goes through the Phase 1 kit (luxKit.js).
// Agency side: white marble floors, walnut panelling under pale stone, gold, a back-lit onyx wall,
// leather and velvet. Prison side: board-formed concrete walls, grey epoxy floor, diamond-plate
// catwalks, powder-coated steel, cold strip lights. Low-poly people throughout (seated where they sit).
const GLOW = new Set([0xfff0c8, 0xe8eeff, 0xf2f7ff, 0xffe9a8, 0xffffcc, 0xe8f6ff, 0xff2a2a, 0x4dd2ff, 0x9fe6ff]);
const MAT_OF = new Map([
  [MARBLE, 'marble'], [0x3c3a3a, 'granite'], [GOLD, 'gold'], [CONC, 'epoxyGrey'], [0xd9dde5, 'stone'], [0xffd9a0, 'onyx'],
  [ONYX, 'granite'], [WALNUT, 'walnut'], [0x3a2a1c, 'walnut'], [LEATHER, 'leather'], [VELVET, 'velvet'],
  [0x6e5a8a, 'rug'], [0x8c1a1a, 'rug'], [0x4a2a5a, 'rug'],
  [STEEL, 'metalV'], [STEEL_D, 'metalV'], [0x5c6169, 'plate'], [0x707a88, 'metalV'], [0x9aa3ad, 'steel'], [0x23272e, 'metalV'], [0x222222, 'metalV'], [0x2a2a2a, 'metalV'], [0x111111, 'metalV'], [0x1b2f4a, 'metalV'],
  [0x2e7bd6, 'carPaint'], [0x9a7a4a, 'brushedBronze'], [0x8a6a4a, 'brushedBronze'], [0x3f9a4a, 'foliage'], [0x7a8a3a, 'foliage'], [0xd8a62a, 'glossV'],
]);
const pickMat = (c, { y0 }) => (GLOW.has(c) ? 'glow' : c === STEEL_D && Math.abs(y0 - (CW_Y - 0.25)) < 0.01 ? 'plate' : MAT_OF.get(c) || 'satinV');
const SECP = { wall: 'stone', wallDeep: 'stone', panel: 'lampWarm', frame: 'brushedBronze', frameDark: 'blackMetal', dado: 'walnut', cap: 'gold',
  runner: 'redCarpet', edge: 'gold', liner: 'steel', ink: '#e3c27a', kioskBg: '#1a1510', kioskBtn: '#3a2a1a', kioskEdge: '#c9a23a', hostSuit: 0x111418 };
const CAT = { // catwalk bands (prison side)
  n: [-109, -64, -3, -0.5], w: [-109, -106.5, -0.5, 39], s: [-106.5, -64, 36.5, 39], e: [-66.5, -64, -0.5, 36.5],
};
const STAIR = { x0: -106.5, x1: -104, zBot: 30, n: 24, rise: 0.25, tread: 0.3 }; // up to the west catwalk
const PODIUM = { x0: -102, x1: -98.6, z0: 12, z1: 18, h: 1.0 };
const FEEDBACK = { x0: -81, x1: -66.8, z0: 18.5, z1: 27 };
const GROUPS = [[-78, 21], [-71, 21.2], [-74.5, 25]]; // beating groups (victim positions)

export function securityHQ(ctx0) {
  const L = new Lux(ctx0);
  const ctx = luxProxy(ctx0, L, { mat: pickMat });
  const e = ctx.e;
  const { box, deco } = { box: ctx.box.bind(ctx), deco: ctx.deco.bind(ctx) };
  const disposables = [];

  // steel railing: collider top bar + mid bar + posts (merged into the floor batch)
  const rail = (x0, x1, z0, z1, y = 0) => {
    box(x0, x1, y + 1.0, y + 1.1, z0, z1, STEEL);
    deco(x0, x1, y + 0.5, y + 0.56, z0, z1, STEEL);
    const alongX = x1 - x0 > z1 - z0;
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    for (let a = a0; a <= a1 + 0.01; a += 1.5) {
      const p = Math.min(a, a1 - 0.06);
      if (alongX) deco(p, p + 0.06, y, y + 1.0, z0, z1, STEEL); else deco(x0, x1, y, y + 1.0, p, p + 0.06, STEEL);
    }
  };
  const railRun = (axis, a0, a1, f0, f1, y, gaps = []) => {
    let cur = a0;
    for (const [ga, gb] of [...gaps, [a1, a1]]) {
      if (ga - cur > 0.05) axis === 'x' ? rail(cur, ga, f0, f1, y) : rail(f0, f1, cur, ga, y);
      cur = Math.max(cur, gb);
    }
  };

  // ================================================================ floors + ceiling lights
  deco(-78, -50, 0.012, 0.025, -39, -3.3, MARBLE); // luxury marble
  deco(-109, -78, 0.012, 0.025, -39, -3.3, 0x3c3a3a); // bay + depot: polished dark stone
  for (const z of [-26.5, -12]) deco(-78, -50, 0.025, 0.03, z - 0.08, z + 0.08, GOLD); // gold inlays
  deco(-78.08, -77.92, 0.025, 0.03, -39, -3.3, GOLD);
  deco(-109, -50, 0.012, 0.025, -3, 39, CONC); // prison concrete
  for (let z = -36; z <= -6; z += 6) deco(-76, -52, 11.55, 11.7, z, z + 2.5, 0xfff0c8); // warm coffers
  for (let z = -36; z <= -8; z += 7) deco(-106, -80, 11.55, 11.7, z, z + 1.2, 0xe8eeff);
  for (let x = -104; x <= -54; x += 6) deco(x, x + 0.5, 11.55, 11.7, 0, 36, 0xf2f7ff); // harsh strip lights
  for (const [x, z] of [[-58, -19], [-64, -33], [-70, -7]]) { // gold chandeliers
    deco(x - 0.05, x + 0.05, 8.6, 11.75, z - 0.05, z + 0.05, GOLD);
    deco(x - 1.4, x + 1.4, 7.6, 8.6, z - 1.4, z + 1.4, 0xffe9a8);
    deco(x - 0.9, x + 0.9, 7.0, 7.6, z - 0.9, z + 0.9, GOLD);
  }

  // ---- wall finishes over the shell: panelled agency walls, concrete prison walls
  const face = (axis, a0, a1, f0, f1, y0, y1, mat, gaps = []) => { // a run of facing with door gaps [[a, b, top]]
    let cur = a0;
    for (const [ga, gb, top] of [...gaps, [a1, a1, 0]]) {
      if (ga - cur > 0.02) axis === 'x' ? L.box(cur, ga, y0, y1, f0, f1, mat) : L.box(f0, f1, y0, y1, cur, ga, mat);
      if (top != null && top < y1 && gb > ga) axis === 'x' ? L.box(ga, gb, Math.max(y0, top), y1, f0, f1, mat) : L.box(f0, f1, Math.max(y0, top), y1, ga, gb, mat);
      cur = Math.max(cur, gb);
    }
  };
  const H = 11.75;
  face('x', -78, -50, -39, -38.97, 0, 4.4, 'walnut'); face('x', -78, -50, -39, -38.96, 4.4, 4.5, 'gold'); face('x', -78, -50, -39, -38.97, 4.5, H, 'stone');
  face('z', -39, -3.3, -50.03, -50, 0, 4.4, 'walnut', [[-18, -10, 5.5]]); face('z', -39, -3.3, -50.04, -50, 4.4, 4.5, 'gold', [[-18, -10, 5.5]]); face('z', -39, -3.3, -50.03, -50, 4.5, H, 'stone', [[-18, -10, 5.5]]);
  face('x', -109, -78, -39, -38.97, 0, H, 'concreteDark'); face('z', -39, -3.3, -109, -108.97, 0, H, 'concreteDark');
  face('x', -109, -50, 38.97, 39, 0, H, 'concrete'); face('z', -3, 39, -109, -108.97, 0, H, 'concrete'); face('z', -3, 39, -50.03, -50, 0, H, 'concrete', [[11, 17, 4.2]]);
  face('x', -109, -50, -2.99, -2.96, 0, H, 'concrete', [[-89.5, -86.5, 3.2], [-75.5, -52.5, 5]]); // divider, yard side
  face('x', -75.5, -52.5, -2.99, -2.96, 0, 1, 'concrete');

  // ================================================================ divider: luxury | prison
  ctx.wallX(-109, -50, -3.3, -3, 11.75, 0xd9dde5, [
    { from: -89.5, to: -86.5, top: 3.2 }, // staff passage (bay/depot -> yard)
    { from: -75.5, to: -52.5, bottom: 1, top: 5 }, // salon + reception window onto the yard
  ]);
  ctx.glassBox(-75.5, -52.5, 1, 5, -3.2, -3.1, 0xbfe6ff, true);
  for (const y of [0.92, 5]) deco(-75.6, -52.4, y, y + 0.08, -3.35, -2.95, GOLD);
  for (let x = -75.5; x <= -52.4; x += 2.3) deco(x - 0.04, x + 0.04, 1, 5, -3.0, -2.9, STEEL_D); // bars on the yard side
  ctx.sign('Staff passage → Mandatory Alignment Yard', -88, 3.9, -3.34, { size: 0.4, yaw: Math.PI });
  deco(-88.4, -87.6, 3.25, 3.55, -3.4, -2.9, 0xff2a2a); // red beacon

  // ================================================================ LUXURY — client reception
  deco(-66, -50, 0.03, 0.04, -15.5, -12.5, 0x8c1a1a); // red runner from the luxury portal
  for (const z of [-15.5, -12.62]) deco(-66, -50, 0.04, 0.045, z, z + 0.12, GOLD);
  box(-64, -63.7, 0, 6, -26, -17, ONYX); // back-lit onyx backdrop
  deco(-63.7, -63.6, 0.5, 5.6, -25.6, -17.4, 0xffd9a0);
  box(-60.5, -59.3, 0, 1.1, -25, -18.5, WALNUT); // reception desk
  deco(-60.6, -59.2, 1.1, 1.18, -25.1, -18.4, GOLD);
  ctx.npc(-61.4, -23, 0x111111, Math.PI / 2); ctx.npc(-61.4, -20.4, 0x111111, Math.PI / 2);
  ctx.screen(-59.25, 1.4, -21.7, Math.PI / 2, 0.8, 0.5, CH.PNL);
  ctx.sign('ASSET PROTECTION SERVICES', -63.55, 6.7, -21.5, { size: 0.75, sub: 'Your assets. Our obsession.', yaw: Math.PI / 2 });
  for (const z of [-17, -26]) planter(L, SECP, -54.5, z, 1.2); // planters
  ctx.npc(-52.5, -18.5, CLIENT, -Math.PI / 2); // a client arriving

  // ---- client waiting salon (sofas face the window onto the yard)
  deco(-76, -60, 0.03, 0.04, -11, -3.6, 0x6e5a8a); // rug
  for (const x of [-73, -68, -63]) {
    box(x - 2, x + 2, 0, 0.45, -8.6, -7.6, LEATHER); deco(x - 2, x + 2, 0.45, 1.0, -8.6, -8.2, LEATHER);
    box(x - 0.8, x + 0.8, 0, 0.42, -5.6, -4.8, WALNUT);
    ctx.npc(x - 1, -8.05, CLIENT, 0, 0, { sit: true }); if (x !== -68) ctx.npc(x + 1, -8.05, CLIENT, 0, 0, { sit: true });
  }
  ctx.sign('Client Waiting Salon', -64, 5.75, -3.34, { size: 0.5, sub: 'Please enjoy the view of our alignment programme', yaw: Math.PI });

  // ---- protection officers' lounge + bar
  box(-72, -56, 0, 1.1, -37.4, -36.4, WALNUT); deco(-72.1, -55.9, 1.1, 1.18, -37.5, -36.3, GOLD);
  for (let x = -71; x <= -57; x += 2) deco(x, x + 1.4, 1.6, 4.2, -38.95, -38.7, 0x3a2a1c); // back-bar shelves
  for (let x = -71; x <= -57; x += 2) for (const y of [2.0, 2.8, 3.6]) deco(x + 0.2, x + 1.2, y, y + 0.35, -38.7, -38.5, 0xd8a62a);
  box(-58, -57, 1.18, 1.7, -37.2, -36.6, 0x9aa3ad); // espresso machine
  ctx.npc(-64, -38.2, 0x111111, 0); // bartender
  for (const [x, z] of [[-73, -31], [-69, -29.5], [-65, -31.5], [-61, -29.5], [-57, -31]]) {
    box(x - 0.5, x + 0.5, 0, 0.45, z - 0.5, z + 0.5, LEATHER); deco(x - 0.5, x + 0.5, 0.45, 1.1, z - 0.5, z - 0.3, LEATHER);
    ctx.npc(x, z - 0.05, GUARD, 0, 0, { sit: true });
  }
  for (const x of [-71, -63, -59]) ctx.npc(x, -35.4, GUARD, Math.PI); // at the bar
  ctx.glassBox(-76, -66, 0, 2.6, -27.1, -26.9, 0xbfe6ff, true);
  ctx.sign("Protection Officers' Lounge", -64, 5.4, -38.9, { size: 0.55, sub: 'Complimentary cigars after every alignment', yaw: 0 });

  // ================================================================ LUXURY — deployment bay
  ctx.screen(-94, 6, -38.9, 0, 24, 6, CH.PNL); // threat board: department budgets
  ctx.sign('FISCAL DISCIPLINE ADVISORY STATUS: CALM', -94, 9.9, -38.9, { size: 0.65, bg: '#141414', color: '#ffd400', yaw: 0 });
  for (let z = -38; z <= -19.6; z += 1.2) { // gold-trimmed lockers on the west wall
    box(-109, -108.2, 0, 2.3, z, z + 1.1, 0x23272e);
    deco(-108.2, -108.15, 1.9, 2.0, z + 0.1, z + 1.0, GOLD);
  }
  for (const x of [-102, -96, -90, -84]) {
    for (const xx of [x - 1.6, x + 1.6]) deco(xx - 0.08, xx + 0.08, 0.025, 0.035, -35, -19, YEL); // muster lanes
    for (let k = 0; k < 8; k++) ctx.npc(x + (k % 2 ? 0.7 : -0.7), -33 + Math.floor(k / 2) * 1.6, GUARD, Math.PI);
  }
  ctx.sign('Rapid Alignment Deployment Bay', -108.9, 4.3, -28.5, { size: 0.6, sub: 'Average response time 41 s · sprinting encouraged', yaw: Math.PI / 2 });

  // ================================================================ LUXURY — cash-robot escort depot
  for (let i = 0; i < 4; i++) {
    const z = -16 + i * 2.9;
    box(-109, -106.8, 0, 0.2, z, z + 2.4, 0x1b2f4a); deco(-106.9, -106.8, 0.2, 0.25, z, z + 2.4, 0x4dd2ff); // dock
    deco(-109, -108.8, 0.2, 2.6, z + 0.2, z + 2.2, 0x1b2f4a); deco(-108.8, -108.75, 1.6, 2.2, z + 0.9, z + 1.5, 0x4dd2ff); // charger
    if (i !== 2) { box(-108.4, -107.4, 0.2, 1.4, z + 0.5, z + 1.9, 0x2e7bd6); deco(-107.4, -107.35, 1.0, 1.25, z + 0.8, z + 1.6, 0x9fe6ff); } // parked courier
  }
  for (const [x, z] of [[-98, -12], [-92, -8], [-98, -6]]) {
    deco(x - 2, x + 2, 0.025, 0.035, z - 1.4, z + 1.4, 0x2e7bd6); // pairing box
    ctx.npc(x - 0.9, z, GUARD, Math.PI / 2); ctx.npc(x + 0.9, z, GUARD, -Math.PI / 2);
  }
  ctx.screen(-96, 3.6, -3.4, Math.PI, 12, 2.4, CH.TICKER); // escort route board (on the divider)
  ctx.sign('ALC Escort Muster Point', -96, 5.6, -3.34, { size: 0.55, sub: 'Two officers per courier. Nothing goes wrong in transit.', yaw: Math.PI });

  // ================================================================ PRISON — exit processing
  for (const z of [11, 17]) deco(-64, -50, 0.025, 0.035, z - 0.1, z + 0.1, YEL); // lane from the portal
  for (let x = -64; x < -50; x += 1.2) deco(x, x + 0.6, 0.025, 0.035, 13.9, 14.1, YEL);
  box(-61, -55, 0, 1.0, 3, 4.5, STEEL); deco(-61.1, -54.9, 1.0, 1.05, 2.9, 4.6, YEL); // box issuance counter
  for (let i = 0; i < 6; i++) deco(-60.6 + i * 0.9, -60 + i * 0.9, 1.05, 1.45, 3.4, 4.1, 0xa07a4a); // boxes on the counter
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(-62 + i * 0.7, -61.4 + i * 0.7, j * 0.45, j * 0.45 + 0.42, 0, 0.6, 0xa07a4a); // pallet of spare boxes
  ctx.npc(-58, 1.8, 0x3a3f47, 0); ctx.npc(-56, 1.8, 0x3a3f47, 0);
  ctx.sign('Box Issuance', -58, 0.62, 2.88, { size: 0.32, yaw: Math.PI });
  box(-54, -52.8, 0, 1.15, 4, 5.2, 0x2a2a2a); deco(-53.9, -52.9, 1.15, 1.25, 4.1, 5.1, 0xff2a2a); // badge shredder
  ctx.sign('Credential Retirement', -53.4, 0.75, 5.23, { size: 0.2, yaw: 0 });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) deco(-50.05, -49.98, 1.4 + j * 1.1, 2.3 + j * 1.1, 20 + i * 2.4, 21.6 + i * 2.4, j % 2 ? 0xd9d2c3 : 0xbfb5a0); // alumni photos
  for (let y = 1; y <= 2.2; y += 0.2) deco(-50.05, -49.98, y, y + 0.02, 34.5, 35.5, 0x222222); // height chart
  box(-56.2, -55.8, 0, 1.5, 34.8, 35.2, 0x222222); deco(-56.5, -55.5, 1.5, 1.9, 34.7, 35.3, 0x111111); // camera on a tripod
  ctx.sign('Alumni Wall', -50.06, 5.3, 26, { size: 0.5, sub: 'Thank you for your contribution', yaw: -Math.PI / 2 });
  ctx.sign('Accompanied Offboarding — Processing', -57, 6.4, 14, { size: 0.75, sub: 'Please have your box ready' });

  // ================================================================ PRISON — the yard
  const spots = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
    const x = -92 + i * 2.5, z = 6 + j * 2.5;
    deco(x - 0.45, x + 0.45, 0.025, 0.035, z - 0.45, z - 0.37, YEL); deco(x - 0.45, x + 0.45, 0.025, 0.035, z + 0.37, z + 0.45, YEL);
    deco(x - 0.45, x - 0.37, 0.025, 0.035, z - 0.37, z + 0.37, YEL); deco(x + 0.37, x + 0.45, 0.025, 0.035, z - 0.37, z + 0.37, YEL);
    spots.push([x, z]);
  }
  spots.forEach(([x, z], k) => { if ((k * 7) % 10 < 6) ctx.npc(x, z, SUIT, -Math.PI / 2); }); // a session in progress, facing the podium
  for (let z = 6; z <= 16; z += 2.5) ctx.sign(String((z - 6) / 2.5 * 9 + 1), -94.2, 0.5, z, { size: 0.35, gold: false }); // row numbers
  // CFO podium (west), steps on the east side, hanging screen behind
  box(PODIUM.x0, PODIUM.x1, 0, PODIUM.h, PODIUM.z0, PODIUM.z1, STEEL_D);
  box(PODIUM.x1, PODIUM.x1 + 0.4, 0, 0.66, 14, 16, STEEL_D); box(PODIUM.x1 + 0.4, PODIUM.x1 + 0.8, 0, 0.33, 14, 16, STEEL_D);
  box(-99.6, -99.1, PODIUM.h, PODIUM.h + 1.2, 14.6, 15.4, WALNUT); deco(-99.65, -99.05, PODIUM.h + 1.2, PODIUM.h + 1.28, 14.5, 15.5, GOLD);
  ctx.npc(-100.4, 15, CFO, Math.PI / 2, PODIUM.h);
  for (const z of [13, 17]) ctx.npc(-101.3, z, GUARD, Math.PI / 2, PODIUM.h);
  ctx.screen(-103.6, 8.6, 15, Math.PI / 2, 10, 3.6, CH.PNL);
  ctx.sign('MANDATORY ALIGNMENT YARD', -84, 9.3, -2.94, { size: 1.0, sub: 'Stand on your number. Smiling is optional but noted.', yaw: 0 });
  for (const [x, z] of [[-90, 19], [-74, 4], [-96, 25]]) ctx.npc(x, z, GUARD, 0); // yard guards

  // ---- the beating area ("Kinetic Performance Feedback")
  const F = FEEDBACK;
  for (const [x0, x1, z0, z1] of [[F.x0, F.x1, F.z0, F.z0 + 0.2], [F.x0, F.x1, F.z1 - 0.2, F.z1], [F.x0, F.x0 + 0.2, F.z0, F.z1], [F.x1 - 0.2, F.x1, F.z0, F.z1]]) deco(x0, x1, 0.025, 0.04, z0, z1, 0xd62839);
  deco(F.x0 + 0.2, F.x1 - 0.2, 0.02, 0.03, F.z0 + 0.2, F.z1 - 0.2, 0x7a6f66);
  ctx.sign('Kinetic Performance Feedback', (F.x0 + F.x1) / 2, 5.2, (F.z0 + F.z1) / 2, { size: 0.7, sub: 'Feedback is a gift' });
  for (const [x, z] of [[F.x0 - 1, F.z0 + 1], [F.x0 - 1, F.z1 - 1]]) ctx.npc(x, z, SUIT, Math.PI / 2); // colleagues made to watch

  // ---- holding cells ("Transition Suites"): glass row along the south wall
  // one unified glass enclosure (user, 2026-11-06): no partitions, glass front and glass end walls
  const HC = { x0: -104, x1: -66, z0: 31, z1: 39, h: 4 };
  deco(HC.x0, HC.x1, 0.03, 0.04, HC.z0 + 0.1, HC.z1, 0x4a2a5a); // plush carpet
  ctx.glassBox(HC.x0, HC.x1, 0, HC.h, HC.z0 - 0.05, HC.z0 + 0.05, 0xbfe6ff, true); // glass front
  for (const x of [HC.x0, HC.x1 - 0.1]) ctx.glassBox(x, x + 0.1, 0, HC.h, HC.z0, HC.z1, 0xbfe6ff, true); // glass ends
  ctx.glassBox(HC.x0, HC.x1, HC.h - 0.1, HC.h, HC.z0, HC.z1, 0xbfe6ff, false); // glass roof (seen from the catwalk)
  for (let x = HC.x0; x <= HC.x1 + 0.01; x += 4.75) deco(Math.min(x, HC.x1 - 0.12), Math.min(x, HC.x1 - 0.12) + 0.12, 0, HC.h, HC.z0 - 0.08, HC.z0 + 0.08, GOLD); // gold mullions
  deco(HC.x0, HC.x1, HC.h - 0.1, HC.h, HC.z0 - 0.1, HC.z0 + 0.1, GOLD);
  for (let x = HC.x0 + 3; x < HC.x1 - 2; x += 6) deco(x, x + 2, 3.8, 3.9, 34.5, 35.5, 0xe8f6ff); // cold lights
  box(HC.x0 + 0.6, HC.x1 - 0.6, 0, 0.45, 37.8, 38.8, VELVET); deco(HC.x0 + 0.6, HC.x1 - 0.6, 0.45, 1.2, 38.6, 38.8, VELVET); // one long velvet bench
  for (const x of [-96, -85, -74]) { box(x - 0.4, x + 0.4, 0, 0.9, 31.6, 32.4, WALNUT); deco(x - 0.4, x + 0.4, 0.9, 0.95, 31.6, 32.4, GOLD); } // shared minibars
  for (const x of [-102.5, -90.5, -79.5, -68]) { box(x - 0.2, x + 0.2, 0, 0.4, 31.6, 32, 0x8a6a4a); deco(x - 0.08, x + 0.08, 0.4, 0.75, 31.72, 31.88, 0x7a8a3a); } // sad plants
  for (const x of [-101, -97, -92, -88, -83, -77, -71]) { ctx.npc(x, 38.15, SUIT, Math.PI, 0, { sit: true }); deco(x - 0.25, x + 0.25, 0.45, 0.8, 38, 38.4, 0xa07a4a); } // associates waiting, boxes on the bench
  for (const [x, z] of [[-94, 34], [-80, 33.5]]) ctx.npc(x, z, SUIT, Math.PI / 3); // pacing
  ctx.sign('Transition Suite', -85, 4.75, 30.92, { size: 0.5, sub: 'Open plan · complimentary minibar · checkout is final', yaw: Math.PI });

  // ================================================================ PRISON — catwalks at 6 m
  for (const [x0, x1, z0, z1] of Object.values(CAT)) {
    box(x0, x1, CW_Y - 0.25, CW_Y, z0, z1, STEEL_D);
    for (let a = (x1 - x0 > z1 - z0 ? x0 : z0) + 0.5; a < (x1 - x0 > z1 - z0 ? x1 : z1); a += 1) { // grating lines underneath
      if (x1 - x0 > z1 - z0) deco(a, a + 0.05, CW_Y - 0.3, CW_Y - 0.25, z0, z1, STEEL); else deco(x0, x1, CW_Y - 0.3, CW_Y - 0.25, a, a + 0.05, STEEL);
    }
  }
  // inner rails (gap where the stair's landing joins the west catwalk) + the outer rail over processing
  railRun('x', CAT.w[1], CAT.e[0], CAT.n[3] - 0.1, CAT.n[3], CW_Y);
  railRun('x', CAT.w[1], CAT.e[0], CAT.s[2], CAT.s[2] + 0.1, CW_Y);
  railRun('z', CAT.n[3], CAT.s[2], CAT.w[1] - 0.1, CAT.w[1], CW_Y, [[21, STAIR.zBot - STAIR.n * STAIR.tread]]);
  railRun('z', CAT.n[3], CAT.s[2], CAT.e[0] - 0.1, CAT.e[0], CW_Y);
  railRun('z', CAT.n[2], 39, -64.1, -64, CW_Y);
  // columns under the inner edges
  for (const x of [-98, -90, -82, -74]) box(x - 0.15, x + 0.15, 0, CW_Y - 0.25, -0.8, -0.5, STEEL);
  for (const z of [8, 16, 24]) { box(-66.65, -66.35, 0, CW_Y - 0.25, z - 0.15, z + 0.15, STEEL); box(-64.3, -64, 0, CW_Y - 0.25, z - 0.15, z + 0.15, STEEL); }
  for (const z of [6, 14]) box(-106.65, -106.35, 0, CW_Y - 0.25, z - 0.15, z + 0.15, STEEL);
  for (let x = -102; x <= -68; x += 8.5) deco(x, x + 0.25, 0, CW_Y - 0.25, 38.6, 38.9, STEEL); // catwalk posts against the south wall (behind the glass)
  // the stair: 24 risers of 0.25 m up to the north, then a landing onto the west catwalk
  for (let i = 0; i < STAIR.n; i++) {
    const z1 = STAIR.zBot - i * STAIR.tread, z0 = z1 - STAIR.tread, top = (i + 1) * STAIR.rise;
    box(STAIR.x0, STAIR.x1, 0, top, z0, z1, 0x5c6169);
    deco(STAIR.x0, STAIR.x1, top - 0.03, top, z0, z0 + 0.06, YEL);
    box(STAIR.x1, STAIR.x1 + 0.12, top + 0.9, top + 1.0, z0, z1, STEEL); // hand rail
    deco(STAIR.x1, STAIR.x1 + 0.12, top, top + 0.9, z0, z0 + 0.05, STEEL);
  }
  const zTop = STAIR.zBot - STAIR.n * STAIR.tread;
  box(STAIR.x0, STAIR.x1, CW_Y - 0.25, CW_Y, 21, zTop, STEEL_D);
  rail(STAIR.x1, STAIR.x1 + 0.12, 21, zTop, CW_Y);
  rail(STAIR.x0, STAIR.x1 + 0.12, 20.9, 21, CW_Y);
  // searchlights on the catwalk corners, aimed at the yard
  for (const [x, z] of [[-107.8, -1.8], [-65.2, -1.8], [-107.8, 37.8], [-65.2, 37.8]]) {
    deco(x - 0.3, x + 0.3, CW_Y + 1.1, CW_Y + 1.6, z - 0.3, z + 0.3, 0xffffcc);
    deco(x - 0.08, x + 0.08, CW_Y, CW_Y + 1.1, z - 0.08, z + 0.08, STEEL);
  }
  ctx.sign('Observation Walkway — Asset Protection only', -86, CW_Y + 2.2, -1.8, { size: 0.45, gold: false });

  // ================================================================ lift hall (two portals)
  luxLiftHall(ctx0, L, {
    s: -1, H: ctx0.floor.height, P: SECP, ceo: 'ceo',
    banks: [['ot_high', 'OFFICE HIGH-RISE · L · 3–5', false], ['freight_ot', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['ot_high', ['L', '3', '4', '5']]],
    portals: [
      { z: -14, half: 4, top: 5.5, text: 'ASSET PROTECTION SERVICES', sub: 'Client Reception · by appointment or by alignment', textH: 0.5 },
      { z: 14, half: 3, top: 4.2, text: 'ACCOMPANIED OFFBOARDING', sub: 'Processing entrance · associates in transition only', textH: 0.6, runner: false }, // its yellow lane is the runner
    ],
    hallFloor: (LL, x0, x1, z0, z1) => { // marble on the client side, dark concrete on the processing side
      if (z0 < 0) LL.floor(x0, x1, z0, Math.min(z1, 0), 0.012, 'marble');
      if (z1 > 0) LL.floor(x0, x1, Math.max(z0, 0), z1, 0.012, 'concreteDark');
    },
  });
  securityHall(ctx);

  // ================================================================ animated life (2 instanced meshes)
  const PATH = [[-44, 14], [-52.5, 14], [-58, 7], [-65, 29], [-95, 29], [-95, 3], [-68, 3], [-57, 14]]; // the offboarding parade loop
  const segs = PATH.map((p, i) => { const q = PATH[(i + 1) % PATH.length]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
  const LOOP = segs.reduce((a, s) => a + s.len, 0);
  const at = (s) => {
    s = ((s % LOOP) + LOOP) % LOOP;
    for (const sg of segs) {
      if (s <= sg.len) { const u = s / sg.len; return [sg.p[0] + (sg.q[0] - sg.p[0]) * u, sg.p[1] + (sg.q[1] - sg.p[1]) * u, Math.atan2(sg.q[0] - sg.p[0], sg.q[1] - sg.p[1])]; }
      s -= sg.len;
    }
    return [PATH[0][0], PATH[0][1], 0];
  };
  const CATLOOP = [[-107.75, -1.75], [-65.25, -1.75], [-65.25, 37.75], [-107.75, 37.75]];
  const catSegs = CATLOOP.map((p, i) => { const q = CATLOOP[(i + 1) % 4]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
  const CLOOP = catSegs.reduce((a, s) => a + s.len, 0);
  const catAt = (s) => {
    s = ((s % CLOOP) + CLOOP) % CLOOP;
    for (const sg of catSegs) { if (s <= sg.len) { const u = s / sg.len; return [sg.p[0] + (sg.q[0] - sg.p[0]) * u, sg.p[1] + (sg.q[1] - sg.p[1]) * u]; } s -= sg.len; }
    return CATLOOP[0];
  };

  const N_PARADE = 6, N_PEOPLE = N_PARADE + 2 + GROUPS.length * 3 + 3;
  const people = peopleInstanced(ctx0, N_PEOPLE);
  const propGeo = new THREE.BoxGeometry(1, 1, 1), propMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.1 });
  const props = new THREE.InstancedMesh(propGeo, propMat, N_PARADE + GROUPS.length * 2);
  props.frustumCulled = false;
  const col = new THREE.Color();
  let pi = 0;
  const idx = { parade: [], escort: [], victims: [], beaters: [], patrol: [] };
  const SK = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850];
  for (let k = 0; k < N_PARADE; k++) { idx.parade.push(pi); people.color(pi++, SUIT, SK[k % 5]); }
  for (let k = 0; k < 2; k++) { idx.escort.push(pi); people.color(pi++, GUARD, SK[(k + 2) % 5]); }
  for (let g = 0; g < GROUPS.length; g++) {
    idx.victims.push(pi); people.color(pi++, SUIT, SK[(g + 1) % 5]);
    for (let k = 0; k < 2; k++) { idx.beaters.push(pi); people.color(pi++, GUARD, SK[(g + k + 3) % 5]); }
  }
  for (let k = 0; k < 3; k++) { idx.patrol.push(pi); people.color(pi++, GUARD, SK[k % 5]); }
  for (let k = 0; k < N_PARADE; k++) props.setColorAt(k, col.set(0xa07a4a)); // carried boxes
  for (let k = N_PARADE; k < props.count; k++) props.setColorAt(k, col.set(0x111111)); // batons
  ctx.group.add(props);
  disposables.push(propGeo, propMat);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), dir = new THREE.Vector3();
  const stand = (i, x, z, yaw, y = 0, bob = 0) => { q.setFromAxisAngle(UP, yaw); m4.compose(v.set(x, e + y + 0.85 + bob, z), q, sc); people.set(i, m4); };
  const SPACING = 1.3, SPEED = 1.3, PATROL = 1.2;
  let t = 0;
  const place = () => {
    // parade: escort guard in front, six associates with boxes, escort guard behind
    const head = t * SPEED;
    { const [x, z, yaw] = at(head + 1.6); stand(idx.escort[0], x, z, yaw); }
    for (let k = 0; k < N_PARADE; k++) {
      const [x, z, yaw] = at(head - k * SPACING);
      const bob = Math.abs(Math.sin(t * 6 + k)) * 0.04;
      stand(idx.parade[k], x, z, yaw, 0, bob);
      q.setFromAxisAngle(UP, yaw);
      m4.compose(v.set(x + Math.sin(yaw) * 0.38, e + 1.05 + bob, z + Math.cos(yaw) * 0.38), q, dir.set(0.55, 0.36, 0.42));
      props.setMatrixAt(k, m4);
    }
    { const [x, z, yaw] = at(head - N_PARADE * SPACING - 0.4); stand(idx.escort[1], x, z, yaw); }
    // beating groups: two guards swing batons; the associate staggers, falls, lies there, gets up
    GROUPS.forEach(([vx, vz], g) => {
      const T = 4.4, ph = ((t + g * 1.37) % T + T) % T;
      let a; // fall angle
      if (ph < 1.6) a = 0.08 * Math.abs(Math.sin(ph * 9));
      else if (ph < 2.1) a = ((ph - 1.6) / 0.5) * Math.PI / 2;
      else if (ph < 3.3) a = Math.PI / 2;
      else a = (1 - (ph - 3.3) / 0.9) * Math.PI / 2;
      const fallYaw = g * 1.9 + 0.6;
      axis.set(Math.cos(fallYaw), 0, -Math.sin(fallYaw));
      q.setFromAxisAngle(axis, Math.min(a, Math.PI / 2));
      const fx = Math.sin(fallYaw), fz = Math.cos(fallYaw);
      const cy = Math.max(0.3, 0.85 * Math.cos(a));
      m4.compose(v.set(vx + fx * 0.85 * Math.sin(a), e + cy, vz + fz * 0.85 * Math.sin(a)), q, sc);
      people.set(idx.victims[g], m4);
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const gx = vx + Math.cos(fallYaw) * side * 1.15, gz = vz - Math.sin(fallYaw) * side * 1.15;
        const yawG = Math.atan2(vx - gx, vz - gz);
        const lean = a > 1 ? 0.12 : 0;
        stand(idx.beaters[g * 2 + k], gx, gz, yawG, 0, Math.abs(Math.sin(t * 7 + k)) * 0.05 - lean);
        // baton: pivot at the hand, swings from raised to struck down
        const th = 0.7 + 1.2 * Math.sin(t * (a > 1 ? 9 : 7) + k * Math.PI + g);
        const hx = gx + Math.sin(yawG) * 0.35, hz = gz + Math.cos(yawG) * 0.35;
        dir.set(Math.sin(yawG) * Math.sin(th), Math.cos(th), Math.cos(yawG) * Math.sin(th)).normalize();
        q.setFromUnitVectors(UP, dir);
        m4.compose(v.set(hx + dir.x * 0.4, e + 1.4 + dir.y * 0.4, hz + dir.z * 0.4), q, axis.set(0.07, 0.8, 0.07));
        props.setMatrixAt(N_PARADE + g * 2 + k, m4);
      }
    });
    // catwalk patrol
    idx.patrol.forEach((i, k) => {
      const s = t * PATROL + k * (CLOOP / 3);
      const [x, z] = catAt(s), [x2, z2] = catAt(s + 0.5);
      stand(i, x, z, Math.atan2(x2 - x, z2 - z), CW_Y, Math.abs(Math.sin(t * 5 + k)) * 0.03);
    });
    people.commit();
    props.instanceMatrix.needsUpdate = true;
  };
  place();
  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;
    t += dt;
    place();
  });

  L.build();
  ctx0.disposables.push(...disposables);
}

// ---------------------------------------------------------------- the lift hall (X -50..-30)
// North half luxury (marble, gold, red carpet to the luxury portal at Z -14), south half grim
// (dark concrete, hazard stripes, yellow lane from the freight lift to the processing portal at Z 14).
function securityHall(ctx) {
  const { box, deco } = { box: ctx.box.bind(ctx), deco: ctx.deco.bind(ctx) };
  // (floors, ceiling, lighting, planters and kiosks come from the shared Phase 1 hall: luxHall.js)
  for (let x = -49.7; x < -35.2; x += 1.2) { deco(x, x + 0.6, 0.03, 0.04, -0.3, 0.3, YEL); deco(x + 0.6, x + 1.2, 0.03, 0.04, -0.3, 0.3, 0x111111); }
  // red carpet to the luxury portal; yellow lane from the freight lift to the processing portal
  deco(-49.7, -43, 0.03, 0.045, -15.5, -12.5, 0x8c1a1a);
  for (const z of [-15.5, -12.62]) deco(-49.7, -43, 0.045, 0.05, z, z + 0.12, GOLD);
  for (const [x0, x1, z0, z1] of [[-46.1, -35.2, 22.4, 22.6], [-46.1, -35.2, 24.4, 24.6], [-46.1, -45.9, 12.6, 24.6], [-49.7, -45.9, 12.6, 12.8], [-44.1, -43.9, 15.2, 22.4], [-49.7, -43.9, 15.2, 15.4]]) deco(x0, x1, 0.03, 0.04, z0, z1, YEL);
  for (const z of [-30, -6]) { deco(-43.05, -42.95, 8.4, 11.6, z - 0.05, z + 0.05, GOLD); deco(-44.2, -41.8, 7.4, 8.4, z - 1.2, z + 1.2, 0xffe9a8); } // gold chandeliers

  // luxury portal (Z -18..-10, 5.5 m): gold pilasters, lintel, crest sign
  for (const [za, zb] of [[-19.6, -18], [-10, -8.4]]) { box(-51.2, -48.6, 0, 6.9, za, zb, GOLD); deco(-51.25, -48.55, 6.6, 6.9, za - 0.05, zb + 0.05, 0xfff0c8); }
  deco(-51.2, -48.6, 5.5, 6.9, -18, -10, GOLD);
  ctx.npc(-47.6, -8.6, GUARD, Math.PI / 2); // doorman in a suit

  // processing portal (Z 11..17, 4.2 m): steel frame, hazard stripes, wellness-screening arch
  for (const [za, zb] of [[9.8, 11], [17, 18.2]]) {
    box(-50.9, -48.8, 0, 4.9, za, zb, STEEL_D);
    for (let y = 0.3; y < 4.6; y += 0.7) deco(-48.8, -48.75, y, y + 0.35, za, zb, YEL);
  }
  deco(-50.9, -48.8, 4.2, 4.9, 11, 17, STEEL_D);
  for (let z = 11; z < 17; z += 0.8) deco(-48.8, -48.75, 4.35, 4.75, z, z + 0.4, YEL);
  for (const z of [12.6, 15.1]) box(-48, -47.4, 0, 2.6, z, z + 0.3, 0x707a88); // screening arch posts
  deco(-48, -47.4, 2.4, 2.7, 12.6, 15.4, YEL);
  ctx.npc(-47.2, 10.2, GUARD, Math.PI / 2); ctx.npc(-47.2, 17.8, GUARD, Math.PI / 2);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) box(-49.4 + j * 0.7, -48.8 + j * 0.7, i * 0.45, i * 0.45 + 0.42, 31, 31.7, 0xa07a4a); // box supply

  ctx.sign('Asset Protection — Screening Hall', -35.16, 7.4, 0, { size: 0.7, sub: 'Clients to the right · associates in transition to the left', yaw: -Math.PI / 2 });
}
