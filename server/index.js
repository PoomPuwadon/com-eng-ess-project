// Entry point: `node server/index.js` (or `npm run server`). In dev, Vite proxies /api here.
import { CONFIG } from './env.js';
import { createApp } from './app.js';

process.removeAllListeners('warning'); // node:sqlite prints an ExperimentalWarning on some Node versions
const app = createApp(CONFIG);
app.server.listen(CONFIG.port, () => {
  console.log(`[firm] server on http://localhost:${CONFIG.port} · db ${CONFIG.dbFile}`);
  console.log(`[firm] LLM agents: ${CONFIG.anthropicKey ? `enabled (${CONFIG.modelTick}, cap $${CONFIG.llmMonthlyCapUsd}/month)` : 'no ANTHROPIC_API_KEY — rule-based fallback'}`);
  console.log(`[firm] stock quotes: ${CONFIG.finnhubKey ? 'Finnhub + Yahoo charts' : 'Yahoo Finance public chart endpoint'}${CONFIG.allowClosedFills ? ' · SIM_ALLOW_CLOSED_FILLS on' : ''}`);
  app.start();
});
const shutdown = () => { app.stop(); app.server.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
