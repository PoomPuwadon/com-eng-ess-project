// Club "following": a neutral, data-driven measure of how many people around the world pay attention
// to a club, for the Fixture Scout (SCOUT.md: club stature and global following come first).
// Source: the free public MediaWiki API of English Wikipedia (no key, no paid tier). ONE request per
// 40 clubs resolves each club's article from its football-data.org name (redirects followed) AND returns
// its daily page views for the last 30 days (prop=pageviews), summed into a monthly readership figure.
// Budget: only clubs in the 7-day scouting window (~60 clubs -> 2 requests), 2 s apart, cached 7 days;
// a 429 stops the run until the next cycle (free-data-sources skill).
// Never names or ranks any club by hand: every number comes from the readership data.

const WIKI = 'https://en.wikipedia.org/w/api.php';
const UA = 'FirmGreyboxFixtureScout/1.0 (educational game; notional money only)'; // Wikimedia asks for a descriptive agent
const TTL = 7 * 86400_000, RETRY_MS = 6 * 3600_000, GAP_MS = 2000, PER_CALL = 40, MAX_PER_RUN = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 0..2.5 stature score from monthly views: ~10k views -> 0, ~100k -> 1, ~1M -> 2, 3M+ -> 2.5 */
export const statureOf = (views) => (views > 0 ? Math.max(0, Math.min(2.5, Math.log10(views) - 4)) : 0);

/** one MediaWiki response (formatversion 2) -> Map(requested name -> { title, views }) */
export function parseViews(names, j) {
  const norm = new Map((j.query?.normalized || []).map((x) => [x.from, x.to]));
  const redir = new Map((j.query?.redirects || []).map((x) => [x.from, x.to]));
  const pages = new Map((j.query?.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => [p.title, p]));
  const out = new Map();
  for (const name of names) {
    let title = norm.get(name) || name; title = redir.get(title) || title;
    const p = pages.get(title);
    out.set(name, { title: p ? title : null, views: p ? Object.values(p.pageviews || {}).reduce((s, v) => s + (v || 0), 0) : 0 });
  }
  return out;
}

export function createFollowing({ db, offline = false, log = console, fetchImpl = globalThis.fetch }) {
  const KEY = 'football:following:v3';
  const cache = db.kvGet(KEY, {}); // teamId -> { title, views, at }
  let busy = false;
  const get = async (url) => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`wikimedia ${res.status}`);
    return res.json();
  };

  /** refresh stale clubs (teams: [{ id, name }]); returns how many were updated */
  async function refresh(teams) {
    if (offline || busy || !fetchImpl) return 0;
    const now = Date.now(), seen = new Set();
    const fresh = (c) => c && now - c.at < (c.views ? TTL : RETRY_MS);
    const stale = teams.filter((t) => t?.id && t.name && !seen.has(t.id) && seen.add(t.id) && !fresh(cache[t.id])).slice(0, MAX_PER_RUN);
    if (!stale.length) return 0;
    busy = true;
    let n = 0;
    try {
      for (let i = 0; i < stale.length; i += PER_CALL) {
        if (i) await sleep(GAP_MS);
        const chunk = stale.slice(i, i + PER_CALL), names = chunk.map((t) => t.name);
        const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageviews', pvipdays: '30', titles: names.join('|') });
        const got = parseViews(names, await get(`${WIKI}?${q}`));
        for (const t of chunk) { const g = got.get(t.name); cache[t.id] = { title: g.title, views: g.views, at: Date.now() }; n++; }
      }
    } catch (e) { log.warn?.('[following]', e.message); }
    finally { busy = false; db.kvSet(KEY, cache); }
    return n;
  }

  // views: 0 means unknown (lookup failed / no article), never "a small club"
  return { refresh, views: (id) => cache[id]?.views || null, all: () => cache, statureOf };
}
