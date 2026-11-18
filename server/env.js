// Tiny .env loader (no dependency). Real environment variables win over the file.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRoutes } from './agents/llm.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Precedence: real environment variables, then .env.local (gitignored secrets), then .env.
// Secrets are read here, server side only; they are never sent to the client or logged.
for (const name of ['.env.local', '.env']) {
  const file = join(ROOT, name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const bool = (k, d) => (process.env[k] ? /^(1|true|yes)$/i.test(process.env[k]) : d);

export const CONFIG = {
  port: num('GAME_PORT', 8787),
  // DATABASE_URL (Supabase Postgres, session-pooler URI) makes Supabase the database of record; SQLite is then only the in-memory working set
  databaseUrl: process.env.DATABASE_URL || '',
  dbFile: process.env.DB_FILE || (process.env.DATABASE_URL ? ':memory:' : join(ROOT, 'data', 'firm.db')),
  finnhubKey: process.env.FINNHUB_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  // which provider the agents use when both keys are set: 'claude' (default) or 'gemini'
  llmProvider: (process.env.LLM_PROVIDER || '').toLowerCase(),
  geminiModel: process.env.GEMINI_MODEL || '', // comma list = fallback chain; empty = DEFAULT_GEMINI in agents/llm.js
  // per-agent provider overrides, e.g. "head_trader=claude,co_head_trader=gemini" (defaults: ROUTES in agents/llm.js)
  agentProviders: parseRoutes(process.env.AGENT_PROVIDERS),
  footballKey: process.env.FOOTBALL_DATA_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  mediaDir: process.env.MEDIA_DIR || join(ROOT, 'data', 'arena-media'), // VT-02 uploaded highlights (gitignored)
  usersFile: process.env.USERS_FILE || join(ROOT, 'data', 'users.json'),
  maxPlayers: num('MAX_PLAYERS', 50),
  // models per job (agent-cost-control skill §1: Haiku for ticks; configurable)
  modelTick: process.env.AGENT_MODEL_TICK || 'claude-haiku-5-5',
  llmMonthlyCapUsd: num('LLM_MONTHLY_CAP_USD', 75),
  llmEnabled: bool('LLM_ENABLED', true),
  // dev/testing: let orders fill at the last delayed price while the US market is closed
  allowClosedFills: bool('SIM_ALLOW_CLOSED_FILLS', false),
  startingBalance: num('STARTING_BALANCE_MINOR', 1_000_000), // ¤ 10,000.00
  lotteryBackfillFrom: process.env.LOTTERY_BACKFILL_FROM || '2016-01-01',
  offline: bool('OFFLINE', false), // no outbound fetches (tests)
  // OT-01 off-hours research (agents/research.js): one cycle every N minutes while the US market is closed, inside its own monthly sub-budget
  researchEveryMin: num('RESEARCH_EVERY_MIN', 150),
  researchBudgetUsd: num('RESEARCH_BUDGET_USD', 2),
};
