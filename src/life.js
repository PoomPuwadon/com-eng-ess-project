import * as THREE from 'three';
import { makeSign } from './world/geom.js';
import { locateFloor, FLOOR_BY_ID } from './layout/building.js';

// Placeholder cash transporter robots (Autonomous Liquidity Couriers) with guards.
// Phase 0: scripted routes, fake amounts. They ride the real freight lifts and run
// whether or not anyone is watching.
const ROUTES = [
  {
    name: 'ALC-01', amount: '250,000.00', dest: 'Asset Protection HQ',
    steps: [
      { walk: [[104, -20, -6], [80, -20, 0], [74, -20, 0], [67, -20, 0], [60, -20, 0], [58.8, -20.00, 0], [56.7, -18.75, 0], [54.6, -17.50, 0], [52.5, -16.25, 0], [50.4, -15.00, 0], [48.3, -13.75, 0], [46.2, -12.50, 0], [44.1, -11.25, 0], [42.0, -10.00, 0], [35, -10, 0], [28, -10, 0], [16, -10, 0], [4, -10, 0], [-1, -10, 0], [-7, -10, 0], [-14, -10, 0], [-16, -10, 10], [-16, -10, 23.5], [-26, -10, 23.5]] }, // Treasury Reserve → door → bridge → descent → sentry hall → lasers → escort airlock → freight lift
      { lift: 'freight_ot', from: 'B1', to: 'OT-04' },
      { walk: [[-39, 62, 23.5], [-44.5, 62, 23.5], [-44.5, 62, -14], [-56, 62, -14], [-80, 62, -14], [-88, 62, -10]] }, // OT-04: luxury portal -> ALC Escort Muster Point
      { wait: 5, label: 'DELIVERED' },
    ],
  },
  {
    name: 'ALC-02', amount: '1,800,000.00', dest: 'Executive Leisure Suite (via The Link)',
    steps: [
      { walk: [[112, -20, 6], [80, -20, 0], [74, -20, 0], [67, -20, 0], [60, -20, 0], [58.8, -20.00, 0], [56.7, -18.75, 0], [54.6, -17.50, 0], [52.5, -16.25, 0], [50.4, -15.00, 0], [48.3, -13.75, 0], [46.2, -12.50, 0], [44.1, -11.25, 0], [42.0, -10.00, 0], [35, -10, 0], [28, -10, 0], [16, -10, 0], [4, -10, 0], [-1, -10, 0], [-7, -10, 0], [-14, -10, 0], [-16, -10, 10], [-16, -10, 23.5], [-26, -10, 23.5]] },
      { lift: 'freight_ot', from: 'B1', to: 'OT-01' },
      { walk: [[-39, 15, 23.5], [-45, 15, 23.5], [-45, 15, 0], [-30, 15, 0], [30, 15, 0], [96, 15, 0]] },
      { wait: 5, label: 'DELIVERED' },
    ],
  },
];

function withReturn(route) {
  const back = [];
  for (let i = route.steps.length - 1; i >= 0; i--) {
    const s = route.steps[i];
    if (s.walk) back.push({ walk: [...s.walk].reverse() });
    else if (s.lift) back.push({ lift: s.lift, from: s.to, to: s.from });
  }
  back.push({ wait: 4, label: 'RELOADING' });
  return [...route.steps, ...back];
}

export class Life {
  constructor(scene, elevators) {
    this.elev = elevators;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.robots = ROUTES.map((r) => this.makeRobot(r));
  }

  makeRobot(r) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.4), new THREE.MeshLambertMaterial({ color: 0x2e7bd6 }));
    const label = makeSign(`${r.name} · ${r.amount}`, { size: 0.55, sub: `→ ${r.dest}` });
    label.position.y = 1.8;
    body.add(label);
    const gMat = new THREE.MeshLambertMaterial({ color: 0x050505 });
    const gGeo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 8);
    const guards = [new THREE.Mesh(gGeo, gMat), new THREE.Mesh(gGeo, gMat)];
    this.group.add(body, ...guards);
    const segs = withReturn(r);
    return { r, body, guards, segs, i: 0, t: 0, leg: 0, phase: null, car: null, pos: new THREE.Vector3(...segs[0].walk[0]), dir: new THREE.Vector3(0, 0, 1), status: 'dispatched' };
  }

  // Robots standing in a car's doorway hold the doors (door sensor).
  occupies(car) {
    return this.robots.some((rb) => this.elev.inDoorway(car, rb.pos.x, rb.pos.y, rb.pos.z) || (rb.phase === 'board' && rb.car === car));
  }

  moveToward(rb, x, z, step) {
    const dx = x - rb.pos.x, dz = z - rb.pos.z, L = Math.hypot(dx, dz);
    if (L <= step) { rb.pos.x = x; rb.pos.z = z; return true; }
    rb.dir.set(dx / L, 0, dz / L);
    rb.pos.x += rb.dir.x * step; rb.pos.z += rb.dir.z * step;
    return false;
  }

  update(dt, visibleIds) {
    const speed = 2.2;
    for (const rb of this.robots) {
      const seg = rb.segs[rb.i];
      if (seg.walk) {
        rb.status = 'in transit';
        let remaining = speed * dt;
        while (remaining > 0 && rb.leg < seg.walk.length - 1) {
          const [tx, ty, tz] = seg.walk[rb.leg + 1];
          const d = Math.hypot(tx - rb.pos.x, tz - rb.pos.z);
          rb.pos.y = ty;
          if (d <= remaining) { rb.pos.x = tx; rb.pos.z = tz; rb.leg++; remaining -= d; }
          else { this.moveToward(rb, tx, tz, remaining); remaining = 0; }
        }
        if (rb.leg >= seg.walk.length - 1) this.next(rb);
      } else if (seg.wait) {
        rb.status = seg.label;
        rb.t += dt;
        if (rb.t >= seg.wait) this.next(rb);
      } else if (seg.lift) {
        const e = this.elev;
        if (!rb.phase) { rb.car = e.call(seg.lift, seg.from, seg.to); rb.phase = 'wait'; rb.status = 'calling lift'; }
        const c = rb.car;
        if (rb.phase === 'wait') {
          if (c.at === seg.from && c.door > 0.95) rb.phase = 'board';
          else if (c.at !== seg.from && c.state === 'closed' && !c.queue.includes(seg.from)) rb.phase = null; // missed it: call again
        } else if (rb.phase === 'board') {
          rb.status = 'boarding';
          const dp = e.doorPoints(c, seg.from);
          if (this.moveToward(rb, dp.centre.x, dp.centre.z, speed * dt)) { rb.phase = 'ride'; if (!c.queue.includes(seg.to)) e.send(c, seg.to); }
        } else if (rb.phase === 'ride') {
          rb.status = 'in lift';
          rb.pos.y = c.y;
          if (c.at === seg.to && c.door > 0.95) { rb.pos.y = FLOOR_BY_ID[seg.to].elevation; this.next(rb); }
        }
      }
      const fl = locateFloor(rb.pos.x, rb.pos.y + 0.1, rb.pos.z);
      const visible = rb.phase === 'ride' || rb.phase === 'board' || (fl && visibleIds.includes(fl.id));
      rb.body.visible = !!visible;
      rb.body.position.set(rb.pos.x, rb.pos.y + 0.6, rb.pos.z);
      rb.body.rotation.y = Math.atan2(rb.dir.x, rb.dir.z);
      const inLift = rb.phase === 'ride' || rb.phase === 'board';
      const side = new THREE.Vector3(rb.dir.z, 0, -rb.dir.x);
      rb.guards.forEach((g, k) => {
        g.visible = !!visible;
        if (inLift) g.position.set(rb.pos.x + (k ? 0.9 : -0.9) * 0.5, rb.pos.y + 0.85, rb.pos.z + (k ? 1 : -1));
        else g.position.copy(rb.pos).addScaledVector(rb.dir, -1.6).addScaledVector(side, k ? 1.1 : -1.1).setY(rb.pos.y + 0.85);
      });
    }
  }

  next(rb) {
    const wasLift = !!rb.segs[rb.i].lift;
    rb.i = (rb.i + 1) % rb.segs.length;
    rb.t = 0; rb.leg = 0; rb.phase = null; rb.car = null;
    const s = rb.segs[rb.i];
    if (s.walk && !wasLift) rb.pos.set(...s.walk[0]); // after a lift, walk out from where the car stopped
  }

  status() {
    return this.robots.map((rb) => ({ name: rb.r.name, status: rb.status, car: rb.car?.label || null, floor: locateFloor(rb.pos.x, rb.pos.y + 0.1, rb.pos.z)?.id || null, pos: rb.pos.toArray().map((v) => +v.toFixed(1)) }));
  }
}
