// Supabase write-through store: row changes are captured by triggers and replicated in ordered batches.
// A recording fake stands in for the Postgres pool; the SQL itself was applied to the real Supabase project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../store.js';
import { createApp } from '../app.js';
import { openDb } from '../db.js';

const quiet = { log() {}, warn() {}, error() {} };
const cfg = { dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, allowClosedFills: true, lotteryBackfillFrom: '2020-01-01' };

function fakePool({ fail = false } = {}) {
  const log = [];
  const state = { fail };
  const run = async (sql, params) => {
    if (state.fail && /^INSERT/.test(sql)) throw new Error('network down');
    log.push({ sql: String(sql), params });
    return { rows: [] };
  };
  return { log, state, query: run, connect: async () => ({ query: run, release() {} }), end: async () => {} };
}

test('seed rows from Postgres are loaded into the working set', () => {
  const db = openDb(':memory:', { seed: { kv: [{ key: 'a', value: '1' }], users: [{ key: 'bob', name: 'Bob', salt: 's', hash: 'h', player_id: 'p1', created_at: 5, last_login: null }], unknown_table: [{ x: 1 }] } });
  assert.equal(db.get('SELECT value FROM kv WHERE key = ?', 'a').value, '1');
  assert.equal(db.get('SELECT player_id FROM users WHERE key = ?', 'bob').player_id, 'p1');
});

test('writes are replicated: users, ledger (append-only) and balances (upsert)', async () => {
  const pool = fakePool();
  const store = await connect('postgres://x', quiet, { pool });
  const app = createApp(cfg, quiet, { store, seed: {} });
  app.auth.register('Alice', 'secret1');
  assert.ok(store.status().pending > 0);
  await store.flush();
  assert.equal(store.status().pending, 0);
  const sql = pool.log.map((l) => l.sql).join('\n');
  assert.match(sql, /INSERT INTO "users"/);
  assert.match(sql, /INSERT INTO "transactions"[^;]*ON CONFLICT \("id"\) DO NOTHING/);
  assert.match(sql, /INSERT INTO "balances"[^;]*DO UPDATE SET "balance" = EXCLUDED."balance"/);
  assert.match(sql, /^BEGIN/m);
  assert.match(sql, /^COMMIT/m);
  const users = pool.log.find((l) => /INSERT INTO "users"/.test(l.sql));
  assert.ok(users.params.includes('alice'));
  await store.close();
  app.stop();
});

test('a failed flush keeps the changes and retries', async () => {
  const pool = fakePool({ fail: true });
  const store = await connect('postgres://x', quiet, { pool });
  const app = createApp(cfg, quiet, { store, seed: {} });
  app.auth.register('Bob', 'secret1');
  const before = store.status().pending;
  await assert.rejects(store.flush(), /network down/);
  assert.equal(store.status().pending, before);
  assert.match(store.status().lastError, /network down/);
  pool.state.fail = false;
  await store.flush();
  assert.equal(store.status().pending, 0);
  await store.close();
  app.stop();
});

test('restart: rows replicated from one server load into the next with accounts and balances intact', async () => {
  const rows = {};
  // capture what the first server replicates, as Postgres would hold it
  const pool = fakePool();
  const store = await connect('postgres://x', quiet, { pool });
  const app = createApp(cfg, quiet, { store, seed: {} });
  const { player } = app.auth.register('Carol', 'secret1');
  for (const t of ['users', 'players', 'accounts', 'balances', 'transactions', 'entries', 'kv']) rows[t] = app.db.all(`SELECT * FROM ${t}`);
  await store.close();
  app.stop();
  const store2 = await connect('postgres://x', quiet, { pool: fakePool() });
  const app2 = createApp(cfg, quiet, { store: store2, seed: rows });
  const again = app2.auth.login('carol', 'secret1');
  assert.equal(again.player.id, player.id);
  assert.equal(again.player.balance, cfg.startingBalance);
  assert.equal(app2.ledger.reconcile().ok, true);
  await store2.close();
  app2.stop();
});
