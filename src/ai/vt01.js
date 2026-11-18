// VT-01 Executive Leisure Suite: AI hosts you can see walking the roulette promenade near the entrance (follow-up task).
// DEFAULT CHOICES (owner can change): 3 rule-book hosts, they WALK and WATCH the tables, they never stake, so no money logic and no LLM
// calls are involved (cost $0). Tags say so: "AI HOST · RULE BOOK · watches, never stakes". Real money-moving AI stays in the three feed rooms.
import * as THREE from 'three';
import { makeQuant, makeCoHeadTrader, makeRiskOfficer } from '../characters/roster.js';
import { makeTag } from '../characters/kit.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { setPerson, setPersonPos } from './agentCard.js';

const E = () => FLOOR_BY_ID['VT-01'].elevation;
const SPEED = 1.3;
// tables sit at x 58 + 9n, rows z -14.6 / -21.5 / -28.4; the walkways run between the rows. Hosts work the first columns by the entrance.
const HOSTS = [
  { id: 'host_a', name: 'Concierge Bot Valentina', make: () => makeQuant(0xd9a47f), lane: -18.0, x0: 56, x1: 92, start: 0.0 },
  { id: 'host_b', name: 'Concierge Bot Reggie', make: makeRiskOfficer, lane: -25.0, x0: 56, x1: 84, start: 0.5 },
  { id: 'host_c', name: 'Concierge Bot Mei', make: makeCoHeadTrader, lane: -18.0, x0: 60, x1: 100, start: 0.8 },
];

export class LeisureAi {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group); this.t = 0;
    this.hosts = HOSTS.map((d, i) => {
      const c = d.make(); if (c.tag) c.root.remove(c.tag); c.pose = 'phone'; c.root.traverse?.((m) => { m.castShadow = false; });
      const tag = makeTag([{ t: '◉ AI HOST · RULE BOOK', px: 26, c: '#9aa3b2', w: 900 }, { t: d.name, px: 40, w: 800 }, { t: 'watches the roulette, never stakes', px: 22, c: '#e3c27a', w: 600 }], { bg: 'rgba(6,8,12,.92)', border: '#9aa3b2', radius: 14, ps: 0.0046 });
      tag.position.y = c.tagY + 0.3; tag.renderOrder = 998; c.root.add(tag); this.group.add(c.root);
      const span = d.x1 - d.x0, h = { d, c, tag, base: tag.scale.clone(), pos: new THREE.Vector3(d.x0 + span * d.start, E(), d.lane), dir: 1, wait: 2 + i * 3, yaw: 0 };
      setPerson({ id: d.id, name: d.name, role: 'AI Host · rule book · watches, never stakes', room: 'VT-01', floor: 'VT-01', agent: d.id, provider: 'rules', x: h.pos.x, y: E(), z: h.pos.z });
      return h;
    });
  }
  update(dt, visibleIds, viewer = globalThis.__crowdViewer) {
    const vis = visibleIds.includes('VT-01'); this.group.visible = vis; this.t += dt;
    for (const h of this.hosts) {
      const d = h.d; let speed = 0;
      if (h.wait > 0) { h.wait -= dt; h.c.pose = 'deal'; h.yaw = d.lane > -20 ? -Math.PI / 2 * 0 + 0 : Math.PI; } // stops to watch a table, facing it
      else {
        h.c.pose = 'phone';
        const tx = h.dir > 0 ? d.x1 : d.x0, dx = tx - h.pos.x, step = SPEED * dt;
        if (Math.abs(dx) <= step) { h.pos.x = tx; h.dir *= -1; h.wait = 3; } else { h.pos.x += Math.sign(dx) * step; speed = SPEED; h.yaw = Math.sign(dx) * Math.PI / 2; }
        if (Math.abs(((h.pos.x - 58) % 9 + 9) % 9 - 4.5) < 0.12 && Math.random() < 0.5) h.wait = 2 + Math.random() * 4; // pause by a table
      }
      setPersonPos(d.id, 'VT-01', h.pos.x, h.pos.y, h.pos.z);
      h.c.root.visible = vis; if (!vis) continue;
      let dy = h.yaw - h.c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); h.c.root.rotation.y += dy * Math.min(1, dt * 6);
      h.c.root.position.copy(h.pos); h.c.update(dt, this.t, speed);
      const k = viewer ? Math.min(2.2, Math.max(0.45, Math.hypot(viewer.x - h.pos.x, viewer.z - h.pos.z) / 9)) : 1; h.tag.scale.set(h.base.x * k, h.base.y * k, 1);
    }
  }
}
