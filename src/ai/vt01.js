// VT-01 Executive Leisure Suite: a Claude seat and a Gemini seat PLAY the roulette (server/agents/roulettePlayers.js).
// They walk the promenade by the entrance and stand at the tables; every rotation is a real spin on the server's wheel engine with their OWN
// notional bankroll (owner rule: the firm's money is not affected, nothing touches the ledger). Each win / loss pops up over their head and
// their running NET stays on the tag. Labels say CLAUDE / GEMINI / RULE BOOK from the model that actually made the plan.
import * as THREE from 'three';
import { makeHeadTrader, makeCoHeadTrader } from '../characters/roster.js';
import { makeTag } from '../characters/kit.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { api } from '../net/api.js';
import { setPerson, setPersonPos } from './agentCard.js';
import { startAiFeed, onAgent, COL, providerChip } from './feed.js';
import { away } from './ot04.js';

const E = () => FLOOR_BY_ID['VT-01'].elevation;
const SPEED = 1.3;
const LANE = -18.0; // walkway between the first two roulette rows (rows at z -14.6 and -21.5)
const TABLES_X = [58, 67, 76, 85, 94];
const SEATS = [
  { id: 'roulette_claude', name: 'Claude, Roulette Desk', route: 'claude', make: makeHeadTrader, x: 60 },
  { id: 'roulette_gemini', name: 'Gemini, Roulette Desk', route: 'gemini', make: makeCoHeadTrader, x: 80 },
];
const money = (m) => `${m < 0 ? '−' : m > 0 ? '+' : ''}¤${Math.abs(m / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export class LeisureAi {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group); this.t = 0; this.acc = 0;
    startAiFeed();
    this.seats = SEATS.map((d, i) => {
      const c = d.make(); if (c.tag) c.root.remove(c.tag); c.pose = 'deal'; c.root.traverse?.((m) => { m.castShadow = false; });
      const tag = makeTag([{ t: '', px: 10 }], { bg: 'rgba(6,8,12,.94)', border: d.route === 'claude' ? '#ff8a5c' : '#5aa2ff', radius: 14, ps: 0.0048 });
      tag.position.y = c.tagY + 0.3; tag.renderOrder = 998; c.root.add(tag);
      const pop = makeTag([{ t: '', px: 10 }], { bg: 'rgba(6,8,12,.0)', ps: 0.0075 }); pop.renderOrder = 999; pop.material.opacity = 0; pop.visible = false; c.root.add(pop);
      this.group.add(c.root);
      const s = { d, c, tag, pop, popT: 99, base: tag.scale.clone(), pos: new THREE.Vector3(d.x, E(), LANE), yaw: 0, tx: d.x, row: 1, wait: 6 + i * 20, info: null, text: '' };
      setPerson({ id: d.id, name: d.name, role: 'Plays roulette · notional chips · firm money not affected', room: 'VT-01', floor: 'VT-01', agent: d.id, provider: d.route, x: s.pos.x, y: E(), z: LANE });
      this.draw(s);
      return s;
    });
    onAgent((ev) => this.onFeed(ev));
    this.load(); setInterval(() => this.load(), 20_000);
  }
  async load() { try { const j = await api('/api/ai/roulette'); for (const p of j.players) { const s = this.seats.find((x) => x.d.id === p.id); if (s) { s.info = p; this.draw(s); } } } catch { /* server down: tag keeps its last numbers */ } }
  onFeed(ev) {
    if (ev.room !== 'VT-01') return;
    const s = this.seats.find((x) => x.d.id === ev.agent); if (!s) return;
    if (ev.stage === 'result' && ev.data) {
      s.info = { ...(s.info || {}), bank: ev.data.bank, net: ev.data.total, rounds: ev.data.rounds, provider: ev.provider, last: ev.data };
      s.popT = 0; s.popNet = ev.data.net; this.setPop(s, ev.data.net, ev.data.pocket, ev.data.color); this.draw(s);
    } else if (ev.stage === 'decision') { s.info = { ...(s.info || {}), note: ev.data?.note, provider: ev.provider }; this.draw(s); }
  }
  draw(s) {
    const i = s.info, chip = providerChip(i?.provider || 'rules'), net = i?.net ?? 0;
    s.tag.userData.set([
      { t: `◉ ${s.d.route === 'claude' ? 'CLAUDE' : 'GEMINI'} · LIVE AI PLAYER${i && chip.label === 'RULE BOOK' ? ' · RULE BOOK PLAN' : ''}`, px: 26, c: s.d.route === 'claude' ? COL.claude : COL.gemini, w: 900 },
      { t: s.d.name, px: 40, w: 800 },
      { t: i ? `NET ${money(net)}   ·   BANK ¤${Math.round((i.bank || 0) / 100).toLocaleString('en-US')}` : 'taking a seat…', px: 30, c: net > 0 ? COL.good : net < 0 ? COL.bad : '#cfd6e4', w: 900 },
      { t: 'notional chips · firm money not affected', px: 20, c: '#9aa3b2', w: 600 },
    ]);
    s.base = s.tag.scale.clone();
  }
  setPop(s, net, pocket, color) {
    const col = net > 0 ? COL.good : net < 0 ? COL.bad : '#cfd6e4';
    s.pop.userData.set([{ t: money(net) === '' || net === 0 ? 'PUSH' : money(net), px: 74, c: col, w: 900 }, { t: `${pocket} ${String(color).toUpperCase()}`, px: 30, c: '#e3c27a', w: 800 }]);
    s.pop.visible = true;
  }
  update(dt, visibleIds, viewer = globalThis.__crowdViewer) {
    const vis = visibleIds.includes('VT-01'); this.group.visible = vis; this.t += dt;
    for (const s of this.seats) {
      let speed = 0;
      if (s.wait > 0) { s.wait -= dt; s.c.pose = 'deal'; s.yaw = s.row > 0 ? 0 : Math.PI; } // at the table, facing it
      else {
        s.c.pose = 'phone';
        const dx = s.tx - s.pos.x, step = SPEED * dt;
        if (Math.abs(dx) <= step) { s.pos.x = s.tx; s.wait = 50 + Math.random() * 50; s.row = Math.random() < 0.5 ? 1 : -1; const nx = TABLES_X[Math.floor(Math.random() * TABLES_X.length)] + 0.0; s.tx = nx; } else { s.pos.x += Math.sign(dx) * step; speed = SPEED; s.yaw = Math.sign(dx) * Math.PI / 2; }
      }
      setPersonPos(s.d.id, 'VT-01', s.pos.x, s.pos.y, s.pos.z);
      s.c.root.visible = vis && !away(s.d.id); if (!vis || away(s.d.id)) continue; // at Asset Protection: this character is being punished there
      let dy = s.yaw - s.c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.c.root.rotation.y += dy * Math.min(1, dt * 6);
      s.c.root.position.copy(s.pos); s.c.update(dt, this.t, speed);
      const k = viewer ? Math.min(2.2, Math.max(0.45, Math.hypot(viewer.x - s.pos.x, viewer.z - s.pos.z) / 9)) : 1; s.tag.scale.set(s.base.x * k, s.base.y * k, 1);
      if (s.popT < 7) { // win / loss pops over the head, rises and fades
        s.popT += dt; const u = s.popT / 7, sc = (1 + Math.min(1, s.popT * 4) * 0.0) * k;
        s.pop.scale.set(s.pop.scale.x, s.pop.scale.y, 1); s.pop.position.y = s.c.tagY + 0.3 + s.base.y * k + 0.5 + u * 0.9 * k; s.pop.material.opacity = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25; void sc;
      } else if (s.pop.visible) { s.pop.visible = false; s.pop.material.opacity = 0; }
    }
  }
}
