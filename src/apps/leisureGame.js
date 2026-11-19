// Leisure Suite machines and tables (VT-01): slots (Automated Yield Terminal), blackjack (Twenty-One Advisory Table), baccarat and poker (Private Banking /
// Card Salon ovals) and craps (Kinetic Probability Pit). A small DOM panel holds the controls; the table itself is 3D (src/apps/tableSeat.js: camera at your seat,
// dealt cards, tumbling dice, spinning reels). Every outcome comes from the server's real engine (server/games/leisure.js + poker.js, settled on the ledger
// like roulette). The seat ends by itself when you are moved (CEO teleport / basket) or walk away.
import { api, fmt, setBalance, esc } from '../net/api.js';

let seat = null;
export const setSeat = (s) => { seat = s; };
const STAKES = { default: [100, 500, 2500, 10000], poker: [100, 250, 500, 1000, 5000] };
let el = null, state = null; // state: { kind, x, z }
const css = () => {
  if (document.getElementById('lsg-css')) return;
  const s = document.createElement('style'); s.id = 'lsg-css';
  s.textContent = `.lsg{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(520px,calc(100vw - 24px));background:rgba(8,10,16,.9);border:2px solid #e3c27a;border-radius:16px;color:#eef1f8;font:600 14px/1.4 "Segoe UI",Inter,Arial,sans-serif;padding:12px 16px;z-index:55;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  .lsg h3{margin:0 0 2px;font-size:17px;color:#e3c27a}.lsg .sub{color:#9aa3b2;font-size:12px;margin-bottom:4px}.lsg .x{float:right;cursor:pointer;color:#9aa3b2;font-size:12px}
  .lsg .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.lsg button{background:#1b2230;color:#eef1f8;border:1px solid #3a4256;border-radius:8px;padding:7px 12px;font:700 13px inherit;cursor:pointer}
  .lsg button.on{border-color:#e3c27a;background:#3a2f12}.lsg button.go{background:#e3c27a;color:#1a1305}.lsg button:disabled{opacity:.4}
  .lsg .out{min-height:40px;font-size:15px}.lsg .win{color:#5dff9a}.lsg .lose{color:#ff7a7a}`;
  document.head.appendChild(s);
};
const dollars = (m) => fmt(m);
const net = (n) => `<b class="${n > 0 ? 'win' : n < 0 ? 'lose' : ''}">${n > 0 ? 'WON ' : n < 0 ? 'LOST ' : 'PUSH '}${n === 0 ? '' : dollars(Math.abs(n))}</b>`;
const post = (path, body) => api(path, { method: 'POST', body });

export function gameOpen() { return Boolean(el); }
export function closeGame() { if (el) { el.remove(); el = null; state = null; } seat?.end(); }
/** called every frame: walk away (> 4.2 m) and the seat ends */
export function gameWatch(player) { if (state && Math.hypot(player.pos.x - state.x, player.pos.z - state.z) > 4.2) closeGame(); }

export function openGame(kind, at) {
  closeGame(); css();
  state = { kind, x: at.x, z: at.z };
  const stakes = kind === 'poker' ? STAKES.poker : STAKES.default;
  let stake = kind === 'poker' ? 250 : 500, side = null, busy = false, hand = null, out = '';
  el = document.createElement('div'); el.className = 'lsg'; document.body.appendChild(el);
  document.exitPointerLock?.();
  seat?.begin(kind, at); seat?.setChips(stake, kind);
  const T = {
    slots: ['Automated Yield Terminal', 'Three reels, real odds (about 94.7% returned).'],
    blackjack: ['Twenty-One Advisory Table', 'Six decks, dealer stands on 17, 3:2 on a natural. Hit, stand or double (no split).'],
    baccarat: ['Private Banking Table', 'Punto banco, eight decks. Banker pays 0.95 to 1, tie 8 to 1.'],
    craps: ['Kinetic Probability Pit', "Pass or don't pass, played out to the end."],
    poker: ['Private Card Salon', "Heads-up hold'em against the house. Ante, bet 2 units, one raise per street."],
  }[kind];
  const cards = (h) => h.map((c) => `<b>${esc(c)}</b>`).join(' ');
  const done = (r) => { if (r.balance != null) setBalance(r.balance); };
  const draw = () => {
    if (!el) return;
    const sb = stakes.map((x) => `<button data-s="${x}" class="${x === stake ? 'on' : ''}" ${hand ? 'disabled' : ''}>${dollars(x)}</button>`).join('');
    let ctl = '';
    if (kind === 'baccarat') ctl = ['player', 'banker', 'tie'].map((x) => `<button data-side="${x}" class="${side === x ? 'on' : ''}">${x.toUpperCase()}</button>`).join('');
    if (kind === 'craps') ctl = [['pass', 'PASS'], ['dont', "DON'T PASS"]].map(([x, t]) => `<button data-side="${x}" class="${side === x ? 'on' : ''}">${t}</button>`).join('');
    let go;
    if (kind === 'blackjack' && hand) go = `<button class="go" data-a="hit">HIT</button><button class="go" data-a="stand">STAND</button><button data-a="double" ${hand.player.length === 2 ? '' : 'disabled'}>DOUBLE</button>`;
    else if (kind === 'poker' && hand) go = (hand.facing > 0 ? `<button class="go" data-a="call">CALL ${dollars(hand.facing)}</button>${hand.canRaise ? '<button data-a="raise">RAISE</button>' : ''}` : '<button class="go" data-a="check">CHECK</button><button data-a="bet">BET</button>') + '<button data-a="fold">FOLD</button>';
    else go = `<button class="go" data-go="1">${kind === 'blackjack' || kind === 'poker' ? 'DEAL' : kind === 'slots' ? 'SPIN' : 'PLAY'}</button>`;
    el.innerHTML = `<span class="x">leave · Esc</span><h3>${esc(T[0])}</h3><div class="sub">${esc(T[1])}</div><div class="row">${sb}</div>${ctl ? `<div class="row">${ctl}</div>` : ''}<div class="row">${go}</div><div class="out">${out}</div>`;
    el.querySelector('.x').onclick = closeGame;
    el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { stake = Number(b.dataset.s); seat?.setChips(stake, kind); draw(); }; });
    el.querySelectorAll('[data-side]').forEach((b) => { b.onclick = () => { side = b.dataset.side; draw(); }; });
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
    const g = el.querySelector('[data-go]'); if (g) g.onclick = go1;
  };
  const run = async (fn) => { if (busy) return; busy = true; try { await fn(); } catch (e) { out = `<span class="lose">${esc(e.message)}</span>`; } busy = false; draw(); };
  const showBj = async (r) => {
    out = `<div>You ${cards(r.player)} = ${r.pv}</div>`; draw();
    await seat?.playBlackjack(r, { reveal: r.done });
    if (r.done) { hand = null; out = `<div>You ${cards(r.player)} = ${r.pv} · Dealer ${cards(r.dealer)} = ${r.dv}</div><div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r); }
    else { hand = r; out = `<div>You ${cards(r.player)} = ${r.pv} · Dealer shows ${esc(r.dealer[0])}</div>`; }
  };
  const showPk = async (r) => {
    await seat?.playPoker(r, { showBot: r.done && r.botHole[0] !== '??', botLabels: r.botHole });
    const info = `Pot ${dollars(r.pot)} · you ${cards(r.hole)}${r.board.length ? ` · board ${cards(r.board)}` : ''}`;
    if (r.done) { hand = null; out = `<div>${info}</div><div>${esc(r.note)} ${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r); }
    else { hand = r; out = `<div>${info}</div>${r.facing > 0 ? `<div>The house bets. You owe ${dollars(r.facing)}.</div>` : ''}`; }
  };
  const go1 = () => run(async () => {
    seat?.clearHands();
    if (kind === 'slots') {
      out = ''; draw();
      const r = await post('/api/leisure/slots', { stake }); await seat?.playSlots(r.reels, Math.floor(stake * (r.mult || 0)));
      out = `<div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else if (kind === 'baccarat') {
      if (!side) throw new Error('Choose player, banker or tie.');
      const r = await post('/api/leisure/baccarat', { side, stake }); await seat?.playBaccarat(r);
      out = `<div>Player ${cards(r.player)} = ${r.pt} · Banker ${cards(r.banker)} = ${r.bk}</div><div>${r.winner.toUpperCase()} · ${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else if (kind === 'craps') {
      if (!side) throw new Error("Choose pass or don't pass.");
      const r = await post('/api/leisure/craps', { side, stake }); await seat?.playCraps(r.rolls);
      out = `<div>${r.rolls.map((x) => `[${x[0]}+${x[1]}]`).join(' ')}${r.point ? ` · point ${r.point}` : ''}</div><div>${net(r.net)} · balance ${dollars(r.balance)}</div>`; done(r);
    } else if (kind === 'poker') await showPk(await post('/api/leisure/poker/deal', { stake }));
    else await showBj(await post('/api/leisure/blackjack/deal', { stake }));
  });
  const act = (a) => run(async () => { if (kind === 'poker') await showPk(await post('/api/leisure/poker/act', { action: a })); else await showBj(await post('/api/leisure/blackjack/act', { action: a })); });
  const resume = kind === 'blackjack' || kind === 'poker' ? api(`/api/leisure/${kind}`).then(async (j) => { if (j.hand && el) { hand = j.hand; await (kind === 'poker' ? showPk(hand) : showBj(hand)); draw(); } }).catch(() => {}) : null;
  void resume;
  draw();
}
addEventListener('keydown', (e) => { if (e.code === 'Escape' && gameOpen()) closeGame(); });
