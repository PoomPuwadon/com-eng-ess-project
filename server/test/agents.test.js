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
