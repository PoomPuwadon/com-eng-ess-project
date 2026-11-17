// Trading Floor key agents: Quant (systematic signals, code), Head Trader (decides; LLM when a key is
// configured, otherwise a deterministic rule book), Risk Officer (hard limits + parametric VaR, code).
// Everything they do is public: positions, orders, fills with rationale, and their reports.
import { DEPT } from '../ledger.js';
import { SYMBOLS, NAME } from '../market/data.js';
import { features, zscore, covariance, logReturns } from '../market/indicators.js';
import { marketStatus } from '../time.js';

const OWNER = DEPT.trading;
const LIMITS = { maxWeight: 0.2, maxInvested: 0.95, targetInvestedRiskOn: 0.85, targetInvestedRiskOff: 0.5, picks: 7, rebalanceBand: 0.015, staleMs: 3600_000 };
const pct = (x, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const money = (m) => `¤${(m / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const SYSTEM = `You are the Head Trader (Managing Director, Global Equities) of a satirically over-confident, absurdly luxurious financial firm.
You run the firm's US equity book with FAKE money against REAL delayed market prices. The book is shown live to the public.

Each tick you receive JSON state: the book (cash, NAV, positions with P&L), the Quant's ranked signal table built from real daily bars
(momentum, trend, RSI, volatility, composite score), the market regime, a baseline rebalance proposal from the rule book, and any
orders the Risk Officer rejected since your last tick (with reasons).

Decide the orders to send now. Rules you must respect (the Risk Officer enforces them in code and will reject violations):
- Long only, whole shares, symbols only from the signal table.
- Max 20% of NAV in one name after the trade; max 95% of NAV invested; one working order per symbol.
- Buys need enough cash in the book. You may send at most 10 orders per tick.
- It is fine to send no orders. Prefer the baseline unless you have a specific reason grounded in the numbers.

Write the "memo" as a polished, deluded investment-bank desk note (2-4 sentences, max 70 words): straight corporate face,
loud finance-excess confidence, numbers taken ONLY from the state (never invent prices, news, or events).
Never use the words casino, gambling, gamble, jackpot, rigged. Each order needs a one-sentence rationale citing the signal numbers.`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['actions', 'memo', 'conviction'],
  properties: {
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'side', 'qty', 'rationale'],
      properties: { symbol: { type: 'string' }, side: { type: 'string', enum: ['buy', 'sell'] }, qty: { type: 'integer' }, rationale: { type: 'string' } } } },
    memo: { type: 'string' },
    conviction: { type: 'string', enum: ['low', 'medium', 'high', 'unreasonably high'] },
  },
};

export function createTradingDesk({ db, ledger, market, trading, gateway, llm, bus, log = console }) {
  let lastTick = 0, running = false;

  // ---------------------------------------------------------------- Quant
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
    }
    rows.sort((a, b) => b.score - a.score);
    const spy = rows.find((r) => r.symbol === 'SPY');
    const riskOn = spy ? spy.above200 !== false && spy.trend50 > -0.03 : true;
    return { rows, regime: riskOn ? 'risk-on' : 'risk-off', spy };
  }

  // ---------------------------------------------------------------- rule book (baseline / fallback)
  function baseline(sig, book) {
    const nav = book.nav;
    const target = new Map();
    const picks = sig.rows.filter((r) => r.score > 0).slice(0, LIMITS.picks);
    const investFrac = sig.regime === 'risk-on' ? LIMITS.targetInvestedRiskOn : LIMITS.targetInvestedRiskOff;
    const raw = picks.map((r) => Math.max(r.score, 0.05) / Math.max(r.vol20, 0.12));
    const tot = raw.reduce((s, x) => s + x, 0) || 1;
    picks.forEach((r, i) => target.set(r.symbol, Math.min(LIMITS.maxWeight * 0.9, (raw[i] / tot) * investFrac)));
    const actions = [];
    const working = new Set(book.pending.map((o) => o.symbol)); // one working order per symbol
    const priceOf = (s) => Math.round(sig.rows.find((r) => r.symbol === s)?.price * 100) || null;
    // sells first: names that dropped out of the picks or are over target
    for (const p of book.positions) {
      const w = target.get(p.symbol) || 0, cur = p.value / nav;
      const free = p.qty - p.reservedQty;
      if (free <= 0 || working.has(p.symbol)) continue;
      if (cur - w > LIMITS.rebalanceBand) {
        const qty = w === 0 ? free : Math.min(free, Math.floor(((cur - w) * nav) / p.price));
        if (qty > 0) actions.push({ symbol: p.symbol, side: 'sell', qty, rationale: w === 0 ? `Exited: composite score fell out of the top ${LIMITS.picks}.` : `Trimmed to target weight ${(w * 100).toFixed(1)}%.` });
      }
    }
    let cashLeft = book.cash; // buys can only use free cash (pending sells release theirs on fill)
    for (const [s, w] of target) {
      const pos = book.positions.find((p) => p.symbol === s);
      const cur = pos ? pos.value / nav : 0;
      const px = priceOf(s);
      if (!px || working.has(s) || w - cur <= LIMITS.rebalanceBand) continue;
      const qty = Math.min(Math.floor(((w - cur) * nav) / px), Math.floor(cashLeft / (px * 1.05)));
      cashLeft -= Math.ceil(Math.max(qty, 0) * px * 1.05);
      const r = sig.rows.find((x) => x.symbol === s);
      if (qty > 0) actions.push({ symbol: s, side: 'buy', qty, rationale: `Score ${r.score} (6m ${pct(r.ret6m)}, trend ${pct(r.trend50)}, RSI ${r.rsi14?.toFixed(0)}); target ${(w * 100).toFixed(1)}%.` });
    }
    return actions;
  }

  // ---------------------------------------------------------------- Risk Officer: hard limits, then execution
  function execute(agent, a, sig, book) {
    const symbol = String(a.symbol || '').toUpperCase();
    const qty = Number(a.qty);
    if (!SYMBOLS.includes(symbol)) throw new Error('symbol not on the approved list');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('quantity must be a positive whole number');
    const q = market.quote(symbol);
    if (!q) throw new Error('no price');
    const ms = marketStatus();
    if (ms.open && Date.now() - q.as_of > LIMITS.staleMs) throw new Error('price is stale (> 1 h) while the market is open');
    const px = Math.round(q.price * 100), value = px * qty;
    let spend = 0;
    if (a.side === 'buy') {
      const pos = book.positions.find((p) => p.symbol === symbol);
      const pendingBuys = book.pending.filter((o) => o.side === 'buy').reduce((s, o) => s + o.reserved, 0);
      if (((pos?.value || 0) + value) / book.nav > LIMITS.maxWeight) throw new Error(`would exceed the ${LIMITS.maxWeight * 100}% single-name limit`);
      if ((book.invested + pendingBuys + value) / book.nav > LIMITS.maxInvested) throw new Error(`would exceed the ${LIMITS.maxInvested * 100}% invested limit`);
      spend = Math.ceil(value * 1.05);
      if (ledger.balance(OWNER) < spend) throw new Error('insufficient cash in the book');
    } else if (a.side !== 'sell') throw new Error('side must be buy or sell');
    const commit = gateway.check(agent, 'PLACE_TRADE', spend);
    return db.tx(() => {
      const order = trading.placeOrder(OWNER, { symbol, side: a.side, qty, type: 'market' }, { agent, rationale: a.rationale, actor: `agent:${agent}` });
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
      const top = sig.rows.slice(0, 5).map((r) => `${r.symbol} ${r.score}`).join(', ');
      gateway.report('quant', `Signal refresh across ${sig.rows.length} names. Regime: ${sig.regime.toUpperCase()} (SPY ${pct(sig.spy?.trend50 || 0)} vs 50-day). Top composite scores: ${top}. The model has never been more certain, which is also what it said last time.`,
        { regime: sig.regime, signals: sig.rows.slice(0, 30).map(({ symbol, name, price, day, score, ret1m, ret3m, ret6m, trend50, rsi14, vol20, z20 }) => ({ symbol, name, price, day, score, ret1m, ret3m, ret6m, trend50, rsi14, vol20, z20 })) });

      const proposal = baseline(sig, book);
      const rejections = gateway.recentRejections('head_trader', lastTick || Date.now() - 86400_000);
      let actions = proposal, memo = null, conviction = 'high', usedLLM = false;
      const state = {
        now: new Date().toISOString(), market: ms.open ? 'OPEN (orders fill at the next delayed price)' : `CLOSED (orders queue until ${ms.nextOpen ? new Date(ms.nextOpen).toISOString() : 'next open'})`,
        book: { cash: book.cash / 100, nav: book.nav / 100, invested: book.invested / 100, realized: book.realized / 100,
          positions: book.positions.map((p) => ({ symbol: p.symbol, qty: p.qty, avg: p.avg / 100, price: p.price / 100, value: p.value / 100, unrealized: p.unrealized / 100, weight: +(p.value / book.nav).toFixed(3) })),
          workingOrders: book.pending.map((o) => ({ symbol: o.symbol, side: o.side, qty: o.qty })) },
        regime: sig.regime,
        signals: sig.rows.slice(0, 18).map((r) => ({ symbol: r.symbol, price: +r.price.toFixed(2), score: r.score, ret1m: +(r.ret1m * 100).toFixed(1), ret6m: +(r.ret6m * 100).toFixed(1), trend50: +(r.trend50 * 100).toFixed(1), rsi14: +(r.rsi14 || 0).toFixed(0), vol20: +(r.vol20 * 100).toFixed(0) })),
        baseline: proposal, rejectedSinceLastTick: rejections.map((r) => ({ ...r.action, reason: r.reason })),
      };
      const out = await llm.json({ job: 'tick', agent: 'head_trader', system: SYSTEM, user: JSON.stringify(state), schema: SCHEMA, maxTokens: 2500, minBreaker: ms.open ? 2 : 1 });
      if (out && Array.isArray(out.actions)) { actions = out.actions.slice(0, 10); memo = out.memo; conviction = out.conviction; usedLLM = true; }

      const results = [];
      for (const a of actions) {
        try { const o = execute('head_trader', a, sig, book); results.push({ ...a, ok: true, orderId: o.id }); book = trading.portfolio(OWNER); } catch (e) {
          gateway.reject('head_trader', a, e.message); results.push({ ...a, ok: false, reason: e.message });
        }
      }
      const placed = results.filter((r) => r.ok);
      memo ||= placed.length
        ? `Deployed conviction into ${placed.map((r) => `${r.side === 'buy' ? '+' : '−'}${r.qty} ${r.symbol}`).join(', ')}. NAV ${money(book.nav)}, realised ${money(book.realized)}. ${sig.regime === 'risk-on' ? 'Momentum is our friend and we are extremely loyal.' : 'Defensive posture adopted; champagne remains on ice.'}`
        : `No orders this tick: the book already reflects our view. NAV ${money(book.nav)} across ${book.positions.length} names. Conviction remains ${conviction}.`;
      gateway.report('head_trader', memo, { reason, orders: results, conviction, market: ms.open ? 'open' : 'closed' }, usedLLM);

      const risk = var95(book);
      const top1 = [...book.positions].sort((a, b) => b.value - a.value)[0];
      const rejected = results.filter((r) => !r.ok);
      gateway.report('risk_officer', `1-day 95% VaR ${money(risk.var95)} (${((risk.var95 / book.nav) * 100).toFixed(2)}% of NAV), annualised vol ${(risk.vol * 100).toFixed(1)}%. Invested ${((book.invested / book.nav) * 100).toFixed(0)}% of NAV${top1 ? `; largest line ${top1.symbol} at ${((top1.value / book.nav) * 100).toFixed(1)}%` : ''}. ${rejected.length ? `Blocked ${rejected.length} order(s): ${rejected.map((r) => `${r.symbol} — ${r.reason}`).join('; ')}.` : 'All orders within limits. I remain the only adult in the room.'}`,
        { var95: risk.var95, vol: risk.vol, invested: book.invested / book.nav, rejected });
      lastTick = Date.now();
      bus.emit('firm', { type: 'tick', placed: placed.length, at: lastTick });
      return { ok: true, usedLLM, placed: placed.length, rejected: rejected.length };
    } finally { running = false; }
  }

  const intervalMs = () => (marketStatus().open ? 15 : 60) * 60_000 * (llm.breaker() >= 1 ? 2 : 1);
  return { tick, intervalMs, quant, OWNER, lastTick: () => lastTick };
}
