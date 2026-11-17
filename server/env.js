// Tiny .env loader (no dependency). Real environment variables win over the file.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const file = join(ROOT, '.env');
if (existsSync(file)) {
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
  dbFile: process.env.DB_FILE || join(ROOT, 'data', 'firm.db'),
  finnhubKey: process.env.FINNHUB_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  // models per job (agent-cost-control skill §1: Haiku for ticks; configurable)
  modelTick: process.env.AGENT_MODEL_TICK || 'claude-haiku-5-5',
  llmMonthlyCapUsd: num('LLM_MONTHLY_CAP_USD', 75),
  llmEnabled: bool('LLM_ENABLED', true),
  // dev/testing: let orders fill at the last delayed price while the US market is closed
  allowClosedFills: bool('SIM_ALLOW_CLOSED_FILLS', false),
  startingBalance: num('STARTING_BALANCE_MINOR', 1_000_000), // ¤ 10,000.00
  lotteryBackfillFrom: process.env.LOTTERY_BACKFILL_FROM || '2016-01-01',
  offline: bool('OFFLINE', false), // no outbound fetches (tests)
};
