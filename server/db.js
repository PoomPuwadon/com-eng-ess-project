// SQLite (Node's built-in node:sqlite). One file, synchronous, single process: every money write
// runs inside one transaction, so concurrent requests can never interleave half a posting.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

-- sign-in accounts (scrypt-hashed passwords); replicated to Supabase like everything else
CREATE TABLE IF NOT EXISTS users (key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, player_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER);

-- ---------------------------------------------------------------- ledger (money-ledger skill)
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS balances (account_id TEXT PRIMARY KEY REFERENCES accounts(id), balance INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, actor TEXT NOT NULL,
  reason TEXT NOT NULL, ref TEXT, idem TEXT UNIQUE, memo TEXT);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tx_id INTEGER NOT NULL REFERENCES transactions(id),
  account_id TEXT NOT NULL REFERENCES accounts(id), amount INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS entries_acct ON entries(account_id);
CREATE INDEX IF NOT EXISTS entries_tx ON entries(tx_id);
-- append-only
CREATE TRIGGER IF NOT EXISTS tx_no_update BEFORE UPDATE ON transactions BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS tx_no_delete BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS en_no_update BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS en_no_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE IF NOT EXISTS cash_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_acct TEXT NOT NULL, to_acct TEXT NOT NULL, amount INTEGER NOT NULL,
  status TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL, eta INTEGER NOT NULL, delivered_at INTEGER);

-- ---------------------------------------------------------------- players (guest identities until Phase 1 sign-in)
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER);
-- extra bearer tokens issued by name + password sign-in (one per device); the guest token stays valid too
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL);
-- positions on real football fixtures (Sports Analytics Arena) — stake held in ESCROW:BET:fx<id>
CREATE TABLE IF NOT EXISTS fixture_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, match_id INTEGER NOT NULL, market TEXT NOT NULL, pick TEXT NOT NULL,
  stake INTEGER NOT NULL, price REAL NOT NULL, status TEXT NOT NULL, payout INTEGER, created_at INTEGER NOT NULL, settled_at INTEGER, label TEXT);

-- ---------------------------------------------------------------- roulette
CREATE TABLE IF NOT EXISTS roulette_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, result INTEGER NOT NULL, bets TEXT NOT NULL,
  stake INTEGER NOT NULL, returned INTEGER NOT NULL, seed_hash TEXT NOT NULL, created_at INTEGER NOT NULL);

-- ---------------------------------------------------------------- market
CREATE TABLE IF NOT EXISTS quotes (
  symbol TEXT PRIMARY KEY, name TEXT, price REAL, prev_close REAL, day_high REAL, day_low REAL, volume INTEGER,
  as_of INTEGER, fetched_at INTEGER, source TEXT);
CREATE TABLE IF NOT EXISTS bars (symbol TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, as_of INTEGER, fetched_at INTEGER, PRIMARY KEY (symbol, kind));
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, qty INTEGER NOT NULL,
  type TEXT NOT NULL, limit_price INTEGER, status TEXT NOT NULL, reserved INTEGER NOT NULL DEFAULT 0,
  fill_price INTEGER, filled_at INTEGER, created_at INTEGER NOT NULL, agent TEXT, rationale TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner);
CREATE TABLE IF NOT EXISTS positions (
  owner TEXT NOT NULL, symbol TEXT NOT NULL, qty INTEGER NOT NULL, cost INTEGER NOT NULL, reserved_qty INTEGER NOT NULL DEFAULT 0,
  realized INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner, symbol));
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, qty INTEGER NOT NULL,
  price INTEGER NOT NULL, amount INTEGER NOT NULL, realized INTEGER, order_id INTEGER, agent TEXT, rationale TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS trades_owner ON trades(owner, created_at);
CREATE TABLE IF NOT EXISTS nav_history (owner TEXT NOT NULL, t INTEGER NOT NULL, nav INTEGER NOT NULL, PRIMARY KEY (owner, t));

-- ---------------------------------------------------------------- agents (agent-cost-control skill)
CREATE TABLE IF NOT EXISTS agent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, dept TEXT NOT NULL, created_at INTEGER NOT NULL,
  report TEXT NOT NULL, data TEXT, llm INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS agent_reports_dept ON agent_reports(dept, created_at);
CREATE TABLE IF NOT EXISTS agent_privileges (
  agent TEXT PRIMARY KEY, offline_allowed INTEGER NOT NULL, daily_spend_cap INTEGER NOT NULL,
  max_actions_per_day INTEGER NOT NULL, max_single_stake INTEGER NOT NULL, allowed_actions TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_usage (agent TEXT NOT NULL, day TEXT NOT NULL, actions INTEGER NOT NULL DEFAULT 0, spend INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (agent, day));
CREATE TABLE IF NOT EXISTS agent_rejections (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, created_at INTEGER NOT NULL, action TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS llm_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, job TEXT NOT NULL, agent TEXT, model TEXT NOT NULL,
  input_tokens INTEGER, cache_write INTEGER, cache_read INTEGER, output_tokens INTEGER, usd REAL NOT NULL);

-- ---------------------------------------------------------------- Thai lottery
CREATE TABLE IF NOT EXISTS lottery_draws (date TEXT PRIMARY KEY, json TEXT NOT NULL, confirmed INTEGER NOT NULL, first_seen INTEGER NOT NULL, fetched_at INTEGER NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_probe (date TEXT PRIMARY KEY, found INTEGER NOT NULL, checked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, target_date TEXT NOT NULL, created_at INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, number TEXT NOT NULL, target_date TEXT NOT NULL, sale_day TEXT NOT NULL,
  price INTEGER NOT NULL, status TEXT NOT NULL, payout INTEGER, prizes TEXT, settled_date TEXT, run_id INTEGER, source TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tickets_status ON lottery_tickets(status);
`;

/** seed: { table: rows[] } read from Supabase at boot (server/store.js); empty for tests and local-only runs. */
export function openDb(file, { seed } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  // additive migrations: which model made each decision (Claude v Gemini league table)
  for (const t of ['orders', 'trades', 'lottery_tickets']) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'model')) db.exec(`ALTER TABLE ${t} ADD COLUMN model TEXT`);
  }
  if (seed) {
    db.exec('BEGIN');
    for (const [t, rows] of Object.entries(seed)) {
      if (!rows.length) continue;
      const have = new Set(db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name));
      if (!have.size) continue; // a table this build does not know about
      const cols = Object.keys(rows[0]).filter((c) => have.has(c));
      const ins = db.prepare(`INSERT OR REPLACE INTO "${t}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const r of rows) ins.run(...cols.map((c) => r[c] ?? null));
    }
    db.exec('COMMIT');
  }
  // statement cache
  const cache = new Map();
  db.q = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  db.get = (sql, ...a) => db.q(sql).get(...a);
  db.all = (sql, ...a) => db.q(sql).all(...a);
  db.run = (sql, ...a) => db.q(sql).run(...a);
  let depth = 0;
  // nested-safe transaction (savepoints inside an outer transaction)
  db.tx = (fn) => {
    const sp = `sp${depth}`;
    db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
    depth++;
    try {
      const r = fn();
      depth--;
      db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
      return r;
    } catch (e) {
      depth--;
      db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  };
  db.kvGet = (k, d = null) => { const r = db.get('SELECT value FROM kv WHERE key = ?', k); return r ? JSON.parse(r.value) : d; };
  db.kvSet = (k, v) => db.run('INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
  return db;
}
