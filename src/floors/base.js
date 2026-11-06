import * as THREE from 'three';
import { FloorCtx, MAT, makeSign } from '../world/geom.js';
import { BANKS, CARS, FLOOR_BY_ID } from '../layout/building.js';

// Tower colour palettes (greybox: colour only tells you where you are)
export const PALETTE = {
  OT: { floor: 0x8d97a8, wall: 0xd9dde5, room: 0xa7b3c8, core: 0x4a5160 },
  VT: { floor: 0xb59a7a, wall: 0xeee2cf, room: 0xcdb390, core: 0x5e5040 },
  L0: { floor: 0xd8d0c0, wall: 0xf1ece0, room: 0xe2d7c2, core: 0x555 },
  B1: { floor: 0x6d6d6d, wall: 0xa9a9a9, room: 0x878787, core: 0x3a3a3a },
  PLAZA: { floor: 0xb8b2a6, wall: 0xd8d0c0, room: 0xa8a294, core: 0x555 },
  BRIDGE: { floor: 0xe8f4ff, wall: 0x9fd8ff, room: 0xe8f4ff, core: 0x333 },
};
const SHAFT = 0x3d4250, DOOR = 0xb8b8c0;
const EXT = 1; // exterior wall thickness
const INT = 0.3; // interior wall thickness
const SW = 0.2; // shaft wall thickness
const EPS = 0.01;

// ---------------------------------------------------------------- shafts
// Vertical extent of a car's shaft: lowest stop .. highest stop + cab.
export function shaftExtent(car) {
  const ys = BANKS[car.bank].stops.map((s) => FLOOR_BY_ID[s].elevation);
  return { y0: Math.min(...ys), y1: Math.max(...ys) + car.carH + 0.6 };
}
const inside = (c, b) => c.x0 >= b.x0 - EPS && c.x1 <= b.x1 + EPS && c.z0 >= b.z0 - EPS && c.z1 <= b.z1 + EPS;

// Rectangle minus holes -> list of rectangles (grid slicing).
export function subtractRects(rect, holes) {
  const hs = holes.filter((h) => h.x1 > rect.x0 && h.x0 < rect.x1 && h.z1 > rect.z0 && h.z0 < rect.z1);
  if (!hs.length) return [rect];
  const xs = [...new Set([rect.x0, rect.x1, ...hs.flatMap((h) => [h.x0, h.x1])])].filter((v) => v >= rect.x0 && v <= rect.x1).sort((a, b) => a - b);
  const zs = [...new Set([rect.z0, rect.z1, ...hs.flatMap((h) => [h.z0, h.z1])])].filter((v) => v >= rect.z0 && v <= rect.z1).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const holed = hs.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (!holed) { if (run) run.x1 = xs[i + 1]; else run = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] }; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}

// Rect minus a circle, as 1 m rows (for slabs over a sunken bowl).
function circleHoleRows(b, c) {
  const out = [];
  for (let z = b.z0; z < b.z1; z += 1) {
    const z1 = Math.min(b.z1, z + 1);
    const dz = Math.min(Math.abs(z - c.cz), Math.abs(z1 - c.cz)) * ((z - c.cz) * (z1 - c.cz) < 0 ? 0 : 1);
    if (dz >= c.r) { out.push({ x0: b.x0, x1: b.x1, z0: z, z1 }); continue; }
    const half = Math.sqrt(c.r * c.r - dz * dz);
    if (c.cx - half > b.x0) out.push({ x0: b.x0, x1: c.cx - half, z0: z, z1 });
    if (c.cx + half < b.x1) out.push({ x0: c.cx + half, x1: b.x1, z0: z, z1 });
  }
  return out;
}

// ---------------------------------------------------------------- generic shell
export function buildBase(floor) {
  const ctx = new FloorCtx(floor);
  const P = PALETTE[floor.tower];
  const { x0, x1, z0, z1 } = floor.bounds;
  const H = floor.height;
  const e = floor.elevation;

  // shafts passing through this floor
  const through = CARS.filter((c) => { const s = shaftExtent(c); return s.y1 > e + 0.1 && s.y0 < e + H - 0.1; });
  const inShafts = through.filter((c) => inside(c, floor.bounds));
  const stopping = CARS.filter((c) => BANKS[c.bank].stops.includes(floor.id));

  // slab + ceiling, with holes where shafts pass
  const slabHoles = inShafts.filter((c) => shaftExtent(c).y0 < e - 0.1);
  const slabRects = floor.slabHoleCircle ? circleHoleRows(floor.bounds, floor.slabHoleCircle).flatMap((rc) => subtractRects(rc, slabHoles))
    : subtractRects(floor.bounds, [...slabHoles, ...(floor.slabHoleRect ? [floor.slabHoleRect] : [])]); // slabHoleRect: a sunken pit (OT-03)
  for (const rc of slabRects) ctx.deco(rc.x0, rc.x1, floor.tower === 'BRIDGE' ? -0.5 : -0.1, 0, rc.z0, rc.z1, floor.slabColor ?? P.floor);
  if (floor.glassRoof) {
    ctx.glassBox(x0, x1, H - 0.2, H, z0, z1, 0xcfe8ff, false);
    for (let x = x0 + 10; x < x1; x += 10) ctx.deco(x - 0.15, x + 0.15, H - 0.6, H - 0.2, z0, z1, 0xc9a23a);
  } else if (floor.tower !== 'BRIDGE' && !floor.outdoor) {
    const ceilHoles = inShafts.filter((c) => shaftExtent(c).y1 > e + H);
    for (const rc of subtractRects(floor.bounds, ceilHoles)) ctx.deco(rc.x0, rc.x1, H - 0.25, H - 0.15, rc.z0, rc.z1, floor.ceilColor ?? 0xf4f4f0);
  }

  // exterior walls (inside the bounds): gaps for the bridge, for shafts on the edge
  // (their own walls replace the facade), and car doors of shafts just outside.
  if (floor.tower !== 'BRIDGE' && !floor.outdoor) {
    const gaps = { n: [], s: [], e: [], w: [] };
    for (const o of floor.openings || []) gaps[o.side].push({ from: o.from, to: o.to, bottom: o.y0 != null ? o.y0 - e : 0, top: o.y1 != null ? o.y1 - e : 4 });
    for (const c of inShafts) {
      if (Math.abs(c.x1 - x1) < EPS) gaps.e.push({ from: c.z0, to: c.z1, top: H });
      if (Math.abs(c.x0 - x0) < EPS) gaps.w.push({ from: c.z0, to: c.z1, top: H });
    }
    for (const c of stopping) {
      if (inside(c, floor.bounds)) continue;
      const side = BANKS[c.bank].side(floor.id);
      const zc = (c.z0 + c.z1) / 2;
      const g = { from: zc - c.doorW / 2 - 0.1, to: zc + c.doorW / 2 + 0.1, top: c.doorH };
      if (side === 'e' && Math.abs(c.x1 - x0) < EPS) gaps.w.push(g);
      if (side === 'w' && Math.abs(c.x0 - x1) < EPS) gaps.e.push(g);
    }
    const glassAbove = floor.glassRoof ? 15 : null;
    const xWall = (za, zb, side) => {
      if (glassAbove) { ctx.wallX(x0, x1, za, zb, glassAbove, P.wall, gaps[side]); ctx.glass.add(x0, x1, e + glassAbove, e + H, za, zb, 0xcfe8ff); }
      else ctx.wallX(x0, x1, za, zb, H, P.wall, gaps[side]);
    };
    xWall(z0, z0 + EXT, 'n');
    xWall(z1 - EXT, z1, 's');
    ctx.wallZ(z0 + EXT, z1 - EXT, x0, x0 + EXT, H, P.wall, gaps.w);
    ctx.wallZ(z0 + EXT, z1 - EXT, x1 - EXT, x1, H, P.wall, gaps.e);
  }

  // shaft walls (for shafts inside this floor), with landing door gaps
  for (const c of inShafts) {
    const stops = BANKS[c.bank].stops.includes(floor.id);
    const side = stops ? BANKS[c.bank].side(floor.id) : null;
    const zc = (c.z0 + c.z1) / 2;
    const door = (s) => (s === side ? [{ from: zc - c.doorW / 2 - 0.1, to: zc + c.doorW / 2 + 0.1, top: c.doorH }] : []);
    ctx.wallX(c.x0, c.x1, c.z0, c.z0 + SW, H, SHAFT);
    ctx.wallX(c.x0, c.x1, c.z1 - SW, c.z1, H, SHAFT);
    ctx.wallZ(c.z0 + SW, c.z1 - SW, c.x0, c.x0 + SW, H, SHAFT, door('w'));
    ctx.wallZ(c.z0 + SW, c.z1 - SW, c.x1 - SW, c.x1, H, SHAFT, door('e'));
  }

  // landing doors for every car that stops here (instanced, animated by the elevator system)
  const doorRecs = [];
  for (const c of stopping) {
    const side = BANKS[c.bank].side(floor.id);
    const zc = (c.z0 + c.z1) / 2;
    const ins = inside(c, floor.bounds);
    const xPlane = ins ? (side === 'w' ? c.x0 + SW / 2 : c.x1 - SW / 2) : (side === 'e' ? x0 + EXT / 2 : x1 - EXT / 2);
    const rec = { carId: c.id, side, x: xPlane, zc, w: c.doorW, h: c.doorH, open: 0, i: doorRecs.length * 2 };
    doorRecs.push(rec);
    const col = { x0: xPlane - 0.15, x1: xPlane + 0.15, z0: zc - c.doorW / 2 - 0.1, z1: zc + c.doorW / 2 + 0.1, y0: e, y1: e + c.doorH, landing: rec };
    col.openFn = () => rec.open > 0.9;
    ctx.colliders.push(col);
    if (!floor.lux) ctx.sign(`${c.label}`, xPlane + (side === 'w' ? -0.3 : 0.3), c.doorH + 0.45, zc, { size: 0.32, gold: false });
  }
  if (doorRecs.length) {
    const doorMat = floor.lux ? new THREE.MeshStandardMaterial({ color: 0xb4894e, metalness: 0.95, roughness: 0.28 }) : new THREE.MeshLambertMaterial({ color: DOOR });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), doorMat, doorRecs.length * 2);
    mesh.frustumCulled = false;
    ctx.add(mesh, mesh.geometry, mesh.material);
    ctx.landing = { mesh, recs: doorRecs, e };
    setLandingDoors(ctx.landing, true);
  }
  // bank signs above each landing
  for (const lz of floor.elevators) {
    const b = BANKS[lz.bank];
    const cx = lz.side === 'w' ? lz.x0 + 2 : lz.x1 - 2;
    if (!floor.lux) ctx.sign(b.name, cx, Math.min(4.2, H - 0.6), (lz.z0 + lz.z1) / 2, { size: 0.55, sub: b.label }); // lux floors carry real wall signage
    const g = new THREE.PlaneGeometry(lz.x1 - lz.x0, lz.z1 - lz.z0);
    const m = new THREE.Mesh(g, floor.lux ? MAT.elevatorZoneLux : MAT.elevatorZone);
    m.rotation.x = -Math.PI / 2;
    m.position.set((lz.x0 + lz.x1) / 2, e + 0.03, (lz.z0 + lz.z1) / 2);
    ctx.add(m, g);
  }

  // rooms and zones
  for (const rm of floor.rooms) {
    const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
    const w = rm.x1 - rm.x0, d = rm.z1 - rm.z0;
    if (floor.lux && (rm.full || rm.zone)) continue; // Phase 1 floors: no greybox zone tiles or floating labels
    if (rm.full) {
      if (!rm.noSign) ctx.sign(rm.sign, cx, Math.min(H - 1.5, Math.max(4, Math.min(H * 0.55, 14))), cz, { size: Math.min(4, Math.max(1.2, w / 40)) });
      continue;
    }
    if (rm.zone) {
      if (rm.noSign) continue; // dressed by the floor's own module (e.g. OT-04)
      ctx.deco(rm.x0, rm.x1, 0, 0.02, rm.z0, rm.z1, P.room);
      ctx.sign(rm.sign, cx, Math.min(H - 0.8, 4.6), cz, { size: 0.6 });
      continue;
    }
    const h = Math.min(rm.h || H - 0.25, H - 0.25);
    const doors = (rm.doors || []).map((d0) => (typeof d0 === 'string' ? { side: d0 } : d0));
    const doorTop = Math.min(h, Math.max(3, Math.min(5, h * 0.6)));
    const gapsFor = (side, a0, a1) => doors.filter((d0) => d0.side === side).map((d0) => {
      const at = d0.at ?? (a0 + a1) / 2, dw = d0.width || rm.doorWidth || 3;
      return { from: at - dw / 2, to: at + dw / 2, top: d0.top ?? doorTop };
    });
    const open = rm.open || [];
    const wallC = rm.color ?? P.wall; // a room may set its own wall / floor colour (e.g. VT-03's black focus room)
    if (!rm.hall) ctx.deco(rm.x0, rm.x1, 0, 0.015, rm.z0, rm.z1, rm.floorColor ?? P.room); // lift halls lay their own themed floor
    if (!open.includes('n')) ctx.wallX(rm.x0, rm.x1, rm.z0, rm.z0 + INT, h, wallC, gapsFor('n', rm.x0, rm.x1));
    if (!open.includes('s')) ctx.wallX(rm.x0, rm.x1, rm.z1 - INT, rm.z1, h, wallC, gapsFor('s', rm.x0, rm.x1));
    if (!open.includes('w')) ctx.wallZ(rm.z0 + INT, rm.z1 - INT, rm.x0, rm.x0 + INT, h, wallC, gapsFor('w', rm.z0, rm.z1));
    if (!open.includes('e')) ctx.wallZ(rm.z0 + INT, rm.z1 - INT, rm.x1 - INT, rm.x1, h, wallC, gapsFor('e', rm.z0, rm.z1));
    if (h < H - 0.5) ctx.deco(rm.x0, rm.x1, h, h + 0.2, rm.z0, rm.z1, rm.color ?? 0xf4f4f0);
    if (!rm.noSign) ctx.sign(rm.sign, cx, Math.min(h - 0.6, Math.max(2.8, h * 0.6)), cz, { size: Math.min(2.5, Math.max(0.8, Math.min(w, d) / 14)) });
    if (!rm.noDoorSigns) for (const d0 of doors) {
      const off = 0.8;
      const at = d0.at;
      const pos = { n: [at ?? cx, rm.z0 - off], s: [at ?? cx, rm.z1 + off], w: [rm.x0 - off, at ?? cz], e: [rm.x1 + off, at ?? cz] }[d0.side];
      ctx.sign(rm.short, pos[0], doorTop + 0.6, pos[1], { size: 0.55, gold: false });
    }
  }
  return ctx;
}

// Landing door panels: two per door, sliding apart along Z.
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
export function setLandingDoors(landing, force = false) {
  let dirty = false;
  for (const rec of landing.recs) {
    if (!force && rec.shown === rec.open) continue;
    rec.shown = rec.open;
    dirty = true;
    const half = rec.w / 2;
    const slide = rec.open * half;
    for (let k = 0; k < 2; k++) {
      const sgn = k ? 1 : -1;
      const zc = rec.zc + sgn * (half / 2 + slide);
      _m.compose(_p.set(rec.x, landing.e + rec.h / 2, zc), _q, _s.set(0.08, rec.h, half));
      landing.mesh.setMatrixAt(rec.i + k, _m);
    }
  }
  if (dirty) landing.mesh.instanceMatrix.needsUpdate = true;
}

// Finalise: merged meshes, instanced screens and NPCs.
export function finalize(ctx, buildScreens) {
  const s = ctx.solid.build(MAT.solid);
  if (s) { ctx.add(s, s.geometry); if (ctx.floor.lux || ctx.floor.castShadows) { s.castShadow = true; s.receiveShadow = true; } }
  const g = ctx.glass.build(ctx.floor.lux ? MAT.glassLux : MAT.glass);
  if (g) { g.renderOrder = 5; ctx.add(g, g.geometry); }
  if (ctx.screens.length) for (const m of buildScreens(ctx.screens)) ctx.add(m, m.geometry);
  if (ctx.npcs.length) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 8);
    const mesh = new THREE.InstancedMesh(geo, MAT.npc, ctx.npcs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    ctx.npcs.forEach((n, i) => {
      q.setFromAxisAngle(up, n.yaw || 0);
      m4.compose(new THREE.Vector3(n.x, ctx.e + (n.y || 0) + 0.85, n.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(n.color));
    });
    mesh.computeBoundingSphere();
    ctx.add(mesh, geo);
    ctx.npcMesh = mesh;
  }
  return ctx;
}

export { makeSign };
