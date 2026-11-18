// OT-04 Asset Protection HQ: the UNDERPERFORMANCE BOARD and the punished doubles (owner request).
//  - A big board on the yard-side wall ranks every money-making AI agent by its real result, worst first (GET /api/ai/performance).
//    It is read-only; the CEO / admins call an agent up from the console (Alt+F2, Asset Protection), exactly as for the four trading agents.
//  - Every agent the CEO can call up (the extra ones here; the four trading agents are handled by aiTraders.js) appears in the yard in the
//    chosen review: standing on a numbered spot, receiving kinetic performance feedback, or pacing the transition suite. While an agent is
//    at Asset Protection its character at the desk disappears (`away(id)`), so the SAME character is the one being punished.
import * as THREE from 'three';
import { makeCFO, makeLeadQuant, makeOperator, makeHeadTrader, makeCoHeadTrader, makeGuard } from '../characters/roster.js';
import { PUNCH_T, HIT_T } from '../characters/kit.js';
import { makeTag } from '../characters/kit.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { api } from '../net/api.js';
import { Board, font, rrect, drawHeader } from './thoughtBoard.js';
import { COL } from './feed.js';

/** agents the console can call up besides the four OT-01 traders (those live in aiTraders.js) */
export const EXTRA_AGENTS = [
  { id: 'thai_head', name: 'Khun Anan Prasertsak', role: 'Head of Thai Markets · OT-02', make: makeCFO },
  { id: 'lottery_quant', name: 'Dr. Mei-Ling Sutthichai', role: 'Lottery Quant · OT-02', make: makeLeadQuant },
  { id: 'fixture_scout', name: 'Dr. Lucia Ferrante-Okoye', role: 'Fixture Scout · VT-02', make: makeLeadQuant },
  { id: 'sports_desk', name: 'Tomás Beaumont-Reyes', role: 'Sports Desk · VT-02', make: makeOperator },
  { id: 'roulette_claude', name: 'Claude, Roulette Desk', role: 'Roulette player · VT-01', make: makeHeadTrader },
  { id: 'roulette_gemini', name: 'Gemini, Roulette Desk', role: 'Roulette player · VT-01', make: makeCoHeadTrader },
];
const AWAY = new Set();
/** true while this agent is at Asset Protection (its desk / table character hides) */
export const away = (id) => AWAY.has(id);

const SEC = () => FLOOR_BY_ID['OT-04'].elevation;
const REVIEW = {
  alignment: { label: 'MANDATORY ALIGNMENT · STAND ON YOUR NUMBER', pose: 'idle', spot: (i) => ({ x: -92, z: 6 + i * 2.5, yaw: -Math.PI / 2 }) },
  feedback: { label: 'RECEIVING KINETIC PERFORMANCE FEEDBACK', pose: 'panic', spot: (i) => ({ x: [-74.5, -68.8, -78.5, -71.6, -66.4, -80.6][i % 6], z: [22.6, 24.2, 25.4, 25.9, 23.2, 23.8][i % 6], yaw: Math.PI / 2 + i }) },
  suite: { label: 'TRANSITION SUITE · CHECKOUT IS FINAL', pose: 'cross', spot: (i) => ({ x: -96 + i * 3.4, z: 34.2, yaw: Math.PI }), pace: 1.4 },
};
const money = (m) => `${m < 0 ? '−' : '+'}¤${Math.abs(m / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const BOARD = { x: -81, w: 10.6, h: 3.8, y0: 1.4, z: -2.9 };

export class Ot04Ai {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group); this.t = 0; this.perf = null; this.board = null;
    this.doubles = EXTRA_AGENTS.map((d, i) => {
      const c = d.make(); if (c.tag) c.root.remove(c.tag); c.root.traverse?.((m) => { m.castShadow = false; }); c.root.visible = false;
      const tag = makeTag([{ t: '', px: 10 }], { bg: 'rgba(60,8,8,.94)', border: '#ff5a5a', radius: 14, ps: 0.0048 }); tag.position.y = c.tagY + 0.3; tag.renderOrder = 998; c.root.add(tag);
      this.group.add(c.root);
      return { d, c, tag, i: i + 4, custody: null, pos: new THREE.Vector3(), yaw: 0, dir: 1 };
    });
    // guards who beat whoever is receiving KINETIC PERFORMANCE FEEDBACK (two per victim, up to two victims at once); the victim recoils on every blow and goes down after a while
    this.guards = Array.from({ length: 4 }, () => { const c = makeGuard(); c.root.traverse?.((m) => { m.castShadow = false; }); c.root.visible = false; c.pose = 'box'; this.group.add(c.root); return { c, t: Math.random() }; });
    this.victimOf = () => null; // main.js: (agentId) => the trading agent's { c, pos } (those characters live in aiTraders.js)
    this.beat = new Map(); // agentId -> seconds of beating so far
    this.load(); setInterval(() => this.load(), 30_000);
  }
  async load() { try { this.perf = await api('/api/ai/performance'); this.board?.touch(); } catch { /* server down: the board says so */ } }
  bind(rt) { const apply = (m) => this.set(m?.custody || []); rt.on('meta', apply); apply(rt.meta); }
  set(list) {
    this.list = list;
    const by = new Map(list.map((c) => [c.agent, c]));
    for (const x of this.doubles) {
      const c = by.get(x.d.id);
      if (c && REVIEW[c.kind]) {
        if (x.custody?.kind === c.kind) continue;
        const r = REVIEW[c.kind], s = r.spot(x.i);
        x.custody = { kind: c.kind, x: s.x, z: s.z, pace: r.pace || 0 }; x.pos.set(s.x, SEC(), s.z); x.yaw = s.yaw; x.c.pose = r.pose; AWAY.add(x.d.id);
        x.tag.userData.set([{ t: '◉ AT ASSET PROTECTION', px: 24, c: '#ff9a9a', w: 900 }, { t: x.d.name, px: 40, w: 800 }, { t: r.label, px: 22, c: '#ffd0d0', w: 700 }]); x.base = x.tag.scale.clone();
      } else if (!c && x.custody) { x.custody = null; AWAY.delete(x.d.id); x.c.root.visible = false; }
    }
  }
  ensureBoard() {
    if (this.board) return;
    this.board = new Board({ w: BOARD.w, h: BOARD.h, px: 190, name: 'ot04-underperformance', draw: (g, W, H) => {
      drawHeader(g, W, 'UNDERPERFORMANCE BOARD', this.perf ? 'Worst results first · the CEO decides who is called up for review' : 'AI FEED OFFLINE · no ranking available', 'RANKED', null, COL.bad, 50);
      const rows = this.perf?.rows || [], max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
      rows.slice(0, 6).forEach((r, i) => {
        const y = 150 + i * 84, away = AWAY.has(r.agent), bad = r.net < 0;
        rrect(g, 24, y, W - 48, 76, 12, away ? 'rgba(255,90,90,.2)' : 'rgba(255,255,255,.05)', away ? COL.bad : null, 3);
        font(g, 34, 900); g.fillStyle = bad ? '#ff9a9a' : '#9fffc4'; g.textBaseline = 'top'; g.fillText(String(i + 1), 44, y + 18);
        font(g, 34, 800); g.fillStyle = '#f6efe0'; g.fillText(r.name, 96, y + 6); font(g, 22, 600); g.fillStyle = '#9aa3b2'; g.fillText(`${r.unit}${away ? ' · AT ASSET PROTECTION NOW' : ''}`, 96, y + 46);
        const bw = Math.max(8, (Math.abs(r.net) / max) * 520); rrect(g, W - 760, y + 22, bw, 32, 8, bad ? COL.bad : COL.good);
        font(g, 36, 900); g.textAlign = 'right'; g.fillStyle = bad ? COL.bad : COL.good; g.fillText(money(r.net), W - 40, y + 18); g.textAlign = 'left';
      });
      if (!rows.length) { font(g, 30, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText('Waiting for results.', 40, 190); }
    } });
    this.board.mesh.position.set(BOARD.x, SEC() + BOARD.y0 + BOARD.h / 2, BOARD.z); this.group.add(this.board.mesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.2, BOARD.h + 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x1b2230 })); frame.position.set(BOARD.x, SEC() + BOARD.y0 + BOARD.h / 2, BOARD.z - 0.04); this.group.add(frame);
  }
  /** drive the guards and the victims: every ~0.9 s a guard throws a blow, the victim recoils, and after ~12 s the victim is on the floor */
  beating(dt) {
    const victims = [];
    for (const c of this.list || []) if (c.kind === 'feedback') {
      const dbl = this.doubles.find((x) => x.d.id === c.agent), tr = dbl ? null : this.victimOf(c.agent);
      if (dbl?.custody) victims.push({ id: c.agent, ch: dbl.c, pos: dbl.pos, set: (v) => { dbl.guardFace = v; } });
      else if (tr?.custody) victims.push({ id: c.agent, ch: tr.c, pos: tr.pos, tr });
    }
    for (const id of [...this.beat.keys()]) if (!victims.some((v) => v.id === id)) { this.beat.delete(id); }
    this.guards.forEach((g) => { g.c.root.visible = false; });
    victims.slice(0, 2).forEach((v, vi) => {
      const T = (this.beat.get(v.id) || 0) + dt; this.beat.set(v.id, T);
      const down = T > 12;
      v.ch.ko = down; v.ch.walkIn = true;
      if (v.tr) { v.tr.beaten = true; } else v.ch.pose = 'box';
      v.ch.root.rotation.x = down ? -1.35 : 0; // face-down on the floor once the beating has done its work
      for (let k = 0; k < 2; k++) {
        const g = this.guards[vi * 2 + k], side = k ? 1 : -1; g.t += dt;
        g.c.root.visible = true; g.c.pose = 'box';
        g.c.root.position.set(v.pos.x + side * 0.85, SEC(), v.pos.z + (down ? 0.35 : 0.55)); g.c.root.rotation.y = Math.atan2(-side * 0.85, -(down ? 0.35 : 0.55));
        const period = 0.9 + k * 0.17;
        if (g.t >= period && g.c.punchT <= 0) { g.t = 0; g.c.punchT = PUNCH_T; g.c.punchSide = k ? 1 : -1; if (!down) v.ch.hitT = HIT_T; }
        g.c.update(dt, this.t, 0);
      }
    });
  }
  update(dt, visibleIds, viewer = globalThis.__crowdViewer) {
    const vis = visibleIds.includes('OT-04'); this.group.visible = vis; this.t += dt;
    if (!vis) return;
    this.ensureBoard(); this.board.tick(dt, true);
    this.beating(dt);
    for (const x of this.doubles) {
      const k = x.custody; x.c.root.visible = Boolean(k); if (!k) continue;
      let speed = 0;
      if (k.kind === 'feedback') { x.c.pose = 'box'; x.c.walkIn = true; x.pos.set(k.x, SEC(), k.z); x.yaw = x.guardFace ?? x.yaw; } // the beating itself is driven by beating()
      else if (k.pace) { const tx = k.x + 3 * x.dir; if (Math.abs(tx - x.pos.x) < dt * k.pace) x.dir = -x.dir; else { x.pos.x += Math.sign(tx - x.pos.x) * dt * k.pace; speed = k.pace; x.yaw = Math.sign(tx - x.pos.x) * Math.PI / 2; } x.c.pose = 'cross'; }
      x.c.root.position.copy(x.pos); x.c.root.rotation.y = x.yaw; x.c.update(dt, this.t, speed);
      const s = viewer ? Math.min(2.2, Math.max(0.45, Math.hypot(viewer.x - x.pos.x, viewer.z - x.pos.z) / 9)) : 1; if (x.base) x.tag.scale.set(x.base.x * s, x.base.y * s, 1);
    }
  }
}
