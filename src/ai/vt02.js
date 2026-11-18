// VT-02 Sports Analytics Arena: the Fixture Scout and the Sports Desk agent made visible (docs/ai-visuals-plan.md §5).
//   - Two real agents stand at Analytics Desks on the arrivals landing, flanking the head of the grand stair (the first thing
//     you see on entry): the Fixture Scout (Gemini, rule book without a key) and the Sports Desk agent (RULE BOOK).
//     Full LIVE AI tag, thought line, THINKING dots, walk-up card + press E history.
//   - A SCOUT BOARD and a DESK BOOK board stand behind them: scouting runs through the candidate fixtures and LOCKS the pick
//     (centre stack and side screens also react, see world/arenaFeed.js); a stake prints a ticket that resolves on the real result.
//   - ANALYTICS PODS (owner decision 3): 14 look-alike analysts per real agent fill the private boxes nearest the stair. HONESTY:
//     they are labelled "ANALYTICS POD · NOT A SEPARATE AI", they display no decisions of their own, and only MIRROR the real
//     agent's current state (thinking / scouting / printing a ticket) with a small delay and variation.
//   Performance: pods are 2 instanced meshes per pod (one per box level), one shared tag per pod, no lights, no per-frame
//   allocation. Everything is driven by real feed events; with no events the room shows the real countdown and the stored state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeLeadQuant, makeOperator } from '../characters/roster.js';
import { makeTag } from '../characters/kit.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { ARENA as A, BOXES } from '../floors/arena.js';
import { arenaFeedData, SCOUT_FX, refreshArenaFeed } from '../world/arenaFeed.js';
import { startAiFeed, onAgent, status, latest, offline, countdown, agoShort, COL, chip, thinking, outcomeColor, providerFromModel } from './feed.js';
import { Board, font, rrect, wrap, drawChip, drawHeader } from './thoughtBoard.js';
import { FlowFx } from './flowFx.js';
import { AgentActor } from './agentActor.js';
import { setPerson, setPersonPos } from './agentCard.js';
import { playSting } from '../world/sfx.js';

export const NAMES = { fixture_scout: 'Dr. Lucia Ferrante-Okoye', sports_desk: 'Tomás Beaumont-Reyes' };
const E = () => FLOOR_BY_ID['VT-02'].elevation;
const R_DESK = 56, DELTA = 0.22;
const BOARD = { x: 52.7, y0: 3.6, w: 5.2, h: 3.1, zs: 2.8, zd: -2.8 }; // the two boards hang side by side over the landing, on the stair axis // arrivals landing: radius and angle off the stair axis
const DESK_POS = (side) => ({ x: A.cx + R_DESK * Math.cos(Math.PI + side * DELTA), z: A.cz + R_DESK * Math.sin(Math.PI + side * DELTA) }); // side -1 = north (z<0)
const LW = 1500;
const money = (m) => `¤${(m / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** the boxes nearest the stair on one side, upper levels first: [{ k, mid }] */
function podBoxes(side, n4 = 4, n3 = 3) {
  const dist = (b) => (side > 0 ? b.mid - Math.PI : 3 * Math.PI - b.mid); // side +1 = north (z < 0): boxes just above pi; side -1 = south: just below 3 pi
  const by = (k, n) => BOXES.filter((b) => b.k === k && dist(b) > 0 && dist(b) < 1.4).sort((p, q) => dist(p) - dist(q)).slice(0, n);
  return [...by(4, n4), ...by(3, n3)];
}

// one cheap low-poly analyst (torso + legs + head), vertex colours, merged: ~100 triangles
function analystGeometry() {
  const part = (g, c) => { const n = g.toNonIndexed(); const col = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; } n.setAttribute('color', new THREE.BufferAttribute(col, 3)); return n; };
  const torso = new THREE.BoxGeometry(0.46, 0.62, 0.26).translate(0, 1.12, 0), legs = new THREE.BoxGeometry(0.34, 0.8, 0.22).translate(0, 0.4, 0), head = new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.6, 0);
  return mergeGeometries([part(torso, new THREE.Color(0xdfe6f2)), part(legs, new THREE.Color(0x2a2f3a)), part(head, new THREE.Color(0xd8a47f))]);
}

export class ArenaAi {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.t = 0; this.fx = new FlowFx(this.group, { stamps: 4, pulses: 8 }); this.boards = null; this.acc = 0;
    this.sweep = { on: false, t: 0, pick: -1 }; this.pods = []; this.mirror = { scout: { mode: 'idle', prev: 'idle', at: 0 }, desk: { mode: 'idle', prev: 'idle', at: 0 } };
    startAiFeed();
    const e = E(), top = e + A.Y[4];
    const ds = DESK_POS(-1), dd = DESK_POS(1);
    this.scout = new AgentActor(this.group, { id: 'fixture_scout', name: NAMES.fixture_scout, role: 'Fixture Scout · Analytics Desk', route: 'gemini', idle: 'WATCHING THE FIXTURE LIST', make: makeLeadQuant, floor: 'VT-02', room: 'VT-02', x: ds.x, z: ds.z, yaw: Math.PI / 2, elev: top, pose: 'tablet' });
    this.desk = new AgentActor(this.group, { id: 'sports_desk', name: NAMES.sports_desk, role: 'Sports Desk · RULE BOOK', route: 'rules', idle: 'WAITING FOR A MARQUEE FIXTURE', make: makeOperator, floor: 'VT-02', room: 'VT-02', x: dd.x, z: dd.z, yaw: Math.PI / 2, elev: top, pose: 'deal' });
    this.props(top, ds, dd);
    this.makePod('scout', -1, 'fixture_scout', 'Fixture Scout', false);
    this.makePod('desk', 1, 'sports_desk', 'Sports Desk', true);
    onAgent((ev, live) => this.onFeed(ev, live));
  }

  props(top, ds, dd) {
    const steel = new THREE.MeshBasicMaterial({ color: 0x1b2230 }), gold = new THREE.MeshBasicMaterial({ color: 0xd8a62a });
    const box = (m, w, h, d, x, y, z, ry = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.rotation.y = ry; this.group.add(me); return me; };
    for (const d of [ds, dd]) { // analytics consoles in front of the agents (east, towards the stair)
      const ry = -Math.atan2(d.z, d.x - A.cx) - Math.PI / 2; void ry;
      box(steel, 0.8, 1.0, 1.9, d.x + 1.0, top + 0.5, d.z); box(gold, 0.84, 0.05, 1.94, d.x + 1.0, top + 1.02, d.z); box(new THREE.MeshBasicMaterial({ color: 0x46ffb0 }), 0.04, 0.42, 0.8, d.x + 0.62, top + 1.36, d.z);
    }
    this.padPos = [ds, dd];
  }

  ensureBoards() {
    if (this.boards) return;
    const top = E() + A.Y[4], scaled = (fn) => (g, W, H) => { const k = W / LW; g.save(); g.scale(k, k); fn(g, LW, H / k); g.restore(); };
    const sb = new Board({ w: 5.2, h: 3.1, px: 300, name: 'vt02-scout', draw: scaled((g, W, H) => this.drawScout(g, W, H)) });
    const db = new Board({ w: 5.2, h: 3.1, px: 300, name: 'vt02-desk', draw: scaled((g, W, H) => this.drawDesk(g, W, H)) });
    // two boards side by side over the landing: the front faces the arrivals hall (readable through the portal), the back faces the stair
    const post = new THREE.BoxGeometry(0.12, BOARD.y0 + BOARD.h + 0.1, 0.12), pm = new THREE.MeshBasicMaterial({ color: 0x1b2230 });
    for (const [bd, z] of [[sb, BOARD.zs], [db, BOARD.zd]]) {
      bd.mesh.position.set(BOARD.x, top + BOARD.y0 + BOARD.h / 2, z); bd.mesh.rotation.y = -Math.PI / 2; this.group.add(bd.mesh);
      const back = new THREE.Mesh(bd.mesh.geometry, bd.mesh.material); back.position.set(BOARD.x + 0.14, top + BOARD.y0 + BOARD.h / 2, z); back.rotation.y = Math.PI / 2; back.renderOrder = 20; back.userData.boardBack = true; this.group.add(back); bd.back = back;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, BOARD.h + 0.12, BOARD.w + 0.12), pm); frame.position.set(BOARD.x + 0.07, top + BOARD.y0 + BOARD.h / 2, z); this.group.add(frame);
      for (const dz of [-BOARD.w / 2 - 0.06, BOARD.w / 2 + 0.06]) { const p = new THREE.Mesh(post, pm); p.position.set(BOARD.x + 0.07, top + (BOARD.y0 + BOARD.h + 0.1) / 2, z + dz); this.group.add(p); }
    }
    this.boards = [sb, db];
  }

  // ---------------------------------------------------------------- pods
  makePod(key, side, agent, label, ruleBook) {
    const top = E() + A.Y[4], boxes = podBoxes(side), pts = [];
    for (const b of boxes) for (const off of [-0.03, 0.03]) { const r = A.R[b.k] + 4.1, a = b.mid + off; pts.push({ x: A.cx + r * Math.cos(a), z: A.cz + r * Math.sin(a), y: E() + A.Y[b.k], yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), delay: 0.1 + Math.random() * 0.8, amp: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28, tone: 0.82 + Math.random() * 0.18, k: b.k }); }
    const mk = (list) => { const m = new THREE.InstancedMesh(this.geo ||= analystGeometry(), this.mat ||= new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(1, list.length)); m.frustumCulled = false; m.count = list.length; this.group.add(m); return m; };
    const upper = pts.filter((p) => p.k === 4), lower = pts.filter((p) => p.k !== 4);
    const meshes = [[mk(upper), upper], [mk(lower), lower]];
    const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), cz = pts.reduce((s, p) => s + p.z, 0) / (pts.length || 1);
    const tag = makeTag([{ t: '', px: 10 }], { bg: 'rgba(10,12,16,.9)', border: '#9aa3b2', radius: 12, ps: 0.0044 }); tag.position.set(cx, top + 3.6, cz); tag.renderOrder = 998; this.group.add(tag);
    const pod = { key, side, agent, label, ruleBook, meshes, pts, tag, text: '', cx, cz };
    this.pods.push(pod);
    boxes.forEach((b, i) => setPerson({ id: `pod_${key}_${i}`, name: `Analytics Pod · ${label}`, role: 'Look-alike analysts', room: 'VT-02', floor: 'VT-02', agent, pod: true, mirrorName: label, ruleBook, provider: 'rules', x: A.cx + (A.R[b.k] + 4.1) * Math.cos(b.mid), y: E() + A.Y[b.k], z: A.cz + (A.R[b.k] + 4.1) * Math.sin(b.mid) }));
    this.podTag(pod, 'idle', true);
  }
  podTag(pod, mode, force = false) {
    const txt = { idle: 'mirrors: idle', thinking: 'mirrors: THINKING', scouting: 'mirrors: SCOUTING', printing: 'mirrors: PRINTING A TICKET', settled: 'mirrors: RESULT IN' }[mode] || 'mirrors: idle';
    if (!force && pod.text === txt) return; pod.text = txt;
    pod.tag.userData.set([{ t: 'ANALYTICS POD · NOT A SEPARATE AI', px: 22, c: '#c5ccd9', w: 800 }, { t: `mirrors ${pod.label}${pod.ruleBook ? ' · RULE BOOK' : ''}`, px: 26, c: '#e3c27a', w: 700 }, { t: txt.replace('mirrors: ', 'now: '), px: 22, c: '#9aa3b2', w: 600 }]);
    pod.base = pod.tag.scale.clone();
  }
  setMirror(key, mode) { const m = this.mirror[key]; if (m.mode === mode) return; m.prev = m.mode; m.mode = mode; m.at = this.t; }
  updatePods(dt) {
    this.acc += dt; if (this.acc < 1 / 15) return; this.acc = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for (const pod of this.pods) {
      const mir = this.mirror[pod.key];
      let ant = null;
      for (const [mesh, list] of pod.meshes) {
        list.forEach((a, i) => {
          const since = this.t - mir.at - a.delay, mode = since >= 0 ? mir.mode : mir.prev, st = since >= 0 ? since : 99; // the mirror lags the real agent a little, per analyst
          let lean = 0.04 * Math.sin(this.t * 0.7 + a.ph), bob = 0, yaw = a.yaw + 0.08 * Math.sin(this.t * 0.4 + a.ph);
          if (mode === 'thinking') { lean = 0.28 * a.amp; bob = 0.02 * Math.abs(Math.sin(this.t * 9 + a.ph)); }
          else if (mode === 'scouting') { lean = 0.12 * a.amp; bob = 0.05 * Math.abs(Math.sin(this.t * 5 + a.ph)); yaw = a.yaw + 0.5 * Math.sin(this.t * 2.2 + a.ph) * a.amp; } // heads turning across the screens
          else if (mode === 'printing') { bob = Math.max(0, 0.16 * a.amp * Math.sin(st * 9)) * Math.exp(-st * 0.6); lean = 0.1; }
          else if (mode === 'settled') { bob = 0.08 * a.amp * Math.abs(Math.sin(st * 6)) * Math.exp(-st * 0.4); }
          p.set(a.x, a.y + bob, a.z); e.set(lean, yaw, 0, 'YXZ'); q.setFromEuler(e); s.set(1, a.amp > 1 ? 1.04 : 1, 1);
          m4.compose(p, q, s); mesh.setMatrixAt(i, m4); c.setScalar(a.tone); mesh.setColorAt(i, c);
        });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; ant ||= mesh;
      }
      this.podTag(pod, mir.mode);
    }
  }

  // ---------------------------------------------------------------- boards
  scoutView() {
    const ev = [...latest('VT-02', 40, ['scout'])].pop(), d = arenaFeedData(), mq = d?.marquee;
    return { ev, cands: ev?.data?.candidates || [], pickId: ev?.data?.matchId ?? mq?.id, mq, by: ev ? (ev.provider !== 'rules' ? 'llm' : 'rules') : mq?.by, model: ev?.provider !== 'rules' ? ev?.model : mq?.model, points: ev?.data?.points || mq?.points || [], preview: mq?.preview || '' };
  }
  drawScout(g, W, H) {
    const st = status('VT-02'), v = this.scoutView(), prov = { provider: v.by === 'llm' ? providerFromModel(v.model) : 'rules' };
    if (offline() && !v.mq) { drawHeader(g, W, 'FIXTURE SCOUT', 'AI FEED OFFLINE · the building server is not answering', 'NEXT SCOUT', 0, COL.bad, 52); return; }
    drawHeader(g, W, 'FIXTURE SCOUT', `${st.source === 'simulated' || d0()?.simulated ? 'SIMULATED FIXTURES (no data key)' : 'real fixtures · football-data.org'}`, 'NEXT SCOUT', st.nextScoutAt, COL.gold, 52);
    drawChip(g, prov, 30, 130, 22);
    const list = v.cands.length ? v.cands : (d0()?.fixtures || []).slice(0, 12).map((f) => ({ id: f.id, label: `${f.homeTeam.shortName || f.homeTeam.name} v ${f.awayTeam.shortName || f.awayTeam.name}` }));
    const sw = this.sweep, hit = sw.on ? Math.floor(sw.t * 4) % Math.max(1, list.length) : -1;
    list.slice(0, 8).forEach((c, i) => {
      const y = 176 + i * 54, picked = c.id === v.pickId && !sw.on, cur = i === hit;
      rrect(g, 30, y, W - 60, 48, 10, picked ? 'rgba(255,217,106,.22)' : cur ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.05)', picked ? COL.gold : cur ? '#fff' : null, 3);
      font(g, 30, picked ? 900 : 700); g.fillStyle = picked ? '#ffe9a8' : '#e8ecf5'; g.textBaseline = 'top'; g.fillText(c.label || '', 48, y + 8);
      if (picked) { font(g, 22, 900); g.fillStyle = COL.gold; g.textAlign = 'right'; g.fillText('MARQUEE LOCKED', W - 48, y + 12); g.textAlign = 'left'; }
    });
    if (!list.length) { font(g, 30, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText('No upcoming fixtures on file. The countdown above is real.', 40, 200); }
    font(g, 24, 600); g.fillStyle = '#c8d0e0'; g.textBaseline = 'top'; (v.points || []).slice(0, 3).forEach((p, i) => g.fillText(`• ${wrap(g, p, W - 100, 1)[0] || ''}`, 40, 616 + i * 30));
    font(g, 22, 800); g.fillStyle = '#9aa3b2'; g.fillText(sw.on ? 'SCOUTING THE LIST…' : `PICKED BY ${v.by === 'llm' ? `FIXTURE SCOUT · ${String(v.model || '').toUpperCase()}` : 'THE RULE BOOK'}${v.ev ? ` · ${agoShort(v.ev.at)} AGO` : ''}`, 40, H - 38);
  }
  drawDesk(g, W, H) {
    const st = status('VT-02'), d = d0(), evs = latest('VT-02', 60, ['stake', 'settle']);
    drawHeader(g, W, 'SPORTS DESK · BOOK', 'RULE BOOK agent · stakes the marquee, settles on the real result', 'NEXT FIXTURE CYCLE', st.nextCycleAt, COL.gold, 52);
    drawChip(g, { provider: 'rules' }, 30, 130, 22);
    const stakes = new Map();
    for (const e of evs) { if (e.stage === 'stake') stakes.set(e.data.id, { ...e.data, at: e.at, status: 'open' }); else if (e.stage === 'settle') { const s = stakes.get(e.data.id) || { id: e.data.id, label: e.data.label, stake: e.data.stake, price: e.data.price, at: e.at }; stakes.set(e.data.id, { ...s, status: e.outcome, payout: e.data.payout, score: e.data.score }); } }
    let rows = [...stakes.values()].slice(-5).reverse();
    if (!rows.length) rows = (d?.desk?.positions || []).slice(0, 5).map((p) => ({ label: p.label, stake: p.stake, price: p.price, status: p.status === 'gain' ? 'won' : p.status === 'contributed' ? 'lost' : p.status, payout: p.payout, stored: true }));
    rows.forEach((r, i) => {
      const y = 176 + i * 92, col = r.status === 'won' ? COL.good : r.status === 'lost' ? COL.bad : COL.gold;
      rrect(g, 30, y, W - 60, 84, 12, 'rgba(255,255,255,.05)', r.status === 'open' ? COL.gold : null, 3);
      font(g, 28, 800); g.fillStyle = '#f0f3fa'; g.textBaseline = 'top'; wrap(g, r.label || '', W - 400, 1).forEach((l) => g.fillText(l, 48, y + 8));
      font(g, 24, 600); g.fillStyle = '#9aa3b2'; g.fillText(`STAKE ${money(r.stake || 0)} · HOUSE PRICE ${Number(r.price || 0).toFixed(2)}${r.score ? ` · FT ${r.score[0]}-${r.score[1]}` : ''}${r.status === 'won' ? ` · RETURNED ${money(r.payout || 0)}` : ''}`, 48, y + 46);
      font(g, 26, 900); const t = String(r.status || 'open').toUpperCase(), tw = g.measureText(t).width + 30; rrect(g, W - 48 - tw, y + 20, tw, 44, 10, col); g.fillStyle = '#0a0c12'; g.fillText(t, W - 48 - tw + 15, y + 28);
    });
    if (!rows.length) { font(g, 30, 700); g.fillStyle = '#7b8498'; g.textBaseline = 'top'; g.fillText('No stake yet. The desk stakes when a marquee is locked and its budget has arrived.', 40, 200); }
    font(g, 22, 800); g.fillStyle = '#9aa3b2'; g.fillText(`DESK LIQUIDITY ${d?.desk ? money(d.desk.balance) : '—'}${stakes.size ? '' : ''}`, 40, H - 38);
  }

  // ---------------------------------------------------------------- feed
  onFeed(ev, live) {
    this.boards?.forEach((b) => b.touch());
    if (ev.stage === 'sync' || ev.room !== 'VT-02') return;
    if (ev.stage === 'thinking') { if (ev.agent === 'fixture_scout') { this.scout.setThinking(Boolean(ev.data?.on), ev.text); this.setMirror('scout', ev.data?.on ? 'thinking' : 'idle'); } return; }
    if (!live) return;
    const top = E() + A.Y[4], centre = new THREE.Vector3(A.cx, top - 2, A.cz);
    if (ev.stage === 'scout') {
      SCOUT_FX.sweepUntil = Date.now() + 4500; SCOUT_FX.lockedAt = Date.now() + 4500;
      this.sweep = { on: true, t: 0, pick: ev.data?.matchId };
      this.setMirror('scout', 'scouting'); setTimeout(() => this.setMirror('scout', 'idle'), 9000);
      setTimeout(() => { this.fx.stamp('LOCKED', this.scout.up(this.scout.pos, 1.9), { scale: 1, hold: 5 }); this.fx.pulse(this.scout.up(), centre, 0xffd96a, 2.6); if (this.group.visible) playSting('stamp'); refreshArenaFeed(); }, 4500);
      this.scout.say('▶ MARQUEE LOCKED', true);
    } else if (ev.stage === 'stake') {
      this.setMirror('desk', 'printing'); setTimeout(() => this.setMirror('desk', 'idle'), 7000);
      this.fx.stamp('STAKED', this.desk.up(this.desk.pos, 1.9), { scale: 0.8, hold: 5 }); this.fx.pulse(this.desk.up(), this.scout.up(), 0x8fd3ff, 1.4);
      this.desk.say(`▶ TICKET PRINTED · ${ev.text.slice(0, 34)}`, true); if (this.group.visible) playSting('fill'); refreshArenaFeed();
    } else if (ev.stage === 'settle') {
      this.setMirror('desk', 'settled'); setTimeout(() => this.setMirror('desk', 'idle'), 8000);
      this.fx.stamp(ev.outcome === 'won' ? 'WON' : 'LOST', this.desk.up(this.desk.pos, 1.9), { scale: 0.9, hold: 5 }); this.desk.say(`${ev.outcome === 'won' ? '✔ WON' : '✖ LOST'} ${ev.text.slice(0, 30)}`, true);
    }
  }

  update(dt, visibleIds) {
    const vis = visibleIds.includes('VT-02');
    this.group.visible = vis; this.t += dt;
    if (!vis) { this.scout.update(dt, this.t, false); this.desk.update(dt, this.t, false); return; }
    this.ensureBoards();
    if (this.sweep.on) { this.sweep.t += dt; this.boards.forEach((b) => b.touch()); if (this.sweep.t > 4.5) { this.sweep.on = false; this.boards.forEach((b) => b.touch()); } }
    this.updatePods(dt);
    const v = globalThis.__crowdViewer;
    for (const pod of this.pods) if (v && pod.base) { const k = Math.min(2.5, Math.max(0.5, Math.hypot(v.x - pod.cx, v.z - pod.cz) / 14)); pod.tag.scale.set(pod.base.x * k, pod.base.y * k, 1); }
    for (const b of this.boards) b.tick(dt, true);
    this.fx.update(dt);
    this.scout.update(dt, this.t, true); this.desk.update(dt, this.t, true);
  }
}
function d0() { return arenaFeedData(); }
void chip; void thinking; void outcomeColor; void setPersonPos; void countdown;
