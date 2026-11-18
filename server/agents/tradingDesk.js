// Trading Floor key agents. Each tick:
//   1. Quant: code builds the signal table from real daily bars; the Quant LLM may tilt up to 5 scores
//      (clamped ±0.5) and writes the research note.
//   2. Two rival trading desks, each on its own model (llm.js ROUTES: Desk A = Claude, Desk B = Gemini),
//      each running its own sleeve (half the book). They see their own sleeve, the signals, their rule-book
//      baseline and the rival desk's scoreline, and propose orders. Both think in parallel.
//   3. Risk Officer: hard limits in code first (anything breaking them is rejected), then the Risk Officer
//      LLM reviews the survivors and may only VETO (never add or enlarge). Survivors execute.
// Without a key every step falls back to its rule book. Every order and fill records which model made it,
// so the Model League can score Claude against Gemini. Everything is public: positions, fills, reports.
import { DEPT } from '../ledger.js';
import { SYMBOLS, NAME } from '../market/data.js';
import { features, zscore, covariance, logReturns } from '../market/indicators.js';
import { marketStatus } from '../time.js';
import { nullFeed } from './feed.js';

const OWNER = DEPT.trading;
export const TRADERS = ['head_trader', 'co_head_trader'];
const SHARE = { head_trader: 0.5, co_head_trader: 0.5 }; // sleeve = this share of the book's NAV
const STYLE = {
  head_trader: { desk: 'Desk A', key: 'score', label: 'momentum', brief: 'Your style is MOMENTUM: ride the strongest 6- and 3-month trends, cut laggards fast.' },
  co_head_trader: { desk: 'Desk B', key: 'scoreB', label: 'defensive quality', brief: 'Your style is DEFENSIVE QUALITY: low volatility, steady trends, buy oversold names that are still above their 200-day average.' },
};
const LIMITS = { maxWeight: 0.2, maxInvested: 0.95, targetInvestedRiskOn: 0.85, targetInvestedRiskOff: 0.5, picks: 7, rebalanceBand: 0.015, staleMs: 3600_000, maxOrders: 10 };
const pct = (x, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const money = (m) => `¤${(m / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const BANNED_NOTE = 'Never use the words casino, gambling, gamble, jackpot, rigged.';

const traderSystem = (agent) => `You are the ${agent === 'head_trader' ? 'Head Trader (Managing Director, Global Equities, Desk A)' : 'Co-Head Trader (Co-Managing Director, Global Equities, Desk B)'} of a satirically over-confident, absurdly luxurious financial firm.
You run YOUR OWN SLEEVE of the firm's US equity book with FAKE money against REAL delayed market prices. The book is shown live to the public.
A rival desk runs the other sleeve on the same signals; the firm publishes a league table of both desks. You intend to win it.
${STYLE[agent].brief}

Each tick you receive JSON state: your sleeve (allocation, cash, positions with P&L), the firm-level book, the Quant's signal table built
from real daily bars (momentum score, defensive score, returns, trend, RSI, volatility), the market regime, a baseline rebalance from
your desk's rule book, the rival desk's scoreline, and any of your orders the Risk Officer rejected since your last tick (with reasons).

Decide the orders to send now. Rules (the Risk Officer enforces them in code and will reject violations):
- Long only, whole shares, symbols only from the signal table. You may only sell shares your own sleeve holds.
- Max 20% of your sleeve in one name after the trade; firm-wide max 20% of NAV per name and 95% invested; one working order per symbol.
- Buys need enough cash in your sleeve. At most ${LIMITS.maxOrders} orders per tick. It is fine to send no orders.

Write the "memo" as a polished, deluded investment-bank desk note (2-4 sentences, max 70 words): straight corporate face, loud
finance-excess confidence, a little trash talk about the rival desk, numbers taken ONLY from the state (never invent prices, news or events).
${BANNED_NOTE} Each order needs a one-sentence rationale citing the signal numbers.`;

const TRADER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['actions', 'memo', 'conviction'],
  properties: {
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'side', 'qty', 'rationale'],
      properties: { symbol: { type: 'string' }, side: { type: 'string', enum: ['buy', 'sell'] }, qty: { type: 'integer' }, rationale: { type: 'string' } } } },
    memo: { type: 'string' },
    conviction: { type: 'string', enum: ['low', 'medium', 'high', 'unreasonably high'] },
  },
};

const QUANT_SYSTEM = `You are the Quant (Head of Systematic Alpha) of a satirically over-confident luxury financial firm's equity desk.
Code has already built the signal table from real daily bars. You may apply a discretionary "tilt" to at most 5 names: a number between
-0.5 and +0.5 added to their scores, each with a one-sentence reason grounded ONLY in the numbers in the table (e.g. RSI extremes,
trend vs volatility). Tilting nothing is acceptable. Then write "note": a 2-3 sentence research note (max 60 words), deadpan quant
voice, absurd certainty, numbers only from the state. ${BANNED_NOTE}`;
const QUANT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tilts', 'note'],
  properties: {
    tilts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'tilt', 'reason'], properties: { symbol: { type: 'string' }, tilt: { type: 'number' }, reason: { type: 'string' } } } },
    note: { type: 'string' },
  },
};

const RISK_SYSTEM = `You are the Chief Risk Officer (Equities) of a satirically over-confident luxury financial firm: the only adult in the room.
You receive the firm book, the current 1-day 95% VaR, and the orders both trading desks want to send. Every order has already passed
the hard limits in code. You may VETO orders (by id) with a one-sentence reason citing the numbers (concentration, both desks piling into
the same name, volatility, invested level). You can never add or enlarge orders. Vetoing nothing is acceptable and normal.
Then write "memo": 2-3 sentences (max 60 words), weary, precise, straight corporate face, numbers only from the state. ${BANNED_NOTE}`;
const RISK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['vetoes', 'memo'],
  properties: {
    vetoes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } },
    memo: { type: 'string' },
  },
};

export function createTradingDesk({ db, ledger, market, trading, gateway, llm, bus, feed = nullFeed, research = null, log = console }) {
  let lastTick = 0, running = false;
  const ROOM = 'OT-01';
  const say = (agent, stage, text, o = {}) => feed.emit({ room: ROOM, agent, stage, text, ...o });
  const ordText = (a) => `${String(a.side).toUpperCase()} ${a.qty} ${String(a.symbol).toUpperCase()}`;

  // ---------------------------------------------------------------- Quant (code)
  function quant() {
    const rows = [];
    for (const s of SYMBOLS) {
      const bars = market.bars(s, '1d');
      const f = features(bars);
      const q = market.quote(s);
      if (!f || !q) continue;
      rows.push({ symbol: s, name: NAME[s], price: q.price, day: q.prev_close ? q.price / q.prev_close - 1 : 0, ...f });
    }
    if (rows.length < 8) return null;
    const z6 = zscore(rows, 'ret6m'), z3 = zscore(rows, 'ret3m'), zt = zscore(rows, 'trend50'), zv = zscore(rows, 'vol20');
    for (const r of rows) {
      let score = 0.45 * z6(r) + 0.3 * z3(r) + 0.25 * zt(r) - 0.15 * zv(r);
      if (r.rsi14 > 78) score -= 0.5; // overbought: wait for a pullback
      if (r.rsi14 < 25 && r.above200) score += 0.3; // oversold in an uptrend
      r.score = +score.toFixed(3);
      // Desk B's defensive score: volatility dominates, dips in uptrends are welcome
      let b = 0.25 * z6(r) + 0.15 * z3(r) + 0.15 * zt(r) - 0.45 * zv(r);
      if (r.above200 && r.rsi14 < 40) b += 0.35;
      if (r.above200 === false) b -= 0.4;
      r.scoreB = +b.toFixed(3);
    }
    rows.sort((a, b) => b.score - a.score);
    const spy = rows.find((r) => r.symbol === 'SPY');
    const riskOn = spy ? spy.above200 !== false && spy.trend50 > -0.03 : true;
    return { rows, regime: riskOn ? 'risk-on' : 'risk-off', spy };
  }

  // ---------------------------------------------------------------- sleeves: each desk's share of the book
  /** Replays the desk's own fills (average cost) so each desk has its own positions and P&L. */
  function sleeve(agent, book = trading.portfolio(OWNER)) {
    const pos = new Map();
    let realized = 0, fills = 0, wins = 0, closes = 0;
    for (const t of db.all('SELECT symbol, side, qty, amount FROM trades WHERE owner = ? AND agent = ? ORDER BY id', OWNER, agent)) {
      fills++;
      const p = pos.get(t.symbol) || { qty: 0, cost: 0 };
      if (t.side === 'buy') { p.qty += t.qty; p.cost += t.amount; } else {
        const q = Math.min(t.qty, p.qty), out = p.qty ? Math.round((p.cost * q) / p.qty) : 0;
        const r = t.amount - out; realized += r; if (r !== 0) { closes++; if (r > 0) wins++; } // flat closes are neither
        p.qty -= q; p.cost -= out;
      }
      pos.set(t.symbol, p);
    }
    const pending = book.pending.filter((o) => o.agent === agent);
    const positions = [...pos].filter(([, p]) => p.qty > 0).map(([symbol, p]) => {
      const bp = book.positions.find((x) => x.symbol === symbol);
      const q = market.quote(symbol);
      const price = bp?.price ?? (q ? Math.round(q.price * 100) : Math.round(p.cost / p.qty));
      const value = price * p.qty;
      const reservedQty = pending.filter((o) => o.side === 'sell' && o.symbol === symbol).reduce((s, o) => s + o.qty, 0);
      return { symbol, name: bp?.name || NAME[symbol], qty: p.qty, reservedQty, cost: p.cost, avg: Math.round(p.cost / p.qty), price, value, unrealized: value - p.cost };
    });
    const invested = positions.reduce((s, p) => s + p.value, 0);
    const reserved = pending.filter((o) => o.side === 'buy').reduce((s, o) => s + o.reserved, 0);
    const nav = Math.round(book.nav * (SHARE[agent] || 0));
    const cash = Math.max(0, Math.min(nav - invested - reserved, book.cash));
    const unrealized = positions.reduce((s, p) => s + p.unrealized, 0);
    return { agent, nav, cash, reserved, invested, positions, pending, realized, unrealized, pnl: realized + unrealized, fills, closes, wins };
  }

  // ---------------------------------------------------------------- rule book (baseline / fallback), per desk style
  function baseline(sig, sl, key) {
    const nav = sl.nav;
    const target = new Map();
    const ranked = [...sig.rows].sort((a, b) => b[key] - a[key]);
    const picks = ranked.filter((r) => r[key] > 0).slice(0, LIMITS.picks);
    const investFrac = sig.regime === 'risk-on' ? LIMITS.targetInvestedRiskOn : LIMITS.targetInvestedRiskOff;
    const raw = picks.map((r) => Math.max(r[key], 0.05) / Math.max(r.vol20, 0.12));
    const tot = raw.reduce((s, x) => s + x, 0) || 1;
    picks.forEach((r, i) => target.set(r.symbol, Math.min(LIMITS.maxWeight * 0.9, (raw[i] / tot) * investFrac)));
    const actions = [];
    const working = new Set(sl.pending.map((o) => o.symbol)); // one working order per symbol per desk
    const priceOf = (s) => Math.round(sig.rows.find((r) => r.symbol === s)?.price * 100) || null;
    for (const p of sl.positions) { // sells first: names that dropped out or are over target
      const w = target.get(p.symbol) || 0, cur = p.value / nav;
      const free = p.qty - p.reservedQty;
      if (free <= 0 || working.has(p.symbol)) continue;
      if (cur - w > LIMITS.rebalanceBand) {
        const qty = w === 0 ? free : Math.min(free, Math.floor(((cur - w) * nav) / p.price));
        if (qty > 0) actions.push({ symbol: p.symbol, side: 'sell', qty, rationale: w === 0 ? `Exited: ${key === 'score' ? 'momentum' : 'defensive'} score fell out of the top ${LIMITS.picks}.` : `Trimmed to target weight ${(w * 100).toFixed(1)}%.` });
      }
    }
    let cashLeft = sl.cash; // buys can only use the sleeve's free cash
    for (const [s, w] of target) {
      const pos = sl.positions.find((p) => p.symbol === s);
      const cur = pos ? pos.value / nav : 0;
      const px = priceOf(s);
      if (!px || working.has(s) || w - cur <= LIMITS.rebalanceBand) continue;
      const qty = Math.min(Math.floor(((w - cur) * nav) / px), Math.floor(cashLeft / (px * 1.05)));
      cashLeft -= Math.ceil(Math.max(qty, 0) * px * 1.05);
      const r = sig.rows.find((x) => x.symbol === s);
      if (qty > 0) actions.push({ symbol: s, side: 'buy', qty, rationale: `Score ${r[key]} (6m ${pct(r.ret6m)}, trend ${pct(r.trend50)}, RSI ${r.rsi14?.toFixed(0)}, vol ${(r.vol20 * 100).toFixed(0)}%); target ${(w * 100).toFixed(1)}%.` });
    }
    return actions;
  }

  // ---------------------------------------------------------------- Risk Officer: hard limits (code)
  function validate(agent, a, book, sl) {
    const symbol = String(a.symbol || '').toUpperCase();
    const qty = Number(a.qty);
    if (!SYMBOLS.includes(symbol)) throw new Error('symbol not on the approved list');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('quantity must be a positive whole number');
    if (a.side !== 'buy' && a.side !== 'sell') throw new Error('side must be buy or sell');
    const q = market.quote(symbol);
    if (!q) throw new Error('no price');
    if (marketStatus().open && Date.now() - q.as_of > LIMITS.staleMs) throw new Error('price is stale (> 1 h) while the market is open');
    if (sl.pending.some((o) => o.symbol === symbol)) throw new Error('this desk already has a working order in that name');
    const px = Math.round(q.price * 100), value = px * qty;
    let spend = 0;
    if (a.side === 'buy') {
      const own = sl.positions.find((p) => p.symbol === symbol)?.value || 0;
      const firm = book.positions.find((p) => p.symbol === symbol)?.value || 0;
      const pendingBuys = book.pending.filter((o) => o.side === 'buy').reduce((s, o) => s + o.reserved, 0);
      if ((own + value) / sl.nav > LIMITS.maxWeight) throw new Error(`would exceed the ${LIMITS.maxWeight * 100}% single-name limit for the sleeve`);
      if ((firm + value) / book.nav > LIMITS.maxWeight) throw new Error(`would exceed the firm-wide ${LIMITS.maxWeight * 100}% single-name limit`);
      if ((book.invested + pendingBuys + value) / book.nav > LIMITS.maxInvested) throw new Error(`would exceed the ${LIMITS.maxInvested * 100}% invested limit`);
      spend = Math.ceil(value * 1.05);
      if (spend > sl.cash) throw new Error('insufficient cash in the sleeve');
      if (ledger.balance(OWNER) < spend) throw new Error('insufficient cash in the book');
    } else {
      const p = sl.positions.find((x) => x.symbol === symbol);
      if (!p || p.qty - p.reservedQty < qty) throw new Error('the sleeve does not hold enough unreserved shares');
    }
    gateway.check(agent, 'PLACE_TRADE', spend); // privileges and daily caps (throws)
    return { symbol, qty, side: a.side, spend, value };
  }

  function execute(agent, a, model) {
    const book = trading.portfolio(OWNER), sl = sleeve(agent, book);
    const v = validate(agent, a, book, sl);
    const commit = gateway.check(agent, 'PLACE_TRADE', v.spend);
    return db.tx(() => {
      const order = trading.placeOrder(OWNER, { symbol: v.symbol, side: v.side, qty: v.qty, type: 'market' }, { agent, rationale: a.rationale, actor: `agent:${agent}`, model });
      commit();
      return order;
    });
  }

  function var95(book) {
    const held = book.positions.filter((p) => p.value > 0);
    if (!held.length) return { var95: 0, vol: 0 };
    const series = held.map((p) => logReturns(market.bars(p.symbol, '1d').map((b) => b[4])));
    const cov = covariance(series, 60);
    const w = held.map((p) => p.value / book.nav);
    let v = 0; for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) v += w[i] * w[j] * cov[i][j];
    const sd = Math.sqrt(Math.max(v, 0));
    return { var95: Math.round(1.645 * sd * book.nav), vol: sd * Math.sqrt(252) };
  }

  const scoreline = (s) => ({ allocation: s.nav / 100, pnl: s.pnl / 100, realized: s.realized / 100, unrealized: s.unrealized / 100, positions: s.positions.length, fills: s.fills });

  // ---------------------------------------------------------------- one desk's decision
  async function decideDesk(agent, sig, book, ms, minBreaker) {
    const sl = sleeve(agent, book);
    const rival = sleeve(TRADERS.find((a) => a !== agent), book);
    const key = STYLE[agent].key;
    const proposal = baseline(sig, sl, key);
    const rejections = gateway.recentRejections(agent, lastTick || Date.now() - 86400_000);
    const state = {
      now: new Date().toISOString(), market: ms.open ? 'OPEN (orders fill at the next delayed price)' : `CLOSED (orders queue until ${ms.nextOpen ? new Date(ms.nextOpen).toISOString() : 'next open'})`,
      yourSleeve: { allocation: sl.nav / 100, cash: sl.cash / 100, invested: sl.invested / 100, realized: sl.realized / 100, unrealized: sl.unrealized / 100,
        positions: sl.positions.map((p) => ({ symbol: p.symbol, qty: p.qty, avg: p.avg / 100, price: p.price / 100, value: p.value / 100, unrealized: p.unrealized / 100, weight: +(p.value / Math.max(sl.nav, 1)).toFixed(3) })),
        workingOrders: sl.pending.map((o) => ({ symbol: o.symbol, side: o.side, qty: o.qty })) },
      firm: { nav: book.nav / 100, cash: book.cash / 100, investedPct: +((book.invested / Math.max(book.nav, 1)) * 100).toFixed(1) },
      rivalDesk: { name: STYLE[TRADERS.find((a) => a !== agent)].desk, ...scoreline(rival) },
      regime: sig.regime,
      signals: sig.rows.slice(0, 18).map((r) => ({ symbol: r.symbol, price: +r.price.toFixed(2), momentum: r.score, defensive: r.scoreB, ret1m: +(r.ret1m * 100).toFixed(1), ret6m: +(r.ret6m * 100).toFixed(1), trend50: +(r.trend50 * 100).toFixed(1), rsi14: +(r.rsi14 || 0).toFixed(0), vol20: +(r.vol20 * 100).toFixed(0), quantTilt: r.tilt || 0 })),
      baseline: proposal, rejectedSinceLastTick: rejections.map((r) => ({ ...r.action, reason: r.reason })),
    };
    const out = await feed.think({ room: ROOM, agent, text: 'Drafting orders' }, () => llm.ask({ job: 'tick', agent, system: traderSystem(agent), user: JSON.stringify(state), schema: TRADER_SCHEMA, maxTokens: 2500, minBreaker }));
    if (out && Array.isArray(out.data.actions)) return { agent, actions: out.data.actions.slice(0, LIMITS.maxOrders), memo: out.data.memo, conviction: out.data.conviction, model: out.model, sl };
    return { agent, actions: proposal, memo: null, conviction: 'high', model: null, sl };
  }

  // ---------------------------------------------------------------- one tick
  async function tick({ reason = 'scheduled' } = {}) {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const sig = quant();
      if (!sig) return { skipped: 'waiting for market data' };
      let book = trading.portfolio(OWNER);
      if (book.nav <= 0) return { skipped: 'awaiting budget delivery' };
      const ms = marketStatus();
      const minBreaker = ms.open ? 2 : 1;

      // 1. Quant: code signals, LLM tilts + note
      const q = await feed.think({ room: ROOM, agent: 'quant', text: 'Reading the signal table' }, () => llm.ask({ job: 'quant_note', agent: 'quant', system: QUANT_SYSTEM, schema: QUANT_SCHEMA, maxTokens: 900, minBreaker,
        user: JSON.stringify({ regime: sig.regime, spyTrend50: sig.spy?.trend50, signals: sig.rows.slice(0, 20).map((r) => ({ symbol: r.symbol, momentum: r.score, defensive: r.scoreB, ret6m: +(r.ret6m * 100).toFixed(1), trend50: +(r.trend50 * 100).toFixed(1), rsi14: +(r.rsi14 || 0).toFixed(0), vol20: +(r.vol20 * 100).toFixed(0), above200: r.above200 })) }) }));
      const tilts = [];
      for (const t of (q?.data.tilts || []).slice(0, 5)) {
        const r = sig.rows.find((x) => x.symbol === String(t.symbol).toUpperCase());
        const tilt = Math.max(-0.5, Math.min(0.5, Number(t.tilt) || 0));
        if (!r || !tilt) continue;
        r.tilt = tilt; r.score = +(r.score + tilt).toFixed(3); r.scoreB = +(r.scoreB + tilt).toFixed(3);
        tilts.push({ symbol: r.symbol, tilt, reason: String(t.reason || '').slice(0, 200) });
      }
      // off-hours research may nudge the NEXT-OPEN signals through the same clamped tilt (agents propose, the server disposes)
      for (const t of research?.openTilts() || []) {
        const r = sig.rows.find((x) => x.symbol === t.symbol);
        if (!r) continue;
        const total = Math.max(-0.5, Math.min(0.5, (r.tilt || 0) + t.tilt)), add = total - (r.tilt || 0);
        if (!add) continue;
        r.tilt = total; r.score = +(r.score + add).toFixed(3); r.scoreB = +(r.scoreB + add).toFixed(3);
        tilts.push({ symbol: r.symbol, tilt: add, reason: `Overnight research: ${t.reason}`.slice(0, 200), source: 'research' });
      }
      sig.rows.sort((a, b) => b.score - a.score);
      for (const t of tilts) say('quant', 'signal', `${t.symbol} ${t.tilt > 0 ? '+' : ''}${t.tilt.toFixed(2)} tilt: ${t.reason}`, { model: q?.model || null, ref: `tilt:${t.symbol}`, data: { symbol: t.symbol, tilt: t.tilt } });
      say('quant', 'signal', q?.data.note || `Signal refresh: ${sig.regime.toUpperCase()}, ${sig.rows.length} names scored.`, { model: q?.model || null, ref: 'note', data: { regime: sig.regime, top: sig.rows.slice(0, 5).map((r) => ({ symbol: r.symbol, score: r.score })) } });
      const top = sig.rows.slice(0, 5).map((r) => `${r.symbol} ${r.score}`).join(', ');
      gateway.report('quant', q?.data.note || `Signal refresh across ${sig.rows.length} names. Regime: ${sig.regime.toUpperCase()} (SPY ${pct(sig.spy?.trend50 || 0)} vs 50-day). Top momentum scores: ${top}. The model has never been more certain, which is also what it said last time.`,
        { regime: sig.regime, tilts, signals: sig.rows.slice(0, 30).map(({ symbol, name, price, day, score, scoreB, tilt, ret1m, ret3m, ret6m, trend50, rsi14, vol20, z20 }) => ({ symbol, name, price, day, score, scoreB, tilt: tilt || 0, ret1m, ret3m, ret6m, trend50, rsi14, vol20, z20 })) },
        q?.model || false);

      // 2. both desks decide in parallel
      const desks = await Promise.all(TRADERS.map((a) => decideDesk(a, sig, book, ms, minBreaker)));

      for (const d of desks) {
        d.actions.forEach((a, i) => say(d.agent, 'proposal', `${ordText(a)} — ${a.rationale || 'no reason given'}`, { model: d.model, ref: `${d.agent}:${i}`, data: { desk: STYLE[d.agent].desk, symbol: String(a.symbol).toUpperCase(), side: a.side, qty: a.qty, rationale: String(a.rationale || '').slice(0, 400) } }));
        say(d.agent, 'proposal', d.memo || `${STYLE[d.agent].desk}: ${d.actions.length ? d.actions.length + ' order(s) proposed' : 'no orders this tick'}.`, { model: d.model, ref: 'memo', data: { desk: STYLE[d.agent].desk, kind: 'memo', conviction: d.conviction, orders: d.actions.length } });
      }
      // 3a. hard limits (code)
      const results = Object.fromEntries(TRADERS.map((a) => [a, []]));
      const survivors = [];
      for (const d of desks) {
        d.actions.forEach((a, i) => {
          try { const v = validate(d.agent, a, book, d.sl); survivors.push({ id: `${d.agent}:${i}`, agent: d.agent, desk: STYLE[d.agent].desk, a, v }); }
          catch (e) { gateway.reject(d.agent, a, e.message); results[d.agent].push({ ...a, ok: false, reason: e.message }); say('risk_officer', 'result', `REJECTED ${ordText(a)}: ${e.message}`, { model: null, outcome: 'rejected', ref: `${d.agent}:${i}`, data: { desk: STYLE[d.agent].desk, symbol: String(a.symbol).toUpperCase(), side: a.side, qty: a.qty, reason: e.message } }); }
        });
      }
      // 3b. Risk Officer LLM review: veto only
      const riskBefore = var95(book);
      let vetoes = new Map(), riskMemo = null, riskModel = false;
      if (survivors.length || llm.enabled()) {
        const r = await feed.think({ room: ROOM, agent: 'risk_officer', text: 'Reviewing orders' }, () => llm.ask({ job: 'risk_review', agent: 'risk_officer', system: RISK_SYSTEM, schema: RISK_SCHEMA, maxTokens: 900, minBreaker,
          user: JSON.stringify({ firm: { nav: book.nav / 100, cash: book.cash / 100, investedPct: +((book.invested / book.nav) * 100).toFixed(1), var95: riskBefore.var95 / 100, annualVolPct: +(riskBefore.vol * 100).toFixed(1),
            positions: book.positions.map((p) => ({ symbol: p.symbol, weightPct: +((p.value / book.nav) * 100).toFixed(1) })) },
            orders: survivors.map((s) => ({ id: s.id, desk: s.desk, symbol: s.v.symbol, side: s.v.side, qty: s.v.qty, value: s.v.value / 100, rationale: s.a.rationale })) }) }));
        if (r) {
          riskMemo = r.data.memo; riskModel = r.model;
          for (const v of r.data.vetoes || []) if (survivors.some((s) => s.id === v.id)) vetoes.set(v.id, String(v.reason || 'vetoed').slice(0, 200));
        }
      }
      say('risk_officer', 'review', riskMemo || `${survivors.length} order(s) within hard limits${llm.enabled() ? '' : '; rule book review, nothing to veto'}.`, { model: riskModel || null, ref: 'memo', data: { reviewed: survivors.length, vetoes: vetoes.size } });
      // 3c. execute survivors (sells first so freed cash is visible), re-checked against the live book
      survivors.sort((x, y) => (x.v.side === 'sell' ? 0 : 1) - (y.v.side === 'sell' ? 0 : 1));
      for (const s of survivors) {
        const d = desks.find((x) => x.agent === s.agent);
        if (vetoes.has(s.id)) { const reason2 = `Risk Officer veto: ${vetoes.get(s.id)}`; gateway.reject(s.agent, s.a, reason2); results[s.agent].push({ ...s.a, ok: false, reason: reason2 }); say('risk_officer', 'veto', `VETO ${ordText(s.a)}: ${vetoes.get(s.id)}`, { model: riskModel || null, outcome: 'vetoed', ref: s.id, data: { desk: s.desk, deskAgent: s.agent, symbol: s.v.symbol, side: s.v.side, qty: s.v.qty, reason: vetoes.get(s.id) } }); continue; }
        try { const o = execute(s.agent, s.a, d.model || 'rules'); results[s.agent].push({ ...s.a, ok: true, orderId: o.id }); say('risk_officer', 'execute', `CLEARED ${ordText(s.a)} (order #${o.id})`, { model: riskModel || null, outcome: 'cleared', ref: s.id, data: { desk: s.desk, deskAgent: s.agent, symbol: s.v.symbol, side: s.v.side, qty: s.v.qty, orderId: o.id } }); }
        catch (e) { gateway.reject(s.agent, s.a, e.message); results[s.agent].push({ ...s.a, ok: false, reason: e.message }); say('risk_officer', 'result', `REJECTED ${ordText(s.a)}: ${e.message}`, { outcome: 'rejected', ref: s.id, data: { desk: s.desk, symbol: s.v.symbol, side: s.v.side, qty: s.v.qty, reason: e.message } }); }
      }
      book = trading.portfolio(OWNER);

      // reports
      for (const d of desks) {
        const placed = results[d.agent].filter((r) => r.ok), sl = sleeve(d.agent, book);
        const memo = d.memo || (placed.length
          ? `${STYLE[d.agent].desk} deployed conviction into ${placed.map((r) => `${r.side === 'buy' ? '+' : '−'}${r.qty} ${r.symbol}`).join(', ')}. Sleeve P&L ${money(sl.pnl)}. ${sig.regime === 'risk-on' ? 'Momentum is our friend and we are extremely loyal.' : 'Defensive posture adopted; champagne remains on ice.'}`
          : `${STYLE[d.agent].desk}: no orders this tick, the sleeve already reflects our view. P&L ${money(sl.pnl)} across ${sl.positions.length} names. Conviction remains ${d.conviction}.`);
        gateway.report(d.agent, memo, { reason, orders: results[d.agent], conviction: d.conviction, market: ms.open ? 'open' : 'closed', style: STYLE[d.agent].label }, d.model || false);
      }
      const risk = var95(book);
      const top1 = [...book.positions].sort((a, b) => b.value - a.value)[0];
      const rejected = Object.values(results).flat().filter((r) => !r.ok);
      gateway.report('risk_officer', riskMemo || `1-day 95% VaR ${money(risk.var95)} (${((risk.var95 / book.nav) * 100).toFixed(2)}% of NAV), annualised vol ${(risk.vol * 100).toFixed(1)}%. Invested ${((book.invested / book.nav) * 100).toFixed(0)}% of NAV${top1 ? `; largest line ${top1.symbol} at ${((top1.value / book.nav) * 100).toFixed(1)}%` : ''}. ${rejected.length ? `Blocked ${rejected.length} order(s): ${rejected.map((r) => `${r.symbol} — ${r.reason}`).join('; ')}.` : 'All orders within limits. I remain the only adult in the room.'}`,
        { var95: risk.var95, vol: risk.vol, invested: book.invested / book.nav, rejected, vetoes: [...vetoes].map(([id, why]) => ({ id, why })) }, riskModel);

      lastTick = Date.now();
      const placedN = Object.values(results).flat().filter((r) => r.ok).length;
      bus.emit('firm', { type: 'tick', placed: placedN, at: lastTick });
      feed.status(ROOM, { nextAt: lastTick + intervalMs(), mode: ms.open ? 'trading' : 'research', market: ms.open ? 'open' : 'closed', lastTickAt: lastTick, label: 'Next desk decision' });
      return { ok: true, usedLLM: desks.some((d) => d.model), placed: placedN, rejected: rejected.length, desks: desks.map((d) => ({ agent: d.agent, model: d.model || 'rules' })) };
    } finally { running = false; }
  }

  /** public per-desk scoreline for dashboards and the Model League */
  function sleeves() {
    const book = trading.portfolio(OWNER);
    return TRADERS.map((agent) => {
      const s = sleeve(agent, book);
      return { agent, desk: STYLE[agent].desk, style: STYLE[agent].label, route: llm.route(agent), nav: s.nav, cash: s.cash, invested: s.invested, realized: s.realized, unrealized: s.unrealized, pnl: s.pnl,
        fills: s.fills, closes: s.closes, wins: s.wins, positions: s.positions };
    });
  }

  const intervalMs = () => (marketStatus().open ? 15 : 60) * 60_000 * (llm.breaker() >= 1 ? 2 : 1);
  return { tick, intervalMs, quant, sleeves, sleeve, OWNER, lastTick: () => lastTick };
}
