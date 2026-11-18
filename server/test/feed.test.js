// AI visuals feed (docs/ai-visuals-plan.md §2.1): events are recorded, attributed, short, clean and never fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../db.js';
import { createFeed, providerOf } from '../agents/feed.js';
import { createTradingDesk } from '../agents/tradingDesk.js';
import { createResearch } from '../agents/research.js';
import { SYMBOLS } from '../market/data.js';
import { DEPT } from '../ledger.js';

const quiet = { log() {}, warn() {}, error() {} };
const mkApp = (extra = {}) => createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', geminiKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, allowClosedFills: true, lotteryBackfillFrom: '2020-01-01', ...extra }, quiet);

test('providerOf maps the deciding model to claude | gemini | rules', () => {
  assert.equal(providerOf('claude-haiku-5-5'), 'claude');
  assert.equal(providerOf('gemini-3.5-flash'), 'gemini');
  for (const m of [null, false, undefined, 'rules', '']) assert.equal(providerOf(m), 'rules');
});

test('feed: persists attributed events, broadcasts them, keeps `thinking` transient, cleans banned words, caps text at 140', () => {
  const db = openDb(':memory:'), seen = [];
  const feed = createFeed({ db, bus: { emit: (e, d) => seen.push([e, d]) }, routeOf: (a) => (a === 'quant' ? { provider: 'gemini', model: 'gemini-3.5-flash' } : null) });
  const ev = feed.emit({ room: 'OT-01', agent: 'quant', model: 'gemini-3.5-flash', stage: 'signal', text: `A casino jackpot ${'x'.repeat(300)}`, data: { a: 1 } });
  assert.ok(ev.id > 0); assert.equal(ev.provider, 'gemini'); assert.ok(ev.text.length <= 140); assert.doesNotMatch(ev.text, /casino|jackpot/i);
  feed.emit({ room: 'OT-01', agent: 'head_trader', model: null, stage: 'proposal', text: 'BUY 1 AAPL' });
  feed.emit({ room: 'OT-01', agent: 'quant', stage: 'thinking', data: { on: true } });
  assert.equal(seen.length, 3, 'all three reach the SSE bus');
  assert.equal(feed.list({ room: 'OT-01' }).length, 2, 'thinking is not stored');
  assert.equal(feed.list({ room: 'OT-01' })[0].provider, 'rules', 'no model = rule book');
  assert.equal(feed.list({ room: 'OT-02' }).length, 0);
  assert.throws(() => feed.emit({ room: 'OT-09', agent: 'x', stage: 'signal' }), /unknown room/);
  assert.throws(() => feed.emit({ room: 'OT-01', agent: 'x', stage: 'dance' }), /unknown stage/);
});

test('feed.think emits real start/stop around an LLM call, and nothing when no model is routed (rule book)', async () => {
  const db = openDb(':memory:'), seen = [];
  const feed = createFeed({ db, bus: { emit: (_e, d) => seen.push(d) }, routeOf: (a) => (a === 'quant' ? { provider: 'gemini', model: 'gemini-3.5-flash' } : null) });
  assert.equal(await feed.think({ room: 'OT-01', agent: 'quant' }, async () => 42), 42);
  assert.deepEqual(seen.map((e) => e.data.on), [true, false]);
  assert.equal(seen[0].provider, 'gemini');
  seen.length = 0;
  assert.equal(await feed.think({ room: 'OT-01', agent: 'risk_officer' }, async () => 7), 7);
  assert.equal(seen.length, 0);
  await assert.rejects(feed.think({ room: 'OT-01', agent: 'quant' }, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(seen.at(-1).data.on, false, 'stop is emitted even when the call throws');
});

test('feed keeps only the last ~500 rows', () => {
  const db = openDb(':memory:'), feed = createFeed({ db, bus: null });
  for (let i = 0; i < 620; i++) feed.emit({ room: 'VT-02', agent: 'fixture_scout', stage: 'scout', text: `n${i}` });
  const n = db.get('SELECT COUNT(*) AS n FROM agent_events').n;
  assert.ok(n >= 500 && n <= 550, `kept ${n}`);
});

test('VT-02: scout, stake and settle are emitted with RULE BOOK attribution when no key is set; GET /api/ai/feed serves them', async () => {
  const app = mkApp(), fb = app.football;
  await fb.cycle('test');
  const scout = app.feed.list({ room: 'VT-02' }).find((e) => e.stage === 'scout');
  assert.ok(scout, 'a scout event exists');
  assert.equal(scout.provider, 'rules'); assert.equal(scout.agent, 'fixture_scout'); assert.match(scout.text, /MARQUEE LOCKED/);
  assert.ok(scout.data.candidates.length > 0 && scout.data.matchId);
  app.db.run('UPDATE cash_trips SET eta = 0 WHERE to_acct = ?', 'DEPT:sports_desk'); app.treasury.deliverDue();
  const pos = fb.agentTick();
  assert.ok(pos);
  assert.ok(app.feed.list({ room: 'VT-02' }).some((e) => e.stage === 'stake' && e.outcome === 'open' && e.data.id === pos.id));
  const m = fb.snapshot(null).marquee;
  fb._setMatches(fb.matches().map((x) => (x.id === m.id ? { ...x, status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: 3, away: 1 } } } : x)));
  fb.settle();
  const st = app.feed.list({ room: 'VT-02' }).find((e) => e.stage === 'settle');
  assert.ok(st && ['won', 'lost'].includes(st.outcome));
  const api = app.routes['GET /api/ai/feed']({}, new URL('http://x/api/ai/feed?room=VT-02&limit=10'));
  assert.equal(api.room, 'VT-02'); assert.ok(api.events.length >= 3);
  assert.ok(api.events[0].id < api.events.at(-1).id, 'oldest first for the client');
  assert.ok(api.status.nextScoutAt > Date.now(), 'the countdown is real');
  assert.throws(() => app.routes['GET /api/ai/feed']({}, new URL('http://x/api/ai/feed?room=OT-77')), /Unknown room/);
});

// synthetic daily history so the desk's signal table builds offline
function seedMarket(app) {
  const now = Date.now();
  SYMBOLS.forEach((s, k) => {
    const bars = Array.from({ length: 260 }, (_, i) => { const c = 100 + k * 3 + i * (0.05 + (k % 5) * 0.03) + Math.sin(i / 7 + k) * 2; return [now - (260 - i) * 86400_000, c, c + 1, c - 1, c, 1e6]; });
    const last = bars.at(-1)[4];
    app.db.run('INSERT OR REPLACE INTO bars(symbol, kind, json, as_of, fetched_at) VALUES (?,?,?,?,?)', s, '1d', JSON.stringify(bars), now, now);
    app.db.run('INSERT OR REPLACE INTO quotes(symbol, name, price, prev_close, day_high, day_low, volume, as_of, fetched_at, source) VALUES (?,?,?,?,?,?,?,?,?,?)', s, s, last, last * 0.99, last, last, 1e6, now, now, 'test');
  });
}
const fundDesk = (app) => { app.db.run('UPDATE cash_trips SET eta = 0 WHERE to_acct = ?', DEPT.trading); app.treasury.deliverDue(); };

test('OT-01: a rule-book tick emits quant signal, proposals, CLEARED and FILLED with attribution and a real next-decision time', async () => {
  const app = mkApp(); seedMarket(app); fundDesk(app);
  const r = await app.desk.tick();
  assert.ok(r.ok, JSON.stringify(r));
  const ev = app.feed.list({ room: 'OT-01', limit: 200 });
  const stages = new Set(ev.map((e) => e.stage));
  for (const s of ['signal', 'proposal']) assert.ok(stages.has(s), `has ${s}`);
  assert.ok(ev.every((e) => e.provider === 'rules'), 'no key: every decision is labelled RULE BOOK');
  const cleared = ev.filter((e) => e.stage === 'execute' && e.outcome === 'cleared');
  assert.ok(cleared.length > 0, 'at least one order cleared');
  assert.ok(app.feed.getStatus('OT-01').nextAt > Date.now());
  app.trading.processPending();
  const fills = app.feed.list({ room: 'OT-01', limit: 200 }).filter((e) => e.stage === 'result' && e.outcome === 'filled');
  assert.ok(fills.length > 0 && /^FILLED (BUY|SELL) \d+ [A-Z.-]+ @ \d/.test(fills[0].text), fills[0]?.text);
});

test('OT-01: a Risk Officer veto becomes a VETO event naming the desk, the order and the reason, attributed to the model that vetoed', async () => {
  const app = mkApp(); seedMarket(app); fundDesk(app);
  const fake = { enabled: () => true, breaker: () => 0, route: () => ({ provider: 'claude', model: 'claude-haiku-5-5' }),
    ask: async ({ job }) => (job === 'risk_review' ? { data: { vetoes: [{ id: 'head_trader:0', reason: 'Concentration is a feeling, and we feel it.' }], memo: 'Cautious.' }, provider: 'claude', model: 'claude-haiku-5-5' } : null) };
  const desk = createTradingDesk({ db: app.db, ledger: app.ledger, market: app.market, trading: app.trading, gateway: app.gateway, llm: fake, bus: app.bus, feed: app.feed, log: quiet });
  const r = await desk.tick();
  assert.ok(r.ok, JSON.stringify(r));
  const veto = app.feed.list({ room: 'OT-01', limit: 200 }).find((e) => e.stage === 'veto');
  assert.ok(veto, 'veto event exists');
  assert.equal(veto.agent, 'risk_officer'); assert.equal(veto.provider, 'claude'); assert.equal(veto.outcome, 'vetoed');
  assert.match(veto.text, /^VETO (BUY|SELL) \d+ [A-Z.-]+: Concentration is a feeling/);
  assert.equal(veto.data.deskAgent, 'head_trader'); assert.ok(veto.data.symbol);
});

test('OT-01 research (no keys): rule-book research is labelled RULE BOOK, never places orders, and stays inside the budget gate', async () => {
  const app = mkApp(); seedMarket(app);
  const orders0 = app.db.get('SELECT COUNT(*) AS n FROM orders').n;
  const res = await app.research.run({ force: true });
  assert.ok(res); assert.equal(res.mode, 'rules');
  const ev = app.feed.list({ room: 'OT-01', limit: 50 }).filter((e) => e.stage === 'research');
  assert.ok(ev.some((e) => e.data.kind === 'market') && ev.some((e) => e.data.kind === 'plan'));
  assert.ok(ev.every((e) => e.provider === 'rules'));
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM orders').n, orders0, 'research never places orders');
  assert.equal(app.db.get("SELECT COUNT(*) AS n FROM llm_spend WHERE job IN ('news_research','market_research','open_plan')").n, 0);
  assert.ok(app.feed.getStatus('OT-01').nextResearchAt > Date.now());
});

test('OT-01 research (with a model): validates symbols and headline numbers, clamps tilts to +/-0.25, honours the sub-budget', async () => {
  const app = mkApp(); seedMarket(app);
  const news = { headlines: async () => [{ symbol: 'AAPL', headline: 'Apple suppliers ramp up', source: 'Wire', at: 1 }, { symbol: null, headline: 'Rates steady', source: 'Wire', at: 2 }], source: () => 'test' };
  let calls = 0;
  const llm = { enabled: () => true, breaker: () => 0, route: () => ({ provider: 'gemini', model: 'gemini-3.5-flash' }),
    ask: async ({ job }) => { calls++; if (job === 'news_research') return { provider: 'gemini', model: 'gemini-3.5-flash', data: { headlines: [{ i: 0, symbol: 'AAPL', impact: 'bullish', reason: 'Supply chain.' }, { i: 9, symbol: 'AAPL', impact: 'bullish', reason: 'bad index' }, { i: 1, symbol: 'ZZZZ', impact: 'bearish', reason: 'bad symbol' }], tilts: [{ symbol: 'AAPL', tilt: 3, reason: 'big' }, { symbol: 'NOPE', tilt: 0.1, reason: 'x' }] } };
      if (job === 'market_research') return { provider: 'gemini', model: 'gemini-3.5-flash', data: { read: 'Quiet tape.', watchlist: [{ symbol: 'MSFT', reason: 'trend' }, { symbol: 'QQQQ', reason: 'unknown' }] } };
      return { provider: 'claude', model: 'claude-haiku-5-5', data: { plan: 'Do not chase AAPL.', refuse: ['AAPL', 'NOPE'] } }; } };
  const research = createResearch({ db: app.db, llm, market: app.market, gateway: app.gateway, feed: app.feed, news, config: { researchBudgetUsd: 2 }, log: quiet });
  const res = await research.run({ force: true });
  assert.equal(res.mode, 'llm'); assert.equal(calls, 3);
  assert.deepEqual(res.headlines.map((h) => h.symbol), ['AAPL'], 'bad index and unknown symbol are dropped');
  assert.deepEqual(res.tilts, [{ symbol: 'AAPL', tilt: 0.25, reason: 'big' }], 'tilt clamped to 0.25, unknown symbol dropped');
  assert.deepEqual(res.watchlist.map((w) => w.symbol), ['MSFT']); assert.deepEqual(res.refuse, ['AAPL']);
  assert.equal(research.openTilts().length, 1);
  // a spent sub-budget turns the model off but research continues on the rule book
  app.db.run("INSERT INTO llm_spend(created_at, job, agent, model, input_tokens, cache_write, cache_read, output_tokens, usd) VALUES (?,?,?,?,?,?,?,?,?)", Date.now(), 'news_research', 'quant', 'gemini-3.5-flash', 1, 0, 0, 1, 2.5);
  calls = 0;
  const res2 = await research.run({ force: true });
  assert.equal(calls, 0); assert.equal(res2.mode, 'rules');
});

test('OT-02: the pipeline emits one research event per stage, then a run summary; model stages say RULE BOOK when no key is set', async () => {
  const app = mkApp();
  const draws = Array.from({ length: 60 }, (_, i) => { const d = new Date(Date.UTC(2023, 0, 1 + i * 15)).toISOString().slice(0, 10); const f = String((i * 7919) % 1000000).padStart(6, '0'); return { date: d, first: f, last2: f.slice(4), last3f: [f.slice(0, 3)], last3b: [f.slice(3)], second: [], third: [], fourth: [], fifth: [], near1: [] }; });
  for (const d of draws) app.db.run('INSERT OR REPLACE INTO lottery_draws(date, json, confirmed, first_seen, fetched_at, source) VALUES (?,?,?,?,?,?)', d.date, JSON.stringify(d), 1, 1, 1, 'test');
  const run = app.institute.runPipeline('test');
  assert.ok(run);
  const ev = app.feed.list({ room: 'OT-02', limit: 50 });
  assert.equal(ev.filter((e) => e.stage === 'research' && e.ref?.startsWith('stage:')).length, 7);
  assert.ok(ev.some((e) => e.ref === `run:${run.id}` && e.outcome === 'done'));
  assert.ok(ev.every((e) => e.provider === 'rules'));
  assert.ok(app.feed.getStatus('OT-02').nextAt > 0);
});
