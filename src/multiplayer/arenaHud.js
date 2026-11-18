// Client side of the live arena sessions:
//  · VT-03 bouts: "walk into the ring" objective, punches (left click / on-screen button on mobile),
//    own health bar, boxer highlights (remotes.js), CEO highlights hidden during the round.
//  · VT-04 races: riders are locked to a horse on the real track; taps/clicks per second drive it
//    (server-measured); speed lines, dust-to-fire trail, pulsing meter, camera FOV + shake scale with the rate.
//  · Spectators: a positions panel with live pricing on every competitor.
import * as THREE from 'three';
import { Horse, throwPunch, takeHit } from '../characters/kit.js';
import { makeBoxer } from '../characters/roster.js';
import { RingGuide, RING_AT } from './ringGuide.js';
import { setBalance, fmt, esc, onMe } from '../net/api.js';
import { BoutSpotlights } from './spotlights.js';
import { setLiveRace, recordRaceResult } from '../world/raceScreens.js';
import { racePrices } from '../../server/realtime/pricing.js'; // same maths as the server book

// VT-04 dirt oval (floors/equineCentre.js TRK): straights X 128..170, bends radius 30 about (128|170, 0)
const TRK = { x0: 128, x1: 170, rc: 30 }; TRK.len = 2 * (TRK.x1 - TRK.x0) + 2 * Math.PI * TRK.rc;
const EQ_Y = 92;
export function trackPos(s, lane = 0) {
  const R = TRK.rc + lane, S = TRK.x1 - TRK.x0, arc = Math.PI * TRK.rc;
  s = ((s % TRK.len) + TRK.len) % TRK.len;
  if (s < S) return [TRK.x0 + s, -R, Math.PI / 2];
  s -= S;
  if (s < arc) { const t = -Math.PI / 2 + s / TRK.rc; return [TRK.x1 + R * Math.cos(t), R * Math.sin(t), Math.atan2(-Math.sin(t), Math.cos(t))]; }
  s -= arc;
  if (s < S) return [TRK.x1 - s, R, -Math.PI / 2];
  s -= S;
  const t = Math.PI / 2 + s / TRK.rc;
  return [TRK.x0 + R * Math.cos(t), R * Math.sin(t), Math.atan2(-Math.sin(t), Math.cos(t))];
}
const laneOf = (i) => -3 + i * 1.3;
const COLOURS = [0xc0392b, 0x1d4ed8, 0xf59e0b, 0x16a34a, 0x7c3aed, 0xe5e7eb];

const el = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; document.body.append(d); return d; };

export class ArenaHud {
  /** ctx: { rt, scene, camera, player, remotes, hud, isMobile } */
  constructor(ctx) {
    this.ctx = ctx; this.box = null; this.race = null; this.horses = new Map(); this.raceD = new Map();
    this.tapBuf = 0; this.tapAcc = 0; this.localTaps = []; this.shake = 0; this.stake = 10_000;
    this.obj = el('mp-objective');
    this.selfHp = el('mp-selfhp', '', '<div class="nm">YOUR CONDITION</div><div class="hp"><i style="width:100%"></i></div>');
    this.punchBtn = document.createElement('button'); this.punchBtn.id = 'mp-punch'; this.punchBtn.className = 'mp-actbtn'; this.punchBtn.textContent = 'PUNCH'; document.body.append(this.punchBtn);
    this.tapBtn = document.createElement('button'); this.tapBtn.id = 'mp-tap'; this.tapBtn.className = 'mp-actbtn'; this.tapBtn.innerHTML = 'TAP!<br><small>faster = faster</small>'; document.body.append(this.tapBtn);
    this.raceHud = el('mp-race', '', '<div class="clickme"><svg viewBox="0 0 40 56" width="54" height="76"><rect x="2" y="2" width="36" height="52" rx="18" fill="#111" stroke="#fff" stroke-width="3"/><path d="M20 2 V22 H2 V20 A18 18 0 0 1 20 2 Z" class="lb" fill="#12ff6a"/><line x1="20" y1="2" x2="20" y2="22" stroke="#fff" stroke-width="2.5"/><line x1="2" y1="22" x2="38" y2="22" stroke="#fff" stroke-width="2.5"/></svg><span class="word">CLICK!</span></div><div class="combo">0.0 taps/s</div><div class="meter"><i></i></div><div class="msg">Tap / click as fast as you can: faster clicking = a faster horse</div>');
    this.lines = el('mp-speedlines');
    this.book = el('mp-book');
    this.spots = new BoutSpotlights(ctx.scene);
    this.guide = new RingGuide(ctx.scene);
    const { rt, player } = ctx;
    const punch = () => this.punch();
    this.punchBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); punch(); });
    this.tapBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tap(); });
    // Left clicks count even while the right button is held (camera orbit): a second button pressed
    // during a drag sends no new pointerdown, but every press sends a mousedown. Touch/pen use pointerdown.
    const act = () => { if (this.amBoxer()) punch(); else if (this.amRacer()) this.tap(); };
    ctx.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) act(); });
    ctx.canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && e.button === 0) act(); });
    addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && this.amRacer() && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); this.tap(); } });
    this.book.addEventListener('click', (e) => this.bookClick(e));
    this.book.addEventListener('keydown', (e) => e.stopPropagation());
    onMe((me) => { this.balance = me.balance; if (this.book.classList.contains('on')) this.paintBookValues(); }); // the slider tops out at your balance
    rt.on('meta', (m) => this.onMeta(m));
    rt.on('snap', (s) => { if (s.race) for (const [conn, d, tps, v] of s.race) this.raceD.set(conn, { d, tps, v, at: performance.now() }); });
    // every punch thrown in the ring (hit or miss) animates the thrower for everyone; a hit snaps the target back
    rt.on('swing', (m) => { if (m.by !== rt.id) throwPunch(ctx.remotes.get(m.by)?.av); });
    rt.on('hit', (m) => {
      if (m.to === rt.id) { this.shake = 0.5; ctx.hud.toast(`Hit! −${m.dmg} · condition ${m.hp}`, 1.2); takeHit(player.avatar); }
      else takeHit(ctx.remotes.get(m.to)?.av);
      if (this.box) { const b = this.box.boxers.find((x) => x.conn === m.to); if (b) b.hp = m.hp; ctx.remotes.setBoxers(this.box.boxers, rt.id); }
    });
    rt.on('balance', (m) => setBalance(m.balance));
    rt.on('race_go', () => { this.raceD.clear(); });
    void player;
  }
  amBoxer() { return Boolean(this.box && this.box.phase === 'active' && this.box.boxers.some((b) => b.conn === this.ctx.rt.id && b.hp > 0)); }
  amRacer() { return Boolean(this.race && (this.race.phase === 'running' || this.race.phase === 'countdown') && this.race.racers.some((r) => r.conn === this.ctx.rt.id)); }
  get boxingLive() { return Boolean(this.box && this.box.phase === 'active'); }

  onMeta(m) {
    const { rt, remotes, player } = this.ctx;
    const wasRacer = this.amRacer();
    this.box = m.boxing && m.boxing.phase === 'active' ? m.boxing : null;
    remotes.setBoxers(this.box ? this.box.boxers : [], rt.id);
    remotes.hideCeo = Boolean(this.box); // CEO highlights hide during a round
    remotes.baskets = m.baskets || {};
    const prevRace = this.race;
    this.race = m.race && (m.race.phase === 'running' || m.race.phase === 'countdown') ? m.race : null;
    if (wasRacer && !this.amRacer()) { // the race is over: step off the horse where it stopped
      player.ride = null; player.enabled = true;
      const p = player.pos; this.ctx.placeAt('VT-04', p.x, EQ_Y, p.z + 2, player.yaw);
    }
    if (prevRace && !this.race) this.clearHorses();
    if (m.race && m.race.phase === 'ended' && prevRace) { // record the real result on the VT-04 screens
      const res = m.race.result || {}, wi = prevRace.racers.findIndex((r) => r.name === res.winner);
      recordRaceResult(res.void ? null : res.winner, wi >= 0 ? prevRace.prices?.[wi] : null);
    }
    if (m.race && m.race.phase === 'ended' && prevRace) this.ctx.hud.toast(m.race.result?.void ? 'Equine session cancelled: positions returned.' : `${m.race.result?.winner} takes the line!`, 3);
    this.paintBook();
  }

  punch() {
    if (!this.amBoxer()) return;
    const { rt, player } = this.ctx;
    rt.ask('punch', { yaw: player.yaw }).then((r) => { if (r?.miss && r.reason) this.ctx.hud.toast(r.reason, 1.2); }).catch(() => {});
    throwPunch(player.avatar); // at once, before the server answers (the server broadcasts it to everyone else)
  }
  tap() {
    if (!this.race || this.race.phase !== 'running') return;
    this.tapBuf++; this.localTaps.push(performance.now());
    const c = this.raceHud.querySelector('.clickme'); c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); // the icon pops on every click
  }

  // ---------------------------------------------------------------- positions panel (spectators)
  // ---- positions panel (spectators): one amount slider + one tap per competitor (user, 2026-11-18)
  // Built once per session line-up; prices, conditions and "win ¤X" update in place so the slider is
  // never reset mid-drag. Limits match the server book: ¤1 .. ¤10,000, never more than your balance.
  paintBook() {
    const { rt } = this.ctx;
    const g = this.box || (this.race && this.race.open ? this.race : null);
    const mine = g && ((g.boxers || g.racers).some((x) => x.conn === rt.id));
    if (!g || mine) { this.book.classList.remove('on'); this.bookSig = null; return; }
    const list = g.boxers || g.racers, kind = g.boxers ? 'box' : 'race';
    const sig = `${kind}:${list.map((x) => x.conn).join(',')}`;
    if (sig !== this.bookSig) {
      this.bookSig = sig;
      this.book.innerHTML = `<h5>${g.boxers ? 'Back a competitor' : 'Back a rider'} <span class="live">LIVE</span></h5>
        <div class="amt"><span class="lbl">Amount</span><b class="val"></b></div>
        <input type="range" class="slider" data-amt min="1" step="1">
        <div class="quick">${[['10%', 0.1], ['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([l, f]) => `<button class="mp-btn sm" data-q="${f}">${l}</button>`).join('')}</div>
        <div class="picks">${list.map((x, i) => `<button class="pick" data-k="${kind}" data-c="${x.conn}" data-i="${i}"><span class="nm">${esc(x.name)}</span><span class="st"></span><span class="pr"></span><span class="win"></span></button>`).join('')}</div>
        <div class="fine">Tap a name to open a position at the price shown. ${g.boxers ? 'Lower condition pays more on a comeback.' : 'Riders behind pay more if they come through.'} Notional money only.</div>`;
      this.book.querySelector('[data-amt]').addEventListener('input', (e) => { this.stake = Number(e.target.value) * 100; this.paintBookValues(); });
    }
    this.bookG = g;
    this.paintBookValues();
    this.book.classList.add('on');
  }
  paintBookValues() {
    const g = this.bookG; if (!g) return;
    const list = g.boxers || g.racers;
    const maxU = Math.max(1, Math.min(10_000, Math.floor((this.balance ?? 1_000_000) / 100)));
    const slider = this.book.querySelector('[data-amt]');
    if (slider && Number(slider.max) !== maxU) slider.max = maxU;
    const amtU = Math.max(1, Math.min(maxU, Math.round(this.stake / 100)));
    if (slider && document.activeElement !== slider) slider.value = amtU;
    this.book.querySelector('.val').textContent = `¤${amtU.toLocaleString('en-US')}`;
    this.book.querySelectorAll('.pick').forEach((b) => {
      const i = Number(b.dataset.i), x = list[i], pr = g.prices[i];
      b.disabled = !pr;
      b.querySelector('.st').textContent = g.boxers ? `${x.hp} HP` : `${Math.round(x.d)} m`;
      b.querySelector('.pr').textContent = pr ? `${pr.toFixed(2)}x` : 'out';
      b.querySelector('.win').textContent = pr ? `win ¤${Math.floor(amtU * pr).toLocaleString('en-US')}` : '';
    });
  }
  async bookClick(e) {
    const q = e.target.closest('[data-q]');
    if (q) { const maxU = Math.max(1, Math.min(10_000, Math.floor((this.balance ?? 0) / 100))); this.stake = Math.max(1, Math.floor(maxU * Number(q.dataset.q))) * 100; this.paintBookValues(); return; }
    const b = e.target.closest('button[data-k]');
    if (!b || b.disabled) return;
    const amtU = Math.max(1, Number(this.book.querySelector('[data-amt]')?.value) || 1);
    b.disabled = true;
    try {
      const out = await this.ctx.rt.ask(b.dataset.k === 'box' ? 'boxStake' : 'raceStake', { [b.dataset.k === 'box' ? 'boxer' : 'racer']: b.dataset.c, amount: amtU * 100 });
      this.ctx.hud.toast(`Position opened: ${fmt(out.stake)} on ${out.label} at ${out.price.toFixed(2)}x`, 2.5);
      b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900);
    } catch (err) { this.ctx.hud.toast(err.message, 2.5); }
    b.disabled = false; this.paintBookValues();
  }

  // ---------------------------------------------------------------- horses
  horseFor(conn, i) {
    let h = this.horses.get(conn);
    if (!h) {
      h = new Horse({ cloth: COLOURS[i % COLOURS.length], number: i + 1 });
      h.root.traverse((o) => { o.castShadow = false; });
      this.ctx.scene.add(h.root); this.horses.set(conn, h);
      h.trail = this.makeTrail(); this.ctx.scene.add(h.trail.points);
      h.dd = 0;
    }
    return h;
  }
  clearHorses() { for (const h of this.horses.values()) { this.ctx.scene.remove(h.root); this.ctx.scene.remove(h.trail.points); } this.horses.clear(); this.raceD.clear(); }
  makeTrail() {
    const N = 90, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!ArenaHud.puff) { // soft round puff, shared by every trail
      const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d');
      const gr = q.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      q.fillStyle = gr; q.fillRect(0, 0, 64, 64); ArenaHud.puff = new THREE.CanvasTexture(c);
    }
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.6, map: ArenaHud.puff, alphaTest: 0.01, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    points.frustumCulled = false;
    return { points, life: new Float32Array(N), vel: new Float32Array(N * 3), next: 0, N };
  }
  stepTrail(tr, origin, heat, dt) {
    const pos = tr.points.geometry.attributes.position, col = tr.points.geometry.attributes.color;
    const spawn = Math.floor(heat * 40 * dt + Math.random());
    for (let k = 0; k < spawn; k++) {
      const i = tr.next++ % tr.N;
      tr.life[i] = 0.6 + Math.random() * 0.4;
      pos.setXYZ(i, origin.x + (Math.random() - 0.5) * 0.6, origin.y + 0.15, origin.z + (Math.random() - 0.5) * 0.6);
      tr.vel[i * 3] = (Math.random() - 0.5) * 1.5; tr.vel[i * 3 + 1] = 0.6 + Math.random() * (1 + heat * 2); tr.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    const fire = Math.min(1, Math.max(0, (heat - 0.45) / 0.45));
    for (let i = 0; i < tr.N; i++) {
      if (tr.life[i] <= 0) { col.setXYZ(i, 0, 0, 0); continue; }
      tr.life[i] -= dt;
      pos.setXYZ(i, pos.getX(i) + tr.vel[i * 3] * dt, pos.getY(i) + tr.vel[i * 3 + 1] * dt, pos.getZ(i) + tr.vel[i * 3 + 2] * dt);
      const l = Math.max(0, tr.life[i]);
      col.setXYZ(i, (0.55 + 0.45 * fire) * l, (0.42 - 0.12 * fire) * l, (0.3 - 0.28 * fire) * l); // dust brown -> fire orange
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  /** fighter kit for the round only (user, 2026-11-18): shorts, gloves, mongkol; back to your own look after */
  dressBoxer(boxer) {
    const { player, scene, rt } = this.ctx;
    const a = player.avatar;
    if (boxer && !a?.fighter) {
      const i = this.box.boxers.findIndex((b) => b.conn === rt.id);
      player.setAvatar(scene, makeBoxer(i % 2 ? 'blue' : 'red', boxer.name));
    } else if (!boxer && a?.fighter) this.ctx.restoreAvatar();
    const f = player.avatar;
    if (!boxer || !f?.fighter) return;
    f.ko = boxer.hp <= 0; f.walkIn = !boxer.inRing;
    if (boxer.inRing && player.enabled) { // in the ring you face where you aim (the server checks the camera yaw)
      player.bodyYaw = player.yaw + Math.PI; f.root.rotation.y = player.bodyYaw;
    }
  }

  /** per frame, after the world tick: horses, riding, effects. Returns overrides for remote racers. */
  update(dt) {
    const { rt, player, camera } = this.ctx;
    // flush batched taps (<= 4 per message, 10 Hz)
    this.tapAcc += dt;
    if (this.tapAcc >= 0.1) { this.tapAcc = 0; while (this.tapBuf > 0) { const n = Math.min(4, this.tapBuf); this.tapBuf -= n; rt.send('tap', { n }); } }
    const now = performance.now();
    this.localTaps = this.localTaps.filter((t) => now - t < 1000);
    const overrides = new Map();
    // the VT-04 screens show only this live player race (no placeholder field)
    setLiveRace(this.race ? {
      phase: this.race.phase, goIn: Math.max(0, Math.ceil(((this.race.goAt || 0) - Date.now()) / 1000)),
      racers: this.race.racers.map((r, i) => ({ name: r.name, d: this.horses.get(r.conn)?.dd ?? r.d ?? 0, price: this.race.prices?.[i] })),
    } : null);
    // ---- race
    let myTps = 0;
    if (this.race) { // odds follow the live gaps (snapshots ~9 Hz), not only the occasional meta update
      for (const r of this.race.racers) { const srv = this.raceD.get(r.conn); if (srv) r.d = srv.d; }
      this.race.prices = racePrices(this.race.racers.map((r) => r.d));
    }
    if (this.race) {
      this.race.racers.forEach((r, i) => {
        const h = this.horseFor(r.conn, i), srv = this.raceD.get(r.conn) || { d: r.d, tps: r.tps, v: r.v, at: now };
        // dead-reckon between snapshots, never past the server by more than a stride
        const target = Math.min(TRK.len, srv.d + srv.v * Math.min(0.25, (now - srv.at) / 1000));
        h.dd += (target - h.dd) * Math.min(1, dt * 8);
        const [x, z, yaw] = trackPos(h.dd, laneOf(i));
        h.root.position.set(x, EQ_Y, z); h.root.rotation.y = yaw;
        h.update(dt, now / 1000, srv.v * 0.6);
        const saddle = new THREE.Vector3(x, EQ_Y + h.saddleY - 0.95, z);
        const back = new THREE.Vector3(x - Math.sin(yaw) * 0.8, EQ_Y, z - Math.cos(yaw) * 0.8);
        this.stepTrail(h.trail, back, Math.min(1, (srv.tps || 0) / 12), dt);
        if (r.conn === rt.id) {
          myTps = Math.max(srv.tps || 0, this.localTaps.length);
          player.ride = () => saddle; player.rideYaw = yaw;
        } else overrides.set(r.conn, { pos: saddle, yaw });
      });
    }
    // ---- HUD for the rider
    const riding = this.amRacer();
    this.tapBtn.classList.toggle('on', riding && this.ctx.isMobile());
    this.raceHud.classList.toggle('on', riding);
    if (riding) {
      const heat = Math.min(1, myTps / 12);
      const cd = this.race.phase === 'countdown' ? Math.max(0, Math.ceil((this.race.goAt - Date.now()) / 1000)) : 0;
      this.raceHud.querySelector('.combo').textContent = cd ? `GATE OPENS IN ${cd}` : `${myTps.toFixed(1)} taps/s${heat > 0.75 ? ' 🔥' : ''}`;
      this.raceHud.querySelector('.meter i').style.width = `${(heat * 100).toFixed(0)}%`;
      this.raceHud.classList.toggle('hot', heat > 0.6);
      this.raceHud.querySelector('.word').textContent = this.ctx.isMobile() ? 'TAP!' : 'CLICK!';
      this.raceHud.querySelector('.msg').textContent = this.ctx.isMobile() ? 'Tap the button as fast as you can: faster tapping = a faster horse' : 'Click (or Space) as fast as you can: faster clicking = a faster horse';
      this.lines.style.opacity = (heat * 0.9).toFixed(2);
      camera.fov += ((70 + heat * 22) - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
      this.shake = Math.max(this.shake, heat * 0.12);
      this.obj.classList.add('on'); this.obj.textContent = cd ? 'Get ready: tap to gallop' : 'RIDE! Faster clicking = faster horse';
    } else {
      this.lines.style.opacity = '0';
      if (Math.abs(camera.fov - 70) > 0.05) { camera.fov += (70 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    }
    // ---- boxing (every CEO highlight hides during a round, your own CEO plate included)
    if (player.avatar?.tag) player.avatar.tag.visible = !this.boxingLive;
    // a spotlight on every boxer, following them (yourself included)
    const spotTargets = (this.box ? this.box.boxers : []).map((b) => (b.conn === rt.id ? player.pos : this.ctx.remotes.get(b.conn)?.pos)).filter(Boolean);
    this.spots.update(dt, player.floor?.id === 'VT-03', spotTargets);
    const boxer = this.box && this.box.boxers.find((b) => b.conn === rt.id);
    this.dressBoxer(boxer);
    const walkIn = Boolean(boxer && boxer.hp > 0 && !boxer.inRing && player.floor?.id === 'VT-03');
    this.guide.update(dt, walkIn, player.pos);
    this.selfHp.classList.toggle('on', Boolean(boxer));
    this.punchBtn.classList.toggle('on', Boolean(boxer && boxer.hp > 0 && this.ctx.isMobile()));
    if (boxer) {
      this.selfHp.querySelector('.hp i').style.width = `${boxer.hp}%`;
      this.obj.classList.add('on');
      this.obj.textContent = boxer.hp <= 0 ? 'You are down. The session continues without you.' : boxer.inRing ? (this.ctx.isMobile() ? 'FIGHT! Tap PUNCH' : 'FIGHT! Left-click to punch · aim with the camera')
        : `Objective: walk into the ring · ${Math.max(0, Math.round(RingGuide.dist(player.pos) - RING_AT.half))} m · follow the yellow arrow`;
    } else if (!riding) this.obj.classList.remove('on');
    // ---- camera shake (hits, galloping)
    if (this.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.shake; camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.exp(-dt * 6);
    }
    this.bookAcc = (this.bookAcc || 0) + dt;
    if ((this.race || this.box) && this.bookAcc > 0.5) { this.bookAcc = 0; this.paintBook(); } // live prices ~2 Hz (updated in place: the slider keeps its value)
    return overrides;
  }
}
