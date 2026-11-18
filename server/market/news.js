// Free headline source for the off-hours research cycle (OT-01). free-data-sources: Finnhub free tier
// (`/news`, `/company-news`, personal / non-commercial use; ~60 calls/min allowed, we spend ~10 per cycle)
// when FINNHUB_API_KEY is set, otherwise keyless Yahoo Finance RSS headlines. Cached 45 min. Outbound fetches
// are skipped when config.offline. Headlines are untrusted DATA: they are trimmed, stripped of banned words
// (voice-and-satire) and only ever shown or fed to a model as quoted text.
import { clean } from '../agents/feed.js';

const TTL = 45 * 60_000;
const clip = (s, n) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, n);

export function createNews({ config, log = console, fetchImpl = (...a) => fetch(...a) }) {
  let cache = { at: 0, items: [], source: 'none' };
  const getJson = async (url) => { const r = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw Object.assign(new Error(`news ${r.status}`), { status: r.status }); return r.json(); };
  const getText = async (url) => { const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (firm-sim; personal non-commercial)' }, signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw Object.assign(new Error(`rss ${r.status}`), { status: r.status }); return r.text(); };

  async function finnhub(symbols) {
    const day = (t) => new Date(t).toISOString().slice(0, 10), now = Date.now();
    const k = encodeURIComponent(config.finnhubKey), out = [];
    const general = await getJson(`https://finnhub.io/api/v1/news?category=general&token=${k}`);
    for (const n of general.slice(0, 12)) out.push({ symbol: null, headline: n.headline, source: n.source, at: (n.datetime || 0) * 1000 });
    for (const s of symbols.slice(0, 9)) { // 9 + 1 calls per cycle
      try {
        const j = await getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(s.replace('-', '.'))}&from=${day(now - 2 * 86400_000)}&to=${day(now)}&token=${k}`);
        for (const n of j.slice(0, 3)) out.push({ symbol: s, headline: n.headline, source: n.source, at: (n.datetime || 0) * 1000 });
      } catch (e) { if (e.status === 429) break; }
    }
    return out;
  }
  async function rss(symbols) {
    const out = [];
    for (const s of symbols.slice(0, 6)) {
      try {
        const x = await getText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=US&lang=en-US`);
        for (const m of [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3)) {
          const t = m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1], d = m[1].match(/<pubDate>([^<]*)<\/pubDate>/)?.[1];
          if (t) out.push({ symbol: s, headline: t, source: 'Yahoo Finance RSS', at: d ? Date.parse(d) || 0 : 0 });
        }
      } catch { /* one dead feed never blocks the cycle */ }
    }
    return out;
  }

  /** [{ symbol|null, headline, source, at }] newest first, at most ~30; [] offline / on failure (callers fall back to rule-book research) */
  async function headlines(symbols) {
    if (Date.now() - cache.at < TTL) return cache.items;
    if (config.offline) return [];
    let items = [], source = 'none';
    try {
      if (config.finnhubKey) { items = await finnhub(symbols); source = 'Finnhub (free tier)'; }
    } catch (e) { log.warn?.('[news] Finnhub:', e.message); }
    if (!items.length) { try { items = await rss(symbols); source = 'Yahoo Finance RSS'; } catch (e) { log.warn?.('[news] RSS:', e.message); } }
    const seen = new Set();
    items = items.map((n) => ({ ...n, headline: clean(clip(n.headline, 160)) })).filter((n) => n.headline && !seen.has(n.headline) && seen.add(n.headline))
      .sort((a, b) => b.at - a.at).slice(0, 30);
    if (items.length) cache = { at: Date.now(), items, source };
    return items;
  }
  return { headlines, source: () => cache.source, cachedAt: () => cache.at };
}
