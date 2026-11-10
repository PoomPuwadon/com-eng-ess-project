import * as THREE from 'three';
import { canAccess, locateFloor, locateRoom } from './layout/building.js';

export const RADIUS = 0.4, HEIGHT = 1.8, EYE = 1.7, STEP = 0.45;
export const WALK = 5, SPRINT = 9;
const GRAVITY = 25;

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 34);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.vy = 0;
    this.role = 'visitor';
    this.keys = new Set();
    this.auto = null; // {dx, dz, speed} — scripted input (walkTo)
    this.carrier = null; // (pos) => y of the lift car floor the player stands in, or null
    this.floorHint = null; // () => floor the player's lift car is stopped at (shafts outside floor footprints)
    this.floor = null;
    this.room = null;
    this.enabled = true;
    this.touch = null; // {f, s, run} from the on-screen thumbstick
    this.lastMoveBlocked = false;

    addEventListener('keydown', (e) => { this.keys.add(e.code); });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('click', () => {
      if (!this.enabled || document.pointerLockElement === dom) return;
      try { const p = dom.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* embedded views may refuse pointer lock */ }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
    });
  }

  place(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.vy = 0;
    this.locate();
  }

  locate() {
    this.floor = locateFloor(this.pos.x, this.pos.y, this.pos.z) || (this.floorHint && this.floorHint()) || this.floor;
    this.room = this.floor ? locateRoom(this.floor, this.pos.x, this.pos.z) : null;
  }

  blocks(c) {
    if (c.lock && canAccess(this.role, c.lock)) return false;
    if (c.openFn && c.openFn()) return false; // open landing door
    return c.y1 > this.pos.y + STEP && c.y0 < this.pos.y + HEIGHT;
  }

  update(dt, colliders, shapes = []) {
    const live = shapes.filter((sh) => sh.active(this.pos.y));
    // ---- input direction (camera-relative)
    let fx = 0, fz = 0, speed = WALK;
    if (this.auto) {
      fx = this.auto.dx; fz = this.auto.dz; speed = this.auto.speed;
    } else if (this.enabled) {
      const k = this.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      // forward = -Z rotated by yaw
      fx = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s;
      fz = -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) speed = SPRINT;
      const t = this.touch; // on-screen thumbstick (touch.js)
      if (t && (t.f || t.s) && !f && !s) {
        fx = -Math.sin(this.yaw) * t.f + Math.cos(this.yaw) * t.s;
        fz = -Math.cos(this.yaw) * t.f - Math.sin(this.yaw) * t.s;
        speed = t.run ? SPRINT : WALK * Math.min(1, Math.hypot(t.f, t.s) + 0.2);
      }
    }
    const len = Math.hypot(fx, fz);
    const before = this.pos.clone();
    if (len > 0) {
      const dist = speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.25));
      for (let i = 0; i < steps; i++) {
        const px = this.pos.x, pz = this.pos.z;
        this.pos.x += (fx / len) * dist / steps;
        this.pos.z += (fz / len) * dist / steps;
        this.resolve(colliders);
        // curved walls / tiers (e.g. the arena chamber): undo the step if it is blocked
        if (live.some((sh) => sh.blocks(px, pz, this.pos.x, this.pos.z, this.pos.y))) { this.pos.x = px; this.pos.z = pz; }
      }
    }
    // ---- vertical: carried by a lift car, else floor slab / steppable collider top
    const carY = this.carrier ? this.carrier(this.pos) : null;
    const ground = carY != null ? carY : this.groundHeight(colliders, live);
    if (carY != null) { this.pos.y = carY; this.vy = 0; }
    else if (this.pos.y > ground + 0.01) {
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
      if (this.pos.y === ground) this.vy = 0;
    } else { this.pos.y = ground; this.vy = 0; }
    this.lastMoveBlocked = len > 0 && before.distanceTo(this.pos) < speed * dt * 0.2;
    this.locate();

    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  groundHeight(colliders, shapes = []) {
    // Outside any floor's footprint (e.g. the gap between a lift car and the landing) keep the
    // current height; never snap up to a stale floor.
    let g = this.pos.y;
    const f = locateFloor(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const h = f && f.slabHoleRect; // over a sunken pit there is no slab: colliders carry you (or you fall)
    const overHole = h && this.pos.x > h.x0 && this.pos.x < h.x1 && this.pos.z > h.z0 && this.pos.z < h.z1;
    if (overHole) g = f.elevation - (f.below || 0); // look all the way down to the pit floor
    else if (f && f.elevation <= this.pos.y + STEP) g = f.elevation;
    const r = 0.15;
    for (const c of colliders) {
      if (c.lock && !canAccess(this.role, c.lock)) continue;
      if (this.pos.x < c.x0 - r || this.pos.x > c.x1 + r || this.pos.z < c.z0 - r || this.pos.z > c.z1 + r) continue;
      if (c.y1 <= this.pos.y + STEP && c.y1 > g) g = c.y1;
    }
    // a sunken/terraced area (arena bowl) replaces the floor slab where it covers the point
    for (const sh of shapes) {
      // y is passed so a shape can have two levels at one spot (e.g. a tunnel under a concourse)
      if (sh.covers && sh.covers(this.pos.x, this.pos.z)) { g = sh.ground(this.pos.x, this.pos.z, this.pos.y); break; }
      const gs = sh.ground(this.pos.x, this.pos.z, this.pos.y); if (gs <= this.pos.y + STEP && gs > g) g = gs;
    }
    return g;
  }

  resolve(colliders) {
    const p = this.pos;
    for (const c of colliders) {
      if (p.x < c.x0 - RADIUS || p.x > c.x1 + RADIUS || p.z < c.z0 - RADIUS || p.z > c.z1 + RADIUS) continue;
      if (!this.blocks(c)) continue;
      const cx = Math.max(c.x0, Math.min(p.x, c.x1));
      const cz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * RADIUS;
        p.z = cz + (dz / d) * RADIUS;
      } else {
        // centre inside the box: push out along the smallest penetration
        const pen = [[p.x - c.x0 + RADIUS, -1, 0], [c.x1 - p.x + RADIUS, 1, 0], [p.z - c.z0 + RADIUS, 0, -1], [c.z1 - p.z + RADIUS, 0, 1]];
        pen.sort((a, b) => a[0] - b[0]);
        p.x += pen[0][1] * pen[0][0];
        p.z += pen[0][2] * pen[0][0];
      }
    }
  }
}
