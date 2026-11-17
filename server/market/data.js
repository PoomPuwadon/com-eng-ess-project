// US stock data (free-data-sources skill). Only the server calls providers; everything else reads
// the DB. Providers, in order:
//   1. Finnhub free tier /quote — only if FINNHUB_API_KEY is set in .env (the user creates the key).
//   2. Yahoo Finance public chart endpoint — keyless, unofficial, delayed; also our source of
//      intraday 5-minute bars and one year of daily bars (Finnhub candles are not on its free tier).
//   3. Last cached prices, flagged stale.
// Schedule: market open → one symbol every 3 s (≈ 20 calls/min, every symbol ≈ every 90 s);
// market closed → one symbol every 2 min. Daily bars once per day per symbol.
import { marketStatus, zoned } from '../time.js';

export const UNIVERSE = [
  ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq-100 ETF'], ['DIA', 'Dow Jones ETF'], ['IWM', 'Russell 2000 ETF'],
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta Platforms'],
  ['TSLA', 'Tesla'], ['AMD', 'AMD'], ['NFLX', 'Netflix'], ['AVGO', 'Broadcom'], ['JPM', 'JPMorgan Chase'], ['GS', 'Goldman Sachs'],
  ['BAC', 'Bank of America'], ['V', 'Visa'], ['MA', 'Mastercard'], ['BRK-B', 'Berkshire Hathaway B'], ['XOM', 'Exxon Mobil'], ['CVX', 'Chevron'],
  ['LLY', 'Eli Lilly'], ['UNH', 'UnitedHealth'], ['WMT', 'Walmart'], ['COST', 'Costco'], ['KO', 'Coca-Cola'], ['DIS', 'Disney'],
  ['BA', 'Boeing'], ['INTC', 'Intel'],
];
export const SYMBOLS = UNIVERSE.map((u) => u[0]);
export const NAME = Object.fromEntries(UNIVERSE);

const UA = { 'User-Agent': 'Mozilla/5.0 (firm-sim; personal non-commercial)' };

async function getJson(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (r.status === 429) throw Object.assign(new Error('rate limited'), { status: 429 });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Per-provider request budget (checked before every call, free-data-sources §2). */
class Budget {
  constructor(perMin) { this.perMin = perMin; this.calls = []; this.blockedUntil = 0; }
  take() {
    const now = Date.now();
    if (now < this.blockedUntil) return false;
    this.calls = this.calls.filter((t) => now - t < 60_000);
    if (this.calls.length >= this.perMin) return false;
    this.calls.push(now); return true;
  }
  backoff(ms) { this.blockedUntil = Date.now() + ms; }
}

const yahooSym = (s) => s; // BRK-B is already Yahoo form
async function yahooChart(symbol, range, interval) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(symbol))}?range=${range}&interval=${interval}&includePrePost=false`);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(j?.chart?.error?.description || 'no chart result');
  const q = r.indicators?.quote?.[0] || {};
  const bars = (r.timestamp || []).map((t, i) => ({ t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] }))
    .filter((b) => b.c != null);
  return { meta: r.meta, bars };
}

export function createMarketData(db, bus, config, log = console) {
  const yahoo = new Budget(25), finnhub = new Budget(40);
  const state = { source: config.finnhubKey ? 'Finnhub (free tier) + Yahoo Finance charts' : 'Yahoo Finance (public chart endpoint)', errors: 0, lastError: null, calls: 0 };
  let rr = 0, timer = null, dailyTimer = null;

  const saveQuote = (q) => db.run(`INSERT INTO quotes(symbol, name, price, prev_close, day_high, day_low, volume, as_of, fetched_at, source) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close, day_high=excluded.day_high, day_low=excluded.day_low,
    volume=excluded.volume, as_of=excluded.as_of, fetched_at=excluded.fetched_at, source=excluded.source`,
  q.symbol, NAME[q.symbol], q.price, q.prev_close, q.day_high ?? null, q.day_low ?? null, q.volume ?? null, q.as_of, Date.now(), q.source);
  const saveBars = (symbol, kind, bars, asOf) => db.run(`INSERT INTO bars(symbol, kind, json, as_of, fetched_at) VALUES (?,?,?,?,?)
    ON CONFLICT(symbol, kind) DO UPDATE SET json=excluded.json, as_of=excluded.as_of, fetched_at=excluded.fetched_at`, symbol, kind, JSON.stringify(bars), asOf, Date.now());

  async function refreshIntraday(symbol) {
    if (!yahoo.take()) return false;
    state.calls++;
    const { meta, bars } = await yahooChart(symbol, '1d', '5m');
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    saveBars(symbol, '5m', bars.map((b) => [b.t, +b.c.toFixed(4)]), (meta.regularMarketTime || 0) * 1000);
    let quote = { symbol, price: meta.regularMarketPrice, prev_close: prev, day_high: meta.regularMarketDayHigh, day_low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume, as_of: (meta.regularMarketTime || 0) * 1000, source: 'Yahoo Finance' };
    if (config.finnhubKey && finnhub.take()) {
      try {
        const f = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.replace('-', '.'))}&token=${config.finnhubKey}`);
        if (f && f.c > 0) quote = { ...quote, price: f.c, prev_close: f.pc, day_high: f.h, day_low: f.l, as_of: f.t * 1000, source: 'Finnhub' };
      } catch (e) { if (e.status === 429) finnhub.backoff(120_000); }
    }
    if (quote.price > 0) saveQuote(quote);
    return true;
  }

  async function refreshDaily(symbol) {
    if (!yahoo.take()) return false;
    state.calls++;
    const { meta, bars } = await yahooChart(symbol, '1y', '1d');
    saveBars(symbol, '1d', bars.map((b) => [b.t, +b.o.toFixed(4), +b.h.toFixed(4), +b.l.toFixed(4), +b.c.toFixed(4), b.v || 0]), (meta.regularMarketTime || 0) * 1000);
    if (!db.get('SELECT 1 FROM quotes WHERE symbol = ?', symbol) && meta.regularMarketPrice) {
      const prev = bars.length > 1 ? bars[bars.length - 2].c : meta.chartPreviousClose;
      saveQuote({ symbol, price: meta.regularMarketPrice, prev_close: prev, as_of: (meta.regularMarketTime || 0) * 1000, source: 'Yahoo Finance' });
    }
    return true;
  }

  async function step() {
    const ms = marketStatus();
    const sym = SYMBOLS[rr % SYMBOLS.length];
    try {
      const ok = await refreshIntraday(sym);
      if (ok) rr++;
      if (ok && rr % SYMBOLS.length === 0) bus.emit('quotes', snapshot());
      else if (ok && ms.open && rr % 5 === 0) bus.emit('quotes', snapshot());
    } catch (e) {
      state.errors++; state.lastError = `${sym}: ${e.message}`;
      if (e.status === 429) yahoo.backoff(5 * 60_000); // honour rate limiting; never "retry until it works"
      rr++;
    }
    timer = setTimeout(step, ms.open ? 3000 : 120_000);
  }

  async function dailyPass() {
    const today = zoned(Date.now(), 'America/New_York').date;
    for (const s of SYMBOLS) {
      const row = db.get("SELECT fetched_at FROM bars WHERE symbol = ? AND kind = '1d'", s);
      if (row && zoned(row.fetched_at, 'America/New_York').date === today && Date.now() - row.fetched_at < 12 * 3600_000) continue;
      try { await refreshDaily(s); } catch (e) { state.errors++; state.lastError = `${s} daily: ${e.message}`; if (e.status === 429) { yahoo.backoff(10 * 60_000); break; } }
      await new Promise((r) => setTimeout(r, 2500));
    }
    bus.emit('quotes', snapshot());
  }

  /** Initial fill: make sure every symbol has a quote and a daily history before agents run. */
  async function start() {
    if (config.offline) return;
    const missing = SYMBOLS.filter((s) => !db.get('SELECT 1 FROM quotes WHERE symbol = ?', s));
    for (const s of missing) {
      try { await refreshIntraday(s); } catch (e) { state.lastError = `${s}: ${e.message}`; }
      await new Promise((r) => setTimeout(r, 1200));
    }
    bus.emit('quotes', snapshot());
    dailyPass().catch((e) => log.warn('daily pass', e.message));
    dailyTimer = setInterval(() => dailyPass().catch(() => {}), 3 * 3600_000);
    timer = setTimeout(step, 3000);
  }
  const stop = () => { clearTimeout(timer); clearInterval(dailyTimer); };

  function snapshot() {
    const ms = marketStatus();
    const quotes = db.all('SELECT * FROM quotes').map((q) => ({
      symbol: q.symbol, name: q.name, price: q.price, prevClose: q.prev_close, change: q.prev_close ? q.price / q.prev_close - 1 : 0,
      high: q.day_high, low: q.day_low, volume: q.volume, asOf: q.as_of, source: q.source,
    })).sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));
    return { market: ms, source: state.source, delayNote: 'Delayed up to 15 min', quotes, at: Date.now() };
  }
  const quote = (s) => db.get('SELECT * FROM quotes WHERE symbol = ?', s);
  const bars = (s, kind) => JSON.parse(db.get('SELECT json FROM bars WHERE symbol = ? AND kind = ?', s, kind)?.json || '[]');

  return { start, stop, snapshot, quote, bars, state, refreshIntraday, refreshDaily };
}
