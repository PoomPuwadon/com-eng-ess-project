import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createLLM, pickProvider } from '../agents/llm.js';
import { createChartAnalyst, parseImage, heuristicVerdict } from '../agents/chartAnalyst.js';

const quiet = { log() {}, warn() {}, error() {} };
const base = { llmEnabled: true, llmMonthlyCapUsd: 75, modelTick: 'claude-haiku-5-5', geminiModel: 'gemini-2.5-flash' };
// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('provider selection: claude by default, gemini when it is the only key, LLM_PROVIDER wins, none = rule books', () => {
  assert.equal(pickProvider({ anthropicKey: 'a', geminiKey: 'g' }), 'claude');
  assert.equal(pickProvider({ anthropicKey: 'a', geminiKey: 'g', llmProvider: 'gemini' }), 'gemini');
  assert.equal(pickProvider({ anthropicKey: '', geminiKey: 'g' }), 'gemini');
  assert.equal(pickProvider({ anthropicKey: 'a', llmProvider: 'gemini' }), 'claude', 'a provider without a key is ignored');
  assert.equal(pickProvider({}), null);
  const llm = createLLM(openDb(':memory:'), { ...base, anthropicKey: '', geminiKey: '' }, quiet);
  assert.equal(llm.enabled(), false);
  assert.match(llm.status().reason, /rule-based fallback/);
});

test('gemini provider: REST call, JSON parsed, spend metered against the shared monthly cap', async () => {
  const db = openDb(':memory:');
  const llm = createLLM(db, { ...base, anthropicKey: '', geminiKey: 'test-key' }, quiet);
  const real = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"direction":"UP"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }), { status: 200 }); };
  try {
    const out = await llm.json({ job: 't', system: 's', user: 'u', schema: { type: 'object' }, images: [{ mediaType: 'image/png', data: 'AAAA' }] });
    assert.deepEqual(out, { direction: 'UP' });
    assert.match(sent.url, /gemini-2\.5-flash:generateContent/);
    assert.equal(sent.init.headers['x-goog-api-key'], 'test-key');
    assert.equal(JSON.parse(sent.init.body).contents[0].parts[0].inline_data.mime_type, 'image/png');
    const row = db.get('SELECT * FROM llm_spend');
    assert.equal(row.model, 'gemini-2.5-flash');
    assert.ok(row.usd > 0);
    // banned words are discarded
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"x":"jackpot"}' }] } }], usageMetadata: {} }), { status: 200 }); // BANNED_WORDS runtime filter test
    assert.equal(await llm.json({ job: 't', system: 's', user: 'u', schema: {} }), null);
    // HTTP errors -> null (rule book)
    globalThis.fetch = async () => new Response('no', { status: 403 });
    assert.equal(await llm.json({ job: 't', system: 's', user: 'u', schema: {} }), null);
  } finally { globalThis.fetch = real; }
});

test('chart desk: image validation, demo verdict without a key', async () => {
  assert.equal(parseImage(PNG).mediaType, 'image/png');
  assert.throws(() => parseImage('data:image/gif;base64,R0lGODlhAQABAAAAACw='), /PNG, JPG or WebP/);
  assert.throws(() => parseImage('data:image/png;base64,' + Buffer.from('x'.repeat(100)).toString('base64')), /not a valid/);
  assert.equal(heuristicVerdict({ slope: -0.4, coverage: 0.5 }).direction, 'UP');
  assert.equal(heuristicVerdict({ slope: 0.3, lateSlope: 0.2, coverage: 0.5 }).direction, 'DOWN');
  const llm = createLLM(openDb(':memory:'), { ...base, anthropicKey: '', geminiKey: '' }, quiet);
  const v = await createChartAnalyst({ llm, log: quiet }).analyse({ image: PNG, hint: { slope: 0.2, coverage: 0.4 } });
  assert.equal(v.mode, 'demo');
  assert.equal(v.direction, 'DOWN');
  assert.match(v.notice, /DEMO.*Not investment advice/);
});

// ---------------------------------------------------------------- football (VT-02)
import { createApp } from '../app.js';
import { probabilities, expectedGoals, pickWins } from '../football/pricing.js';
import { scoreFixture, isDerby, DEPT_SPORTS } from '../football/service.js';
import { statureOf, parseViews } from '../football/following.js';
import { VAULT } from '../ledger.js';

test('football pricing: probabilities sum to 1, home advantage, settlement rules', () => {
  const p = probabilities(expectedGoals(null, null, null));
  assert.ok(Math.abs(p.H + p.D + p.A - 1) < 1e-9);
  assert.ok(p.H > p.A, 'home advantage');
  const strong = { playedGames: 10, goalsFor: 30, goalsAgainst: 5 }, weak = { playedGames: 10, goalsFor: 8, goalsAgainst: 25 };
  const q = probabilities(expectedGoals(weak, strong, { avgGoals: 2.7 }));
  assert.ok(q.A > q.H, 'the better side is favoured away from home');
  assert.ok(pickWins('H', 2, 1) && pickWins('D', 1, 1) && pickWins('A', 0, 3) && pickWins('O25', 2, 1) && pickWins('U25', 1, 1) && pickWins('BTTS_Y', 1, 1) && pickWins('BTTS_N', 0, 2));
  assert.ok(!pickWins('H', 1, 1));
  const cl = { competition: { code: 'CL' }, homeTeam: { id: 1 }, awayTeam: { id: 2 }, utcDate: new Date(Date.now() + 86400_000).toISOString() };
  const fl1 = { ...cl, competition: { code: 'FL1' } };
  assert.ok(scoreFixture(cl, {}) > scoreFixture(fl1, {}), 'the scout prefers the Champions League');
});

test('fixture scout: club following and derbies outweigh table position; no club is special-cased', () => {
  const at = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const fx = (id, comp, home, away, h = 30) => ({ id, competition: { code: comp }, utcDate: at(h), homeTeam: home, awayTeam: away });
  const T = (id, name) => ({ id, name });
  // fictional clubs: two globally followed giants (mid-table this season) v two little-known clubs at the top
  const giantA = T(1, 'Northbridge Albion FC'), giantB = T(2, 'Kingsmere Wanderers FC'), smallA = T(3, 'Ostervik SC'), smallB = T(4, 'Valmira CF');
  const standings = { PL: { rows: [{ team: { id: 3 }, position: 1 }, { team: { id: 4 }, position: 2 }, { team: { id: 1 }, position: 9 }, { team: { id: 2 }, position: 11 }] } };
  const views = { 1: 2_400_000, 2: 1_900_000, 3: 45_000, 4: 38_000 };
  const following = (id) => views[id] ?? null;
  const giants = fx(10, 'PL', giantA, giantB), leaders = fx(11, 'PL', smallA, smallB);
  assert.ok(scoreFixture(giants, standings, Date.now(), following) > scoreFixture(leaders, standings, Date.now(), following), 'two giants beat a little-known top-of-table clash');
  assert.ok(scoreFixture(giants, standings, Date.now(), following) > scoreFixture(fx(12, 'PL', giantA, smallA), standings, Date.now(), following), 'both clubs must be big');
  assert.ok(scoreFixture(leaders, standings) > scoreFixture(giants, standings), 'without readership data, prestige + table still decide');
  assert.ok(isDerby(fx(13, 'SA', T(5, 'AC Portoria'), T(6, 'FC Portoria Calcio'))), 'clubs sharing a place name');
  assert.ok(!isDerby(fx(14, 'PL', T(7, 'Harrowgate United FC'), T(8, 'Belcastro United FC'))), 'generic words do not make a derby');
  assert.ok(!isDerby(fx(15, 'PL', T(9, 'Luxmont City FC'), T(16, 'Strandmoor City FC'))));
  assert.ok(scoreFixture(fx(17, 'CL', giantA, giantB, -1), standings, Date.now(), following) < 0, 'kicked-off fixtures are never picked');
  assert.equal(statureOf(10_000), 0); assert.equal(statureOf(1e9), 2.5);
  // readership parsing: redirects followed, missing articles count as unknown (0)
  const got = parseViews(['Northbridge Albion FC', 'Nowhere FC'], { query: { redirects: [{ from: 'Northbridge Albion FC', to: 'Northbridge Albion F.C.' }],
    pages: [{ title: 'Northbridge Albion F.C.', pageviews: { '2026-10-01': 1000, '2026-10-02': 2500, '2026-10-03': null } }, { title: 'Nowhere FC', missing: true }] } });
  assert.deepEqual(got.get('Northbridge Albion FC'), { title: 'Northbridge Albion F.C.', views: 3500 });
  assert.deepEqual(got.get('Nowhere FC'), { title: null, views: 0 });
});

test('football positions: players and the Sports Desk agent stake through the ledger and settle on the real score', async () => {
  const app = createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, allowClosedFills: true, lotteryBackfillFrom: '2020-01-01' }, quiet);
  const fb = app.football;
  await fb.cycle('test'); // simulated fixtures offline, scout by rule book
  const s0 = fb.snapshot(null);
  assert.equal(s0.simulated, true);
  assert.ok(s0.marquee, 'a marquee fixture is picked');
  const { token, player } = app.players.create();
  void token;
  const acct = `PLAYER:${player.id}`;
  const m = s0.marquee;
  const pos = fb.open({ owner: acct, matchId: m.id, market: '1X2', pick: 'H', stake: 10_000, actor: 'test' });
  const pos2 = fb.open({ owner: acct, matchId: m.id, market: 'OU25', pick: 'U25', stake: 5_000, actor: 'test' });
  assert.equal(app.ledger.balance(acct), 985_000);
  assert.throws(() => fb.open({ owner: acct, matchId: m.id, market: '1X2', pick: 'Z', stake: 100, actor: 'test' }), /Unknown selection/);
  // the desk gets its budget by courier, then stakes the marquee
  app.treasury.deliverDue(); // not due yet
  app.db.run("UPDATE cash_trips SET eta = 0 WHERE to_acct = ?", DEPT_SPORTS); app.treasury.deliverDue();
  const agent = fb.agentTick();
  assert.ok(agent && agent.stake > 0);
  const vault0 = app.ledger.balance(VAULT);
  // full time 3-1: home wins, over 2.5
  fb._setMatches(fb.matches().map((x) => (x.id === m.id ? { ...x, status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: 3, away: 1 } } } : x)));
  assert.equal(fb.settle(), 3);
  const pay = Math.floor(10_000 * pos.price);
  assert.equal(app.ledger.balance(acct), 985_000 + pay);
  assert.equal(app.ledger.balance(VAULT), vault0 - (pay - 10_000) + 5_000);
  void pos2;
  assert.ok(app.ledger.reconcile().ok);
});
