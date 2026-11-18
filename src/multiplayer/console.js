// Sign-in modal (Name + Password) and the secret executive console (Alt+F2): unlock as CEO or Admin
// with the console password, then Overview · Guests (kick) · Tour · Combat (VT-03) · Equine (VT-04).
import './console.css';
import { signIn, savedAccount, esc, fmt } from '../net/api.js';
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
    <h2>Welcome to [FIRM NAME]</h2>
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
    this.el = h(`<div id="mp-console"><header><b>Executive Console</b><span class="who"></span><button class="mp-btn sm" data-x>Close · Alt+F2</button></header><div class="tabs"></div><div class="body"></div></div>`);
    document.body.append(this.el);
    this.el.querySelector('[data-x]').onclick = () => this.toggle(false);
    this.makeDraggable(this.el.querySelector('header'));
    this.el.addEventListener('keydown', (ev) => ev.stopPropagation());
    this.el.addEventListener('click', (ev) => this.click(ev));
    this.el.addEventListener('change', (ev) => this.change(ev));
    addEventListener('keydown', (ev) => {
      if (ev.altKey && ev.code === 'F2') { ev.preventDefault(); ev.stopPropagation(); this.hotkey(); }
    }, true);
    const { rt } = ctx;
    rt.on('role', () => this.render());
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
  toggle(on = !this.open) { this.el.classList.toggle('on', on); if (on) { document.exitPointerLock?.(); this.render(); this.reclamp?.(); } }

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
    const b = ev.target.closest('[data-tab],[data-op],[data-kick],[data-money]');
    if (!b) return;
    if (b.dataset.money) { const inp = this.el.querySelector(`[data-amt="${b.dataset.money}"]`); if (inp) this.amt[b.dataset.money] = inp.value; this.money(b.dataset.money, b.dataset.mop); return; }
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(); return; }
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
  }

  render() {
    if (!this.open) return;
    const { rt } = this.ctx;
    if (!rt.elevated) { this.toggle(false); return; }
    this.el.querySelector('.who').textContent = `${ROLE_LABEL[rt.role]} · ${rt.connected ? 'online' : 'offline'}`;
    const TABS = [['overview', 'Overview'], ['guests', 'Guests'], ['treasury', 'Treasury'], ['tour', 'Tour'], ['combat', 'Combat · VT-03'], ['equine', 'Equine · VT-04']];
    if (this.tab === 'treasury' && rt.role === 'ceo' && Date.now() - (this.balAt || 0) > 2000) this.loadBalances();
    this.el.querySelector('.tabs').innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${l}</button>`).join('');
    const body = this.el.querySelector('.body');
    const keep = body.scrollTop;
    if (body.contains(document.activeElement) && document.activeElement.matches('input[type=number]')) return; // don't wipe a field being edited
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
