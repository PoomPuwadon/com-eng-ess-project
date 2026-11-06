import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BANKS, CARS, FLOOR_BY_ID, stopArea, canAccess, REFUSALS, landingZone } from './layout/building.js';
import { luxMaterials } from './world/lux.js';

// Physically moving lifts. Every car travels in its own shaft between its bank's stops,
// with sliding car doors + landing doors. Calls use destination dispatch: you pick your
// floor at the landing, a car is assigned, it comes to you, then takes you there.

const SW = 0.2, GAP = 0.05, WALL = 0.1;
const ACCEL = 1.4; // m/s²
const DOOR_TIME = 1.1; // s to open/close
const DWELL = 4; // s doors stay open

export function rideCheck(role, bank, target, from) {
  const b = BANKS[bank];
  if (!b.stops.includes(target)) return { ok: false, reason: 'This lift does not serve that floor.' };
  if (target === from) return { ok: false, reason: 'You are already here.' };
  if (from && !b.stops.includes(from)) return { ok: false, reason: 'This lift does not stop on this floor.' };
  const area = stopArea(bank, target);
  if (!canAccess(role, area)) return { ok: false, reason: REFUSALS[area] || 'Access restricted.' };
  return { ok: true };
}

// Landing zone (if any) containing a point on a floor.
export function zoneAt(floor, x, z) {
  if (!floor) return null;
  return floor.elevators.find((e) => x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1) || null;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
function setBox(mesh, i, x0, x1, y0, y1, z0, z1) {
  _m.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s.set(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0)));
  mesh.setMatrixAt(i, _m);
}

// ---------------------------------------------------------------- Phase 1 cabin model
// Car-local coordinates: x across the car (doors on both x faces — through-cars), z along the bank,
// y = 0 at the cabin floor. Merged per material.
const cabinKey = (c) => [c.x1 - c.x0, c.z1 - c.z0, c.carH, c.doorW, c.doorH].join('x');
function cabinGeometry(c) {
  // Built from pieces that only touch (never overlap or share a visible face) — no z-fighting.
  const w = c.x1 - c.x0 - 2 * (SW + GAP), d = c.z1 - c.z0 - 2 * (SW + GAP), H = c.carH, dw = c.doorW, dh = c.doorH;
  const hx = w / 2, hz = d / 2, T = WALL, parts = {};
  const box = (mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(Math.max(0.002, x1 - x0), Math.max(0.002, y1 - y0), Math.max(0.002, z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    (parts[mat] ||= []).push(g.index ? g.toNonIndexed() : g);
  };
  box('marble', -hx + T, hx - T, -0.15, 0, -hz, hz); // floor (stops at the door walls; sills fill those)
  box('walnut', -hx, hx, H, H + 0.1, -hz, hz); // ceiling slab
  box('downlight', -hx + 0.4, hx - 0.4, H - 0.03, H, -hz + 0.4, hz - 0.4); // lit panel hung below it
  // side walls (z faces): walnut dado, walnut frame around a mirror infill of the same thickness
  for (const sz of [-1, 1]) {
    const za = sz < 0 ? -hz : hz - T, zb = za + T, inner = sz < 0 ? zb : za, dirIn = -sz;
    box('walnut', -hx, hx, 0, 0.95, za, zb);
    box('walnut', -hx, hx, H - 0.18, H, za, zb);
    box('walnut', -hx, -hx + 0.14, 0.95, H - 0.18, za, zb); box('walnut', hx - 0.14, hx, 0.95, H - 0.18, za, zb);
    box('mirror', -hx + 0.14, hx - 0.14, 0.95, H - 0.18, za, zb);
    const zr0 = inner + dirIn * 0.05, zr1 = inner + dirIn * 0.09; // handrail stands off the wall on brackets
    box('bronze', -hx + 0.3, hx - 0.3, 0.88, 0.93, Math.min(zr0, zr1), Math.max(zr0, zr1));
    for (const xx of [-hx + 0.4, hx - 0.4]) box('bronze', xx - 0.02, xx + 0.02, 0.89, 0.92, Math.min(inner, zr0), Math.max(inner, zr0));
    const zk = inner + dirIn * 0.015; box('bronze', -hx, hx, 0, 0.1, Math.min(inner, zk), Math.max(inner, zk)); // kick plate
  }
  // door walls (x faces): walnut piers + header; bronze frame and fittings stand proud on the inside
  for (const sx of [-1, 1]) {
    const xa = sx < 0 ? -hx : hx - T, xb = xa + T, xi = sx < 0 ? xb : xa, din = -sx;
    const pro = (dx0, dx1) => [Math.min(xi + din * dx0, xi + din * dx1), Math.max(xi + din * dx0, xi + din * dx1)];
    box('walnut', xa, xb, 0, H, -hz + T, -dw / 2); box('walnut', xa, xb, 0, H, dw / 2, hz - T);
    box('walnut', xa, xb, dh, H, -dw / 2, dw / 2);
    box('bronze', ...pro(0, 0.03), 0, dh + 0.08, -dw / 2 - 0.08, -dw / 2); box('bronze', ...pro(0, 0.03), 0, dh + 0.08, dw / 2, dw / 2 + 0.08);
    box('bronze', ...pro(0, 0.03), dh, dh + 0.08, -dw / 2, dw / 2);
    box('lampWarm', ...pro(0, 0.02), dh + 0.14, dh + 0.24, -0.25, 0.25); // floor indicator strip
    box('blackMetal', ...pro(0, 0.025), 0.9, 1.5, dw / 2 + 0.16, dw / 2 + 0.42); // operating panel
    for (let r = 0; r < 4; r++) box('downlight', ...pro(0.025, 0.035), 0.98 + r * 0.12, 1.04 + r * 0.12, dw / 2 + 0.24, dw / 2 + 0.31);
    box('bronze', xa, xb, -0.15, 0, -dw / 2, dw / 2); // car sill (threshold) under the doorway
    box('walnut', xa, xb, -0.15, 0, -hz, -dw / 2); box('walnut', xa, xb, -0.15, 0, dw / 2, hz); // floor edge under the piers
  }
  return Object.fromEntries(Object.entries(parts).map(([k, list]) => [k, mergeGeometries(list)]));
}

// Registry so floor displays (lift indicators) can read live car state.
export const LIFT = { sys: null };

export class ElevatorSystem {
  constructor(scene) {
    this.cars = CARS.map((c) => {
      const b = BANKS[c.bank];
      const start = c.bank.startsWith('freight') ? 'B1' : b.stops.includes('L0') ? 'L0' : b.stops[0];
      return {
        ...c, speed: b.speed,
        ix0: c.x0 + SW + GAP, ix1: c.x1 - SW - GAP, iz0: c.z0 + SW + GAP, iz1: c.z1 - SW - GAP, zc: (c.z0 + c.z1) / 2,
        y: FLOOR_BY_ID[start].elevation, v: 0, at: start, queue: [], door: 0, state: 'closed', hold: 0, openSide: null, dirty: true,
      };
    });
    this.byId = Object.fromEntries(this.cars.map((c) => [c.id, c]));
    LIFT.sys = this;
    const n = this.cars.length;
    // Phase 1 cabins: one model per cabin size (walnut, mirror, bronze, marble, lit ceiling), instanced.
    this.cabins = [];
    const groups = new Map();
    this.cars.forEach((c) => { const k = cabinKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    for (const list of groups.values()) {
      const parts = cabinGeometry(list[0]);
      const meshes = Object.entries(parts).map(([mat, geo]) => {
        const m = new THREE.InstancedMesh(geo, luxMaterials()[mat], list.length);
        m.frustumCulled = false; m.receiveShadow = true; scene.add(m); return m;
      });
      list.forEach((c, i) => { c.cabin = { meshes, i }; });
      this.cabins.push(meshes);
    }
    this.panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), luxMaterials().brushedBronze, n * 4);
    this.panels.frustumCulled = false; scene.add(this.panels);
    this.occupied = () => false;
    this.syncMeshes(true);
  }

  // ------------------------------------------------------------ dispatch
  call(bank, from, to) {
    const fromY = FLOOR_BY_ID[from].elevation;
    let best = null, bestCost = Infinity;
    for (const c of this.cars) {
      if (c.bank !== bank) continue;
      let cost = Math.abs(c.y - fromY) / c.speed + c.queue.length * 9 + (c.state !== 'closed' && c.at !== from ? 3 : 0);
      if (c.at === from && c.state !== 'closed') cost = -1;
      if (c.at === from && c.state === 'closed' && !c.queue.length) cost = 0;
      if (cost < bestCost) { best = c; bestCost = cost; }
    }
    if (!best) return null;
    this.enqueue(best, from);
    this.enqueue(best, to);
    return best;
  }
  send(car, to) {
    this.enqueue(car, to);
    if (car.state === 'open') car.hold = Math.min(car.hold, 1.5);
  }
  enqueue(car, f) {
    if (car.at === f && car.state !== 'closed' && !car.queue.length) { if (car.state === 'closing') car.state = 'opening'; return; }
    if (car.queue[car.queue.length - 1] !== f) car.queue.push(f);
  }

  // ------------------------------------------------------------ simulation
  update(dt, landingSets) {
    for (const c of this.cars) {
      const prevY = c.y, prevDoor = c.door;
      if (c.state === 'closed') {
        if (c.queue.length) {
          const target = c.queue[0];
          const ty = FLOOR_BY_ID[target].elevation;
          const dist = ty - c.y;
          if (Math.abs(dist) < 0.003) {
            c.y = ty; c.v = 0; c.at = target; c.queue.shift();
            c.state = 'opening'; c.openSide = BANKS[c.bank].side(target);
          } else {
            c.at = null;
            const vCap = Math.sqrt(2 * ACCEL * Math.abs(dist));
            c.v = Math.min(c.speed, c.v + ACCEL * dt, vCap + 0.05);
            c.y += Math.sign(dist) * Math.min(Math.abs(dist), c.v * dt);
          }
        }
      } else if (c.state === 'opening') {
        c.door = Math.min(1, c.door + dt / DOOR_TIME);
        if (c.door >= 1) { c.state = 'open'; c.hold = DWELL; }
      } else if (c.state === 'open') {
        c.hold -= dt;
        if (this.occupied(c)) c.hold = Math.max(c.hold, 1.2);
        if (c.hold <= 0) c.state = 'closing';
      } else if (c.state === 'closing') {
        if (this.occupied(c)) c.state = 'opening';
        else {
          c.door = Math.max(0, c.door - dt / DOOR_TIME);
          if (c.door <= 0) { c.state = 'closed'; c.openSide = null; }
        }
      }
      if (c.y !== prevY || c.door !== prevDoor) c.dirty = true;
    }
    // landing doors follow their car's doors
    for (const [floorId, landing] of landingSets) {
      for (const rec of landing.recs) {
        const c = this.byId[rec.carId];
        rec.open = c.at === floorId ? c.door : 0;
      }
    }
    this.syncMeshes(false);
  }

  // ------------------------------------------------------------ geometry
  syncMeshes(force) {
    let dirty = false;
    this.cars.forEach((c, k) => {
      if (!force && !c.dirty) return;
      c.dirty = false; dirty = true;
      const y = c.y, H = c.carH, dw = c.doorW, dh = c.doorH;
      const j = k * 4;
      _m.makeTranslation((c.ix0 + c.ix1) / 2, y, c.zc);
      for (const m of c.cabin.meshes) m.setMatrixAt(c.cabin.i, _m);
      [0, 1].forEach((s) => {
        const open = c.openSide === (s ? 'e' : 'w') ? c.door : 0;
        const slide = open * dw / 2;
        const px = s ? c.ix1 - WALL - 0.05 : c.ix0 + WALL + 0.05;
        setBox(this.panels, j + s * 2, px - 0.03, px + 0.03, y, y + dh, c.zc - dw / 2 - slide, c.zc - slide);
        setBox(this.panels, j + s * 2 + 1, px - 0.03, px + 0.03, y, y + dh, c.zc + slide, c.zc + dw / 2 + slide);
      });
    });
    if (dirty) { for (const ms of this.cabins) for (const m of ms) m.instanceMatrix.needsUpdate = true; this.panels.instanceMatrix.needsUpdate = true; }
  }

  // Colliders of cars near height y (walls + closed doors).
  colliders(y) {
    const out = [];
    for (const c of this.cars) {
      if (Math.abs(c.y - y) > 6) continue;
      const y0 = c.y, y1 = c.y + c.carH;
      const ga = c.zc - c.doorW / 2, gb = c.zc + c.doorW / 2;
      out.push({ x0: c.ix0, x1: c.ix1, z0: c.iz0, z1: c.iz0 + WALL, y0, y1 });
      out.push({ x0: c.ix0, x1: c.ix1, z0: c.iz1 - WALL, z1: c.iz1, y0, y1 });
      for (const s of ['w', 'e']) {
        const xa = s === 'w' ? c.ix0 : c.ix1 - WALL, xb = xa + WALL;
        out.push({ x0: xa, x1: xb, z0: c.iz0, z1: ga, y0, y1 });
        out.push({ x0: xa, x1: xb, z0: gb, z1: c.iz1, y0, y1 });
        if (!(c.openSide === s && c.door > 0.9)) out.push({ x0: xa, x1: xb, z0: ga, z1: gb, y0, y1 });
      }
    }
    return out;
  }

  // The car a point is standing in (for carrying the player/robots).
  carAt(x, y, z) {
    for (const c of this.cars) {
      if (x >= c.ix0 && x <= c.ix1 && z >= c.iz0 && z <= c.iz1 && y >= c.y - 0.6 && y <= c.y + 1.6) return c;
    }
    return null;
  }

  // Is a point in the doorway of a car (door sensor)?
  inDoorway(c, x, y, z) {
    if (!c.openSide || Math.abs(y - c.y) > 1.5) return false;
    const xe = c.openSide === 'w' ? c.ix0 : c.ix1;
    return Math.abs(x - xe) < 0.7 && z > c.zc - c.doorW / 2 - 0.2 && z < c.zc + c.doorW / 2 + 0.2;
  }

  // Points used by scripted walkers: just outside the landing door, and car centre.
  doorPoints(c, floorId) {
    const side = BANKS[c.bank].side(floorId);
    const e = FLOOR_BY_ID[floorId].elevation;
    const out = side === 'w' ? c.x0 - 1.2 : c.x1 + 1.2;
    return { outside: { x: out, y: e, z: c.zc }, centre: { x: (c.ix0 + c.ix1) / 2, y: e, z: c.zc } };
  }

  landing(bank, floorId) { return landingZone(bank, floorId); }

  status() {
    return this.cars.map((c) => ({ id: c.id, label: c.label, at: c.at, y: +c.y.toFixed(2), state: c.state, queue: [...c.queue] }));
  }
}
