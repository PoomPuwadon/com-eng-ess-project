// Leisure Suite machines and tables (VT-01): slots (Automated Yield Terminal), blackjack (Twenty-One Advisory Table), baccarat (Private Banking Table)
// and craps (Kinetic Probability Pit). One small DOM panel for all four; every outcome comes from the server's real engine
// (server/games/leisure.js, settled on the ledger like roulette). The panel closes by itself when you are moved (CEO teleport / basket) or walk away.
import { api, fmt, setBalance, esc } from '../net/api.js';

const SYM = { seven: '7️⃣', bar: '🟥', bell: '🔔', cherry: '🍒', lemon: '🍋', plum: '🍇' };
const STAKES = [100, 500, 2500, 10000];
let el = null, state = null; // state: { kind, x, z }
const css = () => {
  if (document.getElementById('lg-css')) return;
  const s = document.createElement('style'); s.id = 'lg-css';
  s.textContent = `.lg{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(460px,calc(100vw - 24px));background:rgba(8,10,16,.95);border:2px solid #e3c27a;border-radius:16px;color:#eef1f8;font:600 14px/1.4 "Segoe UI",Inter,Arial,sans-serif;padding:14px 16px;z-index:55;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  .lg h3{margin:0 0 2px;font-size:18px;color:#e3c27a}.lg .sub{color:#9aa3b2;font-size:12px;margin-bottom:8px}.lg .x{float:right;cursor:pointer;color:#9aa3b2;font-size:12px}
  .lg .row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.lg button{background:#1b2230;color:#eef1f8;border:1px solid #3a4256;border-radius:8px;padding:7px 12px;font:700 13px inherit;cursor:pointer}
  .lg button.on{border-color:#e3c27a;background:#3a2f12}.lg button.go{background:#e3c27a;color:#1a1305}.lg button:disabled{opacity:.4}
  .lg .out{min-height:56px;font-size:15px}.lg .reels{font-size:44px;letter-spacing:10px;text-align:center}.lg .win{color:#5dff9a}.lg .lose{color:#ff7a7a}`;
  document.head.appendChild(s);
};
const dollars = (m) => fmt(m);
const net = (n) => `<b class="${n > 0 ? 'win' : n < 0 ? 'lose' : ''}">${n > 0 ? 'WON ' : n < 0 ? 'LOST ' : 'PUSH '}${n === 0 ? '' : dollars(Math.abs(n))}</b>`;
const post = (path, body) => api(path, { method: 'POST', body });

export function gameOpen() { return Boolean(el); }
export function closeGame() { if (el) { el.remove(); el = null; state = null; } }
/** called every frame: walk away (> 4 m) and the panel closes */
export function gameWatch(player) { if (state && Math.hypot(player.pos.x - state.x, player.pos.z - state.z) > 4.2) closeGame(); }

export function openGame(kind, at) {
  closeGame(); css();
  state = { kind, x: at.x, z: at.z };
  let stake = 500, side = null, busy = false, hand = null, out = '';
  el = document.createElement('div'); el.className = 'lg'; document.body.appendChild(el);
  document.exitPointerLock?.();
  const T = {
    slots: ['Automated Yield Terminal', 'Three reels, real odds (about 94.7% returned). Choose an allocation and spin.'],
    blackjack: ['Twenty-One Advisory Table', 'Six decks, dealer stands on 17, 3:2 on a natural. Hit, stand or double (no split).'],
    baccarat: ['Private Banking Table', 'Punto banco, eight decks. Banker pays 0.95 to 1, tie 8 to 1.'],
    craps: ['Kinetic Probability Pit', "Pass or don't pass, played out to the end."],
  }[kind];
  const cards = (h) => h.map((c) => `<b>${esc(c)}</b>`).join(' ');
  const done = (r) => { if (r.balance != null) setBalance(r.balance); };
  const draw = () => {
    if (!el) return;
    const stakes = STAKES.map((s) => `<button data-s="${s}" class="${s === stake ? 'on' : ''}" ${hand ? 'disabled' : ''}>${dollars(s)}</button>`).join('');
    let ctl = '';
    if (kind === 'baccarat') ctl = ['player', 'banker', 'tie'].map((x) => `<button data-side="${x}" class="${side === x ? 'on' : ''}">${x.toUpperCase()}</button>`).join('');
    if (kind === 'craps') ctl = [['pass', 'PASS'], ['dont', "DON'T PASS"]].map(([x, t]) => `<button data-side="${x}" class="${side === x ? 'on' : ''}">${t}</button>`).join('');
    const go = kind === 'blackjack' && hand
      ? `<button class="go" data-a="hit">HIT</button><button class="go" data-a="stand">STAND</button><button data-a="double" ${hand.player.length === 2 ? '' : 'disabled'}>DOUBLE</button>`
      : `<button class="go" data-go="1">${kind === 'blackjack' ? 'DEAL' : kind === 'slots' ? 'SPIN' : 'PLAY'}</button>`;
    el.innerHTML = `<span class="x">close · Esc</span><h3>${esc(T[0])}</h3><div class="sub">${esc(T[1])}</div><div class="row">${stakes}</div>${ctl ? `<div class="row">${ctl}</div>` : ''}<div class="row">${go}</div><div class="out">${out}</div>`;
    el.querySelector('.x').onclick = closeGame;
    el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { stake = Number(b.dataset.s); draw(); }; });
    el.querySelectorAll('[data-side]').forEach((b) => { b.onclick = () => { side = b.dataset.side; draw(); }; });
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
    const g = el.querySelector('[data-go]'); if (g) g.onclick = go1;
  };
  const run = async (fn) => { if (busy) return; busy = true; try { await fn(); } catch (e) { out = `<span class="lose">${esc(e.message)}</span>`; } busy = false; draw(); };
  const showBj = (r) => {
    if (r.done) { hand = null; out = `<div>You ${cards(r.player)} = ${r.pv}</div><div>Dealer ${cards(r.dealer)} = ${r.dv}</div><div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r); }
    else { hand = r; out = `<div>You ${cards(r.player)} = ${r.pv}</div><div>Dealer ${cards(r.dealer)}</div>`; }
  };
  const go1 = () => run(async () => {
    if (kind === 'slots') {
      out = '<div class="reels">🎰 🎰 🎰</div>'; draw();
      const r = await post('/api/leisure/slots', { stake });
      await new Promise((ok) => setTimeout(ok, 700));
      out = `<div class="reels">${r.reels.map((s) => SYM[s]).join(' ')}</div><div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else if (kind === 'baccarat') {
      if (!side) throw new Error('Choose player, banker or tie.');
      const r = await post('/api/leisure/baccarat', { side, stake });
      out = `<div>Player ${cards(r.player)} = ${r.pt}</div><div>Banker ${cards(r.banker)} = ${r.bk}</div><div>${r.winner.toUpperCase()} · ${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else if (kind === 'craps') {
      if (!side) throw new Error("Choose pass or don't pass.");
      const r = await post('/api/leisure/craps', { side, stake });
      out = `<div>Rolls: ${r.rolls.map((x) => `[${x[0]}+${x[1]}]`).join(' ')}${r.point ? ` · point ${r.point}` : ''}</div><div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else showBj(await post('/api/leisure/blackjack/deal', { stake }));
  });
  const act = (a) => run(async () => { showBj(await post('/api/leisure/blackjack/act', { action: a })); });
  if (kind === 'blackjack') api('/api/leisure/blackjack').then((j) => { if (j.hand && el) { hand = j.hand; out = `<div>You ${cards(hand.player)} = ${hand.pv}</div><div>Dealer ${cards(hand.dealer)}</div>`; draw(); } }).catch(() => {});
  draw();
}
addEventListener('keydown', (e) => { if (e.code === 'Escape' && gameOpen()) closeGame(); });
