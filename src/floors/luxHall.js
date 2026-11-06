import * as THREE from 'three';
import { plaque } from '../world/lux.js';
import { CARS, BANKS } from '../layout/building.js';
import { liftIndicator } from '../world/lobbyScreens.js';
import { liftState } from './lobby.js';

// Phase 1 lift hall for the bridge floors (OT-01, VT-01), built from one design and mirrored per
// tower. Coordinates are written as d = distance from the atrium facade into the tower (x = s * d,
// s = -1 Office, +1 Wellness), so the same code builds both halls.
//   d 30..35.1  lift core (shafts), clad at d 35.1 with a portal for every door that stops here
//   d 35.1..39.1 the Chief Executive Lift stands proud of the core (Z -25.72..-21.08)
//   d 31..35.1  The Link recess (Z ±6.3, 5 m high) with speed gates at d 33.6 and the access barrier
//   d 35.1..49.6 the hall; d 49.6..50.1 the portal wall to the floor's main space (portal Z ±8.6)
// The palette P names Lux material keys: wall, wallDeep, panel, frame, frameDark, dado, cap, floor,
// runner, edge, liner; plus ink (plaque text colour) and kiosk colours.

const RECESS = { z: 6.3, d: 31.04, top: 5.0 };
const CEO = { d: 39.1, z0: -25.72, z1: -21.08 };
const GATE_D = 33.6;

// coffered ceiling: slab + beams + a light panel in every bay (world x range)
export function ceiling(L, P, H, x0, x1, z0, z1, bay = 3.9) {
  L.box(x0, x1, H - 0.15, H + 0.01, z0, z1, P.wall);
  const nx = Math.max(1, Math.round((x1 - x0) / bay)), nz = Math.max(1, Math.round((z1 - z0) / bay));
  const bx = (x1 - x0) / nx, bz = (z1 - z0) / nz;
  for (let i = 0; i <= nx; i++) { const x = x0 + i * bx; L.box(Math.max(x0, x - 0.18), Math.min(x1, x + 0.18), H - 0.55, H - 0.15, z0, z1, P.wallDeep); }
  for (let j = 0; j <= nz; j++) { const z = z0 + j * bz; for (let i = 0; i < nx; i++) L.box(x0 + i * bx + 0.18, x0 + (i + 1) * bx - 0.18, H - 0.5, H - 0.15, Math.max(z0, z - 0.16), Math.min(z1, z + 0.16), P.wallDeep); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cx = x0 + (i + 0.5) * bx, cz = z0 + (j + 0.5) * bz, hx = bx / 2 - 0.75, hz = bz / 2 - 0.75;
    L.box(cx - hx, cx + hx, H - 0.21, H - 0.17, cz - hz, cz + hz, P.panel);
  }
}
export function planter(L, P, x, z, len = 2.4) {
  L.box(x - 0.55, x + 0.55, 0, 0.85, z - len / 2, z + len / 2, P.frame, { collide: true });
  L.box(x - 0.6, x + 0.6, 0.85, 0.92, z - len / 2 - 0.05, z + len / 2 + 0.05, P.cap);
  for (let i = 0; i < Math.round(len / 0.6); i++) {
    const b = new THREE.IcosahedronGeometry(0.42 + (i % 2) * 0.1, 0); b.translate(x, 1.2 + (i % 3) * 0.12, z - len / 2 + 0.3 + i * 0.6);
    L.geo(b, 'foliage', i % 2 ? 0x3f7a3a : 0x4e8f45);
  }
}
function fitFont(g, text, maxW, size, weight, family) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 8);
}

/**
 * opts: { s, H (hall ceiling), P, ceo: bank id, banks: [[bankId, label, board?]], kiosks: [[bankId, floors[]]],
 *         link: { text, id }, portalText, portalSub, board(ctx, x, y, z, yaw, w, h), pylon(list), extras(api) }
 */
export function luxLiftHall(ctx, L, o) {
  const { s, H, P } = o;
  const PH = (o.portal?.half ?? 8) + 0.6, PT = (o.portal?.top ?? 8) + 0.6; // hall-side opening of the portal wall
  const X = (d) => s * d;
  const bx = (d0, d1, y0, y1, z0, z1, m, opt) => L.box(X(d0), X(d1), y0, y1, z0, z1, m, opt);
  const yawCore = s * Math.PI / 2; // facing the hall from the core
  const yawPortal = -yawCore; // facing the hall from the portal wall
  const fl = ctx.floor;
  const cars = CARS.filter((c) => BANKS[c.bank].stops.includes(fl.id) && (s < 0 ? c.x1 > -30.1 && c.x0 > -40 : c.x0 < 30.1 && c.x1 < 40));
  const ceo = cars.find((c) => c.bank === o.ceo);
  const coreCars = cars.filter((c) => c !== ceo);
  const SPLIT = 4.2, DC = 35.1, DB = 35.04, DF = 35.14; // core face, cladding back, liner front

  // ---- one landing portal (liners through the wall, sill, architrave, buttons, indicator)
  const portal = (c, dFront, { aw = 0.26, pad = 0.4 } = {}) => {
    const zc = (c.z0 + c.z1) / 2, dw = c.doorW, dh = c.doorH, hw = dw / 2 + pad;
    const dCar = (s < 0 ? -c.x0 : c.x1) - 0.25, da = dFront + 0.08;
    bx(dFront, dCar, 0, dh + 0.85, zc - hw, zc - dw / 2 - 0.02, P.liner, { collide: true });
    bx(dFront, dCar, 0, dh + 0.85, zc + dw / 2 + 0.02, zc + hw, P.liner, { collide: true });
    bx(dFront, dCar, dh - 0.02, dh + 0.85, zc - dw / 2 - 0.02, zc + dw / 2 + 0.02, P.liner);
    bx(dFront, dCar, -0.02, 0.03, zc - dw / 2 - 0.02, zc + dw / 2 + 0.02, 'brushedBronze');
    bx(da, dFront, 0, dh + 1.1, zc - hw - aw, zc - hw, P.frame);
    bx(da, dFront, 0, dh + 1.1, zc + hw, zc + hw + aw, P.frame);
    bx(da, dFront, dh + 0.85, dh + 1.1, zc - hw, zc + hw, P.frame);
    bx(da + 0.012, da, dh + 0.94, dh + 1.0, zc - hw - aw, zc + hw + aw, P.cap);
    bx(da + 0.02, da, 1.05, 1.45, zc - hw - aw + 0.05, zc - hw - aw + 0.21, P.liner);
    for (const y of [1.15, 1.33]) bx(da + 0.035, da + 0.02, y - 0.04, y + 0.04, zc - hw - aw + 0.09, zc - hw - aw + 0.17, 'lampWarm');
    liftIndicator(ctx, X(dFront - 0.02), dh + 1.42, zc, yawCore, () => liftState(c.id));
    return { z0: zc - hw - aw, z1: zc + hw + aw, top: dh + 1.1 };
  };
  const dado = (d0, d1, za, zb, inward) => { // skirting + dado + cap on a wall face running along z at d0 (inward = +1 hall side is larger d)
    for (const [y0, y1, m, t] of [[0, 0.25, P.frame, 0.05], [0.25, 1.2, P.dado, 0.03], [1.2, 1.27, P.cap, 0.04]]) bx(d0, d0 + inward * t, y0, y1, za, zb, m);
  };

  // ---- core wall
  const gaps = coreCars.map((c) => portal(c, DF));
  for (const g of gaps) bx(DC, DB, g.top, SPLIT, g.z0, g.z1, P.wall);
  gaps.push({ z0: CEO.z0, z1: CEO.z1 }, { z0: -RECESS.z - 0.06, z1: RECESS.z + 0.06 });
  gaps.sort((a, b) => a.z0 - b.z0);
  const coreSpan = (za, zb) => { bx(DC, DB, 0, SPLIT, za, zb, P.wall, { collide: true }); dado(DC, DC, za, zb, 1); };
  let z = -38.9;
  for (const g of gaps) { if (g.z0 - z > 0.02) coreSpan(z, g.z0); z = Math.max(z, g.z1); }
  if (38.9 - z > 0.02) coreSpan(z, 38.9);
  for (const [za, zb, y0] of [[-38.9, CEO.z0, SPLIT], [CEO.z1, -RECESS.z - 0.06, SPLIT], [RECESS.z + 0.06, 38.9, SPLIT], [-RECESS.z - 0.06, RECESS.z + 0.06, RECESS.top]]) {
    bx(DC, DB, y0, H - 0.15, za, zb, P.wall);
    bx(DC + 0.1, DC, SPLIT - 0.05, SPLIT + 0.12, za, zb, P.frame);
    bx(DC + 0.12, DC, H - 0.75, H - 0.6, za, zb, P.frame);
  }
  // ---- the Chief Executive Lift, proud of the core
  if (ceo) {
    const fw = CEO.d, cg = portal(ceo, fw + 0.04, { aw: 0.2, pad: 0.2 });
    for (const [za, zb] of [[CEO.z0 + 0.06, cg.z0], [cg.z1, CEO.z1 - 0.06]]) bx(fw, fw - 0.06, 0, H - 0.15, za, zb, P.wall);
    bx(fw, fw - 0.06, cg.top, H - 0.15, cg.z0, cg.z1, P.wall);
    for (const [za, zb] of [[CEO.z0, CEO.z0 + 0.06], [CEO.z1 - 0.06, CEO.z1]]) bx(fw, DC, 0, H - 0.15, za, zb, P.wall);
    for (const [y0, y1, m, t] of [[0.25, 1.2, P.dado, 0.03], [1.2, 1.27, P.cap, 0.04], [0, 0.25, P.frame, 0.05]]) {
      bx(fw, DC, y0, y1, CEO.z0 - t, CEO.z0, m); bx(fw, DC, y0, y1, CEO.z1, CEO.z1 + t, m);
      for (const [za, zb] of [[CEO.z0, cg.z0], [cg.z1, CEO.z1]]) bx(fw + t, fw, y0, y1, za, zb, m);
    }
    for (const zz of [CEO.z0, CEO.z1]) bx(fw + 0.12, fw - 0.12, 0, H - 0.15, zz - 0.12, zz + 0.12, P.frame);
    bx(fw + 0.1, fw, SPLIT + 0.3, SPLIT + 0.47, CEO.z0, CEO.z1, P.frame);
    plaque(ctx, 'CHIEF EXECUTIVE LIFT', X(fw + 0.03), 5.15, (CEO.z0 + CEO.z1) / 2, yawCore, { h: 0.3, color: P.ink });
  }
  // ---- bank plaques, boards, kiosks
  const bankMid = (id, all = false) => { const cs = (all ? CARS : coreCars).filter((c) => c.bank === id); return cs.length ? (Math.min(...cs.map((c) => c.z0)) + Math.max(...cs.map((c) => c.z1))) / 2 : null; };
  for (const [id, label, board] of o.banks) {
    const zm = bankMid(id, true); if (zm == null) continue;
    if (bankMid(id) != null) plaque(ctx, label, X(DC + 0.03), 4.75, zm, yawCore, { h: 0.3, color: P.ink });
    if (board && o.board) o.board(ctx, X(DC + 0.03), 7.9, zm, yawCore, 9.6, 2.7);
  }
  for (const [id, floorsTxt] of o.kiosks) { const zm = bankMid(id); if (zm != null) for (const dz of [-3.2, 3.2]) kiosk(ctx, L, P, X(43.6), zm + dz, s, floorsTxt); }

  // ---- The Link recess
  const R = RECESS;
  for (const sz of [-1, 1]) bx(DC, R.d, 0, R.top, sz * R.z - (sz > 0 ? 0 : 0.06), sz * R.z + (sz > 0 ? 0.06 : 0), P.wall);
  for (const [za, zb] of [[-R.z, -3.34], [3.34, R.z]]) bx(R.d + 0.06, R.d, 0, R.top, za, zb, P.wall);
  bx(R.d + 0.06, R.d, 4.34, R.top, -3.34, 3.34, P.wall);
  for (const sz of [-1, 1]) bx(R.d + 0.1, 30.0, 0, 4.34, sz < 0 ? -3.34 : 2.96, sz < 0 ? -2.96 : 3.34, P.frame); // Link jambs
  bx(R.d + 0.1, 30.0, 3.96, 4.34, -3.34, 3.34, P.frame);
  bx(DC, R.d, R.top - 0.08, R.top, -R.z, R.z, P.wall);
  bx(DC - 0.5, R.d + 0.5, R.top - 0.12, R.top - 0.08, -R.z + 0.8, R.z - 0.8, P.panel);
  for (const sz of [-1, 1]) bx(DC + 0.14, DC - 0.14, 0, R.top + 0.3, sz * R.z - 0.16, sz * R.z + 0.16, P.frame);
  bx(DC + 0.14, DC - 0.02, R.top - 0.02, R.top + 0.3, -R.z - 0.16, R.z + 0.16, P.frame);
  bx(DC + 0.152, DC + 0.14, R.top + 0.1, R.top + 0.18, -R.z - 0.16, R.z + 0.16, P.cap);
  plaque(ctx, o.link.text, X(DC + 0.04), 6.25, 0, yawCore, { h: 0.42, color: P.ink, sub: 'Link Access Credential required' });
  for (const zc of [-3.1, -1.6, 1.6, 3.1]) { // speed gates: a wide escort lane in the middle for the cash robots
    bx(GATE_D - 0.85, GATE_D + 0.85, 0, 1.0, zc - 0.14, zc + 0.14, P.liner, { collide: true });
    bx(GATE_D - 0.86, GATE_D + 0.86, 1.0, 1.04, zc - 0.15, zc + 0.15, P.frameDark);
    bx(GATE_D + 0.6, GATE_D + 0.75, 1.04, 1.06, zc - 0.08, zc + 0.08, 'downlight');
  }
  for (const zc of [-2.35, 0, 2.35]) bx(GATE_D - 0.05, GATE_D + 0.05, 0.3, 1.1, zc - (zc ? 0.5 : 1.3), zc + (zc ? 0.5 : 1.3), 'glass');
  for (const sz of [-1, 1]) {
    const za = sz < 0 ? -R.z : 3.24, zb = sz < 0 ? -3.24 : R.z;
    bx(GATE_D - 0.04, GATE_D + 0.04, 0, 2.2, za, zb, 'glass');
    bx(GATE_D - 0.06, GATE_D + 0.06, 2.2, 2.3, za, zb, P.frame);
    ctx.colliders.push({ x0: Math.min(X(GATE_D - 0.15), X(GATE_D + 0.15)), x1: Math.max(X(GATE_D - 0.15), X(GATE_D + 0.15)), z0: za, z1: zb, y0: ctx.e, y1: ctx.e + 2.2 });
  }
  ctx.barrier(X(GATE_D - 0.15), X(GATE_D + 0.15), -3.0, 3.0, 1.2, 'bridge', o.link.id);
  ctx.barriers[ctx.barriers.length - 1].mesh.visible = false; // the speed gates are the visible gate
  for (const sz of [-1, 1]) L.person(X(36.8), sz * 4.6, { yaw: yawCore, suit: 0x111418, skin: sz < 0 ? 0xc68c62 : 0x8d5a3b, hair: 0x111111 });

  // ---- hall shell
  for (const [d0, d1, z0, z1] of [[49.6, CEO.d, -38.9, 38.9], [CEO.d, DC, -38.9, CEO.z0], [CEO.d, DC, CEO.z1, 38.9], [DC, R.d, -R.z, R.z]]) L.floor(Math.min(X(d0), X(d1)), Math.max(X(d0), X(d1)), z0, z1, 0.012, P.floor, P.floorTile || 2);
  const runner = (d0, d1, z0, z1, alongX) => {
    const x0 = Math.min(X(d0), X(d1)), x1 = Math.max(X(d0), X(d1));
    L.box(x0, x1, 0.012, 0.022, z0, z1, P.runner);
    if (alongX) for (const zz of [z0 + 0.12, z1 - 0.2]) L.box(x0, x1, 0.012, 0.026, zz, zz + 0.08, P.edge);
    else for (const xx of [x0 + 0.12, x1 - 0.2]) L.box(xx, xx + 0.08, 0.012, 0.026, z0, z1, P.edge);
  };
  runner(49.56, R.d, -2, 2, true);
  runner(47.4, 45.4, -37, -2, false); runner(47.4, 45.4, 2, 37, false);
  const HW0 = 49.66, HW1 = 49.6;
  for (const [za, zb] of [[-38.9, -PH], [PH, 38.9]]) { bx(HW0, HW1, 0, H - 0.15, za, zb, P.wall); dado(HW1, HW1, za, zb, -1); }
  bx(HW0, HW1, PT, H - 0.15, -PH, PH, P.wall);
  for (const zz of [-34, -26, -18, 18, 26, 34]) bx(HW1, HW1 - 0.3, 0, H - 0.15, zz - 0.35, zz + 0.35, P.frame);
  bx(HW1, HW1 - 0.12, H - 0.75, H - 0.6, -38.9, 38.9, P.frame);
  for (const zz of [-38.96, 38.9]) {
    const f = zz < 0 ? zz + 0.06 : zz, dz = zz < 0 ? 1 : -1;
    bx(49.6, DC, 0, H - 0.15, zz, zz + 0.06, P.wall);
    for (const [y0, y1, m, t] of [[0, 0.25, P.frame, 0.05], [0.25, 1.2, P.dado, 0.03], [1.2, 1.27, P.cap, 0.04]]) bx(49.6, DC, y0, y1, Math.min(f, f + dz * t), Math.max(f, f + dz * t), m);
  }
  const cx = (d0, d1) => [Math.min(X(d0), X(d1)), Math.max(X(d0), X(d1))];
  ceiling(L, P, H, ...cx(49.6, CEO.d), -38.9, 38.9, 3.8);
  ceiling(L, P, H, ...cx(CEO.d, DC), -38.9, CEO.z0, 3.8);
  ceiling(L, P, H, ...cx(CEO.d, DC), CEO.z1, 38.9, 3.8);
  plaque(ctx, o.portalText, X(HW1 - 0.04), PT + 0.9, 0, yawPortal, { h: 1.1, color: P.ink, sub: o.portalSub });
  for (const zz of [-12, 12, -30, 30]) planter(L, P, X(48.7), zz, 2.4);
  if (o.pylon) {
    const list = [];
    for (const zz of [-22, 22]) {
      bx(49.0, 47.9, 0, 3.6, zz - 0.6, zz + 0.6, P.frame, { collide: true });
      bx(49.05, 47.85, 3.6, 3.75, zz - 0.65, zz + 0.65, P.cap);
      for (const y of [2.65, 1.55]) list.push({ x: X(47.89), y: ctx.e + y, z: zz, yaw: yawPortal, w: 1.0, h: 0.66, k: y > 2 ? 0 : 1 });
    }
    o.pylon(list);
  }
  L.person(X(44.6), 0.5, { yaw: yawPortal, suit: P.hostSuit ?? 0x1c2a4e, skin: 0xc68c62, hair: 0x2a1a10 });
  return { X, bx, yawCore, yawPortal };
}

// destination kiosk (one shared texture per floor list)
const KIOSK = new Map();
function kiosk(ctx, L, P, x, z, s, floorsTxt) {
  L.box(x - 0.25, x + 0.25, 0, 1.05, z - 0.3, z + 0.3, P.frame, { collide: true });
  L.box(x - 0.27, x + 0.27, 1.05, 1.1, z - 0.32, z + 0.32, P.frameDark);
  const key = floorsTxt.join('') + P.kioskBg;
  let mat = KIOSK.get(key);
  if (!mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = P.kioskBg; g.fillRect(0, 0, 256, 180);
    g.fillStyle = '#f0e4c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitFont(g, 'SELECT DESTINATION', 226, 22, '600', 'sans-serif'); g.fillText('SELECT DESTINATION', 128, 24);
    floorsTxt.forEach((f, i) => {
      const bxx = 28 + (i % 2) * 108, by = 54 + Math.floor(i / 2) * 60;
      g.fillStyle = P.kioskBtn; g.fillRect(bxx, by, 92, 48); g.strokeStyle = P.kioskEdge; g.lineWidth = 3; g.strokeRect(bxx, by, 92, 48);
      g.fillStyle = '#ffffff'; g.font = '700 28px sans-serif'; g.fillText(f, bxx + 46, by + 25);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    KIOSK.set(key, mat);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), mat);
  m.position.set(x + s * 0.255, ctx.e + 1.0, z); m.rotation.set(-0.35, s * Math.PI / 2, 0, 'YXZ');
  ctx.add(m, m.geometry);
}
