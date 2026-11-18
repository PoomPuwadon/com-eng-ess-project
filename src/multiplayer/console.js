// Sign-in modal (Name + Password) and the secret executive console (Alt+F2): unlock as CEO or Admin
// with the console password, then Overview · Guests (kick) · Tour · Combat (VT-03) · Equine (VT-04) ·
// Arena Media (VT-02: head-to-head results and highlight videos on the Sports Analytics Arena's side screens).
import './console.css';
import { signIn, savedAccount, esc, fmt, api, getToken } from '../net/api.js';
import { arenaMediaState, onArenaMedia, refreshArenaMedia } from '../world/arenaMedia.js';
import { FLOOR_BY_ID, findRoom } from '../layout/building.js';

const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const roomName = (id) => (id && findRoom(id)?.room?.short) || '—';
const fmtAmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROLE_LABEL ={ player: 'Guest', admin: 'Staff (Admin)', ceo: 'Chief Executive' };

// ---------------------------------------------------------------- sign in / sign up
// Two tabs: Sign in (existing account) and Sign up (new account: name, password, confirm).
// New accounts are Visitors with the notional starting allocation (server: POST /api/auth/register).
export function showSignIn({ onDone, mode: startMode } = {}) {
  const prev = savedAccount() || '';
  let mode = startMode || (prev ? 'login' : 'register');
  const m = h(`<div class="mp-modal"><form class="card" autocomplete="on" novalidate>
    <h2>Welcome to FINANCIAL FIRM</h2>
    <div class="seg mp-tabs" role="tablist">
      <button type="button" class="mp-btn" role="tab" data-mode="login">Sign in</button>
      <button type="button" class="mp-btn" role="tab" data-mode="register">Sign up</button>
    </div>
    <div class="sub"></div>
    <label for="mp-n">Name</label><input id="mp-n" type="text" name="username" autocomplete="username" maxlength="24" value="${esc(prev)}" />
    <label for="mp-p">Password</label><input id="mp-p" type="password" name="password" maxlength="128" />
    <div class="mp-confirm"><label for="mp-p2">Confirm password</label><input id="mp-p2" type="password" name="password-confirm" autocomplete="new-password" maxlength="128" /></div>
    <div class="err" role="alert"></div>
    <div class="row"><button type="button" class="mp-btn" data-guest>Continue as guest</button><button type="submit" class="mp-btn primary"></button></div>
    <div class="fine">All balances are notional. No real currency is accepted, held or paid out.</div>
  </form></div>`);
  document.body.append(m);
  const n = m.querySelector('#mp-n'), p = m.querySelector('#mp-p'), p2 = m.querySelector('#mp-p2'), e = m.querySelector('.err');
  const sub = m.querySelector('.sub'), confirm = m.querySelector('.mp-confirm'), submit = m.querySelector('.primary');
  const setMode = (md) => {
    mode = md; e.textContent = '';
    for (const b of m.querySelectorAll('[data-mode]')) { const on = b.dataset.mode === md; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
    const up = md === 'register';
    // the remembered name belongs to Sign in; a new account starts blank
    if (up && n.value === prev) n.value = '';
    if (!up && !n.value) n.value = prev;
    sub.textContent = up
      ? 'Open a Visitor account: pick a name (2–24 letters or numbers) and a password (at least 4 characters). You receive a notional starting allocation.'
      : 'Welcome back. Sign in with your name and password.';
    confirm.style.display = up ? 'block' : 'none';
    p.autocomplete = up ? 'new-password' : 'current-password';
    submit.textContent = up ? 'Open my account' : 'Enter the building';
    (n.value ? p : n).focus();
  };
  for (const b of m.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
  setMode(mode);
  const close = (out) => { m.remove(); onDone?.(out); };
  m.querySelector('[data-guest]').onclick = () => close(null);
  m.querySelector('form').onsubmit = async (ev) => {
    ev.preventDefault(); e.textContent = '';
    if (mode === 'register' && p.value !== p2.value) { e.textContent = 'The two passwords do not match.'; p2.focus(); return; }
    submit.disabled = true;
    try { const out = await signIn(n.value, p.value, mode); close(out); } catch (err) {
      e.textContent = err.message;
      submit.disabled = false;
    }
  };
  m.addEventListener('keydown', (ev) => ev.stopPropagation()); // typing never moves the avatar
  return m;
}

// ---------------------------------------------------------------- executive console
export class ExecConsole {
  /** ctx: { rt, toast(text), selfPose() -> {floor, room} } */
  constructor(ctx) {
    this.ctx = ctx; this.tab = 'overview'; this.sel = { box: new Set(), race: new Set() }; this.raceCount = 4;
    this.bal = new Map(); this.amt = {}; // Treasury tab: balances by connection id, typed amounts
    this.md = { fx: null, draft: null, dirty: false, fixtures: [], at: 0, busy: '', yt: '', ytTitle: '', fileTitle: '' }; // Arena Media tab
    this.el = h(`<div id="mp-console"><header><b>Executive Console</b><span class="who"></span><button class="mp-btn sm" data-x>Close · Alt+F2</button></header><div class="tabs"></div><div class="body"></div></div>`);
    document.body.append(this.el);
    // while elevated a small Console button stays on screen: closing the panel never locks it again (user, 2026-11-18)
    this.btn = h('<button id="mp-console-btn" class="mp-btn" title="Executive Console (Alt+F2)">♛ Console <kbd>Alt+F2</kbd></button>');
    document.body.append(this.btn);
    this.btn.onclick = (ev) => { ev.stopPropagation(); this.toggle(); };
    this.el.querySelector('[data-x]').onclick = () => this.toggle(false);
    this.makeDraggable(this.el.querySelector('header'));
    this.el.addEventListener('keydown', (ev) => ev.stopPropagation());
    this.el.addEventListener('click', (ev) => this.click(ev));
    this.el.addEventListener('change', (ev) => this.change(ev));
    this.el.addEventListener('input', (ev) => this.mediaInput(ev));
    // live media updates (another admin's edit) never redraw the form under a field you are typing in
    const editing = () => this.el.querySelector('.body').contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
    onArenaMedia(() => { if (this.tab !== 'media' || this.md.dirty) return; if (editing()) { this.md.pending = true; return; } this.md.draft = null; this.render(true); });
    this.el.addEventListener('focusout', () => setTimeout(() => { if (this.md.pending && !editing() && !this.md.dirty) { this.md.pending = false; this.md.draft = null; this.render(true); } }, 0));
    addEventListener('keydown', (ev) => {
      if (ev.altKey && ev.code === 'F2') { ev.preventDefault(); ev.stopPropagation(); this.hotkey(); }
    }, true);
    const { rt } = ctx;
    const paintBtn = () => { this.btn.classList.toggle('on', Boolean(rt.elevated)); this.btn.classList.toggle('open', this.open); };
    this.paintBtn = paintBtn;
    rt.on('role', () => { paintBtn(); this.render(); });
    rt.on('status', paintBtn);
    rt.on('meta', () => this.render());
    let acc = 0; rt.on('snap', () => { if (++acc % 5 === 0) this.render(); }); // 2 Hz refresh of the lists
  }
  /** drag the console by its header (mouse or touch); kept on screen, position remembered per browser */
  makeDraggable(handle) {
    const KEY = 'firm.console.pos.v1', el = this.el;
    const place = (x, y) => {
      const r = el.getBoundingClientRect();
      x = Math.max(0, Math.min(innerWidth - Math.min(r.width, innerWidth), x));
      y = Math.max(0, Math.min(innerHeight - 40, y)); // the header always stays reachable
      el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.right = 'auto';
      return { x, y };
    };
    this.reclamp = () => { if (el.style.left) place(parseFloat(el.style.left), parseFloat(el.style.top)); };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { el.style.left = `${s.x}px`; el.style.top = `${s.y}px`; el.style.right = 'auto'; } } catch { /* storage blocked */ }
    addEventListener('resize', () => this.reclamp());
    let drag = null;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target.closest('button,input,select')) return;
      const r = el.getBoundingClientRect();
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, id: ev.pointerId };
      handle.setPointerCapture(ev.pointerId); el.classList.add('dragging'); ev.preventDefault();
    });
    handle.addEventListener('pointermove', (ev) => { if (drag && ev.pointerId === drag.id) place(ev.clientX - drag.dx, ev.clientY - drag.dy); });
    const end = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null; el.classList.remove('dragging');
      try { localStorage.setItem(KEY, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch { /* storage blocked */ }
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  }
  get open() { return this.el.classList.contains('on'); }
  closeUnlock() { if (this.unlock) { this.unlock.remove(); this.unlock = null; } }
  hotkey() {
    if (this.unlock) { this.unlock.remove(); this.unlock = null; return; }
    if (!this.ctx.rt.elevated) { this.showUnlock(); return; }
    this.toggle();
  }
  toggle(on = !this.open) { this.el.classList.toggle('on', on); if (on) { document.exitPointerLock?.(); this.render(); this.reclamp?.(); } this.paintBtn?.(); }

  showUnlock() {
    let role = 'ceo';
    const m = h(`<div class="mp-modal"><form class="card">
      <h2>Executive Console</h2><div class="sub">Restricted. Enter the console credential and choose your seat.</div>
      <label>Seat</label><div class="seg"><button type="button" class="mp-btn on" data-r="ceo">♛ Chief Executive</button><button type="button" class="mp-btn" data-r="admin">Staff (Admin)</button></div>
      <label for="mp-ap">Console credential</label><input id="mp-ap" type="password" autocomplete="off" />
      <div class="err"></div>
      <div class="row"><button type="button" class="mp-btn" data-c>Cancel</button><button type="submit" class="mp-btn primary">Unlock</button></div>
      <div class="fine">Several Chief Executives may hold office at once. You can switch seats from the console.</div></form></div>`);
    document.body.append(m); this.unlock = m;
    m.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.code === 'Escape') { m.remove(); this.unlock = null; } });
    m.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { role = b.dataset.r; m.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); }; });
    m.querySelector('[data-c]').onclick = () => { m.remove(); this.unlock = null; };
    const pw = m.querySelector('#mp-ap'); pw.focus();
    m.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await this.ctx.rt.ask('elevate', { password: pw.value, role }); m.remove(); this.unlock = null; this.ctx.toast(`Console unlocked: ${ROLE_LABEL[role]}`); this.toggle(true); }
      catch (err) { m.querySelector('.err').textContent = err.message; pw.select(); }
    };
  }

  async act(op, data = {}, okText) {
    try { const out = await this.ctx.rt.ask(op, data); if (okText) this.ctx.toast(typeof okText === 'function' ? okText(out) : okText); return out; }
    catch (e) { this.ctx.toast(e.message, 3); return null; }
  }

  click(ev) {
    const mb = ev.target.closest('[data-mop]');
    if (mb) { this.mediaOp(mb.dataset.mop, mb.dataset); return; }
    const b = ev.target.closest('[data-tab],[data-op],[data-kick],[data-money]');
    if (!b) return;
    if (b.dataset.money) { const inp = this.el.querySelector(`[data-amt="${b.dataset.money}"]`); if (inp) this.amt[b.dataset.money] = inp.value; this.money(b.dataset.money, b.dataset.mop); return; }
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(true); return; }
    if (b.dataset.kick) { const p = this.ctx.rt.players.find((x) => x.id === b.dataset.kick); if (p && confirm(`Remove ${p.name} from the building?`)) this.act('kick', { target: p.id }, `${p.name} has been removed.`); return; }
    const rt = this.ctx.rt, op = b.dataset.op;
    const ops = {
      ceo: () => this.act('role', { role: 'ceo' }, 'Seat: Chief Executive'),
      admin: () => this.act('role', { role: 'admin' }, 'Seat: Staff (Admin)'),
      player: () => this.act('role', { role: 'player' }, 'Console locked. You are a guest again.'),
      tourOn: () => this.act('tour', { on: true }), tourOff: () => this.act('tour', { on: false }),
      teleportAll: () => this.act('teleportAll', {}, (o) => `Convened ${o.moved} guest(s) at your position.`),
      gather: () => this.act('gather', {}, (o) => `${o.members} guest(s) are in your basket.`),
      putDown: () => this.act('putDown', {}, (o) => `Basket set down: ${o.released} guest(s) released.`),
      boxStart: () => this.act('boxStart', { ids: [...this.sel.box] }, 'Combat session open. Competitors to the walkout.'),
      boxEnd: () => this.act('boxEnd', {}, 'Combat session ended.'),
      raceRandom: async () => { const o = await this.act('raceRandom', { count: this.raceCount }); if (o) { this.sel.race = new Set(o.ids); this.render(); } },
      raceStart: () => this.act('raceStart', { ids: [...this.sel.race] }, 'Riders to the gate.'),
      raceEnd: () => this.act('raceEnd', {}, 'Equine session ended.'),
    };
    void rt; ops[op]?.();
  }
  change(ev) {
    const t = ev.target;
    if (t.dataset.pick) { const s = this.sel[t.dataset.pick]; t.checked ? s.add(t.value) : s.delete(t.value); }
    if (t.dataset.count) this.raceCount = Math.max(2, Math.min(6, Number(t.value) || 4));
    if (t.dataset.amt) this.amt[t.dataset.amt] = t.value;
    if (t.dataset.mfx) { this.md.fx = Number(t.value) || null; this.md.draft = null; this.md.dirty = false; this.render(true); }
  }

  render(force = false) {
    if (!this.open) return;
    const { rt } = this.ctx;
    if (!rt.elevated) { this.toggle(false); return; }
    this.el.querySelector('.who').textContent = `${ROLE_LABEL[rt.role]} · ${rt.connected ? 'online' : 'offline'}`;
    const TABS = [['overview', 'Overview'], ['guests', 'Guests'], ['treasury', 'Treasury'], ['tour', 'Tour'], ['combat', 'Combat · VT-03'], ['equine', 'Equine · VT-04'], ['media', 'Arena Media · VT-02']];
    if (this.tab === 'treasury' && rt.role === 'ceo' && Date.now() - (this.balAt || 0) > 2000) this.loadBalances();
    this.el.querySelector('.tabs').innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${l}</button>`).join('');
    const body = this.el.querySelector('.body');
    const keep = body.scrollTop;
    if (body.contains(document.activeElement) && document.activeElement.matches('input[type=number]')) return; // don't wipe a field being edited
    if (this.tab === 'media' && body.dataset.pane === 'media' && !force) return; // the media form only redraws on its own events
    if (this.tab === 'media' && Date.now() - this.md.at > 60_000) this.loadMediaFixtures();
    body.dataset.pane = this.tab; // not data-tab: click() treats [data-tab] ancestors as tab buttons
    body.innerHTML = this[`tab_${this.tab}`]();
    body.scrollTop = keep;
  }

  badge(p) { return `<span class="badge ${p.device === 'mobile' ? 'm' : ''}">${p.device === 'mobile' ? 'MOBILE' : 'PC'}</span>`; }
  roleBadge(p) { return p.role === 'player' ? '' : `<span class="badge ${p.role}">${p.role === 'ceo' ? 'CEO' : 'ADMIN'}</span>`; }

  tab_overview() {
    const { rt } = this.ctx, ps = rt.players, m = rt.meta || {};
    const mob = ps.filter((p) => p.device === 'mobile').length;
    const dist = new Map();
    for (const p of ps) { const k = `${p.floor || '—'}|${p.room || ''}`; dist.set(k, (dist.get(k) || 0) + 1); }
    const rows = [...dist].sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [f, r] = k.split('|'); return `<tr><td><b>${esc(f)}</b> ${esc(FLOOR_BY_ID[f]?.short || '')}</td><td>${esc(roomName(r))}</td><td style="text-align:right">${n}</td></tr>`; }).join('');
    const tour = m.tour || {};
    const bx = m.boxing, rc = m.race;
    const game = (g, label) => (!g ? `<span class="off">idle</span>` : g.phase === 'ended' ? `<span class="off">last: ${esc(g.result?.winner || 'void')}</span>` : `<span class="live">LIVE · ${g.phase}</span> · ${(g.boxers || g.racers).length} · ${g.positions} positions · ${fmt(g.pool)}`);
    return `<div class="stats"><div class="stat"><small>Connected</small><span>${ps.length}</span></div><div class="stat"><small>PC</small><span>${ps.length - mob}</span></div><div class="stat"><small>Mobile</small><span>${mob}</span></div></div>
      <h4>Tour Mode</h4><div>${tour.on ? `<span class="live">ON</span> · host ${esc(tour.hostName)} · floor <b>${esc(tour.floor || '—')}</b> ${esc(roomName(tour.room))}` : '<span class="off">OFF</span>'} · baskets: ${Object.values(m.baskets || {}).reduce((s, x) => s + x.length, 0)} aboard</div>
      <h4>Active mini-sessions</h4><div>VT-03 Combat: ${game(bx)}</div><div>VT-04 Equine: ${game(rc)}</div>
      <h4>Distribution</h4><table><tr><th>Floor</th><th>Room</th><th style="text-align:right">Guests</th></tr>${rows || '<tr><td colspan=3 class="note">Nobody connected.</td></tr>'}</table>`;
  }

  tab_guests() {
    const { rt } = this.ctx;
    const rows = rt.players.map((p) => `<tr><td>${esc(p.name)} ${p.id === rt.id ? '<span class="badge you">YOU</span>' : ''}</td><td>${this.roleBadge(p) || 'Player'}</td><td><b>${esc(p.floor || '—')}</b> ${esc(roomName(p.room))}</td><td>${this.badge(p)}</td>
      <td>${p.id === rt.id ? '' : `<button class="mp-btn sm danger" data-kick="${p.id}">Kick</button>`}</td></tr>`).join('');
    return `<table><tr><th>Name</th><th>Role</th><th>Floor · room</th><th>Device</th><th></th></tr>${rows}</table>`;
  }

  // ---- Treasury: a Chief Executive adds, removes or sets any guest's (notional) money
  async loadBalances() {
    this.balAt = Date.now();
    try { const rows = await this.ctx.rt.ask('balances'); this.bal = new Map(rows.map((r) => [r.id, r.balance])); this.render(); } catch { /* not a CEO */ }
  }
  async money(target, op) {
    const raw = this.amt[target] ?? '';
    const amount = Number(String(raw).replace(/,/g, ''));
    if (raw === '' || !Number.isFinite(amount)) { this.ctx.toast('Enter an amount first.', 2); return; }
    const who = target === 'all' ? 'every connected guest' : this.ctx.rt.players.find((p) => p.id === target)?.name || 'this guest';
    if (target === 'all' && !confirm(`${{ add: 'Add', remove: 'Remove', set: 'Set' }[op]} ¤${fmtAmt(amount)} ${op === 'set' ? 'as the balance of' : op === 'add' ? 'to' : 'from'} ${who}?`)) return;
    const out = await this.act('money', { target, op, amount });
    if (!out) return;
    this.bal = new Map(out.balances.map((r) => [r.id, r.balance])); this.balAt = Date.now();
    const verb = { add: 'Added', remove: 'Removed', set: 'Set' }[op];
    this.ctx.toast(out.changed ? `${verb} · ${out.changed} account(s) changed · net ${out.net >= 0 ? '+' : '−'}${fmt(Math.abs(out.net))}` : 'No balances needed changing.', 2.5);
    this.render();
  }
  tab_treasury() {
    const { rt } = this.ctx;
    if (rt.role !== 'ceo') return '<div class="note">Treasury controls are reserved for a Chief Executive. Switch your seat on the Tour tab.</div>';
    const row = (id, label, bal) => `<tr><td>${label}</td><td style="text-align:right">${bal == null ? '—' : fmt(bal)}</td>
      <td><input type="number" class="amt" data-amt="${id}" min="0" step="0.01" placeholder="¤" value="${esc(this.amt[id] ?? '')}"></td>
      <td class="mbtns"><button class="mp-btn sm" data-money="${id}" data-mop="add">Add</button><button class="mp-btn sm" data-money="${id}" data-mop="remove">Remove</button><button class="mp-btn sm" data-money="${id}" data-mop="set">Set</button></td></tr>`;
    const rows = rt.players.map((p) => row(p.id, `${esc(p.name)} ${p.id === rt.id ? '<span class="badge you">YOU</span>' : ''}${this.roleBadge(p)}`, this.bal.get(p.id))).join('');
    return `<h4>All connected guests</h4><table class="money">${row('all', `<b>Everyone</b> (${rt.players.length})`, null)}</table>
      <h4>Each guest</h4><table class="money"><tr><th>Name</th><th style="text-align:right">Liquidity</th><th>Amount</th><th></th></tr>${rows || '<tr><td colspan=4 class="note">Nobody connected.</td></tr>'}</table>
      <div class="note">Add mints notional money; Remove takes it back (never below zero); Set makes the balance exactly the amount. Every change is posted to the ledger under your name. No real currency exists.</div>`;
  }

  tab_tour() {
    const { rt } = this.ctx, m = rt.meta || {}, ceo = rt.role === 'ceo', tour = m.tour || {};
    const mine = (m.baskets || {})[rt.id] || [];
    return `<h4>Your seat</h4><div class="btns"><button class="mp-btn ${ceo ? 'primary' : ''}" data-op="ceo">♛ Chief Executive</button><button class="mp-btn ${rt.role === 'admin' ? 'primary' : ''}" data-op="admin">Staff (Admin)</button><button class="mp-btn" data-op="player">Lock console</button></div>
      <h4>Tour Mode · ${tour.on ? `<span class="live">ON</span> (${esc(tour.hostName)}, ${esc(tour.floor || '—')})` : '<span class="off">OFF</span>'}</h4>
      <div class="btns"><button class="mp-btn" data-op="tourOn" ${ceo ? '' : 'disabled'}>Tour ON</button><button class="mp-btn" data-op="tourOff" ${ceo ? '' : 'disabled'}>Tour OFF</button></div>
      <div class="note">Only a Chief Executive toggles the tour. When the host changes floor the tour floor follows; nobody is moved automatically.</div>
      <h4>Convene</h4><div class="btns"><button class="mp-btn primary" data-op="teleportAll">Teleport All to me</button></div>
      <h4>Executive Basket ${mine.length ? `· ${mine.length} aboard` : ''}</h4>
      <div class="btns"><button class="mp-btn" data-op="gather" ${ceo ? '' : 'disabled'}>Gather into Basket</button><button class="mp-btn" data-op="putDown" ${ceo && mine.length ? '' : 'disabled'}>Put Down Basket</button></div>
      <div class="note">${ceo ? 'Gathered guests ride above your head wherever you go, lifts included.' : 'Switch to Chief Executive to carry the basket.'}</div>`;
  }

  pickList(kind, extra = () => '') {
    const { rt } = this.ctx;
    return `<table><tr><th></th><th>Name</th><th>Device</th><th>Where</th></tr>${rt.players.map((p) => `<tr><td><input type="checkbox" data-pick="${kind}" value="${p.id}" ${this.sel[kind].has(p.id) ? 'checked' : ''}></td>
      <td>${esc(p.name)} ${p.id === rt.id ? '<span class="badge you">YOU</span>' : ''}${this.roleBadge(p)}</td><td>${this.badge(p)}${extra(p)}</td><td>${esc(p.floor || '—')}</td></tr>`).join('')}</table>`;
  }

  tab_combat() {
    const { rt } = this.ctx, g = rt.meta?.boxing, ceo = rt.role === 'ceo', live = g && g.phase === 'active';
    const state = !g ? '<span class="off">No session yet.</span>' : live
      ? `<span class="live">LIVE</span> · ${g.boxers.map((b) => `${esc(b.name)} ${b.hp} HP${b.inRing ? ' (ring)' : ''}`).join(' · ')}<br>${g.positions} position(s) · ${fmt(g.pool)} allocated`
      : `Last session: ${g.result?.void ? 'level card, positions returned' : `${esc(g.result?.winner)} (${esc(g.result?.reason)})`}`;
    return `<h4>Session</h4><div>${state}</div>
      <h4>Select competitors (2 or more)</h4>${this.pickList('box')}
      <div class="btns"><button class="mp-btn primary" data-op="boxStart" ${ceo && !live ? '' : 'disabled'}>Start session</button><button class="mp-btn danger" data-op="boxEnd" ${live ? '' : 'disabled'}>Force End Round</button></div>
      <div class="note">Start sends competitors to the walkout ("walk into the ring") and everyone else to the stands. CEO highlights hide during the round. Ends on a knockout, Force End, or when the host leaves VT-03.</div>`;
  }

  // ---- Arena Media (VT-02): staff attach previous head-to-head results and highlights to a fixture;
  // the Arena's side screens show them next to the pricing screens. Every write is checked on the server.
  async loadMediaFixtures() {
    this.md.at = Date.now();
    try {
      const s = await api('/api/football/state');
      const seen = new Set();
      this.md.fixtures = [s.marquee && { ...s.marquee, star: true }, ...(s.fixtures || [])].filter((m) => m && !seen.has(m.id) && seen.add(m.id));
      if (!this.md.fx) this.md.fx = arenaMediaState()?.onScreens || s.marquee?.id || this.md.fixtures[0]?.id || null;
      refreshArenaMedia();
      if (this.tab === 'media') this.render(true);
    } catch { /* server offline */ }
  }
  mediaEntry() { return arenaMediaState()?.fixtures?.[this.md.fx] || null; }
  mediaInput(ev) {
    const t = ev.target;
    if (t.dataset.h2h) {
      const [i, k] = t.dataset.h2h.split(':'); const row = this.md.draft?.[Number(i)];
      if (row) { row[k] = t.value; row.src = 'manual'; this.md.dirty = true; for (const b of this.el.querySelectorAll('[data-mop="saveRows"],[data-mop="revert"]')) b.disabled = false; }
    }
    if (t.dataset.myt != null) this.md[t.dataset.myt] = t.value;
  }
  async mediaOp(op, ds) {
    const md = this.md, fx = md.fx;
    if (!fx && op !== 'off') { this.ctx.toast('Choose a fixture first.', 2); return; }
    const run = async (label, fn) => { md.busy = label; this.render(true); try { return await fn(); } catch (e) { this.ctx.toast(e.message, 3.5); return null; } finally { md.busy = ''; this.render(true); } };
    if (op === 'fetch') {
      const out = await run('Consulting the data feed…', () => this.ctx.rt.ask('mediaFetchH2H', { matchId: fx }));
      if (out) { md.draft = null; md.dirty = false; this.ctx.toast(out.fetched ? `${out.fetched} previous meeting(s) on file${out.cached ? ' (cached)' : ''}.` : 'The feed lists no previous meetings. Add them by hand.', 3); this.render(true); }
    } else if (op === 'addRow') {
      md.draft.unshift({ date: new Date().toISOString().slice(0, 10), competition: '', home: '', away: '', hs: 0, as: 0, src: 'manual' }); md.dirty = true; this.render(true);
    } else if (op === 'delRow') {
      md.draft.splice(Number(ds.i), 1); md.dirty = true; this.render(true);
    } else if (op === 'saveRows') {
      const rows = md.draft.map((r) => ({ ...r, hs: Number(r.hs), as: Number(r.as) }));
      if (await run('Saving…', () => this.ctx.rt.ask('mediaSetH2H', { matchId: fx, rows }))) { md.draft = null; md.dirty = false; this.ctx.toast('Head-to-head saved and on the screens.', 2.5); this.render(true); }
    } else if (op === 'revert') {
      md.draft = null; md.dirty = false; this.render(true);
    } else if (op === 'yt') {
      if (await run('Attaching…', () => this.ctx.rt.ask('mediaAddYoutube', { matchId: fx, url: md.yt, title: md.ytTitle }))) { md.yt = ''; md.ytTitle = ''; this.ctx.toast('Highlights attached.', 2.5); this.render(true); }
    } else if (op === 'upload') {
      const file = this.el.querySelector('[data-mfile]')?.files?.[0];
      if (!file) { this.ctx.toast('Choose an mp4 or webm file first.', 2.5); return; }
      const lim = (arenaMediaState()?.limits?.uploadMb || 80) * 1024 * 1024;
      if (!/\.(mp4|webm)$/i.test(file.name) && !/^video\/(mp4|webm)$/.test(file.type)) { this.ctx.toast('Only mp4 or webm video files are accepted.', 3); return; }
      if (file.size > lim) { this.ctx.toast(`Uploads are limited to ${lim / 1024 / 1024} MB.`, 3); return; }
      md.busy = 'Uploading 0%'; this.render(true);
      try {
        await new Promise((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open('POST', `/api/arena-media/upload?match=${fx}&title=${encodeURIComponent(md.fileTitle || file.name.replace(/\.[^.]+$/, ''))}`);
          x.setRequestHeader('Authorization', `Bearer ${getToken()}`);
          x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          x.upload.onprogress = (e) => { if (e.lengthComputable) { md.busy = `Uploading ${Math.round((e.loaded / e.total) * 100)}%`; const b = this.el.querySelector('.md-busy'); if (b) b.textContent = md.busy; } };
          x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch { /* empty */ } x.status === 200 ? resolve(j) : reject(new Error(j?.error || `Upload failed (${x.status})`)); };
          x.onerror = () => reject(new Error('Upload interrupted.'));
          x.send(file);
        });
        md.fileTitle = ''; this.ctx.toast('Highlights uploaded and rolling on the reel screens.', 3);
      } catch (e) { this.ctx.toast(e.message, 3.5); }
      md.busy = ''; this.render(true);
    } else if (op === 'rmv') {
      await run('Removing…', () => this.ctx.rt.ask('mediaRemoveVideo', { matchId: fx, videoId: ds.id }));
    } else if (op === 'show') {
      if (await run('…', () => this.ctx.rt.ask('mediaShow', { matchId: fx }))) this.ctx.toast('This fixture is now on the Arena media screens.', 2.5);
    } else if (op === 'off') {
      if (await run('…', () => this.ctx.rt.ask('mediaShow', { matchId: null }))) this.ctx.toast('Media screens handed back to the fixture cards.', 2.5);
    } else if (op === 'clear') {
      if (!confirm('Remove every head-to-head result and highlight for this fixture? Uploaded files are deleted.')) return;
      if (await run('Clearing…', () => this.ctx.rt.ask('mediaClear', { matchId: fx }))) { md.draft = null; md.dirty = false; this.ctx.toast('Fixture media cleared.', 2.5); }
    }
  }
  tab_media() {
    const md = this.md, st = arenaMediaState(), e = this.mediaEntry();
    if (!md.fixtures.length) return '<div class="note">Loading the fixture list…</div>';
    if (!md.draft) md.draft = (e?.h2h || []).map((r) => ({ ...r }));
    const name = (m) => `${m.homeTeam.shortName || m.homeTeam.name} v ${m.awayTeam.shortName || m.awayTeam.name}`;
    const opts = md.fixtures.map((m) => `<option value="${m.id}" ${m.id === md.fx ? 'selected' : ''}>${m.star ? '★ MARQUEE · ' : ''}${esc(name(m))} · ${esc(m.competition?.code || '')} · ${new Date(m.utcDate).toUTCString().slice(5, 22)}${st?.fixtures?.[m.id] ? ' · media' : ''}</option>`).join('');
    const onName = st?.onScreens ? esc(st.fixtures[st.onScreens]?.label || `fixture ${st.onScreens}`) : null;
    const inp = (i, k, v, ph, type = 'text') => `<input type="${type}" data-h2h="${i}:${k}" value="${esc(v)}" placeholder="${ph}" aria-label="${ph}" ${type === 'number' ? 'min="0" max="30"' : ''}>`;
    const rows = md.draft.map((r, i) => `<div class="md-row${r.src === 'auto' ? ' auto' : ''}"><div class="l1">${inp(i, 'date', r.date, 'Date', 'date')}${inp(i, 'competition', r.competition, 'Competition')}<button class="mp-btn sm danger" data-mop="delRow" data-i="${i}" title="Delete this result">✕</button></div>
      <div class="l2">${inp(i, 'home', r.home, 'Home club')}${inp(i, 'hs', r.hs, 'Home goals', 'number')}${inp(i, 'as', r.as, 'Away goals', 'number')}${inp(i, 'away', r.away, 'Away club')}</div></div>`).join('');
    const vids = (e?.videos || []).map((v) => `<tr><td>${v.kind === 'youtube' ? '<span class="badge">YOUTUBE</span>' : '<span class="badge m">UPLOAD</span>'}</td><td>${esc(v.title)}${v.size ? ` <span class="note">${(v.size / 1024 / 1024).toFixed(1)} MB</span>` : ''}</td><td class="note">${esc(String(v.by || '').replace(/^\w+:/, ''))}</td><td><button class="mp-btn sm danger" data-mop="rmv" data-id="${v.id}">Remove</button></td></tr>`).join('');
    const busy = md.busy ? `<div class="note md-busy" style="color:#f0d18a">${esc(md.busy)}</div>` : '';
    const lim = st?.limits || { uploadMb: 80, videos: 8 };
    return `<h4>Fixture</h4><select data-mfx style="width:100%;background:#171b25;color:#fff;border:1px solid #3a4152;border-radius:6px;padding:6px">${opts}</select>
      <div class="note">Media screens: ${onName ? `<span class="live">ON</span> · ${onName}` : '<span class="off">showing fixture cards</span>'}. The marquee stack and pricing screens are never replaced: media goes on the side screens beside the Sports Analytics signs (five head-to-head, five highlights) on the back faces of the big hanging screens and on the middle ring of the centre-hung stack (highlights); the stack's top and bottom rings and the hanging screens' front faces keep the pricing.</div>
      <div class="btns"><button class="mp-btn primary" data-mop="show" ${e ? '' : 'disabled'}>Put this fixture on the screens</button><button class="mp-btn" data-mop="off" ${st?.onScreens ? '' : 'disabled'}>Hand screens back</button></div>${busy}
      <h4>Head-to-head · previous meetings</h4>
      <div class="btns"><button class="mp-btn" data-mop="fetch">Auto-fill from football-data.org</button><button class="mp-btn" data-mop="addRow">+ Add a result</button></div>
      <div class="md-rows">${rows || '<div class="note">No results yet. Auto-fill (cached 12 h, paced to the free tier) or add them by hand.</div>'}</div>
      <div class="btns"><button class="mp-btn primary" data-mop="saveRows" ${md.dirty ? '' : 'disabled'}>Save head-to-head</button><button class="mp-btn" data-mop="revert" ${md.dirty ? '' : 'disabled'}>Discard edits</button></div>
      <h4>Highlights (${(e?.videos || []).length}/${lim.videos})</h4><table>${vids || '<tr><td class="note">No highlights attached.</td></tr>'}</table>
      <div class="note">YouTube link</div><div class="btns"><input type="text" data-myt="yt" value="${esc(md.yt)}" placeholder="https://www.youtube.com/watch?v=…" style="flex:2 1 60%"><input type="text" data-myt="ytTitle" value="${esc(md.ytTitle)}" placeholder="Title (optional)" style="flex:1 1 30%"><button class="mp-btn sm" data-mop="yt">Attach</button></div>
      <div class="note">Upload a video (mp4 or webm, up to ${lim.uploadMb} MB)</div><div class="btns"><input type="file" data-mfile accept="video/mp4,video/webm,.mp4,.webm" style="flex:2 1 55%;color:#cfd6e6"><input type="text" data-myt="fileTitle" value="${esc(md.fileTitle)}" placeholder="Title (optional)" style="flex:1 1 30%"><button class="mp-btn sm" data-mop="upload">Upload</button></div>
      <div class="note">Uploads play muted on the five reel screens through one shared video. YouTube clips play muted in YouTube's own player laid over the reel screen nearest each guest (a browser cannot paint YouTube into a 3D texture); the other reel screens show the clip's card.</div>
      <div class="btns"><button class="mp-btn danger" data-mop="clear" ${e ? '' : 'disabled'}>Clear all media for this fixture</button></div>
      <h4>Recent changes</h4><table>${(st?.audit || []).slice(0, 8).map((a) => `<tr><td class="note">${new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(String(a.by).replace(/^\w+:/, ''))}</td><td>${esc(a.what)}</td></tr>`).join('') || '<tr><td class="note">Nothing yet.</td></tr>'}</table>`;
  }

  tab_equine() {
    const { rt } = this.ctx, g = rt.meta?.race, ceo = rt.role === 'ceo', live = g && (g.phase === 'running' || g.phase === 'countdown');
    const boxed = new Set(rt.meta?.boxed || []);
    const state = !g ? '<span class="off">No session yet.</span>' : live
      ? `<span class="live">LIVE · ${g.phase}</span> · ${g.racers.map((r) => esc(r.name)).join(', ')} · ${g.positions} position(s)`
      : `Last session: ${g.result?.void ? 'cancelled, positions returned' : `${esc(g.result?.winner)} (${esc(g.result?.reason)})`}`;
    return `<h4>Session</h4><div>${state}</div>
      <h4>Riders (2–6)</h4>${this.pickList('race', (p) => (boxed.has(p.id) ? '<span class="badge boxed">BOXED VT-03</span>' : ''))}
      <div class="btns" style="align-items:center"><label class="note" style="flex:none">Count <input type="number" min="2" max="6" value="${this.raceCount}" data-count style="width:52px"></label>
        <button class="mp-btn" data-op="raceRandom" ${ceo ? '' : 'disabled'}>Randomize Non-Boxers</button></div>
      <div class="btns"><button class="mp-btn primary" data-op="raceStart" ${ceo && !live ? '' : 'disabled'}>Start race</button><button class="mp-btn danger" data-op="raceEnd" ${live ? '' : 'disabled'}>Force End</button></div>
      <div class="note">Randomize prefers guests who have not boxed in VT-03 and falls back to the rest if there are too few. Ends at the line, on Force End, or when the host leaves VT-04.</div>`;
  }
}
