// Entry point: `node server/index.js` (or `npm run server`). In dev, Vite proxies /api here.
import { CONFIG } from './env.js';
import { createApp } from './app.js';

process.removeAllListeners('warning'); // node:sqlite prints an ExperimentalWarning on some Node versions
const app = createApp(CONFIG);
app.server.listen(CONFIG.port, () => {
  console.log(`[firm] server on http://localhost:${CONFIG.port} · db ${CONFIG.dbFile}`);
  const st = app.llm.status();
  console.log(`[firm] LLM agents: ${st.provider ? `${st.provider} (${st.model}, cap $${CONFIG.llmMonthlyCapUsd}/month)` : 'no ANTHROPIC_API_KEY / GEMINI_API_KEY — rule-based fallback + demo chart desk'}`);
  console.log(`[firm] football data: ${CONFIG.footballKey ? 'football-data.org key loaded' : 'no FOOTBALL_DATA_API_KEY — simulated fixtures'}`);
  console.log(`[firm] stock quotes: ${CONFIG.finnhubKey ? 'Finnhub + Yahoo charts' : 'Yahoo Finance public chart endpoint'}${CONFIG.allowClosedFills ? ' · SIM_ALLOW_CLOSED_FILLS on' : ''}`);
  app.start();
});
const shutdown = () => { app.stop(); app.server.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
