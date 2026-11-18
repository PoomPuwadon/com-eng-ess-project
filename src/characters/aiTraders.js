import * as THREE from 'three';
import { makeTag } from './kit.js';
import { makeHeadTrader, makeCoHeadTrader, makeQuant, makeRiskOfficer } from './roster.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { on } from '../net/api.js';

// The AI trading desk: the firm's four LIVE trading-floor agents walk the OT-01 entrance, stroll the
// aisle and stand at their own PC to place orders. Each wears a big provider-coloured tag (CLAUDE
// orange / GEMINI blue), a floor ring and a spinning marker so nobody misses who is who.
// The server decides what they trade (server/agents/tradingDesk.js); this file only SHOWS it:
//   'order' / 'trade' events  -> the matching agent walks to its PC and types the order
//   'firm' tick               -> all four head to their PCs (research note, risk review, desk reviews)
// Without a server they keep the same routine on a timer. Routes mirror ROUTES in server/agents/llm.js.

const CLAUDE = { key: 'claude', name: 'CLAUDE', hex: '#ff8a5c', col: 0xff8a5c };
const GEMINI = { key: 'gemini', name: 'GEMINI', hex: '#5aa2ff', col: 0x5aa2ff };

// Desk PCs are built in floors/tradingFloor.js at the same coordinates (DESK_Z / DESK_X below).
export const DESK_X = [-55.5, -53.9];
export const DESK_Z = 9.65; // |z| of the desk centre; the agent stands 1.25 m in front, on the aisle side

export const AI_AGENTS = [
  { id: 'head_trader', name: 'Chad Whitmore III', role: 'Head Trader · Desk A · Momentum', who: CLAUDE, make: makeHeadTrader, stand: [DESK_X[0], -(DESK_Z - 1.25)], faceYaw: Math.PI, idle: 'SCANNING MOMENTUM SIGNALS',
    route: [[-56, -3], [-66, -4], [-76, -2], [-66, -0.5], [-56, -1.5]] },
  { id: 'co_head_trader', name: 'Priya Ramanathan-Cole', role: 'Co-Head Trader · Desk B · Quality', who: GEMINI, make: makeCoHeadTrader, stand: [DESK_X[1], -(DESK_Z - 1.25)], faceYaw: Math.PI, idle: 'CHECKING DEFENSIVE SCORES',
    route: [[-54, -5], [-62, -5.5], [-70, -4.5], [-62, -2.5], [-54, -3]] },
  { id: 'quant', name: 'Dr. Tobias Wren', role: 'Quant · Signal Table', who: GEMINI, make: () => makeQuant(0xe8bf9f), stand: [DESK_X[0], DESK_Z - 1.25], faceYaw: 0, idle: 'BUILDING THE SIGNAL TABLE',
    route: [[-56, 3], [-66, 4], [-76, 2], [-66, 0.5], [-56, 1.5]] },
  { id: 'risk_officer', name: 'Marcus Adeyemi-Park', role: 'Risk Officer · Veto Desk', who: CLAUDE, make: makeRiskOfficer, stand: [DESK_X[1], DESK_Z - 1.25], faceYaw: 0, idle: 'SCREENING OPEN ORDERS',
    route: [[-54, 5], [-62, 5.5], [-70, 4.5], [-62, 2.5], [-54, 3]] },
];

const SPEED = 1.5;
const ELEV = () => FLOOR_BY_ID['OT-01'].elevation;
const providerOf = (model) => (!model || model === 'rules' ? 'RULE BOOK' : /claude/i.test(model) ? 'CLAUDE' : /gemini/i.test(model) ? 'GEMINI' : String(model).toUpperCase());
const fmtPx = (p) => (Number.isFinite(p) ? ` @ ${p.toFixed(2)}` : '');

export class AiTraders {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false;
    scene.add(this.group);
    this.t = 0;
    this.agents = AI_AGENTS.map((def, i) => this.make(def, i));
    this.byId = Object.fromEntries(this.agents.map((a) => [a.def.id, a]));

    on('order', (d) => { const o = d?.order; if (o?.agent) this.job(o.agent, `▶ ${String(o.side).toUpperCase()} ${o.qty} ${o.symbol}`, 9); });
    on('trade', (d) => {
      if (!d?.agent) return;
      const via = providerOf(d.model), own = this.byId[d.agent]?.def.who.name;
      this.job(d.agent, `✔ ${String(d.side).toUpperCase()} ${d.qty} ${d.symbol}${fmtPx(d.price)}${via !== own ? ` · via ${via}` : ''}`, 8, true);
    });
    on('firm', (d) => {
      if (d?.type !== 'tick') return;
      for (const a of this.agents) if (!a.def.id.endsWith('trader')) this.job(a.def.id, a.def.id === 'quant' ? '▶ PUBLISHING RESEARCH NOTE' : '▶ REVIEWING ORDERS · VETO CHECK', 10);
    });
  }

  make(def, i) {
    const c = def.make();
    c.pose = 'phone';
    const w = def.who;
    const tag = makeTag([{ t: '', px: 10 }], { bg: 'rgba(6,8,12,.94)', border: w.hex, radius: 16, ps: 0.0052 });
    tag.position.y = c.tagY + 0.3; tag.renderOrder = 998;
    c.root.add(tag); c.tag = tag;
    // a spinning marker above the tag, a pulsing ring on the floor
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: w.col })); gem.scale.set(0.8, 1.2, 0.8);
    c.root.add(gem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: w.col, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.y = 0.04; c.root.add(ring);
    // the floor pad at this agent's PC lights up when an order goes in
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: w.col, transparent: true, opacity: 0.25, depthWrite: false }));
    pad.position.set(def.stand[0], ELEV() + 0.035, def.stand[1]); this.group.add(pad);
    for (const o of c.root.children) o.traverse?.((m) => { m.castShadow = false; });
    this.group.add(c.root);
    const a = { def, c, tag, gem, ring, pad, pos: new THREE.Vector3(def.stand[0], ELEV(), def.stand[1]), yaw: def.faceYaw, state: i % 2 ? 'stroll' : 'desk', timer: 6 + i * 5, leg: i % 4, job: null, last: null, text: '' };
    if (a.state === 'stroll') a.pos.set(def.route[a.leg][0], ELEV(), def.route[a.leg][1]);
    this.say(a, def.idle, true);
    return a;
  }

  /** an order / research / review for this agent: go to the PC and work it */
  job(id, text, hold, done = false) {
    const a = this.byId[id]; if (!a) return;
    a.job = { text, t: hold };
    if (done) a.last = text;
    a.pad.material.opacity = 1;
    this.say(a, text);
    if (a.state !== 'desk') a.state = 'toDesk';
  }

  say(a, status, force = false) {
    if (!force && a.text === status) return;
    a.text = status;
    const w = a.def.who;
    a.tag.userData.set([
      { t: `◉ ${w.name} · LIVE AI AGENT`, px: 30, c: w.hex, w: 900 },
      { t: a.def.name, px: 46, w: 800 },
      { t: a.def.role, px: 24, c: '#e3c27a', w: 600 },
      { t: status, px: 28, c: status.startsWith('✔') ? '#6dffb0' : status.startsWith('▶') ? '#ffe27a' : '#cfd6e4', w: 700 },
    ]);
    a.base = a.tag.scale.clone(); // full-size tag; update() scales it with distance so it stays readable
    a.gemY = a.c.tagY + 0.3 + a.base.y + 0.35;
  }

  moveToward(a, x, z, step) {
    const dx = x - a.pos.x, dz = z - a.pos.z, L = Math.hypot(dx, dz);
    if (L <= step) { a.pos.x = x; a.pos.z = z; return true; }
    a.yaw = Math.atan2(dx, dz);
    a.pos.x += (dx / L) * step; a.pos.z += (dz / L) * step;
    return false;
  }

  update(dt, visibleIds, viewer = globalThis.__crowdViewer) {
    const vis = visibleIds.includes('OT-01');
    this.group.visible = vis;
    this.t += dt;
    for (const a of this.agents) {
      const d = a.def;
      a.timer -= dt;
      let speed = 0;
      if (a.state === 'desk') {
        a.pos.set(d.stand[0], ELEV(), d.stand[1]); a.yaw = d.faceYaw;
        a.c.pose = 'deal';
        if (a.job) { a.job.t -= dt; if (a.job.t <= 0) { a.job = null; this.say(a, a.last || d.idle); } }
        if (!a.job && a.timer <= 0) { a.state = 'stroll'; a.timer = 16 + Math.random() * 16; a.leg = Math.floor(Math.random() * d.route.length); this.say(a, 'ON THE FLOOR · WALKING THE PITS'); }
      } else if (a.state === 'stroll') {
        a.c.pose = 'phone';
        const [tx, tz] = d.route[a.leg];
        if (this.moveToward(a, tx, tz, SPEED * dt)) a.leg = (a.leg + 1) % d.route.length; else speed = SPEED;
        if (a.timer <= 0) a.state = 'toDesk';
      } else { // toDesk
        a.c.pose = 'phone';
        if (this.moveToward(a, d.stand[0], d.stand[1], SPEED * 1.15 * dt)) { a.state = 'desk'; a.timer = 12 + Math.random() * 14; if (!a.job) this.say(a, a.last || d.idle); } else speed = SPEED * 1.15;
      }
      if (!vis) continue;
      // smooth turn, then place the figure
      let dy = a.yaw - a.c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.c.root.rotation.y += dy * Math.min(1, dt * 8);
      a.c.root.position.copy(a.pos);
      a.c.update(dt, this.t, speed);
      // keep the tag the same size on screen from 3 m to 20 m (huge up close would block the view, tiny far away would be missed)
      const k = viewer ? Math.min(2.5, Math.max(0.4, Math.hypot(viewer.x - a.pos.x, viewer.y - a.pos.y - 2, viewer.z - a.pos.z) / 8)) : 1;
      a.tag.scale.set(a.base.x * k, a.base.y * k, 1); a.gem.scale.setScalar(k);
      a.gemY = a.c.tagY + 0.3 + a.base.y * k + 0.3 * k;
      a.gem.rotation.y = this.t * 2; a.gem.position.y = a.gemY + Math.sin(this.t * 3 + a.leg) * 0.06 * k;
      a.ring.scale.setScalar(1 + Math.sin(this.t * 4) * 0.08);
      a.pad.material.opacity += ((a.state === 'desk' ? 0.4 : 0.2) - a.pad.material.opacity) * Math.min(1, dt * 1.5);
    }
  }

  status() {
    return this.agents.map((a) => ({ id: a.def.id, provider: a.def.who.name, state: a.state, text: a.text, pos: a.pos.toArray().map((v) => +v.toFixed(1)) }));
  }
}
