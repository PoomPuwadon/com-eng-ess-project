// Entry point: `node server/index.js` (or `npm run server`). In dev, Vite proxies /api here.
import { CONFIG } from './env.js';
import { createApp } from './app.js';
import { connect } from './store.js';

process.removeAllListeners('warning'); // node:sqlite prints an ExperimentalWarning on some Node versions

// Supabase Postgres is the database of record when DATABASE_URL is set: load everything before serving.
let store = null, seed;
if (CONFIG.databaseUrl) {
  try {
    store = await connect(CONFIG.databaseUrl, console);
    seed = await store.loadAll();
    console.log(`[firm] Supabase Postgres connected · loaded ${Object.values(seed).reduce((n, r) => n + r.length, 0)} rows from ${Object.keys(seed).length} tables`);
  } catch (e) {
    console.error('[firm] cannot reach Supabase Postgres (check DATABASE_URL):', e.message);
    process.exit(1);
  }
}

const app = createApp(CONFIG, console, { store, seed });
app.server.listen(CONFIG.port, () => {
  console.log(`[firm] server on http://localhost:${CONFIG.port} · db ${store ? 'Supabase Postgres (write-through)' : CONFIG.dbFile}`);
  const st = app.llm.status();
  console.log(`[firm] LLM agents: ${st.provider ? `${st.providers.map((p) => `${p.name} (${p.model})`).join(' + ')} · cap $${CONFIG.llmMonthlyCapUsd}/month · ${Object.entries(st.routes).map(([a, r]) => `${a}→${r?.provider}`).join(', ')}` : 'no ANTHROPIC_API_KEY / GEMINI_API_KEY — rule-based fallback + demo chart desk'}`);
  console.log(`[firm] football data: ${CONFIG.footballKey ? 'football-data.org key loaded' : 'no FOOTBALL_DATA_API_KEY — simulated fixtures'}`);
  console.log(`[firm] stock quotes: ${CONFIG.finnhubKey ? 'Finnhub + Yahoo charts' : 'Yahoo Finance public chart endpoint'}${CONFIG.allowClosedFills ? ' · SIM_ALLOW_CLOSED_FILLS on' : ''}`);
  app.start();
});
// Render sends SIGTERM on every restart or deploy: stop the schedulers, flush pending writes to Supabase, then exit.
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  app.stop(); app.server.close();
  await Promise.race([store ? store.close() : null, new Promise((r) => setTimeout(r, 8000))]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
