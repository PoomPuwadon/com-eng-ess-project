// Composition root: DB, ledger, services, schedulers and the HTTP/SSE API.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './env.js';
import { openDb } from './db.js';
import { createLedger, VAULT, DEPT, MINT, EXT_MARKET, EXT_LOTTERY } from './ledger.js';
import { createTreasury, INITIAL_BUDGETS } from './treasury.js';
import { createPlayers } from './players.js';
import { createRoulette } from './roulette.js';
import { createMarketData, SYMBOLS } from './market/data.js';
import { createTrading } from './market/trading.js';
import { createLLM } from './agents/llm.js';
import { createGateway, AGENTS } from './agents/gateway.js';
import { createTradingDesk } from './agents/tradingDesk.js';
import { createChartAnalyst } from './agents/chartAnalyst.js';
import { createLeague } from './agents/league.js';
import { createFeed } from './agents/feed.js';
import { createResearch } from './agents/research.js';
import { createNews } from './market/news.js';
import { createFootball } from './football/service.js';
import { createArenaMedia } from './football/arenaMedia.js';
import { createLotteryData, ATTRIBUTION } from './lottery/data.js';
import { createInstitute, TICKET_PRICE } from './lottery/institute.js';
import { TARGETS, MODELS } from './lottery/models.js';
import { createAuth, dbStore, memoryStore } from './auth.js';
import { createHub } from './realtime/hub.js';
import { marketStatus } from './time.js';
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

/** extra.store / extra.seed: the Supabase write-through store and the rows it loaded (see server/store.js and index.js). */
export function createApp(config, log = console, extra = {}) {
  const db = openDb(config.dbFile, { seed: extra.seed });
  extra.store?.attach(db);
  const bus = createBus();
  const ledger = createLedger(db);
  const treasury = createTreasury(db, ledger, bus);
  const players = createPlayers(db, ledger, config);
  const auth = createAuth({ store: config.dbFile === ':memory:' && !extra.store ? memoryStore() : dbStore(db, config.usersFile), players, adminPassword: config.adminPassword || 'admin123' });
  const hub = createHub({ players, auth, ledger, config, log });
  const roulette = createRoulette(db, ledger, bus, players);
  const market = createMarketData(db, bus, config, log);
  const trading = createTrading(db, ledger, market, bus, config);
  const llm = createLLM(db, config, log);
  const gateway = createGateway(db);
  const feed = createFeed({ db, bus, routeOf: llm.route }); // AI visuals: one attributed event stream for OT-01 / OT-02 / VT-02
  const news = createNews({ config, log });
  const research = createResearch({ db, llm, market, gateway, feed, news, config, log });
  const desk = createTradingDesk({ db, ledger, market, trading, gateway, llm, bus, feed, research, log });
  const league = createLeague({ db, market, desk });
  const chartDesk = createChartAnalyst({ llm, log });
  const football = createFootball({ db, ledger, treasury, llm, config, feed, log });
  const media = createArenaMedia({ db, football, dir: config.mediaDir || join(ROOT, 'data', 'arena-media'), blobs: extra.store?.blobs || null, offline: Boolean(config.offline), log });
  media.restore().catch((e) => log.warn?.('[media] restore failed:', e.message)); // uploads come back from Supabase after a redeploy
  hub.extend(media.hubOps(hub));
  media.onChange((v) => hub.broadcast({ t: 'arenaMedia', media: v })); // live to every connected client
  const lotto = createLotteryData(db, bus, config, log);
  const institute = createInstitute({ db, ledger, data: lotto, gateway, llm, bus, players, feed, log });
  let reconcile = ledger.reconcile();
  treasury.genesis();

  // a desk order that fills is the end of the story the room has been following: idea -> proposal -> cleared -> FILLED
  bus.on('trade', (t) => {
    if (t.owner !== DEPT.trading || !t.agent) return;
    feed.emit({ room: 'OT-01', agent: t.agent, model: t.model, stage: 'result', outcome: 'filled', ref: t.order_id ? `order:${t.order_id}` : null,
      text: `FILLED ${String(t.side).toUpperCase()} ${t.qty} ${t.symbol} @ ${(t.price / 100).toFixed(2)}${t.rationale ? ` — ${t.rationale}` : ''}`, data: { symbol: t.symbol, side: t.side, qty: t.qty, price: t.price, realized: t.realized, rationale: String(t.rationale || '').slice(0, 300) } });
  });

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
      try { const r = await desk.tick(); if (r.ok) delay = desk.intervalMs(); else delay = 60_000; if (!r.ok) feed.status('OT-01', { nextAt: Date.now() + delay, market: marketStatus().open ? 'open' : 'closed', label: r.skipped ? `Waiting: ${r.skipped}` : 'Next desk decision' }); if (r.ok) log.log(`[desk] tick: ${r.placed} placed, ${r.rejected} rejected, llm=${r.usedLLM}`); } catch (e) { log.warn('[desk]', e.message); }
      timers.push(setTimeout(deskLoop, delay));
    };
    timers.push(setTimeout(deskLoop, 30_000));
    feed.status('OT-01', { nextAt: Date.now() + 30_000, market: marketStatus().open ? 'open' : 'closed', mode: marketStatus().open ? 'trading' : 'research', label: 'Next desk decision' });
    // OT-01 off-hours research: market + news research while the market is closed (tiny capped budget, see agents/research.js)
    timers.push(setTimeout(() => research.tick().catch(() => {}), 45_000));
    timers.push(setInterval(() => research.tick().catch(() => {}), 5 * 60_000));
    // keep the real countdown to the next open fresh for the research-mode board
    timers.push(setInterval(() => { const ms = marketStatus(); feed.status('OT-01', { market: ms.open ? 'open' : 'closed', mode: ms.open ? 'trading' : 'research', nextOpenAt: ms.open ? null : ms.nextOpen || null }); }, 60_000));
    // lottery: backfill history, poll results, run the pipeline, settle
    const lottoLoop = async () => {
      try { await lotto.pollLatest(); await institute.cycle('scheduled'); } catch (e) { log.warn('[lottery]', e.message); }
      const run = institute.getRun(), cal = institute.calendar();
      const waiting = run && !run.decision && run.target === cal.next && cal.salesOpen; // e.g. budget still with the courier
      const delay = Math.min(lotto.nextPollDelay(cal.next), waiting ? 10 * 60_000 : Infinity);
      feed.status('OT-02', { nextCycleAt: Date.now() + delay, nextDraw: cal.next });
      timers.push(setTimeout(lottoLoop, delay));
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
      if (t.to === DEPT.sports) football.agentTick();
    });
  }
  let stop = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); market.stop(); };

  // ---------------------------------------------------------------- HTTP
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req, max = 64_000) => new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > max) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } });
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
    const sleeves = desk.sleeves(); // which desk owns each line (pit boards stripe it in the desk's colour)
    for (const p of book.positions) p.owners = sleeves.filter((s) => s.positions.some((x) => x.symbol === p.symbol)).map((s) => s.agent);
    return {
      book, navHistory: trading.navHistory(DEPT.trading), trades: trading.trades(DEPT.trading, 60), orders: trading.orders(DEPT.trading, 30),
      agents: gateway.latestReports('trading_floor', 3), desks: desk.sleeves(), league: league.table(), budget: { inTransit: treasury.inTransit(DEPT.trading) }, llm: llm.status(),
      lastTick: desk.lastTick(), nextTickInMs: desk.lastTick() ? Math.max(0, desk.lastTick() + desk.intervalMs() - Date.now()) : null,
    };
  }

  // Grand Lobby big screen: every department's real money result (minor units). Departments with no money
  // source yet are listed as reporting:false so the screen says so instead of inventing numbers.
  function firmDepartments() {
    const book = trading.portfolio(DEPT.trading);
    const lot = league.lottery(), thaiNet = Object.values(lot).reduce((s, o) => s + o.net, 0);
    const fx = db.get("SELECT COALESCE(SUM(payout - stake), 0) AS net FROM fixture_positions WHERE owner = ? AND status IN ('gain','contributed')", DEPT.sports);
    const open = (id, name, budget, value, pnl, note) => ({ id, name, budget, value, pnl, note, reporting: true });
    const departments = [
      open('trading_floor', 'Trading Floor', INITIAL_BUDGETS[DEPT.trading], book.nav, book.nav + treasury.inTransit(DEPT.trading) - INITIAL_BUDGETS[DEPT.trading], `${book.positions.length} positions`), // budget still on a cash robot is not a loss,
      open('thai_markets', 'Thai Markets', INITIAL_BUDGETS[DEPT.thai], ledger.balance(DEPT.thai), thaiNet, 'lottery certificates'),
      open('sports_desk', 'Sports Desk', INITIAL_BUDGETS[DEPT.sports], ledger.balance(DEPT.sports), fx.net, 'fixture positions'),
      ...['Security HQ', 'Legal', 'IT', 'HR'].map((name) => ({ id: name.toLowerCase().replace(/\W+/g, '_'), name, reporting: false })),
    ];
    return { at: Date.now(), vault: ledger.balance(VAULT), departments, total: departments.filter((d) => d.reporting).reduce((s, d) => s + d.pnl, 0), navHistory: trading.navHistory(DEPT.trading) };
  }

  const routes = {
    'GET /api/firm/departments': () => firmDepartments(),
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
    // AI visuals feed: backfill for the three rooms (SSE 'agent' events carry the live ones)
    'GET /api/ai/feed': (req, url) => {
      const room = url.searchParams.get('room') || undefined;
      if (room && !['OT-01', 'OT-02', 'VT-02'].includes(room)) throw Object.assign(new Error('Unknown room'), { status: 400 });
      const st = llm.status();
      return { room: room || null, events: feed.list({ room, limit: url.searchParams.get('limit') || 40, agent: url.searchParams.get('agent') || undefined }).reverse(), status: feed.getStatus(room),
        research: room === 'OT-01' || !room ? research.latest() : undefined, now: Date.now(), llm: { enabled: st.enabled, routes: st.routes } };
    },
    'GET /api/ai/league': () => ({ league: league.table(), llm: llm.status() }),
    'GET /api/football/state': (req) => { const p = authOf(req); return { ...football.snapshot(p ? p.account : null), league: league.table(), llm: llm.status() }; },
    'GET /api/arena-media': () => media.view(),
    'POST /api/football/position': async (req) => { const p = need(req); limit(p.id); const b = await readBody(req); const out = football.open({ owner: p.account, matchId: b.matchId, market: b.market, pick: b.pick, stake: Math.round(Number(b.amount)), actor: `player:${p.id}` }); return { position: out, balance: ledger.balance(p.account) }; },
    // OT-01 Chart Desk: image -> UP/DOWN (AI when a key is set, labelled demo otherwise)
    'POST /api/vision/chart': async (req) => { const p = need(req); limit(`chart:${p.id}`, 1); const b = await readBody(req, 6_000_000); return chartDesk.analyse({ image: b.image, hint: b.hint }); },

    'GET /api/lottery/state': (req) => {
      const p = authOf(req);
      const run = institute.getRun();
      return {
        calendar: institute.calendar(), latest: lotto.latest(), sales: institute.sales(institute.calendar().next),
        recentDraws: lotto.draws().slice(-12).reverse().map((d) => ({ date: d.date, first: d.first, last2: d.last2, last3f: d.last3f, last3b: d.last3b })), draws: lotto.count(), backfill: lotto.state, attribution: ATTRIBUTION, price: TICKET_PRICE,
        run, history: institute.history(), blind: institute.blindRounds(), models: MODELS.map(({ id, name, desc }) => ({ id, name, desc })), targets: Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, { label: t.label, k: t.k, topK: t.topK }])),
        agents: gateway.latestReports('thai_markets', 2), league: league.table(), tickets: p ? institute.tickets(p.account) : [], llm: llm.status(),
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
    if (url.pathname === '/api/football/crest') { // club crests, proxied same-origin (3D canvases) and cached
      try { const c = await football.crest(url.searchParams.get('u')); res.writeHead(200, { 'Content-Type': c.type, 'Cache-Control': 'public, max-age=86400' }); res.end(c.body); }
      catch (e) { json(res, e.status || 502, { error: e.status ? e.message : 'Crest unavailable' }); }
      return;
    }
    // VT-02 Arena Media: staff upload a highlight video (raw mp4/webm body), stored under data/arena-media/
    if (req.method === 'POST' && url.pathname === '/api/arena-media/upload') {
      try {
        const p = need(req);
        if (!hub.isStaffPlayer(p.id)) throw Object.assign(new Error('Executive clearance required.'), { status: 403 });
        limit('upload:' + p.id, 1);
        const v = await media.upload(url.searchParams.get('match'), req, { title: url.searchParams.get('title'), length: Number(req.headers['content-length']) || 0, by: 'staff:' + p.name });
        json(res, 200, { video: v });
      } catch (e) { if (!res.headersSent) { req.resume(); json(res, e.status || 500, { error: e.status ? e.message : 'Upload failed' }); } if (!e.status) log.error('[upload]', e); }
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/arena-media/file/')) { media.serveFile(req, res, url.pathname.slice('/api/arena-media/file/'.length)); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/arena-media/thumb/')) {
      try { const t = await media.thumb(url.pathname.slice('/api/arena-media/thumb/'.length)); res.writeHead(200, { 'Content-Type': t.type, 'Cache-Control': 'public, max-age=86400' }); res.end(t.body); }
      catch (e) { json(res, e.status || 502, { error: e.status ? e.message : 'Thumbnail unavailable' }); }
      return;
    }
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
  start = () => { ws = attachWs(server, hub, log); start0(); football.start(); };
  stop = () => { ws?.stop(); football.stop(); stop0(); };
  return { store: extra.store, auth, hub, feed, research, news, league, football, media, db, ledger, treasury, players, roulette, market, trading, llm, gateway, desk, lotto, institute, bus, server, start, stop, routes };
}
