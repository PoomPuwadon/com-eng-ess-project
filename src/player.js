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
    this.lastMoveBlocked = false;

    // third person (user decision 2026-11-18): the camera orbits the avatar while the right mouse
    // button is held; the wheel zooms; Space jumps.
    this.camDist = 4.2;
    this.bodyYaw = this.yaw + Math.PI; // the avatar's facing (kit characters face +z)
    this.avatar = null;
    this.grounded = true;
    this.groundY = this.pos.y;
    this.blockInput = () => false; // set by main: true while an application owns the keyboard
    this.stick = { x: 0, y: 0, run: false }; // touch joystick (x right, y forward, -1..1), set by touchControls
    this.t = 0;
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.drag = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 2 || !this.enabled) return;
      this.drag = true;
      try { dom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    const end = (e) => { if (e.button === 2 || e.type === 'pointercancel') this.drag = false; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.yaw -= e.movementX * 0.005;
      this.pitch = Math.max(-1.05, Math.min(0.55, this.pitch - e.movementY * 0.004));
    });
    dom.addEventListener('wheel', (e) => { if (this.enabled) this.camDist = Math.max(1.6, Math.min(12, this.camDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
  }

  /** Swap the avatar (kit Character) — the look follows the role. */
  setAvatar(scene, char) {
    if (this.avatar) scene.remove(this.avatar.root);
    this.avatar = char;
    if (!char) return;
    char.root.traverse((o) => { o.castShadow = false; }); // the shadow map is static: no ghost shadows
    char.root.userData.selfAvatar = true; // e.g. the Arena's on-screen YouTube layer ignores your own body
    scene.add(char.root); // the name plate stays on, above your own head too
  }

  place(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.bodyYaw = yaw + Math.PI;
    this.vy = 0; this.grounded = true; this.groundY = y;
    this.locate();
  }

  locate() {
    this.floor = locateFloor(this.pos.x, this.pos.y, this.pos.z) || (this.floorHint && this.floorHint()) || this.floor;
    this.room = this.floor ? locateRoom(this.floor, this.pos.x, this.pos.z) : null;
  }

  blocks(c) {
    if (c.lock && canAccess(this.role, c.lock)) return false;
    if (c.openFn && c.openFn()) return false; // open landing door
    if (c.lock) return c.y0 < this.pos.y + HEIGHT && c.y1 + 2.5 > this.pos.y; // closed gates: no jumping over them
    // step height is measured from the ground you jumped from, so a jump never clears a rail or barrier
    return c.y1 > Math.min(this.pos.y, this.groundY) + STEP && c.y0 < this.pos.y + HEIGHT;
  }

  update(dt, colliders, shapes = []) {
    // carried (the CEO's basket, a race horse): the server/host decides where we are; no input, no gravity
    if (this.ride) {
      const before = this.pos.clone(), p = this.ride();
      if (p) {
        this.pos.copy(p); this.vy = 0; this.grounded = true; this.groundY = p.y;
        if (this.rideYaw != null) this.bodyYaw = this.rideYaw;
        this.locate();
        this.t += dt;
        const a = this.avatar;
        if (a) { a.root.position.copy(this.pos); a.root.rotation.y = this.bodyYaw; a.airborne = false; a.update(dt, this.t, 0); a.root.visible = true; void before; }
        this.placeCamera(colliders);
        return;
      }
    }
    const live = shapes.filter((sh) => sh.active(this.pos.y));
    // ---- input direction (camera-relative)
    let fx = 0, fz = 0, speed = WALK;
    if (this.auto) {
      fx = this.auto.dx; fz = this.auto.dz; speed = this.auto.speed;
    } else if (this.enabled) {
      const k = this.keys;
      const f = Math.max(-1, Math.min(1, (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.stick.y));
      const s = Math.max(-1, Math.min(1, (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.stick.x));
      // forward = -Z rotated by yaw
      fx = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s;
      fz = -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s;
      if (k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.run) speed = SPRINT;
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
    else if (this.vy > 0 || this.pos.y > ground + 0.01) {
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
      if (this.pos.y === ground && this.vy < 0) this.vy = 0;
    } else { this.pos.y = ground; this.vy = 0; }
    this.grounded = carY != null || (this.pos.y <= ground + 0.01 && this.vy <= 0);
    if (this.grounded) this.groundY = this.pos.y;
    this.lastMoveBlocked = len > 0 && Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < speed * dt * 0.2;
    this.locate();

    // ---- the avatar: faces where it walks, walk cycle from the real ground speed, legs tucked in the air
    this.t += dt;
    const a = this.avatar;
    if (a) {
      const v = dt > 0 ? Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / dt : 0;
      if (v > 0.2) {
        let d = Math.atan2(this.pos.x - before.x, this.pos.z - before.z) - this.bodyYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.bodyYaw += d * Math.min(1, dt * 12);
      }
      a.root.position.copy(this.pos); a.root.rotation.y = this.bodyYaw;
      a.airborne = !this.grounded;
      a.update(dt, this.t, v);
      a.root.visible = this.enabled; // seated at a table: the seat view takes over
    }
    this.placeCamera(colliders);
  }

  // ---- third-person camera: orbit behind the avatar, pulled in when something is in the way
  placeCamera(colliders) {
    const a = this.avatar;
    const s = a ? a.root.scale.x : 1;
    const tx = this.pos.x, ty = this.pos.y + 1.55 * s, tz = this.pos.z;
    const el = 0.3 - this.pitch; // camera elevation above the look target
    const dx = Math.sin(this.yaw) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(this.yaw) * Math.cos(el);
    let dist = this.camClear(colliders, tx, ty, tz, dx, dy, dz, this.camDist * s);
    if (dy < 0) dist = Math.min(dist, (ty - this.pos.y - 0.25) / -dy); // not under the floor
    const top = this.floor ? this.floor.elevation + (this.floor.height || 6) - 0.35 : Infinity;
    if (dy > 0 && ty < top) dist = Math.min(dist, (top - ty) / dy); // not through the ceiling
    this.camera.position.set(tx + dx * dist, ty + dy * dist, tz + dz * dist);
    this.camera.rotation.set(-el, this.yaw, 0, 'YXZ');
  }

  /** distance along the camera ray before it would enter a solid collider (slab test) */
  camClear(colliders, ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    for (const c of colliders) {
      if (c.y1 - c.y0 < 0.6) continue; // low furniture: look over it
      if (c.lock && canAccess(this.role, c.lock)) continue;
      if (c.openFn && c.openFn()) continue;
      let t0 = 0, t1 = best, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const o = k === 0 ? ox : k === 1 ? oy : oz, d = k === 0 ? dx : k === 1 ? dy : dz;
        const lo = k === 0 ? c.x0 : k === 1 ? c.y0 : c.z0, hi = k === 0 ? c.x1 : k === 1 ? c.y1 : c.z1;
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) ok = false; continue; }
        let a = (lo - o) / d, b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) ok = false;
      }
      if (ok && t0 > 0.05 && t0 < best) best = t0;
    }
    return Math.max(0.6, best - 0.25);
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
