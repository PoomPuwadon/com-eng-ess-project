// OT-02 Probability Research Institute: the AI research team made visible (docs/ai-visuals-plan.md §4).
// What a visitor sees on stepping out of the foyer onto the concourse:
//   - two named LIVE agents at command desks flanking the arrival point: the Lottery Quant (Gemini, rule book without
//     a key) on the left and the Head of Thai Markets (Claude) on the right, with the shared tag system;
//   - a RESEARCH PIPELINE board and a DECISION BOARD hanging over them, and seven numbered station pads along the
//     concourse rail that light as the seven real research stages run (real timings, one-line summaries);
//   - a glass HELD CERTIFICATES rack: one ticket slip per certificate the desk holds, gold while pending, green / red
//     once the official result settles it.
// Real runs happen about twice a month, so between them the room REPLAYS the latest stored run on a schedule, labelled
// "REPLAY · run #N · decided X ago". A live run or decision pre-empts the replay and is labelled LIVE. Nothing here is
// invented: every row comes from the stored run (/api/lottery/state) or from agent events on the feed.
import * as THREE from 'three';
import { makeLeadQuant, makeCFO } from '../characters/roster.js';
import { makeTag } from '../characters/kit.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { LOTTO } from '../world/lottoFeed.js';
import { startAiFeed, onAgent, status, latest, offline, countdown, agoShort, providerFromModel, COL, chip, serverNow, outcomeColor } from './feed.js';
import { Board, font, rrect, wrap, drawChip, drawHeader } from './thoughtBoard.js';
import { FlowFx } from './flowFx.js';
import { AgentActor } from './agentActor.js';
import { playSting } from '../world/sfx.js';

export const NAMES = { lottery_quant: 'Dr. Mei-Ling Sutthichai', thai_head: 'Khun Anan Prasertsak' };
const REPLAY_EVERY_MS = 10 * 60_000, LIVE_MS = 120_000;
const DESK = { quant: { x: -58.3, z: -7.6 }, head: { x: -58.3, z: 7.6 }, rack: { x: -59.6, z: 10.6 } };
const BOARD = { x: -62.2, y0: 3.0, w: 8, h: 3.6, zq: -9.8, zh: 9.8 };
const LW = 1680; // boards are drawn on a 1680-wide logical canvas and scaled up to the real one
const PAD_Z = [-18, -12, -6, 0, 6, 12, 18], PAD_X = -60.3;
const STAGE_IDS = ['ingest', 'audit', 'features', 'models', 'ensemble', 'montecarlo', 'picks'];
const SHORT = { ingest: 'INGEST', audit: 'AUDIT', features: 'FEATURES', models: 'BACKTEST', ensemble: 'DMA', montecarlo: 'MONTE CARLO', picks: 'PORTFOLIO' };
const DOT = { idle: '#3a4256', running: '#ffc857', done: '#5dff9a' };

const E = () => FLOOR_BY_ID['OT-02'].elevation;
const money = (m) => `¤${(m / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export class LotteryAi {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.t = 0; this.fx = new FlowFx(this.group, { stamps: 4, pulses: 8 });
    this.boards = null; this.liveAt = 0; this.live = { tickets: [], shortlist: null, quantNote: null, headNote: null, quantModel: null, headModel: null, runId: null };
    this.st = STAGE_IDS.map(() => ({ state: 'idle', ms: 0, name: '', summary: '' })); // station pads / board rows
    this.queue = []; this.qT = 0; // live stage events are shown one station at a time
    this.rp = { on: false, t: 0, last: 0, run: null }; // replay state
    this.reveal = { short: true, tickets: 99 }; // idle = everything shown
    this.version = -1;
    const base = E();
    startAiFeed();
    this.quant = new AgentActor(this.group, { id: 'lottery_quant', name: NAMES.lottery_quant, role: 'Lottery Quant · Principal Researcher', route: 'gemini', idle: 'RANKING THE CANDIDATE NUMBERS', make: makeLeadQuant, floor: 'OT-02', room: 'OT-02', x: DESK.quant.x, z: DESK.quant.z, yaw: -Math.PI / 2, elev: base, pose: 'tablet' });
    this.head = new AgentActor(this.group, { id: 'thai_head', name: NAMES.thai_head, role: 'Head of Thai Markets · Certificate Desk', route: 'claude', idle: 'REVIEWING THE SHORTLIST', make: makeCFO, floor: 'OT-02', room: 'OT-02', x: DESK.head.x, z: DESK.head.z, yaw: -Math.PI / 2, elev: base, pose: 'clipboard' });
    this.buildProps(base);
    onAgent((ev, live) => this.onFeed(ev, live));
  }

  // ---------------------------------------------------------------- static props: desks, rack, station pads
  buildProps(base) {
    const steel = new THREE.MeshBasicMaterial({ color: 0x1b2230 }), glass = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.22, depthWrite: false }), gold = new THREE.MeshBasicMaterial({ color: 0xd8a62a });
    const box = (m, w, h, d, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, base + y, z); this.group.add(me); return me; };
    for (const d of [DESK.quant, DESK.head]) { box(steel, 0.8, 1.0, 1.9, d.x - 1.0, 0.5, d.z); box(gold, 0.84, 0.05, 1.94, d.x - 1.0, 1.02, d.z); box(new THREE.MeshBasicMaterial({ color: 0x46ffb0 }), 0.04, 0.4, 0.8, d.x - 1.42, 1.35, d.z); }
    // held-certificates rack: glass case on a plinth, 16 slots
    this.rackSlots = 16;
    box(steel, 0.5, 0.35, 2.7, DESK.rack.x, 0.18, DESK.rack.z); box(glass, 0.5, 1.2, 2.7, DESK.rack.x, 0.95, DESK.rack.z); box(gold, 0.54, 0.05, 2.74, DESK.rack.x, 1.57, DESK.rack.z);
    this.slips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.46, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.rackSlots);
    this.slips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.slips);
    this.slipState = Array.from({ length: this.rackSlots }, () => null);
    this.rackTag = makeTag([{ t: 'HELD CERTIFICATES', px: 30, c: '#e3c27a', w: 800 }, { t: '—', px: 40 }], { bg: 'rgba(6,8,12,.9)', border: '#e3c27a', radius: 14, ps: 0.0046 });
    this.rackTag.position.set(DESK.rack.x, base + 1.9, DESK.rack.z); this.group.add(this.rackTag);
    // seven numbered station pads along the concourse rail (the pipeline, physically)
    this.pads = PAD_Z.map((z, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x3a4256 })); m.position.set(PAD_X, base + 0.03, z); this.group.add(m);
      const tag = makeTag([{ t: `${i + 1} · ${SHORT[STAGE_IDS[i]]}`, px: 26, w: 800 }, { t: 'idle', px: 22, c: '#9aa3b2', w: 600 }], { bg: 'rgba(6,8,12,.88)', border: '#3a4256', radius: 12, ps: 0.0042 });
      tag.position.set(PAD_X, base + 1.1, z); this.group.add(tag);
      return { m, tag, last: '' };
    });
    // hanging frames for the two boards
    for (const z of [BOARD.zq, BOARD.zh]) {
      box(steel, 0.12, BOARD.h + 0.16, BOARD.w + 0.16, BOARD.x, BOARD.y0 + BOARD.h / 2, z);
      for (const dz of [-BOARD.w / 2 + 0.4, BOARD.w / 2 - 0.4]) box(steel, 0.05, 9.6 - BOARD.y0 - BOARD.h, 0.05, BOARD.x, (9.6 + BOARD.y0 + BOARD.h) / 2, z + dz);
    }
  }

  ensureBoards() {
    if (this.boards) return;
    const base = E();
    const scaled = (fn) => (g, W, H) => { const k = W / LW; g.save(); g.scale(k, k); fn(g, LW, H / k); g.restore(); };
    const pipe = new Board({ w: BOARD.w, h: BOARD.h, px: 256, name: 'ot02-pipeline', draw: scaled((g, W, H) => this.drawPipeline(g, W, H)) });
    const dec = new Board({ w: BOARD.w, h: BOARD.h, px: 256, name: 'ot02-decisions', draw: scaled((g, W, H) => this.drawDecisions(g, W, H)) });
    for (const [b, z] of [[pipe, BOARD.zq], [dec, BOARD.zh]]) { b.mesh.position.set(BOARD.x + 0.09, base + BOARD.y0 + BOARD.h / 2, z); b.mesh.rotation.y = Math.PI / 2; this.group.add(b.mesh); }
    this.boards = [pipe, dec];
  }

  // ---------------------------------------------------------------- data
  run() { return LOTTO.data?.run || null; }
  label() {
    const r = this.run(), live = Date.now() < this.liveAt;
    if (offline() && !r) return { text: 'AI FEED OFFLINE', col: COL.bad };
    if (live) return { text: `LIVE${r ? ` · run #${r.id}` : ''}`, col: COL.good };
    if (!r) return { text: 'NO RUN YET · the Institute runs when a draw is due', col: COL.rules };
    const at = r.decision?.at || r.createdAt, ago = agoShort(at);
    return this.rp.on ? { text: `REPLAY · run #${r.id} · decided ${ago} ago`, col: COL.warn } : { text: `LAST RUN · run #${r.id} · ${r.decision ? 'decided' : 'built'} ${ago} ago`, col: COL.gold };
  }
  tickets() { return this.live.tickets.length ? this.live.tickets : (this.run()?.decision?.tickets || []); }
  /** the stage rows: live station states, or the stored run's stages when idle / replaying */
  rows() {
    const r = this.run();
    return STAGE_IDS.map((id, i) => {
      const s = r?.stages.find((x) => x.id === id), cur = this.st[i];
      return { id, name: SHORT[id], ms: cur.ms || s?.ms || 0, summary: cur.summary || s?.summary || '', state: cur.state };
    });
  }

  // ---------------------------------------------------------------- boards
  drawPipeline(g, W, H) {
    const lb = this.label(), nx = status('OT-02');
    drawHeader(g, W, 'RESEARCH PIPELINE', lb.text, 'NEXT OFFICIAL DRAW', nx.nextAt, lb.col, 56);
    this.rows().forEach((r, i) => {
      const y = 166 + i * 76, a = r.state === 'idle' && !this.rp.on && Date.now() > this.liveAt ? 'done' : r.state; // outside a run every stored stage counts as done
      rrect(g, 24, y, W - 48, 68, 10, a === 'running' ? 'rgba(255,200,87,.14)' : 'rgba(255,255,255,.05)', a === 'running' ? COL.warn : null, 3);
      g.fillStyle = DOT[a]; g.beginPath(); g.arc(62, y + 34, 18, 0, 6.3); g.fill();
      font(g, 26, 900); g.fillStyle = '#0a0c12'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 62, y + 36); g.textAlign = 'left';
      font(g, 32, 900); g.fillStyle = '#f6efe0'; g.textBaseline = 'top'; g.fillText(r.name, 96, y + 6);
      font(g, 20, 700); g.fillStyle = '#9aa3b2'; g.fillText(`${a === 'idle' ? 'waiting' : `${r.ms} ms`} · code · RULE BOOK maths`, 96, y + 42);
      font(g, 22, 600); g.fillStyle = '#d6dcea'; wrap(g, a === 'idle' ? '' : r.summary, W - 520, 2).forEach((l, k) => g.fillText(l, 480, y + 8 + k * 28));
    });
    font(g, 26, 800); g.fillStyle = '#9aa3b2'; g.textBaseline = 'top';
    g.fillText(`NEXT RESEARCH RUN ${countdown(nx.nextCycleAt)} · LATEST RUN REPLAYED EVERY 10 MIN WHEN NOTHING IS LIVE`, 30, H - 38);
  }
  drawDecisions(g, W, H) {
    const lb = this.label(), r = this.run(), d = r?.decision, tk = this.tickets();
    drawHeader(g, W, 'DECISION BOARD', lb.text, 'DRAW', status('OT-02').nextAt, lb.col, 56);
    const qm = this.live.quantModel ?? d?.quantModel, hm = this.live.headModel ?? d?.model;
    const qc = { provider: providerFromModel(qm) }, hc = { provider: providerFromModel(hm) };
    // lottery quant block
    font(g, 30, 900); g.fillStyle = '#e3c27a'; g.textBaseline = 'top'; g.fillText('LOTTERY QUANT', 30, 170); drawChip(g, qc, 330, 166, 24);
    const sl = this.live.shortlist || (r?.picks?.candidates || []).slice(0, 8).map((c) => ({ number: c.number, value: c.modelValue }));
    if (this.reveal.short) sl.slice(0, 8).forEach((c, i) => { font(g, 30, 800); const x = 30 + i * 200; rrect(g, x, 212, 188, 46, 10, 'rgba(255,255,255,.08)'); g.fillStyle = '#f6efe0'; g.fillText(c.number, x + 12, 220); font(g, 20, 700); g.fillStyle = '#9aa3b2'; g.fillText(`¤${c.value}`, x + 130, 226); });
    font(g, 24, 600); g.fillStyle = '#c8d0e0'; wrap(g, this.reveal.short ? (this.live.quantNote || d?.quantNote || 'No model note: the rule book ranks by model-implied value.') : '', W - 60, 2).forEach((l, i) => g.fillText(l, 30, 268 + i * 30));
    // head of thai markets block
    font(g, 30, 900); g.fillStyle = '#e3c27a'; g.fillText('HEAD OF THAI MARKETS', 30, 346); drawChip(g, hc, 470, 342, 24);
    tk.slice(0, 6).forEach((t, i) => {
      const y = 388 + i * 52; if (i >= this.reveal.tickets) return;
      const ok = t.bought !== false, col = ok ? COL.good : COL.warn;
      rrect(g, 30, y, W - 60, 46, 10, 'rgba(255,255,255,.05)');
      font(g, 30, 900); g.fillStyle = '#f6efe0'; g.fillText(t.number, 44, y + 7);
      font(g, 24, 600); g.fillStyle = '#c8d0e0'; wrap(g, t.rationale || '', W - 520, 1).forEach((l) => g.fillText(l, 220, y + 10));
      font(g, 22, 900); const tx = ok ? 'BOUGHT' : 'REJECTED', tw = g.measureText(tx).width + 24; rrect(g, W - 30 - tw - 8, y + 6, tw, 34, 8, col); g.fillStyle = '#0a0c12'; g.fillText(tx, W - 30 - tw + 4, y + 11);
    });
    if (!tk.length) { font(g, 28, 700); g.fillStyle = '#7b8498'; g.fillText(offline() ? 'AI FEED OFFLINE. Nothing is shown rather than something invented.' : 'No certificates decided yet for the next draw.', 30, 400); }
    const bought = tk.filter((t) => t.bought !== false).length, s = r?.settlement;
    font(g, 26, 800); g.fillStyle = '#9aa3b2'; g.fillText(`HELD ${bought} · SPEND ${money(d?.spend || bought * 8000)}${s ? ` · SETTLED: returned ${money(s.agentReturn)} on ${money(s.agentCost)}` : ''}`, 30, H - 44);
    if (d?.rejected?.length) { g.textAlign = 'right'; g.fillStyle = COL.warn; g.fillText(`GATEWAY: ${d.rejected[0].slice(0, 60)}`, W - 30, H - 44); g.textAlign = 'left'; }
  }

  // ---------------------------------------------------------------- feed
  onFeed(ev, live) {
    this.boards?.forEach((b) => b.touch());
    if (ev.stage === 'sync' || ev.room !== 'OT-02') { this.version = -1; return; }
    const A = ev.agent === 'thai_head' ? this.head : this.quant;
    if (ev.stage === 'thinking') { if (ev.agent === 'lottery_quant') this.quant.setThinking(Boolean(ev.data?.on), ev.text); else if (ev.agent === 'thai_head') this.head.setThinking(Boolean(ev.data?.on), ev.text); return; }
    if (!live) return;
    this.liveAt = Date.now() + LIVE_MS; this.rp.on = false;
    const base = E(), world = (x, y, z) => new THREE.Vector3(x, base + y, z);
    if (ev.stage === 'research' && ev.ref?.startsWith('stage:')) { this.queue.push(ev); }
    else if (ev.stage === 'research' && ev.ref?.startsWith('run:')) { this.live = { tickets: [], shortlist: null, quantNote: null, headNote: null, quantModel: null, headModel: null, runId: ev.data?.runId }; this.reveal = { short: false, tickets: 0 }; }
    else if (ev.stage === 'shortlist' && !ev.data?.blind) {
      this.live.shortlist = ev.data?.shortlist || null; this.live.quantNote = ev.text; this.live.quantModel = ev.model === 'rules' ? null : ev.model; this.reveal.short = true;
      this.fx.pulse(this.quant.up(), this.head.up(), 0x5aa2ff, 1.4); this.quant.say(`▶ SHORTLIST SENT (${ev.data?.shortlist?.length || 0})`, true);
    } else if (ev.stage === 'decision' && ev.data?.number) {
      this.live.tickets.push({ number: ev.data.number, rationale: ev.data.rationale, bought: ev.outcome === 'bought' }); this.live.headModel = ev.model === 'rules' ? null : ev.model;
      this.reveal.tickets = this.live.tickets.length;
      const bought = ev.outcome === 'bought';
      this.fx.stamp(bought ? 'BOUGHT' : 'REJECTED', this.head.up(this.head.pos, 1.8), { scale: 0.7, hold: 3 });
      this.fx.pulse(this.head.up(), world(DESK.rack.x, 1.1, DESK.rack.z), bought ? 0x5dff9a : 0xffc857, 1.3); this.head.say(`${bought ? '✔ BOUGHT' : '✖ REJECTED'} ${ev.data.number}`, true);
      if (this.group.visible) playSting(bought ? 'fill' : 'stamp');
    } else if (ev.stage === 'decision') { this.live.headNote = ev.text; }
    else if (ev.stage === 'settle') { this.fx.stamp(ev.outcome === 'won' ? 'WON' : 'LOST', this.head.up(this.head.pos, 1.8), { scale: 0.9, hold: 5 }); this.head.say(`${ev.outcome === 'won' ? '✔' : '✖'} ${ev.text}`.slice(0, 40), true); }
    void A;
  }

  startReplay() {
    const r = this.run(); if (!r) return;
    this.rp = { on: true, t: 0, last: Date.now(), run: r.id };
    this.st.forEach((s) => { s.state = 'idle'; s.ms = 0; s.summary = ''; });
    this.reveal = { short: false, tickets: 0 }; this.live = { tickets: [], shortlist: null, quantNote: null, headNote: null, quantModel: null, headModel: null, runId: null };
    this.boards?.forEach((b) => b.touch());
  }
  stepReplay(dt) {
    const r = this.run(); if (!this.rp.on || !r) return;
    this.rp.t += dt; const t = this.rp.t, n = r.decision?.tickets?.length || 0, base = E();
    r.stages.forEach((s, i) => {
      const i0 = STAGE_IDS.indexOf(s.id); if (i0 < 0) return;
      const on = 0.6 + i * 1.5, done = on + 1.2, cur = this.st[i0], want = t >= done ? 'done' : t >= on ? 'running' : 'idle';
      if (cur.state !== want) { cur.state = want; cur.ms = s.ms; cur.summary = want === 'idle' ? '' : s.summary; this.boards?.forEach((b) => b.touch()); if (want === 'running') this.quant.say(`▶ ${SHORT[s.id]}`, true); }
    });
    if (t > 11.4 && !this.reveal.short) { this.reveal.short = true; this.fx.pulse(this.quant.up(), this.head.up(), 0x5aa2ff, 1.4); this.quant.say('▶ SHORTLIST SENT', true); this.boards?.forEach((b) => b.touch()); }
    const k = Math.min(n, Math.max(0, Math.floor((t - 13) / 0.9) + 1));
    if (k > this.reveal.tickets) {
      this.reveal.tickets = k; const tk = r.decision.tickets[k - 1], bought = tk.bought !== false;
      this.fx.stamp(bought ? 'BOUGHT' : 'REJECTED', this.head.up(this.head.pos, 1.8), { scale: 0.7, hold: 2.5 });
      this.fx.pulse(this.head.up(), new THREE.Vector3(DESK.rack.x, base + 1.1, DESK.rack.z), bought ? 0x5dff9a : 0xffc857, 1.1); this.head.say(`${bought ? '✔ BOUGHT' : '✖ REJECTED'} ${tk.number}`, true);
      if (this.group.visible) playSting(bought ? 'fill' : 'stamp'); this.boards?.forEach((b) => b.touch());
    }
    if (t > 13 + n * 0.9 + 4) { this.rp.on = false; this.reveal = { short: true, tickets: 99 }; this.st.forEach((s) => { s.state = 'idle'; }); this.quant.say(this.quant.def.idle, true); this.head.say(this.head.def.idle, true); this.boards?.forEach((b) => b.touch()); }
  }

  // ---------------------------------------------------------------- rack + pads
  syncRack() {
    const tk = this.tickets().filter((t) => t.bought !== false), shown = Math.min(this.reveal.tickets, tk.length), s = this.run()?.settlement;
    const m = new THREE.Matrix4(), col = new THREE.Color(), base = E();
    for (let i = 0; i < this.rackSlots; i++) {
      const t = tk[i], on = t && i < shown;
      m.compose(new THREE.Vector3(DESK.rack.x, base + 0.72 + (i % 2) * 0.48, DESK.rack.z - 1.2 + Math.floor(i / 2) * 0.34), new THREE.Quaternion(), on ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(0.001, 0.001, 0.001));
      this.slips.setMatrixAt(i, m);
      const res = s?.agentTickets?.find((x) => x.number === t?.number);
      col.set(!on ? 0x000000 : res ? (res.payout > 0 ? 0x5dff9a : 0xff5a5a) : 0xe8c15a); this.slips.setColorAt(i, col);
    }
    this.slips.instanceMatrix.needsUpdate = true; if (this.slips.instanceColor) this.slips.instanceColor.needsUpdate = true;
    const txt = `${Math.min(shown, tk.length)}${s ? ` · SETTLED` : ''}`;
    if (this.rackTxt !== txt) { this.rackTxt = txt; this.rackTag.userData.set([{ t: 'HELD CERTIFICATES', px: 30, c: '#e3c27a', w: 800 }, { t: txt, px: 44 }]); }
  }
  syncPads() {
    const r = this.run(), idleDone = !this.rp.on && Date.now() > this.liveAt;
    this.pads.forEach((p, i) => {
      const s = this.st[i], st = idleDone ? (r ? 'done' : 'idle') : s.state, ms = s.ms || r?.stages.find((x) => x.id === STAGE_IDS[i])?.ms || 0;
      const key = `${st}:${ms}`; if (key === p.last) return; p.last = key;
      p.m.material.color.set(DOT[st]);
      p.tag.userData.set([{ t: `${i + 1} · ${SHORT[STAGE_IDS[i]]}`, px: 26, w: 800, c: '#f6efe0' }, { t: st === 'idle' ? 'waiting' : `${ms} ms`, px: 22, c: DOT[st], w: 700 }]);
    });
  }

  update(dt, visibleIds) {
    const vis = visibleIds.includes('OT-02');
    this.group.visible = vis; this.t += dt;
    if (!vis) { this.quant.update(dt, this.t, false); this.head.update(dt, this.t, false); return; }
    this.ensureBoards();
    // live stage events: one station at a time (the real stage timings are shown on the pads and rows)
    if (this.queue.length && (this.qT -= dt) <= 0) {
      const ev = this.queue.shift(), i = STAGE_IDS.indexOf(ev.data?.stage); this.qT = 0.9;
      if (i >= 0) { for (let k = 0; k < i; k++) if (this.st[k].state !== 'done') this.st[k].state = 'done'; Object.assign(this.st[i], { state: 'done', ms: ev.data.ms, summary: ev.text.replace(/^[^:]*:\s*/, '') }); if (this.st[i + 1]) this.st[i + 1].state = 'running'; this.quant.say(`▶ ${SHORT[ev.data.stage]} · ${ev.data.ms} ms`, true); }
    }
    // replay: when nothing is live, replay the latest stored run on a schedule (first time shortly after arrival)
    if (!this.rp.on && Date.now() > this.liveAt && this.run() && !this.queue.length && Date.now() - this.rp.last > REPLAY_EVERY_MS) this.startReplay();
    if (LOTTO.version !== this.version) { this.version = LOTTO.version; this.boards.forEach((b) => b.touch()); if (!this.rp.last) this.rp.last = 0; }
    this.stepReplay(dt);
    this.syncRack(); this.syncPads();
    for (const b of this.boards) b.tick(dt, true);
    this.fx.update(dt);
    this.quant.update(dt, this.t, true); this.head.update(dt, this.t, true);
  }
}
void chip; void serverNow; void outcomeColor; void latest;
