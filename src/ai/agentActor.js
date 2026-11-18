// A stationary live AI agent (OT-02 desks, VT-02 pit desks): body from characters/roster.js, a provider-coloured
// tag with name / role / live status / last real decision, a floor pad that pulses while a model call is in
// flight, THINKING dots and a head-down pose. Same honesty rules as the OT-01 walking desk: the tag says which
// model really decided (CLAUDE / GEMINI / RULE BOOK). Registered with agentCard.js for the walk-up card.
import * as THREE from 'three';
import { makeTag } from '../characters/kit.js';
import { forAgent, chip, outcomeColor, thinking, thinkingInfo } from './feed.js';
import { setPerson, setPersonPos } from './agentCard.js';
import { away } from './ot04.js';

const HEX = { claude: 0xff8a5c, gemini: 0x5aa2ff, rules: 0x9aa3b2 };
const HEXS = { claude: '#ff8a5c', gemini: '#5aa2ff', rules: '#9aa3b2' };
const wrap2 = (s, n = 34) => {
  const words = String(s || '').split(/\s+/), out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; if (out.length === 2) break; } else cur = (cur + ' ' + w).trim(); }
  if (out.length < 2 && cur) out.push(cur);
  const t = out.slice(0, 2); if (words.join(' ').length > t.join(' ').length + 2) t[t.length - 1] = `${t[t.length - 1].slice(0, n - 1)}…`;
  return t;
};

export class AgentActor {
  /** def: { id, name, role, route ('claude'|'gemini'|'rules'), idle, make, floor, room, x, z, yaw, elev } */
  constructor(parent, def) {
    this.def = def; this.thinking = false; this.t = 0; this.text = ''; this.poseT = 0; this.poseOv = null; this.dotT = 0; this.dots = 0;
    const c = def.make(); this.c = c;
    if (c.tag) c.root.remove(c.tag); // roster bodies carry a fixed demo tag; the live one is made here
    c.pose = def.pose || 'deal';
    const col = HEX[def.route] ?? HEX.rules;
    this.tag = makeTag([{ t: '', px: 10 }], { bg: 'rgba(6,8,12,.94)', border: HEXS[def.route], radius: 16, ps: 0.0052 });
    this.tag.position.y = c.tagY + 0.3; this.tag.renderOrder = 998; c.root.add(this.tag);
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: col })); this.gem.scale.set(0.8, 1.2, 0.8); c.root.add(this.gem);
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
    this.pad.position.set(def.x, def.elev + 0.04, def.z); parent.add(this.pad);
    c.root.position.set(def.x, def.elev, def.z); c.root.rotation.y = def.yaw;
    c.root.traverse?.((m) => { m.castShadow = false; });
    parent.add(c.root);
    this.pos = new THREE.Vector3(def.x, def.elev, def.z);
    setPerson({ id: def.id, name: def.name, role: def.role, room: def.room, floor: def.floor, agent: def.id, provider: def.route, x: def.x, y: def.elev, z: def.z });
    this.say(def.idle, true);
  }
  say(status, force = false) {
    if (!force && this.text === status) return;
    this.text = status;
    const d = this.def, ev = forAgent(d.id, 1)[0], c = ev ? chip(ev) : chip({ provider: d.route });
    const lines = [
      { t: `◉ ${c.label} · LIVE AI AGENT`, px: 30, c: c.hex, w: 900 },
      { t: d.name, px: 46, w: 800 },
      { t: d.role, px: 24, c: '#e3c27a', w: 600 },
      { t: status, px: 28, c: this.thinking ? '#ffe27a' : status.startsWith('▶') ? '#ffe27a' : '#cfd6e4', w: 700 },
    ];
    if (ev && !this.thinking) for (const l of wrap2(ev.text)) lines.push({ t: l, px: 22, c: ev.outcome ? outcomeColor(ev.outcome) : '#aab3c5', w: 600 });
    this.tag.userData.set(lines);
    this.base = this.tag.scale.clone();
  }
  setThinking(on, label) { this.thinking = on; this.say(on ? this.dotText(label) : this.def.idle, true); this.pad.material.opacity = 1; }
  dotText(label = 'Thinking') { return `${['●', '● ●', '● ● ●'][this.dots % 3]} THINKING · ${String(label).toUpperCase()}`; }
  pose(name, secs) { this.poseOv = name; this.poseT = secs; }
  up(vec = this.pos, h = 1.25) { return new THREE.Vector3(vec.x, vec.y + h, vec.z); }

  update(dt, t, visible, viewer = globalThis.__crowdViewer) {
    visible = visible && !away(this.def.id); // called up to Asset Protection: this character is the one being punished there
    this.c.root.visible = visible; this.pad.visible = visible;
    if (!visible) return;
    if (this.thinking && !thinking(this.def.id)) this.setThinking(false);
    if (this.thinking && (this.dotT += dt) > 0.4) { this.dotT = 0; this.dots++; this.say(this.dotText(thinkingInfo(this.def.id)?.text), true); }
    this.c.pose = this.poseT > 0 ? this.poseOv : this.thinking ? 'tablet' : (this.def.pose || 'deal');
    if (this.poseT > 0) this.poseT -= dt;
    this.c.update(dt, t, 0);
    const k = viewer ? Math.min(2.5, Math.max(0.4, Math.hypot(viewer.x - this.pos.x, viewer.y - this.pos.y - 2, viewer.z - this.pos.z) / 8)) : 1;
    this.tag.scale.set(this.base.x * k, this.base.y * k, 1); this.gem.scale.setScalar(k);
    this.gem.rotation.y = t * 2; this.gem.position.y = this.c.tagY + 0.3 + this.base.y * k + 0.3 * k + Math.sin(t * 3) * 0.06 * k;
    const target = this.thinking ? 0.45 + Math.sin(t * 7) * 0.35 : 0.32;
    this.pad.material.opacity += (target - this.pad.material.opacity) * Math.min(1, dt * (this.thinking ? 8 : 1.5));
    setPersonPos(this.def.id, this.def.floor, this.pos.x, this.pos.y, this.pos.z);
  }
}
