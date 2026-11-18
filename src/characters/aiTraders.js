import * as THREE from 'three';
import { makeTag } from './kit.js';
import { makeHeadTrader, makeCoHeadTrader, makeQuant, makeRiskOfficer, makeTrader } from './roster.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { on } from '../net/api.js';
import { startAiFeed, onAgent, thinking, thinkingInfo, forAgent, chip, COL, outcomeColor } from '../ai/feed.js';
import { FlowFx } from '../ai/flowFx.js';
import { setPerson, setPersonPos } from '../ai/agentCard.js';
import { makeDeskBoard, makeResearchWall } from '../ai/ot01Boards.js';
import { playSting } from '../world/sfx.js';

// The AI trading desk: the firm's four LIVE trading-floor agents walk the OT-01 entrance, stroll the
// aisle and stand at their own PC to place orders. Each wears a big provider-coloured tag (CLAUDE
// orange / GEMINI blue), a floor ring and a spinning marker so nobody misses who is who.
// The server decides what they trade (server/agents/tradingDesk.js); this file only SHOWS it
// (docs/ai-visuals-plan.md §3), driven by the agent feed (src/ai/feed.js, server/agents/feed.js):
//   thinking on/off  -> the agent goes to its PC, head down, dots on the tag, pad pulses (REAL in-flight model call)
//   signal           -> a light pulse runs Quant -> Desk A and Desk B
//   proposal         -> a pulse runs desk -> Risk Officer
//   veto             -> VETO stamp slams on the board + over the Risk Officer, board shakes, bell sting, he stands up and
//                       points, three pit traders react; the board row turns red with his one-line reason
//   execute / filled -> CLEARED pulse to the pit; a small FILLED stamp over the desk that placed it, a bell tap
//   research         -> while the market is closed the Quant/Head Trader/Risk Officer work the research wall
// Without a server they keep a quiet timer routine and the boards say AI FEED OFFLINE. Routes mirror ROUTES in server/agents/llm.js.

const CLAUDE = { key: 'claude', name: 'CLAUDE', hex: '#ff8a5c', col: 0xff8a5c };
const GEMINI = { key: 'gemini', name: 'GEMINI', hex: '#5aa2ff', col: 0x5aa2ff };

// Desk PCs are built in floors/tradingFloor.js at the same coordinates (DESK_Z / DESK_X below).
export const DESK_X = [-55.5, -53.9];
export const DESK_Z = 9.65; // |z| of the desk centre; the agent stands 1.25 m in front, on the aisle side
// The hanging AI DESK BOARD (front, faces the portal) + RESEARCH WALL (back, faces the pit): steel frame built in
// floors/tradingFloor.js, screens drawn here from src/ai (y0 = underside, local to the floor slab).
export const AI_BOARD = { x: -58, y0: 5.0, w: 8, h: 3.6 };
const PIT = { x: -72, z: 0 }; // where a cleared order goes: the pit

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
const SEC_ELEV = () => FLOOR_BY_ID['OT-04'].elevation; // Asset Protection HQ

// Called up by the Chief Executive: where each agent is made to stand in Security HQ (coordinates from floors/securityHQ.js).
//   alignment = a numbered yard spot facing the CFO podium; feedback = inside the Kinetic Performance Feedback area;
//   suite = pacing inside the glass Transition Suite.
const REVIEW = {
  alignment: { label: 'MANDATORY ALIGNMENT · STAND ON YOUR NUMBER', pose: 'idle', spot: (i) => ({ x: -92, z: 6 + i * 2.5, yaw: -Math.PI / 2 }) },
  feedback: { label: 'RECEIVING KINETIC PERFORMANCE FEEDBACK', pose: 'panic', spot: (i) => ({ x: [-74.5, -68.8, -78.5, -71.6][i % 4], z: [22.6, 24.2, 25.4, 25.9][i % 4], yaw: Math.PI / 2 + i }) },
  suite: { label: 'TRANSITION SUITE · CHECKOUT IS FINAL', pose: 'cross', spot: (i) => ({ x: -96 + i * 7, z: 34.2, yaw: Math.PI }), pace: 3 },
};
const providerOf = (model) => (!model || model === 'rules' ? 'RULE BOOK' : /claude/i.test(model) ? 'CLAUDE' : /gemini/i.test(model) ? 'GEMINI' : String(model).toUpperCase());
const fmtPx = (p) => (Number.isFinite(p) ? ` @ ${p.toFixed(2)}` : '');
const wrap2 = (s, n = 36) => { // two short lines for the tag's thought
  const words = String(s || '').split(/\s+/), out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; if (out.length === 2) break; } else cur = (cur + ' ' + w).trim(); }
  if (out.length < 2 && cur) out.push(cur);
  const t = out.slice(0, 2); if (words.join(' ').length > t.join(' ').length + 2) t[t.length - 1] = `${t[t.length - 1].slice(0, n - 1)}…`;
  return t;
};

export class AiTraders {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false;
    scene.add(this.group);
    this.t = 0;
    this.agents = AI_AGENTS.map((def, i) => this.make(def, i));
    this.byId = Object.fromEntries(this.agents.map((a) => [a.def.id, a]));
    this.fx = new FlowFx(this.group);
    this.boards = null; // built the first time the floor is on screen: canvas textures are not allocated for nothing
    this.reactors = [-5.8, 0, 5.8].map((z, i) => {
      const c = makeTrader(); c.pose = 'idle'; c.root.position.set(-63.5, ELEV(), z); c.root.rotation.y = Math.PI / 2; c.root.traverse?.((m) => { m.castShadow = false; });
      this.group.add(c.root); return { c, t: 0, i };
    });
    this.dotT = 0; this.dots = 0;
    startAiFeed();
    for (const a of this.agents) setPerson({ id: a.def.id, name: a.def.name, role: a.def.role, room: 'OT-01', floor: 'OT-01', agent: a.def.id, provider: a.def.who.key, x: a.pos.x, y: ELEV(), z: a.pos.z });
    onAgent((ev, live) => this.onFeed(ev, live));

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
    const a = { def, c, tag, gem, ring, pad, pos: new THREE.Vector3(def.stand[0], ELEV(), def.stand[1]), yaw: def.faceYaw, state: i % 2 ? 'stroll' : 'desk', timer: 6 + i * 5, leg: i % 4, job: null, last: null, text: '', thinking: false, poseT: 0, poseOv: null };
    if (a.state === 'stroll') a.pos.set(def.route[a.leg][0], ELEV(), def.route[a.leg][1]);
    this.say(a, def.idle, true);
    return a;
  }

  // ---------------------------------------------------------------- feed events (REAL server decisions only)
  onFeed(ev, live) {
    this.boards?.forEach((b) => b.touch());
    if (ev.stage === 'sync' || ev.room !== 'OT-01') { if (ev.stage === 'sync') for (const a of this.agents) this.say(a, a.text, true); return; }
    const a = this.byId[ev.agent];
    if (ev.stage === 'thinking') {
      if (!a) return;
      a.thinking = Boolean(ev.data?.on);
      if (a.thinking) { if (a.state !== 'desk') a.state = 'toDesk'; a.job = null; }
      else { a.timer = Math.max(a.timer, 8); a.pad.material.opacity = 1; }
      this.say(a, a.thinking ? this.dotText(ev.text) : (a.last || a.def.idle), true);
      return;
    }
    if (!live) { if (a) this.say(a, a.text, true); return; } // a backfill refreshes the thought line only
    if (a) this.say(a, a.text, true);
    const P = (x) => { const v = x.pos.clone(); v.y += 1.25; return v; }, qa = this.byId.quant, ro = this.byId.risk_officer, ha = this.byId.head_trader, co = this.byId.co_head_trader;
    const board = this.group.visible ? this.boards?.[0] : null, world = (x, y, z) => new THREE.Vector3(x, ELEV() + y, z);
    switch (ev.stage) {
      case 'signal': if (ev.ref === 'note') { this.fx.pulse(P(qa), P(ha), COL_C.gemini, 1.2); this.fx.pulse(P(qa), P(co), COL_C.gemini, 1.5); if (a) this.job('quant', '▶ PUBLISHED: signal note', 8); } break;
      case 'proposal': if (ev.ref !== 'memo' && a) { this.fx.pulse(P(a), P(ro), a.def.who.col, 1.3); } break;
      case 'review': this.job('risk_officer', '▶ REVIEW: ' + ev.text.slice(0, 60), 8); break;
      case 'veto': {
        board?.shake();
        const slam = world(AI_BOARD.x + 0.9, AI_BOARD.y0 + AI_BOARD.h * 0.5, -2.3); // right of the row, so the reason stays readable
        this.fx.stamp('VETO', slam, { scale: 1.5, hold: 6 });
        const up = P(ro); up.y += 1.5; this.fx.stamp('VETO', up, { scale: 0.9, hold: 4 });
        ro.poseOv = 'shout'; ro.poseT = 5; ro.c.face = 'shout';
        this.job('risk_officer', `✖ VETOED ${ev.data?.symbol || 'ORDER'}`, 9, true);
        this.react('shout', 4); this.sting('veto');
        break;
      }
      case 'execute': { const to = world(PIT.x, 1.6, PIT.z); this.fx.pulse(P(ro), to, COL_C.good, 2.4); const up = P(ro); up.y += 1.2; this.fx.stamp('CLEARED', up, { scale: 0.7, hold: 2.5 }); break; }
      case 'result':
        if (ev.outcome === 'filled' && a) { const up = P(a); up.y += 1.5; this.fx.stamp('FILLED', up, { scale: 0.8, hold: 4 }); a.pad.material.opacity = 1; this.react('shout', 2); this.sting('fill'); }
        else if (ev.outcome === 'rejected') { const up = P(ro); up.y += 1.2; this.fx.stamp('REJECTED', up, { scale: 0.7, hold: 3 }); }
        break;
      case 'research': {
        if (a) { const sh = ev.data?.kind === 'headline' ? ev.data.symbol : ''; this.job(a.def.id, ev.data?.kind === 'plan' ? '▶ DRAFTING THE OPEN PLAN' : `▶ READING THE TAPE ${sh}`.trim(), 10); }
        if (ev.data?.kind === 'headline' && !ev.data.none) this.job('head_trader', `▶ READS: ${ev.data.symbol} ${ev.data.impact}`, 8);
        break;
      }
      default: break;
    }
  }
  sting(kind) { if (this.group.visible) playSting(kind); } // only while the player is on OT-01
  react(pose, secs) { for (const r of this.reactors) { r.c.pose = pose; r.t = secs + r.i * 0.4; } }
  dotText(label = 'Thinking') { return `${['●', '● ●', '● ● ●'][this.dots % 3]} THINKING · ${String(label).toUpperCase()}`; }

  /** follow the server's list of agents called up to Asset Protection (hub meta `custody`) */
  bind(rt) {
    const apply = (m) => this.setCustody(m?.custody || []);
    rt.on('meta', apply); apply(rt.meta);
  }
  setCustody(list) {
    const by = new Map(list.map((c) => [c.agent, c]));
    this.agents.forEach((a, i) => {
      const c = by.get(a.def.id);
      if (c && REVIEW[c.kind] && a.custody?.kind !== c.kind) this.summon(a, i, c);
      else if (!c && a.custody) this.sendBack(a);
    });
  }
  summon(a, i, c) {
    const r = REVIEW[c.kind], s = r.spot(i);
    a.custody = { kind: c.kind, x: s.x, z: s.z, pace: r.pace || 0, dir: 1, yaw: s.yaw };
    a.job = null; a.state = 'custody';
    a.pos.set(s.x, SEC_ELEV(), s.z); a.yaw = s.yaw; a.c.pose = r.pose;
    this.say(a, r.label, true);
  }
  sendBack(a) {
    a.custody = null; a.state = 'desk'; a.timer = 8;
    a.pos.set(a.def.stand[0], ELEV(), a.def.stand[1]); a.yaw = a.def.faceYaw; a.c.pose = 'deal';
    this.say(a, a.last || a.def.idle, true);
  }

  /** an order / research / review for this agent: go to the PC and work it */
  job(id, text, hold, done = false) {
    const a = this.byId[id]; if (!a) return;
    if (a.custody) { if (done) a.last = text; return; } // not at the desk right now
    a.job = { text, t: hold };
    if (done) a.last = text;
    a.pad.material.opacity = 1;
    this.say(a, text);
    if (a.state !== 'desk') a.state = 'toDesk';
  }

  say(a, status, force = false) {
    if (!force && a.text === status) return;
    a.text = status;
    const w = a.def.who, ev = forAgent(a.def.id, 1)[0], c = ev ? chip(ev) : { label: w.name, hex: w.hex };
    const lines = [
      { t: `◉ ${w.name} · LIVE AI AGENT`, px: 30, c: w.hex, w: 900 },
      { t: a.def.name, px: 46, w: 800 },
      { t: a.def.role, px: 24, c: '#e3c27a', w: 600 },
      { t: status, px: 28, c: status.startsWith('✔') ? '#6dffb0' : status.startsWith('✖') ? '#ff7a7a' : status.startsWith('▶') || a.thinking ? '#ffe27a' : '#cfd6e4', w: 700 },
    ];
    if (ev && ev.provider !== w.key) lines[0] = { t: `◉ ${w.name} AGENT · LAST DECISION BY ${c.label}`, px: 26, c: c.hex, w: 900 }; // honest when a key is missing and the other model (or the rule book) decided
    if (ev && !a.thinking) for (const l of wrap2(ev.text)) lines.push({ t: l, px: 22, c: ev.outcome ? outcomeColor(ev.outcome) : '#aab3c5', w: 600 });
    a.tag.userData.set(lines);
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

  ensureBoards() {
    if (this.boards) return;
    const front = makeDeskBoard(), back = makeResearchWall(), cy = ELEV() + AI_BOARD.y0 + AI_BOARD.h / 2;
    front.mesh.position.set(AI_BOARD.x + 0.09, cy, 0); front.mesh.rotation.y = Math.PI / 2;
    back.mesh.position.set(AI_BOARD.x - 0.09, cy, 0); back.mesh.rotation.y = -Math.PI / 2;
    this.group.add(front.mesh, back.mesh); this.boards = [front, back];
  }

  update(dt, visibleIds, viewer = globalThis.__crowdViewer) {
    const visDesk = visibleIds.includes('OT-01'), visSec = visibleIds.includes('OT-04');
    this.group.visible = visDesk || visSec;
    this.t += dt;
    if (visDesk) this.ensureBoards();
    if (this.boards) for (const b of this.boards) { b.mesh.visible = visDesk; b.tick(dt, visDesk); }
    this.fx.group.visible = visDesk; if (visDesk) this.fx.update(dt);
    for (const r of this.reactors) { r.c.root.visible = visDesk; if (r.t > 0) { r.t -= dt; if (r.t <= 0) r.c.pose = 'idle'; } if (visDesk) r.c.update(dt, this.t, 0); }
    // THINKING dots: redraw the tag three times a second, only for agents with a model call in flight
    let anyThink = false;
    for (const a of this.agents) { if (a.thinking && !thinking(a.def.id)) { a.thinking = false; this.say(a, a.last || a.def.idle, true); } anyThink ||= a.thinking; }
    if (anyThink && (this.dotT += dt) > 0.4) { this.dotT = 0; this.dots++; for (const a of this.agents) if (a.thinking) this.say(a, this.dotText(thinkingInfo(a.def.id)?.text), true); }
    for (const a of this.agents) {
      const d = a.def;
      a.timer -= dt;
      let speed = 0;
      const vis = a.custody ? visSec : visDesk;
      a.c.root.visible = vis; a.pad.visible = vis && !a.custody; // the desk pad stays dark while its agent is away
      if (a.state === 'custody') {
        const k = a.custody;
        if (k.kind === 'feedback') { a.c.pose = 'panic'; a.pos.x = k.x + Math.sin(this.t * 3.1 + k.yaw) * 0.18; a.pos.z = k.z + Math.cos(this.t * 2.3 + k.yaw) * 0.18; a.yaw = k.yaw + Math.sin(this.t * 2) * 0.5; }
        else if (k.pace) { // pace the glass suite
          const tx = k.x + k.pace * k.dir;
          if (this.moveToward(a, tx, k.z, 0.9 * dt)) k.dir = -k.dir; else speed = 0.9;
          a.c.pose = 'cross';
        } else { a.pos.set(k.x, SEC_ELEV(), k.z); a.yaw = k.yaw; }
      } else if (a.state === 'desk') {
        a.pos.set(d.stand[0], ELEV(), d.stand[1]); a.yaw = d.faceYaw;
        a.c.pose = a.thinking ? 'tablet' : 'deal'; // head down while a model call is in flight
        if (a.job) { a.job.t -= dt; if (a.job.t <= 0) { a.job = null; this.say(a, a.last || d.idle); } }
        // strolls only while idle: no job, no model call in flight
        if (!a.job && !a.thinking && a.timer <= 0) { a.state = 'stroll'; a.timer = 16 + Math.random() * 16; a.leg = Math.floor(Math.random() * d.route.length); this.say(a, 'ON THE FLOOR · WALKING THE PITS'); }
      } else if (a.state === 'stroll') {
        a.c.pose = 'phone';
        const [tx, tz] = d.route[a.leg];
        if (this.moveToward(a, tx, tz, SPEED * dt)) a.leg = (a.leg + 1) % d.route.length; else speed = SPEED;
        if (a.timer <= 0) a.state = 'toDesk';
      } else { // toDesk
        a.c.pose = 'phone';
        if (this.moveToward(a, d.stand[0], d.stand[1], SPEED * 1.15 * dt)) { a.state = 'desk'; a.timer = 12 + Math.random() * 14; if (!a.job && !a.thinking) this.say(a, a.last || d.idle); } else speed = SPEED * 1.15;
      }
      if (a.poseT > 0) { a.poseT -= dt; a.c.pose = a.poseOv; if (a.poseT <= 0) a.poseOv = null; }
      setPersonPos(d.id, a.custody ? 'OT-04' : 'OT-01', a.pos.x, a.pos.y, a.pos.z);
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
      const padTarget = a.thinking ? 0.45 + Math.sin(this.t * 7) * 0.35 : a.state === 'desk' ? 0.4 : 0.2; // pulses while the model thinks
      a.pad.material.opacity += (padTarget - a.pad.material.opacity) * Math.min(1, dt * (a.thinking ? 8 : 1.5));
    }
  }

  status() {
    return this.agents.map((a) => ({ id: a.def.id, provider: a.def.who.name, state: a.state, text: a.text, thinking: a.thinking, pos: a.pos.toArray().map((v) => +v.toFixed(1)) }));
  }
}

const COL_C = { gemini: 0x5aa2ff, good: 0x5dff9a };
