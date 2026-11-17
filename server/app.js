// Composition root: DB, ledger, services, schedulers and the HTTP/SSE API.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './env.js';
import { openDb } from './db.js';
import { createLedger, VAULT, DEPT, MINT, EXT_MARKET, EXT_LOTTERY } from './ledger.js';
import { createTreasury } from './treasury.js';
import { createPlayers } from './players.js';
import { createRoulette } from './roulette.js';
import { createMarketData, SYMBOLS } from './market/data.js';
import { createTrading } from './market/trading.js';
import { createLLM } from './agents/llm.js';
import { createGateway, AGENTS } from './agents/gateway.js';
import { createTradingDesk } from './agents/tradingDesk.js';
import { createLotteryData, ATTRIBUTION } from './lottery/data.js';
import { createInstitute, TICKET_PRICE } from './lottery/institute.js';
import { TARGETS, MODELS } from './lottery/models.js';
import { createAuth, jsonFileStore, memoryStore } from './auth.js';
import { createHub } from './realtime/hub.js';
import { attachWs } from './realtime/ws.js';

function createBus() {
  const clients = new Set();
  const listeners = new Map();
  return {
    clients,
    emit(event, data) {
      const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(msg);
      for (const fn of listeners.get(event) || []) fn(data);
    },
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(fn); },
  };
}

export function createApp(config, log = console) {
  const db = openDb(config.dbFile);
  const bus = createBus();
  const ledger = createLedger(db);
  const treasury = createTreasury(db, ledger, bus);
  const players = createPlayers(db, ledger, config);
  const auth = createAuth({ store: config.dbFile === ':memory:' ? memoryStore() : jsonFileStore(config.usersFile), players, adminPassword: config.adminPassword || 'admin123' });
  const hub = createHub({ players, auth, ledger, config, log });
  const roulette = createRoulette(db, ledger, bus, players);
  const market = createMarketData(db, bus, config, log);
  const trading = createTrading(db, ledger, market, bus, config);
  const llm = createLLM(db, config, log);
  const gateway = createGateway(db);
  const desk = createTradingDesk({ db, ledger, market, trading, gateway, llm, bus, log });
  const lotto = createLotteryData(db, bus, config, log);
  const institute = createInstitute({ db, ledger, data: lotto, gateway, llm, bus, players, log });
  let reconcile = ledger.reconcile();
  treasury.genesis();

  // ---------------------------------------------------------------- schedulers (the firm runs 24/7, players or not)
  const timers = [];
  let start = function start() {
    timers.push(setInterval(() => { try { treasury.deliverDue(); trading.processPending(); } catch (e) { log.warn('[exec]', e.message); } }, 4000));
    timers.push(setInterval(() => { try { trading.snapshotNav([DEPT.trading, ...db.all("SELECT DISTINCT owner FROM positions WHERE owner LIKE 'PLAYER:%' AND qty > 0").map((r) => r.owner)]); } catch (e) { log.warn('[nav]', e.message); } }, 300_000));
    timers.push(setInterval(() => { reconcile = ledger.reconcile(); if (!reconcile.ok) log.error('[ledger] LEDGER_DRIFT', reconcile.problems); }, 600_000));
    market.start().catch((e) => log.warn('[market]', e.message));
    // trading desk: first tick once data and budget are in, then every 15 min (open) / 60 min (closed)
    const deskLoop = async () => {
      let delay = 60_000;
      try { const r = await desk.tick(); if (r.ok) delay = desk.intervalMs(); else delay = 60_000; if (r.ok) log.log(`[desk] tick: ${r.placed} placed, ${r.rejected} rejected, llm=${r.usedLLM}`); } catch (e) { log.warn('[desk]', e.message); }
      timers.push(setTimeout(deskLoop, delay));
    };
    timers.push(setTimeout(deskLoop, 30_000));
    // lottery: backfill history, poll results, run the pipeline, settle
    const lottoLoop = async () => {
      try { await lotto.pollLatest(); await institute.cycle('scheduled'); } catch (e) { log.warn('[lottery]', e.message); }
      const run = institute.getRun(), cal = institute.calendar();
      const waiting = run && !run.decision && run.target === cal.next && cal.salesOpen; // e.g. budget still with the courier
      timers.push(setTimeout(lottoLoop, Math.min(lotto.nextPollDelay(cal.next), waiting ? 10 * 60_000 : Infinity)));
    };
    if (!config.offline) {
      lotto.backfill().then(() => institute.cycle('backfill')).catch((e) => log.warn('[lottery backfill]', e.message));
      timers.push(setTimeout(lottoLoop, 5_000));
    }
    bus.on('lottery', (e) => { if (e.type === 'draw_confirmed') institute.cycle('new draw').catch(() => {}); });
    // a department budget landing can unblock a waiting decision
    bus.on('trip', (t) => {
      if (t.status !== 'delivered') return;
      if (t.to === DEPT.thai) institute.cycle('budget delivered').catch(() => {});
      if (t.to === DEPT.trading) desk.tick({ reason: 'budget delivered' }).catch(() => {});
    });
  }
  let stop = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); market.stop(); };

  // ---------------------------------------------------------------- HTTP
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 64_000) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
  });
  const authOf = (req) => players.auth((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const need = (req) => { const p = authOf(req); if (!p) throw Object.assign(new Error('Session required'), { status: 401 }); return p; };
  const rate = new Map(); // token bucket per player for write endpoints
  const limit = (pid, perSec = 4) => {
    const now = Date.now(), b = rate.get(pid) || { t: now, n: perSec };
    b.n = Math.min(perSec, b.n + ((now - b.t) / 1000) * perSec); b.t = now;
    if (b.n < 1) throw Object.assign(new Error('Easy, tiger. One allocation at a time.'), { status: 429 });
    b.n -= 1; rate.set(pid, b);
  };

  function firmBook() {
    const book = trading.portfolio(DEPT.trading);
    return {
      book, navHistory: trading.navHistory(DEPT.trading), trades: trading.trades(DEPT.trading, 60), orders: trading.orders(DEPT.trading, 30),
      agents: gateway.latestReports('trading_floor', 3), budget: { inTransit: treasury.inTransit(DEPT.trading) }, llm: llm.status(),
      lastTick: desk.lastTick(), nextTickInMs: desk.lastTick() ? Math.max(0, desk.lastTick() + desk.intervalMs() - Date.now()) : null,
    };
  }

  const routes = {
    'GET /api/health': () => ({ ok: true, at: Date.now() }),
    'POST /api/session': async (req) => {
      const body = await readBody(req);
      const p = body.token && players.auth(body.token);
      if (p) return { token: body.token, player: p };
      return players.create();
    },
    'GET /api/me': (req) => ({ player: need(req) }),
    // name + password: unknown names open an account (Visitor), known names must match
    'POST /api/auth/enter': async (req) => { const b = await readBody(req); limit(`auth:${req.socket.remoteAddress}`, 1); return auth.enter(b.name, b.password); },
    'POST /api/auth/login': async (req) => { const b = await readBody(req); limit(`auth:${req.socket.remoteAddress}`, 1); return auth.login(b.name, b.password); },
    'POST /api/auth/register': async (req) => { const b = await readBody(req); limit(`auth:${req.socket.remoteAddress}`, 1); return auth.register(b.name, b.password); },
    'GET /api/presence': () => ({ players: hub.snapshot().length, meta: hub.meta() }),
    'POST /api/me/name': async (req) => ({ player: players.rename(need(req).id, (await readBody(req)).name) }),

    'GET /api/roulette/state': (req) => { const p = authOf(req); return { recent: roulette.recent(), limits: roulette.LIMITS, stats: roulette.stats(), commitment: p ? roulette.commitment(p.id) : null }; },
    'POST /api/roulette/spin': async (req) => { const p = need(req); limit(p.id, 2); return roulette.spin(p.id, (await readBody(req)).bets); },

    'GET /api/market/quotes': () => market.snapshot(),
    'GET /api/market/chart': (req, url) => {
      const s = String(url.searchParams.get('symbol') || '').toUpperCase();
      if (!SYMBOLS.includes(s)) throw Object.assign(new Error('Unknown symbol'), { status: 404 });
      return { symbol: s, quote: market.quote(s), intraday: market.bars(s, '5m'), daily: market.bars(s, '1d').map((b) => [b[0], b[4]]) };
    },
    // compact feed for the 3D trading-floor walls: today's 5-min closes + last 12 daily candles per symbol
    'GET /api/market/wall': () => ({
      at: Date.now(),
      symbols: Object.fromEntries(SYMBOLS.map((s) => [s, { spark: market.bars(s, '5m').map((b) => b[1]), candles: market.bars(s, '1d').slice(-12).map((b) => [b[1], b[2], b[3], b[4]]) }])),
    }),
    'GET /api/market/portfolio': (req) => { const p = need(req); return { portfolio: trading.portfolio(p.account), trades: trading.trades(p.account, 40), orders: trading.orders(p.account, 40), navHistory: trading.navHistory(p.account) }; },
    'POST /api/market/order': async (req) => { const p = need(req); limit(p.id); return { order: trading.placeOrder(p.account, await readBody(req), { actor: `player:${p.id}` }), portfolio: trading.portfolio(p.account) }; },
    'POST /api/market/cancel': async (req) => { const p = need(req); return { order: trading.cancelOrder(p.account, Number((await readBody(req)).id)), portfolio: trading.portfolio(p.account) }; },
    'GET /api/market/leaderboard': () => ({ leaders: trading.leaderboard(players, config.startingBalance), firm: { nav: trading.portfolio(DEPT.trading).nav, start: 100_000_000 } }),
    'GET /api/firm/book': () => firmBook(),

    'GET /api/lottery/state': (req) => {
      const p = authOf(req);
      const run = institute.getRun();
      return {
        calendar: institute.calendar(), latest: lotto.latest(), sales: institute.sales(institute.calendar().next),
        recentDraws: lotto.draws().slice(-12).reverse().map((d) => ({ date: d.date, first: d.first, last2: d.last2, last3f: d.last3f, last3b: d.last3b })), draws: lotto.count(), backfill: lotto.state, attribution: ATTRIBUTION, price: TICKET_PRICE,
        run, history: institute.history(), models: MODELS.map(({ id, name, desc }) => ({ id, name, desc })), targets: Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, { label: t.label, k: t.k, topK: t.topK }])),
        agents: gateway.latestReports('thai_markets', 2), tickets: p ? institute.tickets(p.account) : [], llm: llm.status(),
      };
    },
    'POST /api/lottery/buy': async (req) => { const p = need(req); limit(p.id); const b = await readBody(req); return institute.buy(p.id, b.number, b.qty || 1); },

    'GET /api/ops': () => ({
      reconcile, llm: llm.status(), market: { ...market.state, status: market.snapshot().market }, lottery: lotto.state,
      vault: ledger.balance(VAULT), mint: ledger.balance(MINT), externalMarket: ledger.balance(EXT_MARKET), externalLottery: ledger.balance(EXT_LOTTERY),
      depts: { trading: ledger.balance(DEPT.trading), thai: ledger.balance(DEPT.thai) }, trips: treasury.trips(10), agents: AGENTS,
    }),
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      bus.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => { clearInterval(ping); bus.clients.delete(res); });
      return;
    }
    const fn = routes[`${req.method} ${url.pathname}`];
    if (fn) {
      try { json(res, 200, await fn(req, url)); } catch (e) {
        const status = e.status || (e.code === 'INSUFFICIENT' ? 402 : 500);
        if (status >= 500) log.error('[api]', req.method, url.pathname, e);
        json(res, status, { error: status >= 500 ? 'Internal error' : e.message });
      }
      return;
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    // production: serve the built client
    const dist = join(ROOT, 'dist');
    let file = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) return json(res, 403, { error: 'Forbidden' });
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    if (!existsSync(file)) return json(res, 404, { error: 'Client not built — run npm run build, or use npm run dev' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  }

  const server = createServer(handle);
  let ws = null;
  const start0 = start, stop0 = stop;
  start = () => { ws = attachWs(server, hub, log); start0(); };
  stop = () => { ws?.stop(); stop0(); };
  return { auth, hub, db, ledger, treasury, players, roulette, market, trading, llm, gateway, desk, lotto, institute, bus, server, start, stop, routes };
}
