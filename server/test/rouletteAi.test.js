// VT-01 roulette AI seats: they play for real on the real wheel with their OWN notional bankroll; the firm's money is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { validatePlan, START_BANK, MAX_SPIN, createRoulettePlayers } from '../agents/roulettePlayers.js';
import { VAULT, MINT } from '../ledger.js';

const quiet = { log() {}, warn() {}, error() {} };
const mkApp = () => createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', geminiKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, lotteryBackfillFrom: '2020-01-01' }, quiet);

test('plans are validated in code: illegal and over-cap positions are dropped, spins clamped', () => {
  const v = validatePlan({ spins: 999, bets: [{ outside: 'red', amount: 10_000 }, { outside: 'purple', amount: 100 }, { numbers: [1, 2, 4], amount: 100 }, { numbers: [17], amount: MAX_SPIN }], note: 'x' }, START_BANK);
  assert.deepEqual(v.bets, [{ outside: 'red', amount: 10_000 }]); // purple illegal, [1,2,4] not a position, 17 would exceed the per-spin cap
  assert.equal(v.spins, 30);
  assert.equal(validatePlan({ bets: [{ outside: 'red', amount: 5 }] }, START_BANK), null, 'below the minimum position');
  assert.equal(validatePlan({ bets: [{ outside: 'red', amount: 5_000 }] }, 1_000), null, 'more than the bank');
});

test('seats play real rotations with no key (rule book) and the firm ledger does not move', () => {
  const app = mkApp(), ai = app.rouletteAi;
  const before = { vault: app.ledger.balance(VAULT), mint: app.ledger.balance(MINT), txs: app.db.get('SELECT COUNT(*) AS n FROM transactions').n, rounds: app.db.get('SELECT COUNT(*) AS n FROM roulette_rounds').n };
  for (let i = 0; i < 40; i++) ai.tick();
  const view = ai.view();
  assert.equal(view.length, 2);
  for (const p of view) {
    assert.ok(p.rounds >= 30, `${p.id} played ${p.rounds}`);
    assert.equal(p.provider, 'rules', 'no key: RULE BOOK');
    assert.ok(p.last && Number.isInteger(p.last.pocket) && p.last.pocket >= 0 && p.last.pocket <= 36);
    assert.equal(p.net, p.bank - START_BANK * (1 + p.resets), 'net is bank minus buy-ins');
    assert.ok(p.bank >= 0);
  }
  assert.deepEqual({ vault: app.ledger.balance(VAULT), mint: app.ledger.balance(MINT), txs: app.db.get('SELECT COUNT(*) AS n FROM transactions').n, rounds: app.db.get('SELECT COUNT(*) AS n FROM roulette_rounds').n }, before, 'no ledger postings, no visitor round rows');
  assert.ok(app.ledger.reconcile().ok);
});

test('each rotation emits a VT-01 result event (not stored); the plan is stored with its model attribution', () => {
  const app = mkApp(), seen = [];
  app.bus.on('agent', (e) => { if (e.room === 'VT-01') seen.push(e); });
  app.rouletteAi.tick(); app.rouletteAi.tick();
  const res = seen.filter((e) => e.stage === 'result');
  assert.ok(res.length >= 2 && res.every((e) => ['won', 'lost', 'push'].includes(e.outcome) && e.provider === 'rules' && typeof e.data.net === 'number' && typeof e.data.total === 'number'));
  assert.equal(app.feed.list({ room: 'VT-01', limit: 50 }).filter((e) => e.stage === 'result').length, 0, 'rotations are not persisted (they would evict the other rooms)');
  assert.ok(app.feed.list({ room: 'VT-01', limit: 50 }).some((e) => e.stage === 'decision' && /^PLAN /.test(e.text)));
  const api = app.routes['GET /api/ai/roulette']();
  assert.equal(api.players.length, 2); assert.match(api.note, /not affected/);
});

test('a model plan is used (and attributed) when it validates; a broke seat gets a fresh notional buy-in', async () => {
  const app = mkApp();
  const llm = { enabled: () => true, breaker: () => 0, route: () => ({ provider: 'claude', model: 'claude-haiku-5-5' }), ask: async () => ({ provider: 'claude', model: 'claude-haiku-5-5', data: { spins: 5, note: 'Chasing the dozens.', bets: [{ outside: 'dozen2', amount: 2_000 }] } }) };
  const ai = createRoulettePlayers({ db: app.db, llm, feed: app.feed, config: {}, log: quiet });
  await ai.plan('roulette_claude');
  const p = ai.view().find((x) => x.id === 'roulette_claude');
  assert.equal(p.provider, 'claude'); assert.equal(p.note, 'Chasing the dozens.');
  ai.state().roulette_claude.bank = 50; // broke
  ai.spinOne('roulette_claude');
  const after = ai.view().find((x) => x.id === 'roulette_claude');
  assert.equal(after.resets, 1); assert.ok(after.bank > 900_000);
  // an invalid model plan falls back to the rule book
  const bad = { ...llm, ask: async () => ({ provider: 'claude', model: 'claude-haiku-5-5', data: { spins: 5, note: 'x', bets: [{ outside: 'nope', amount: 100 }] } }) };
  const ai2 = createRoulettePlayers({ db: app.db, llm: bad, feed: app.feed, config: {}, log: quiet });
  await ai2.plan('roulette_gemini');
  assert.equal(ai2.view().find((x) => x.id === 'roulette_gemini').provider, 'rules');
});
