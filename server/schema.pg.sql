-- Supabase Postgres schema for FINANCIAL FIRM. Idempotent: server/store.js applies it on every boot.
-- Mirrors the SQLite working set in server/db.js (INTEGER -> BIGINT, REAL -> DOUBLE PRECISION).
-- No foreign keys on purpose: rows are replicated in batches, so insert order must not matter.

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, player_id TEXT NOT NULL, created_at BIGINT NOT NULL, last_login BIGINT);

CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS balances (account_id TEXT PRIMARY KEY, balance BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (id BIGINT PRIMARY KEY, created_at BIGINT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, ref TEXT, idem TEXT UNIQUE, memo TEXT);
CREATE TABLE IF NOT EXISTS entries (id BIGINT PRIMARY KEY, tx_id BIGINT NOT NULL, account_id TEXT NOT NULL, amount BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS entries_acct ON entries(account_id);
CREATE INDEX IF NOT EXISTS entries_tx ON entries(tx_id);

CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RAISE EXCEPTION 'ledger is append-only'; END $$;
DROP TRIGGER IF EXISTS tx_append_only ON transactions;
CREATE TRIGGER tx_append_only BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
DROP TRIGGER IF EXISTS en_append_only ON entries;
CREATE TRIGGER en_append_only BEFORE UPDATE OR DELETE ON entries FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TABLE IF NOT EXISTS cash_trips (id BIGINT PRIMARY KEY, from_acct TEXT NOT NULL, to_acct TEXT NOT NULL, amount BIGINT NOT NULL, status TEXT NOT NULL, reason TEXT, created_at BIGINT NOT NULL, eta BIGINT NOT NULL, delivered_at BIGINT);

CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at BIGINT NOT NULL, last_seen BIGINT);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS fixture_positions (id BIGINT PRIMARY KEY, owner TEXT NOT NULL, match_id BIGINT NOT NULL, market TEXT NOT NULL, pick TEXT NOT NULL,
  stake BIGINT NOT NULL, price DOUBLE PRECISION NOT NULL, status TEXT NOT NULL, payout BIGINT, created_at BIGINT NOT NULL, settled_at BIGINT, label TEXT);

CREATE TABLE IF NOT EXISTS roulette_rounds (id BIGINT PRIMARY KEY, player_id TEXT NOT NULL, result BIGINT NOT NULL, bets TEXT NOT NULL, stake BIGINT NOT NULL, returned BIGINT NOT NULL, seed_hash TEXT NOT NULL, created_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS quotes (symbol TEXT PRIMARY KEY, name TEXT, price DOUBLE PRECISION, prev_close DOUBLE PRECISION, day_high DOUBLE PRECISION, day_low DOUBLE PRECISION, volume BIGINT, as_of BIGINT, fetched_at BIGINT, source TEXT);
CREATE TABLE IF NOT EXISTS bars (symbol TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, as_of BIGINT, fetched_at BIGINT, PRIMARY KEY (symbol, kind));
CREATE TABLE IF NOT EXISTS orders (id BIGINT PRIMARY KEY, owner TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, qty BIGINT NOT NULL, type TEXT NOT NULL, limit_price BIGINT, status TEXT NOT NULL,
  reserved BIGINT NOT NULL DEFAULT 0, fill_price BIGINT, filled_at BIGINT, created_at BIGINT NOT NULL, agent TEXT, rationale TEXT, note TEXT, model TEXT);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner);
CREATE TABLE IF NOT EXISTS positions (owner TEXT NOT NULL, symbol TEXT NOT NULL, qty BIGINT NOT NULL, cost BIGINT NOT NULL, reserved_qty BIGINT NOT NULL DEFAULT 0, realized BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (owner, symbol));
CREATE TABLE IF NOT EXISTS trades (id BIGINT PRIMARY KEY, owner TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, qty BIGINT NOT NULL, price BIGINT NOT NULL, amount BIGINT NOT NULL,
  realized BIGINT, order_id BIGINT, agent TEXT, rationale TEXT, created_at BIGINT NOT NULL, model TEXT);
CREATE INDEX IF NOT EXISTS trades_owner ON trades(owner, created_at);
CREATE TABLE IF NOT EXISTS nav_history (owner TEXT NOT NULL, t BIGINT NOT NULL, nav BIGINT NOT NULL, PRIMARY KEY (owner, t));

CREATE TABLE IF NOT EXISTS agent_reports (id BIGINT PRIMARY KEY, agent TEXT NOT NULL, dept TEXT NOT NULL, created_at BIGINT NOT NULL, report TEXT NOT NULL, data TEXT, llm BIGINT NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS agent_reports_dept ON agent_reports(dept, created_at);
CREATE TABLE IF NOT EXISTS agent_privileges (agent TEXT PRIMARY KEY, offline_allowed BIGINT NOT NULL, daily_spend_cap BIGINT NOT NULL, max_actions_per_day BIGINT NOT NULL, max_single_stake BIGINT NOT NULL, allowed_actions TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_usage (agent TEXT NOT NULL, day TEXT NOT NULL, actions BIGINT NOT NULL DEFAULT 0, spend BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (agent, day));
CREATE TABLE IF NOT EXISTS agent_rejections (id BIGINT PRIMARY KEY, agent TEXT NOT NULL, created_at BIGINT NOT NULL, action TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS llm_spend (id BIGINT PRIMARY KEY, created_at BIGINT NOT NULL, job TEXT NOT NULL, agent TEXT, model TEXT NOT NULL, input_tokens BIGINT, cache_write BIGINT, cache_read BIGINT, output_tokens BIGINT, usd DOUBLE PRECISION NOT NULL);

CREATE TABLE IF NOT EXISTS lottery_draws (date TEXT PRIMARY KEY, json TEXT NOT NULL, confirmed BIGINT NOT NULL, first_seen BIGINT NOT NULL, fetched_at BIGINT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_probe (date TEXT PRIMARY KEY, found BIGINT NOT NULL, checked_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_runs (id BIGINT PRIMARY KEY, target_date TEXT NOT NULL, created_at BIGINT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lottery_tickets (id BIGINT PRIMARY KEY, owner TEXT NOT NULL, number TEXT NOT NULL, target_date TEXT NOT NULL, sale_day TEXT NOT NULL, price BIGINT NOT NULL, status TEXT NOT NULL,
  payout BIGINT, prizes TEXT, settled_date TEXT, run_id BIGINT, source TEXT, created_at BIGINT NOT NULL, model TEXT);
CREATE INDEX IF NOT EXISTS tickets_status ON lottery_tickets(status);

-- Only the server (direct Postgres login) touches these tables: lock out the public Data API.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DO $$ BEGIN REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
