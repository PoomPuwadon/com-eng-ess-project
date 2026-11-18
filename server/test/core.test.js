import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { normaliseBet, returnsFor, WHEEL, RED, pocketFromSeed } from '../roulette.js';
import { prizesFor, nextDrawDate, TICKET_PRICE } from '../lottery/institute.js';
import { evaluate, audit, MODELS } from '../lottery/models.js';
import { chiSquareP, binomTail } from '../lottery/stats.js';
import { rng } from '../lottery/stats.js';
import { DEPT, VAULT, MINT } from '../ledger.js';

const quiet = { log() {}, warn() {}, error() {} };
const mkApp = (extra = {}) => createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, allowClosedFills: true, lotteryBackfillFrom: '2020-01-01', ...extra }, quiet);

// ---------------------------------------------------------------- roulette
test('roulette wheel is the 37-pocket European order with 18 reds', () => {
  assert.equal(WHEEL.length, 37);
  assert.deepEqual([...new Set(WHEEL)].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(RED.size, 18);
});

test('every legal bet type has exactly a 1/37 house edge (exact enumeration)', () => {
  const bets = [
    { numbers: [17] }, { numbers: [0] }, { numbers: [1, 2] }, { numbers: [1, 4] }, { numbers: [0, 3] }, { numbers: [7, 8, 9] }, { numbers: [0, 1, 2] },
    { numbers: [1, 2, 4, 5] }, { numbers: [0, 1, 2, 3] }, { numbers: [1, 2, 3, 4, 5, 6] }, { outside: 'red' }, { outside: 'black' }, { outside: 'odd' },
    { outside: 'even' }, { outside: 'low' }, { outside: 'high' }, { outside: 'dozen2' }, { outside: 'column3' },
  ];
  for (const b of bets) {
    const nb = normaliseBet({ ...b, amount: 3700 });
    let ret = 0; for (let p = 0; p <= 36; p++) ret += returnsFor([nb], p);
    assert.equal(ret / 37, 3700 * 36 / 37, `${nb.kind} ${nb.nums}`);
  }
});

test('illegal roulette positions are rejected', () => {
  for (const b of [{ numbers: [1, 5] }, { numbers: [3, 4] }, { numbers: [1, 2, 3, 4] }, { numbers: [37] }, { outside: 'purple' }]) assert.throws(() => normaliseBet({ ...b, amount: 500 }));
  assert.throws(() => normaliseBet({ numbers: [5], amount: 50 }), /Minimum/);
});

test('provably fair seed -> pocket is uniform enough and deterministic', () => {
  assert.equal(pocketFromSeed('abc'), pocketFromSeed('abc'));
  const c = new Array(37).fill(0); const r = rng(7);
  for (let i = 0; i < 37000; i++) c[pocketFromSeed(String(r()))]++;
  const stat = c.reduce((s, o) => s + (o - 1000) ** 2 / 1000, 0);
  assert.ok(chiSquareP(stat, 36) > 0.001, `chi2 p too small (${stat})`);
});

test('spins move money through the ledger and conserve it', () => {
  const app = mkApp();
  const { token, player } = app.players.create();
  assert.ok(token);
  let bal = player.balance;
  for (let i = 0; i < 300; i++) {
    const out = app.roulette.spin(player.id, [{ outside: 'red', amount: 1000 }, { numbers: [17], amount: 100 }]);
    bal += out.net;
    assert.equal(out.balance, bal);
    assert.equal(out.seedHash.length, 64);
  }
  assert.ok(app.ledger.reconcile().ok, JSON.stringify(app.ledger.reconcile().problems));
  assert.throws(() => app.roulette.spin(player.id, [{ outside: 'red', amount: 999_999_999 }]));
});

// ---------------------------------------------------------------- ledger invariants (property test)
test('ledger: random operations never create, destroy or overdraw money', () => {
  const app = mkApp();
  const r = rng(42);
  const ids = Array.from({ length: 6 }, () => app.players.create().player.id);
  for (let i = 0; i < 1500; i++) {
    const pid = ids[Math.floor(r() * ids.length)];
    try {
      if (r() < 0.6) app.roulette.spin(pid, [{ outside: r() < 0.5 ? 'odd' : 'even', amount: 100 + Math.floor(r() * 50_000) }]);
      else app.ledger.post({ actor: 'test', reason: 'WAGER_PLACED', transfers: [{ from: `PLAYER:${pid}`, to: VAULT, amount: Math.floor(r() * 2_000_000) }] });
    } catch (e) { assert.ok(/negative|liquidity|limit|Minimum/i.test(e.message), e.message); }
    if (i % 100 === 0) assert.ok(app.ledger.reconcile().ok);
  }
  assert.throws(() => app.ledger.post({ actor: 'x', reason: 'WAGER_WON', transfers: [{ from: MINT, to: VAULT, amount: 1 }] }), /may not touch/);
  assert.throws(() => app.db.run('DELETE FROM entries'), /append-only/);
  const a = app.ledger.post({ actor: 'x', reason: 'ADMIN_TOPUP', idem: 'same', transfers: [{ from: MINT, to: `PLAYER:${ids[0]}`, amount: 5 }] });
  const b = app.ledger.post({ actor: 'x', reason: 'ADMIN_TOPUP', idem: 'same', transfers: [{ from: MINT, to: `PLAYER:${ids[0]}`, amount: 5 }] });
  assert.equal(a.id, b.id); assert.ok(b.duplicate);
  assert.ok(app.ledger.reconcile().ok);
});

// ---------------------------------------------------------------- trading
test('orders reserve, fill, sell with realised P&L, and cancel cleanly', () => {
  const app = mkApp();
  const { player } = app.players.create();
  app.db.run("INSERT INTO quotes(symbol, name, price, prev_close, as_of, fetched_at, source) VALUES ('AAPL','Apple',100,99,?,?,'test')", Date.now(), Date.now());
  const acct = player.account;
  const o = app.trading.placeOrder(acct, { symbol: 'AAPL', side: 'buy', qty: 10 });
  assert.equal(o.reserved, Math.ceil(10_000 * 10 * 1.05));
  app.trading.processPending();
  let pf = app.trading.portfolio(acct);
  assert.equal(pf.positions[0].qty, 10);
  assert.equal(pf.cash, 1_000_000 - 100_000);
  app.db.run("UPDATE quotes SET price = 110 WHERE symbol = 'AAPL'");
  app.trading.placeOrder(acct, { symbol: 'AAPL', side: 'sell', qty: 4 });
  assert.throws(() => app.trading.placeOrder(acct, { symbol: 'AAPL', side: 'sell', qty: 7 }), /enough/);
  app.trading.processPending();
  pf = app.trading.portfolio(acct);
  assert.equal(pf.positions[0].qty, 6);
  assert.equal(pf.realized, 4 * 1000);
  const lim = app.trading.placeOrder(acct, { symbol: 'AAPL', side: 'buy', qty: 1, type: 'limit', limit: 50 });
  app.trading.processPending();
  assert.equal(app.db.get('SELECT status FROM orders WHERE id = ?', lim.id).status, 'pending');
  app.trading.cancelOrder(acct, lim.id);
  assert.equal(app.trading.portfolio(acct).cash, 1_000_000 - 100_000 + 44_000);
  assert.ok(app.ledger.reconcile().ok);
});

test('trading desk ticks on synthetic data, respects risk limits, stays in budget', async () => {
  const app = mkApp();
  const r = rng(3);
  const syms = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'XOM', 'KO', 'WMT'];
  for (const s of syms) {
    let p = 100 + r() * 300; const drift = (r() - 0.4) * 0.002; const bars = [];
    for (let i = 0; i < 260; i++) { p *= Math.exp(drift + (r() - 0.5) * 0.03); bars.push([Date.now() - (260 - i) * 864e5, p, p * 1.01, p * 0.99, p, 1e6]); }
    app.db.run('INSERT INTO bars(symbol, kind, json, as_of, fetched_at) VALUES (?,?,?,?,?)', s, '1d', JSON.stringify(bars), Date.now(), Date.now());
    app.db.run('INSERT INTO quotes(symbol, name, price, prev_close, as_of, fetched_at, source) VALUES (?,?,?,?,?,?,?)', s, s, p, p * 0.99, Date.now(), Date.now(), 'test');
  }
  app.db.run('UPDATE cash_trips SET eta = 0'); app.treasury.deliverDue();
  const res = await app.desk.tick();
  assert.ok(res.ok, JSON.stringify(res));
  assert.ok(res.placed > 0);
  app.trading.processPending();
  const book = app.trading.portfolio(DEPT.trading);
  for (const p of book.positions) assert.ok(p.value / book.nav <= 0.2 + 1e-9, `${p.symbol} ${p.value / book.nav}`);
  assert.ok(book.invested / book.nav <= 0.95);
  const reports = app.gateway.latestReports('trading_floor');
  assert.equal(reports.length, 4, 'two desks + quant + risk officer');
  assert.ok(reports.every((a) => a.reports.length === 1));
  // both desks traded their own sleeve with their own (rule-book) style; nothing claims an AI model
  const sl = app.desk.sleeves();
  assert.deepEqual(sl.map((d) => d.agent), ['head_trader', 'co_head_trader']);
  for (const d of sl) assert.ok(d.fills > 0 && d.invested <= d.nav * 0.96, `${d.agent} ${d.invested} / ${d.nav}`);
  assert.ok(app.db.all('SELECT model FROM trades').every((t) => t.model === 'rules'));
  const lg = app.league.table();
  assert.equal(lg.families.find((f) => f.id === 'rules').trading.fills, app.db.get('SELECT COUNT(*) AS n FROM trades').n);
  assert.equal(lg.families.find((f) => f.id === 'claude').trading.fills, 0);
  assert.ok(app.ledger.reconcile().ok);
});

test('multi-model desk: each desk on its own model, risk veto, models recorded, league splits P&L by model', async () => {
  const { createTradingDesk } = await import('../agents/tradingDesk.js');
  const { createLeague } = await import('../agents/league.js');
  const app = mkApp();
  const r = rng(5);
  const syms = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'XOM', 'KO', 'WMT'];
  for (const s of syms) {
    let p = 100 + r() * 300; const drift = (r() - 0.4) * 0.002; const bars = [];
    for (let i = 0; i < 260; i++) { p *= Math.exp(drift + (r() - 0.5) * 0.03); bars.push([Date.now() - (260 - i) * 864e5, p, p * 1.01, p * 0.99, p, 1e6]); }
    app.db.run('INSERT INTO bars(symbol, kind, json, as_of, fetched_at) VALUES (?,?,?,?,?)', s, '1d', JSON.stringify(bars), Date.now(), Date.now());
    app.db.run('INSERT INTO quotes(symbol, name, price, prev_close, as_of, fetched_at, source) VALUES (?,?,?,?,?,?,?)', s, s, p, p * 0.99, Date.now(), Date.now(), 'test');
  }
  app.db.run('UPDATE cash_trips SET eta = 0'); app.treasury.deliverDue();
  const MODEL = { head_trader: 'claude-haiku-5-5', co_head_trader: 'gemini-2.5-flash', quant: 'gemini-2.5-flash', risk_officer: 'claude-haiku-5-5' };
  const calls = [];
  const fake = {
    enabled: () => true, breaker: () => 0,
    route: (a) => ({ provider: MODEL[a].startsWith('claude') ? 'claude' : 'gemini', model: MODEL[a] }),
    async ask({ agent, user }) {
      calls.push(agent);
      const st = JSON.parse(user), model = MODEL[agent];
      if (agent === 'quant') return { model, data: { note: 'Tilted.', tilts: [{ symbol: 'KO', tilt: 9, reason: 'clamped' }] } };
      if (agent === 'risk_officer') return { model, data: { memo: 'Vetoed AAPL.', vetoes: st.orders.filter((o) => o.symbol === 'AAPL').map((o) => ({ id: o.id, reason: 'too shiny' })) } };
      // desk A buys AAPL + MSFT, desk B buys KO + WMT; plus a sell of something it does not hold (rejected in code)
      const buys = agent === 'head_trader' ? ['AAPL', 'MSFT'] : ['KO', 'WMT'];
      return { model, data: { memo: `${agent} memo`, conviction: 'high', actions: [...buys.map((s) => ({ symbol: s, side: 'buy', qty: 10, rationale: 'test' })), { symbol: 'TSLA', side: 'sell', qty: 1, rationale: 'naked' }] } };
    },
  };
  const desk = createTradingDesk({ db: app.db, ledger: app.ledger, market: app.market, trading: app.trading, gateway: app.gateway, llm: fake, bus: app.bus, log: quiet });
  const res = await desk.tick();
  assert.ok(res.ok, JSON.stringify(res));
  assert.deepEqual(calls.sort(), ['co_head_trader', 'head_trader', 'quant', 'risk_officer']);
  assert.deepEqual(res.desks, [{ agent: 'head_trader', model: 'claude-haiku-5-5' }, { agent: 'co_head_trader', model: 'gemini-2.5-flash' }]);
  const orders = app.db.all('SELECT symbol, agent, model FROM orders ORDER BY symbol');
  assert.deepEqual(orders.map((o) => `${o.symbol}:${o.agent}:${o.model}`), ['KO:co_head_trader:gemini-2.5-flash', 'MSFT:head_trader:claude-haiku-5-5', 'WMT:co_head_trader:gemini-2.5-flash']);
  assert.ok(app.db.all('SELECT reason FROM agent_rejections').some((x) => /Risk Officer veto: too shiny/.test(x.reason)));
  assert.ok(app.db.all('SELECT reason FROM agent_rejections').some((x) => /does not hold/.test(x.reason)));
  const quantRep = app.gateway.latestReports('trading_floor').find((a) => a.agent === 'quant').reports[0];
  assert.equal(quantRep.data.tilts[0].tilt, 0.5, 'tilts are clamped to ±0.5');
  assert.equal(quantRep.data.model, 'gemini-2.5-flash');
  app.trading.processPending();
  // price moves: Claude's MSFT up 10 %, Gemini's KO down 10 %
  const bump = (s, f) => app.db.run('UPDATE quotes SET price = price * ? WHERE symbol = ?', f, s);
  const px = (s) => app.db.get('SELECT price FROM trades WHERE symbol = ?', s).price;
  bump('MSFT', 1.1); bump('KO', 0.9);
  const lg = createLeague({ db: app.db, market: app.market, desk }).table();
  const fam = (id) => lg.families.find((f) => f.id === id);
  assert.equal(fam('claude').trading.fills, 1);
  assert.equal(fam('gemini').trading.fills, 2);
  assert.ok(fam('claude').trading.pnl > 0 && Math.abs(fam('claude').trading.unrealized - Math.round(10 * px('MSFT') * 0.1)) <= 10);
  assert.ok(fam('gemini').trading.unrealized < 0);
  assert.ok(app.ledger.reconcile().ok);
});

// ---------------------------------------------------------------- lottery
const DRAW = { date: '2026-11-01', first: '423224', near1: ['423223', '423225'], second: ['213938', '328742', '449187', '861914', '941359'],
  third: Array.from({ length: 10 }, (_, i) => String(100000 + i)), fourth: Array.from({ length: 50 }, (_, i) => String(200000 + i)), fifth: Array.from({ length: 100 }, (_, i) => String(300000 + i)),
  last2: '85', last3f: ['300', '950'], last3b: ['393', '804'] };

test('prize table: categories stack and pay per the official schedule', () => {
  assert.deepEqual(prizesFor('423224', DRAW).prizes, ['first']);
  assert.equal(prizesFor('423225', DRAW).payout, 10_000_000);
  assert.deepEqual(prizesFor('300393', DRAW).prizes.sort(), ['last3b', 'last3f']);
  assert.equal(prizesFor('950885', DRAW).payout, 400_000 + 200_000); // front-3 950 and last-2 85
  assert.equal(prizesFor('111185', DRAW).payout, 200_000);
  assert.equal(prizesFor('950804', DRAW).payout, 400_000 + 400_000);
  assert.equal(prizesFor('111111', DRAW).payout, 0);
});

test('next draw date follows the 1st/16th calendar with holiday shifts', () => {
  assert.equal(nextDrawDate('2026-11-15', '2026-11-01'), '2026-11-16');
  assert.equal(nextDrawDate('2026-11-16', '2026-11-16'), '2026-12-01');
  assert.equal(nextDrawDate('2026-12-20', '2026-12-16'), '2026-12-30');
  assert.equal(nextDrawDate('2027-01-05', '2026-12-30'), '2027-01-17');
  assert.equal(nextDrawDate('2027-04-20', '2027-04-16'), '2027-05-02');
});

test('models: fair random history -> no model beats the null, probabilities sum to 1', () => {
  const r = rng(11);
  const hist = Array.from({ length: 140 }, () => [Math.floor(r() * 100)]);
  const ev = evaluate(hist, 2, { topK: 5 });
  assert.equal(ev.metrics.length, MODELS.length + 1);
  const s = ev.next.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
  const ens = ev.metrics.find((m) => m.id === 'ensemble');
  assert.ok(ens.logLossBits > 6.5 && ens.logLossBits < 7.0, String(ens.logLossBits)); // ≈ log2(100) = 6.64
  // a planted pattern IS learned: digits repeat from the previous draw
  const sticky = [[12]]; for (let i = 1; i < 120; i++) sticky.push([r() < 0.6 ? sticky[i - 1][0] : Math.floor(r() * 100)]);
  const ev2 = evaluate(sticky, 2, { topK: 5 });
  const e2 = ev2.metrics.find((m) => m.id === 'ensemble');
  assert.ok(e2.lift > 3 && e2.pValue < 0.001, `lift ${e2.lift}`);
});

test('audit + stats sanity', () => {
  assert.ok(Math.abs(chiSquareP(16.919, 9) - 0.05) < 0.002);
  assert.ok(Math.abs(binomTail(3, 10, 0.5) - 0.9453) < 0.001);
  const r = rng(5);
  const draws = Array.from({ length: 80 }, () => ({ ...DRAW, first: String(Math.floor(r() * 1e6)).padStart(6, '0'), last2: String(Math.floor(r() * 100)).padStart(2, '0') }));
  const a = audit(draws);
  assert.equal(a.tests.length, 9);
  assert.equal(a.heatmap.length, 6);
});

test('certificates: purchase escrow, settlement on the next confirmed draw, conservation', async () => {
  const app = mkApp();
  const { player } = app.players.create();
  const r = rng(9);
  for (let i = 0; i < 60; i++) { // history so the pipeline can run
    const d = { ...DRAW, date: `2024-${String(1 + Math.floor(i / 2) % 12).padStart(2, '0')}-${i % 2 ? '16' : '01'}`.replace(/^2024/, String(2024 + Math.floor(i / 24))),
      first: String(Math.floor(r() * 1e6)).padStart(6, '0'), last2: String(Math.floor(r() * 100)).padStart(2, '0'),
      last3f: [String(Math.floor(r() * 1000)).padStart(3, '0'), String(Math.floor(r() * 1000)).padStart(3, '0')], last3b: [String(Math.floor(r() * 1000)).padStart(3, '0'), String(Math.floor(r() * 1000)).padStart(3, '0')] };
    app.lotto.store(d, { confirmed: true });
  }
  app.db.run('UPDATE cash_trips SET eta = 0'); app.treasury.deliverDue();
  const run = app.institute.runPipeline('test');
  assert.ok(run && run.stages.length === 7, 'pipeline stages');
  const dec = await app.institute.decide(run);
  assert.ok(dec && dec.tickets.length === 5 && dec.spend === 5 * TICKET_PRICE, JSON.stringify(dec));
  const buy = app.institute.buy(player.id, '950885', 2);
  assert.equal(buy.tickets.length, 2);
  assert.equal(buy.balance, 1_000_000 - 2 * TICKET_PRICE);
  // the next official result arrives (dated today or later in Bangkok)
  app.db.run('UPDATE lottery_tickets SET created_at = created_at - 1000');
  app.lotto.store({ ...DRAW, date: '2099-01-01' }, { confirmed: true });
  app.institute.settle();
  const t = app.institute.tickets(player.account);
  assert.ok(t.every((x) => x.status === 'settled' && x.payout === 600_000));
  assert.equal(app.ledger.balance(player.account), 1_000_000 - 2 * TICKET_PRICE + 2 * 600_000);
  assert.ok(app.ledger.reconcile().ok);
});
