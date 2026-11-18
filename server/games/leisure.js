// Leisure Suite games beyond roulette (leisure-rules skill): Automated Yield Terminals (slots), Twenty-One Advisory Tables (blackjack),
// Private Banking Tables (baccarat, punto banco) and the Kinetic Probability Pit (craps). Real engines, server-authoritative, CSPRNG,
// settled on the ledger exactly like roulette (player <-> VAULT, never MINT). One-shot games settle in ONE posting; blackjack escrows the stake at
// the deal and settles at the end. The pure engines are exported for tests (house-edge checks).
// Simplifications (cheap on purpose, rule edges stated in the UI): blackjack has no split / insurance / surrender (hit, stand, double);
// craps is the pass / don't-pass line only, played to resolution in one request.
import { randomInt } from 'node:crypto';
import { VAULT, player } from '../ledger.js';
import { newDeck, cardName, score, categoryName, botAct } from './poker.js';

export const LIMITS = { min: 100, max: 100_000 }; // ¤ 1.00 .. ¤ 1,000.00 per round
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ---------------------------------------------------------------- slots: three reels, RTP 94.7 % (exhaustive, see test)
export const REEL = { seven: 2, bar: 4, bell: 6, cherry: 8, lemon: 10, plum: 10 };
export const TRIPLE = { seven: 150, bar: 50, bell: 25, cherry: 12, lemon: 10, plum: 7 };
const REEL_STRIP = Object.entries(REEL).flatMap(([s, n]) => Array(n).fill(s));
/** multiple of the stake returned (stake included) for three stopped symbols */
export function slotPay(a, b, c) {
  if (a === b && b === c) return TRIPLE[a];
  const ch = [a, b, c].filter((x) => x === 'cherry').length;
  return ch === 2 ? 2.5 : ch === 1 ? 0.5 : 0;
}
export const slotSpin = (rnd = randomInt) => [0, 1, 2].map(() => REEL_STRIP[rnd(REEL_STRIP.length)]);

// ---------------------------------------------------------------- cards
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
export function shoe(decks, rnd = randomInt) {
  const s = [];
  for (let d = 0; d < decks; d++) for (const r of RANKS) for (const u of SUITS) s.push({ r, u });
  for (let i = s.length - 1; i > 0; i--) { const j = rnd(i + 1); [s[i], s[j]] = [s[j], s[i]]; } // Fisher-Yates
  return s;
}
export const label = (c) => `${c.r}${c.u}`;

// ---------------------------------------------------------------- baccarat (punto banco, 8 decks)
const bv = (c) => (c.r === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(c.r) ? 0 : Number(c.r));
const bt = (h) => h.reduce((s, c) => s + bv(c), 0) % 10;
/** returns { player, banker, winner: 'player'|'banker'|'tie' } using the standard third-card tableau */
export function baccaratDeal(cards = shoe(8)) {
  const p = [cards.pop(), cards.pop()], b = [cards.pop(), cards.pop()];
  if (bt(p) < 8 && bt(b) < 8) {
    let p3 = null;
    if (bt(p) <= 5) { p3 = cards.pop(); p.push(p3); }
    const t = bt(b);
    if (!p3) { if (t <= 5) b.push(cards.pop()); }
    else {
      const v = bv(p3);
      const draw = t <= 2 || (t === 3 && v !== 8) || (t === 4 && v >= 2 && v <= 7) || (t === 5 && v >= 4 && v <= 7) || (t === 6 && (v === 6 || v === 7));
      if (draw) b.push(cards.pop());
    }
  }
  const pt = bt(p), bk = bt(b);
  return { player: p, banker: b, pt, bk, winner: pt > bk ? 'player' : bk > pt ? 'banker' : 'tie' };
}
/** total returned (stake included) for a bet on side */
export const baccaratReturn = (side, winner, stake) => (winner === 'tie' ? (side === 'tie' ? stake * 9 : stake) : winner === side ? (side === 'banker' ? Math.floor(stake * 1.95) : stake * 2) : 0);

// ---------------------------------------------------------------- craps (pass / don't pass, resolved in one request)
const d6 = (rnd) => rnd(6) + 1;
export function crapsRound(side, rnd = randomInt) {
  const rolls = [];
  const roll = () => { const r = [d6(rnd), d6(rnd)]; rolls.push(r); return r[0] + r[1]; };
  const first = roll();
  let outcome; // 'pass' | 'dont' | 'push'
  if (first === 7 || first === 11) outcome = 'pass';
  else if (first === 2 || first === 3) outcome = 'dont';
  else if (first === 12) outcome = 'push'; // bar 12 on don't pass
  else { for (;;) { const r = roll(); if (r === first) { outcome = 'pass'; break; } if (r === 7) { outcome = 'dont'; break; } } }
  const win = side === 'pass' ? outcome === 'pass' : outcome === 'dont';
  return { rolls, point: first >= 4 && first <= 10 && first !== 7 ? first : null, outcome, result: outcome === 'push' && side === 'dont' ? 'push' : win ? 'win' : 'lose' };
}

// ---------------------------------------------------------------- blackjack (6 decks, S17, 3:2, double any two; no split)
export const hv = (h) => { let t = h.reduce((s, c) => s + (c.r === 'A' ? 11 : ['10', 'J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r)), 0), a = h.filter((c) => c.r === 'A').length; while (t > 21 && a-- > 0) t -= 10; return t; };
export const isBJ = (h) => h.length === 2 && hv(h) === 21;
export function dealerPlay(dealer, cards) { while (hv(dealer) < 17) dealer.push(cards.pop()); return dealer; }
/** total returned (stake included) for a finished hand; stake = total committed (doubled stakes included) */
export function bjReturn(playerHand, dealer, stake, doubled) {
  const pv = hv(playerHand), dv = hv(dealer), base = doubled ? stake / 2 : stake;
  if (pv > 21) return 0;
  if (isBJ(playerHand) && !doubled) return isBJ(dealer) ? stake : stake + Math.floor(stake * 1.5);
  if (dv > 21 || pv > dv) return stake * 2;
  return pv === dv ? stake : (void base, 0);
}

export function createLeisureGames(db, ledger, bus, players) {
  const bj = new Map(); // pid -> { id, cards, hand, dealer, stake, doubled, done }
  let seq = db.kvGet('leisure:seq', 0);
  const nextId = () => { seq++; db.kvSet('leisure:seq', seq); return seq; };

  function check(pid, stake) {
    stake = Number(stake);
    if (!Number.isSafeInteger(stake) || stake < LIMITS.min || stake > LIMITS.max) throw err(`Allocation must be between ¤${LIMITS.min / 100} and ¤${LIMITS.max / 100}.`);
    if (ledger.balance(player(pid)) < stake) throw err('You are currently liquidity-constrained for this allocation.', 402);
    return stake;
  }
  const solvent = (stake, maxReturn) => { if (ledger.balance(VAULT) + stake < maxReturn) throw err('The Treasury Reserve cannot underwrite this round right now.', 409); };
  /** one posting: stake to the vault, winnings back */
  function settleOne(pid, game, stake, returned, memo) {
    const id = nextId(), acct = player(pid);
    ledger.post({ actor: `player:${pid}`, reason: 'ROUND_SETTLED', ref: `${game}:${id}`, idem: `${game}:${id}`, memo, transfers: [{ from: acct, to: VAULT, amount: stake }, ...(returned ? [{ from: VAULT, to: acct, amount: returned }] : [])] });
    bus?.emit('leisure', { game, net: returned - stake, name: players.nameOf(pid), at: Date.now() });
    return { round: id, stake, returned, net: returned - stake, balance: ledger.balance(acct) };
  }

  const slots = (pid, stake) => { stake = check(pid, stake); solvent(stake, stake * 150); const reels = slotSpin(); const mult = slotPay(...reels); return { reels, mult, ...settleOne(pid, 'slots', stake, Math.floor(stake * mult)) }; };
  const baccarat = (pid, side, stake) => {
    if (!['player', 'banker', 'tie'].includes(side)) throw err('Choose player, banker or tie.');
    stake = check(pid, stake); solvent(stake, stake * 9);
    const d = baccaratDeal();
    return { player: d.player.map(label), banker: d.banker.map(label), pt: d.pt, bk: d.bk, winner: d.winner, ...settleOne(pid, 'baccarat', stake, baccaratReturn(side, d.winner, stake)) };
  };
  const craps = (pid, side, stake) => {
    if (!['pass', 'dont'].includes(side)) throw err('Choose pass or don\'t pass.');
    stake = check(pid, stake); solvent(stake, stake * 2);
    const r = crapsRound(side);
    return { rolls: r.rolls, point: r.point, result: r.result, ...settleOne(pid, 'craps', stake, r.result === 'win' ? stake * 2 : r.result === 'push' ? stake : 0) };
  };

  // ---- blackjack: escrow at the deal, settle when the hand ends
  const bjView = (g, reveal) => ({ round: g.id, player: g.hand.map(label), pv: hv(g.hand), dealer: reveal ? g.dealer.map(label) : [label(g.dealer[0]), '??'], dv: reveal ? hv(g.dealer) : null, stake: g.stake, doubled: g.doubled, done: g.done });
  function bjFinish(pid, g) {
    const acct = player(pid), esc = `ESCROW:BET:bj${g.id}`;
    if (hv(g.hand) <= 21 && !isBJ(g.hand)) dealerPlay(g.dealer, g.cards);
    const returned = bjReturn(g.hand, g.dealer, g.stake, g.doubled);
    const t = returned > g.stake ? [{ from: esc, to: acct, amount: g.stake }, { from: VAULT, to: acct, amount: returned - g.stake }] : returned === g.stake ? [{ from: esc, to: acct, amount: g.stake }] : [{ from: esc, to: VAULT, amount: g.stake }];
    ledger.post({ actor: `player:${pid}`, reason: returned > g.stake ? 'WAGER_WON' : returned === g.stake ? 'WAGER_VOID' : 'WAGER_LOST', ref: `bj:${g.id}`, idem: `bj:${g.id}:settle`, transfers: t });
    g.done = true; bj.delete(pid);
    bus?.emit('leisure', { game: 'blackjack', net: returned - g.stake, name: players.nameOf(pid), at: Date.now() });
    return { ...bjView(g, true), returned, net: returned - g.stake, balance: ledger.balance(acct) };
  }
  function bjDeal(pid, stake) {
    if (bj.has(pid)) throw err('Finish your current hand first.', 409);
    stake = check(pid, stake); solvent(stake, stake * 5);
    const cards = shoe(6), g = { at: Date.now(), id: nextId(), cards, hand: [cards.pop(), cards.pop()], dealer: [cards.pop(), cards.pop()], stake, doubled: false, done: false };
    ledger.post({ actor: `player:${pid}`, reason: 'WAGER_PLACED', ref: `bj:${g.id}`, idem: `bj:${g.id}:open`, transfers: [{ from: player(pid), to: `ESCROW:BET:bj${g.id}`, amount: stake }] });
    bj.set(pid, g);
    return isBJ(g.hand) || isBJ(g.dealer) ? bjFinish(pid, g) : bjView(g, false);
  }
  function bjAct(pid, action) {
    const g = bj.get(pid); if (!g) throw err('No hand in play.', 409);
    if (action === 'hit') { g.hand.push(g.cards.pop()); return hv(g.hand) >= 21 ? bjFinish(pid, g) : bjView(g, false); }
    if (action === 'stand') return bjFinish(pid, g);
    if (action === 'double') {
      if (g.hand.length !== 2 || g.doubled) throw err('Double is only available on your first two cards.', 409);
      if (ledger.balance(player(pid)) < g.stake) throw err('You are currently liquidity-constrained for this allocation.', 402);
      solvent(g.stake * 2, g.stake * 4);
      ledger.post({ actor: `player:${pid}`, reason: 'WAGER_PLACED', ref: `bj:${g.id}`, idem: `bj:${g.id}:double`, transfers: [{ from: player(pid), to: `ESCROW:BET:bj${g.id}`, amount: g.stake }] });
      g.stake *= 2; g.doubled = true; g.hand.push(g.cards.pop());
      return bjFinish(pid, g);
    }
    throw err('Hit, stand or double.');
  }
  /** a hand left idle (closed tab, teleport) stands on its own after 5 minutes so no stake sits in escrow */
  const sweep = () => { for (const [pid, g] of [...bj]) if (Date.now() - g.at > 300_000) { try { bjFinish(pid, g); } catch { bj.delete(pid); } } for (const [pid, g] of [...pk]) if (Date.now() - g.at > 300_000) { try { pkSettle(pid, g, 'bot', 'Hand abandoned.'); } catch { pk.delete(pid); } } };
  // ---- heads-up hold'em vs the house bot: ante u each, fixed-limit (bet 2u, one raise per street); player chips escrowed as they go in, the bot's side is the vault at settlement
  const pk = new Map();
  const PK_MAX_UNIT = 5_000;
  const pkView = (g, reveal) => ({ round: g.id, hole: g.hole.map(cardName), board: g.board.map(cardName), street: g.street, pot: g.pC + g.bC, mine: g.pC, bot: g.bC, facing: g.facing, canRaise: g.facing > 0 && !g.raised, unit: g.u, done: g.done,
    botHole: reveal ? g.bot.map(cardName) : ['??', '??'], note: g.note || '' });
  function pkAdd(pid, g, amount) {
    if (amount <= 0) return;
    if (ledger.balance(player(pid)) < amount) throw err('You are currently liquidity-constrained for this allocation.', 402);
    ledger.post({ actor: `player:${pid}`, reason: 'WAGER_PLACED', ref: `pk:${g.id}`, idem: `pk:${g.id}:add${g.adds++}`, transfers: [{ from: player(pid), to: `ESCROW:BET:pk${g.id}`, amount }] });
    g.pC += amount;
  }
  function pkSettle(pid, g, winner, note) { // winner: 'player' | 'bot' | 'split'
    const acct = player(pid), esc = `ESCROW:BET:pk${g.id}`;
    const t = winner === 'player' ? [{ from: esc, to: acct, amount: g.pC }, ...(g.bC ? [{ from: VAULT, to: acct, amount: g.bC }] : [])] : winner === 'split' ? [{ from: esc, to: acct, amount: g.pC }] : [{ from: esc, to: VAULT, amount: g.pC }];
    ledger.post({ actor: `player:${pid}`, reason: winner === 'player' ? 'WAGER_WON' : winner === 'split' ? 'WAGER_VOID' : 'WAGER_LOST', ref: `pk:${g.id}`, idem: `pk:${g.id}:settle`, transfers: t });
    g.done = true; g.note = note; pk.delete(pid);
    const net = winner === 'player' ? g.bC : winner === 'split' ? 0 : -g.pC;
    bus?.emit('leisure', { game: 'poker', net, name: players.nameOf(pid), at: Date.now() });
    return { ...pkView(g, winner !== 'bot' || g.showdown), result: winner, net, balance: ledger.balance(acct) };
  }
  function pkShowdown(pid, g) {
    const a = score([...g.hole, ...g.board]), b = score([...g.bot, ...g.board]); g.showdown = true;
    const note = `You: ${categoryName(a)}. House: ${categoryName(b)}.`;
    return pkSettle(pid, g, a > b ? 'player' : a < b ? 'bot' : 'split', note);
  }
  function pkNextStreet(pid, g) { // after a street's betting closes
    g.facing = 0; g.raised = false; g.street++;
    if (g.street >= 4) return pkShowdown(pid, g);
    g.board.push(...(g.street === 1 ? [g.deck.pop(), g.deck.pop(), g.deck.pop()] : [g.deck.pop()]));
    return pkView(g, false);
  }
  function pkBotReply(pid, g, kind) { // kind: 'check' | 'bet' | 'raise' by the player
    const u = g.u, pot = (g.pC + g.bC) / u;
    if (kind === 'check') {
      const a = botAct({ hole: g.bot, board: g.board, facing: 0, canRaise: true, potUnits: pot });
      if (a === 'bet') { g.bC += 2 * u; g.facing = 2 * u; g.raised = false; return pkView(g, false); }
      return pkNextStreet(pid, g);
    }
    const facing = kind === 'bet' ? 2 : 2; // the player's bet / raise the bot must meet (units)
    const a = botAct({ hole: g.bot, board: g.board, facing, canRaise: kind === 'bet', potUnits: pot });
    if (a === 'fold') { g.bC += 0; return pkSettle(pid, g, 'player', 'The house folds.'); }
    if (a === 'raise' && kind === 'bet') { g.bC += 2 * u + 2 * u; g.facing = 2 * u; g.raised = true; return pkView(g, false); } // call 2u and raise 2u: the player may call or fold
    g.bC += 2 * u; return pkNextStreet(pid, g);
  }
  function pokerDeal(pid, stake) {
    if (pk.has(pid)) throw err('Finish your current hand first.', 409);
    stake = Number(stake); if (!Number.isSafeInteger(stake) || stake < LIMITS.min || stake > PK_MAX_UNIT) throw err(`Ante must be between ¤${LIMITS.min / 100} and ¤${PK_MAX_UNIT / 100}.`);
    if (ledger.balance(player(pid)) < stake * 17) throw err('You are currently liquidity-constrained for this allocation.', 402);
    solvent(0, stake * 17);
    const deck = newDeck(), g = { at: Date.now(), id: nextId(), deck, hole: [deck.pop(), deck.pop()], bot: [deck.pop(), deck.pop()], board: [], street: 0, pC: 0, bC: stake, u: stake, facing: 0, raised: false, done: false, adds: 0 };
    pkAdd(pid, g, stake); pk.set(pid, g);
    return pkView(g, false);
  }
  function pokerAct(pid, action) {
    const g = pk.get(pid); if (!g) throw err('No hand in play.', 409);
    const u = g.u;
    if (action === 'fold') return pkSettle(pid, g, 'bot', 'You folded.');
    if (g.facing > 0) { // the bot has bet
      if (action === 'call') { pkAdd(pid, g, g.facing); return pkNextStreet(pid, g); }
      if (action === 'raise' && !g.raised) { pkAdd(pid, g, g.facing + 2 * u); const r = pkBotReply(pid, g, 'raise'); return r; }
      throw err('Call, raise or fold.', 409);
    }
    if (action === 'check') return pkBotReply(pid, g, 'check');
    if (action === 'bet') { pkAdd(pid, g, 2 * u); return pkBotReply(pid, g, 'bet'); }
    throw err('Check, bet or fold.', 409);
  }
  const pokerState = (pid) => { const g = pk.get(pid); return g ? pkView(g, false) : null; };
  const bjState = (pid) => { const g = bj.get(pid); return g ? bjView(g, false) : null; };

  return { slots, baccarat, craps, bjDeal, bjAct, bjState, pokerDeal, pokerAct, pokerState, sweep, LIMITS };
}
