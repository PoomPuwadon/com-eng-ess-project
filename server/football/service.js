// VT-02 Sports Analytics Arena: real fixtures from football-data.org (free tier, server side only,
// X-Auth-Token from FOOTBALL_DATA_API_KEY), a Fixture Scout agent that picks the marquee match on its
// own, house pricing (no odds on the free tier), and positions for players and the Sports Desk agent
// that settle on real full-time results.
//
// Free-tier budget: 10 requests/min. We spend at most 6/min (request log checked before every call),
// fixtures every 30 min, standings every 6 h per competition, results every 10 min while positions are open.
// Without a key (or offline/tests) the arena runs on a clearly labelled simulated fixture list.
import { VAULT, player } from '../ledger.js';
import { expectedGoals, priceFixture, pickWins, MARKETS } from './pricing.js';
import { payoutFor } from '../realtime/pricing.js';
import { readFileSync } from 'node:fs';
import { createFollowing, statureOf } from './following.js';

// The scout's briefing on what makes a marquee match (club stature, rivalry, prestige, stakes, timing).
// General judgement only: it names no club and no fixture.
const BRIEFING = (() => { try { return readFileSync(new URL('./SCOUT.md', import.meta.url), 'utf8'); } catch { return ''; } })();
export const MARQUEE_V = 2; // bump to re-scout a stored marquee picked by an older rule book

export const ATTRIBUTION = 'Football data provided by the Football-Data.org API';
export const COMPETITIONS = ['CL', 'PL', 'PD', 'BL1', 'SA', 'FL1']; // top-5 leagues + UEFA Champions League (free tier)
const WEIGHT = { CL: 3, PL: 2.6, PD: 2.4, BL1: 2.1, SA: 2.1, FL1: 1.8, EL: 2, ECL: 1.5 };
const API = 'https://api.football-data.org/v4';
export const DEPT_SPORTS = 'DEPT:sports_desk';
export const EXT_BOOK = 'EXTERNAL:BOOKMAKER';
const MIN_STAKE = 100, MAX_STAKE = 1_000_000;
const err = (status, message) => Object.assign(new Error(message), { status });
const day = (t) => new Date(t).toISOString().slice(0, 10);

/** simulated fixtures (no key / offline): real-style but clearly flagged */
function simulated(now = Date.now()) {
  const pairs = [['CL', 'Real Madrid CF', 'FC Bayern München'], ['PL', 'Arsenal FC', 'Liverpool FC'], ['PD', 'FC Barcelona', 'Club Atlético de Madrid'], ['SA', 'FC Internazionale Milano', 'AC Milan'], ['BL1', 'Borussia Dortmund', 'Bayer 04 Leverkusen'], ['FL1', 'Paris Saint-Germain FC', 'Olympique de Marseille']];
  return pairs.map(([c, h, a], i) => ({
    id: 900000 + i, utcDate: new Date(now + (6 + i * 20) * 3600_000).toISOString(), status: 'TIMED', simulated: true,
    competition: { code: c, name: { CL: 'UEFA Champions League', PL: 'Premier League', PD: 'Primera Division', SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1' }[c], emblem: null },
    homeTeam: { id: 1000 + i * 2, name: h, shortName: h.split(' ')[0], tla: h.slice(0, 3).toUpperCase(), crest: null },
    awayTeam: { id: 1001 + i * 2, name: a, shortName: a.split(' ')[0], tla: a.slice(0, 3).toUpperCase(), crest: null },
    score: { fullTime: { home: null, away: null } },
  }));
}

// ---------------------------------------------------------------- the rule book (no LLM, or as a pre-ranking)
// SCOUT.md in numbers: stature of BOTH clubs (readership following), a derby, competition prestige and
// stage, table stakes, kick-off timing. No club or fixture is named anywhere.
const GENERIC = new Set(['fc', 'afc', 'cf', 'ac', 'sc', 'ssc', 'as', 'us', 'ss', 'club', 'de', 'del', 'la', 'le', 'the', 'and', 'real', 'sporting', 'united', 'city', 'town',
  'athletic', 'atletico', 'borussia', 'olympique', 'racing', 'stade', 'rc', 'ogc', 'sv', 'vfb', 'vfl', 'tsg', 'fsv', 'bsc', 'calcio', 'football', 'futbol',
  'hotspur', 'albion', 'wanderers', 'rovers', 'county', 'deportivo', 'cd', 'ud', 'sd', 'rcd', 'ca', 'balompie', 'hellas', 'stadium', 'u']);
const cityTokens = (t) => new Set(String(t?.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w)).map((w) => w.slice(0, 5)));
/** two clubs sharing a place name (e.g. "<City> Rovers" v "<City> Athletic") */
export function isDerby(m) { const a = cityTokens(m.homeTeam), b = cityTokens(m.awayTeam); for (const w of a) if (b.has(w)) return true; return false; }

/**
 * rule-based scout score. standings: { [comp]: { rows } }; following: (teamId) => monthly views | null.
 * Without readership data every club counts as mid-sized, so prestige + table + timing still decide.
 */
export function scoreFixture(m, standings, now = Date.now(), following = () => null) {
  const comp = m.competition?.code;
  const table = standings[comp];
  const pos = (id) => table?.rows?.find((r) => r.team.id === id)?.position ?? 12;
  const top = Math.max(0, 8 - pos(m.homeTeam.id)) + Math.max(0, 8 - pos(m.awayTeam.id));
  const hrs = (Date.parse(m.utcDate) - now) / 3600_000;
  const soon = hrs < 0 ? -50 : hrs < 48 ? 1.2 : hrs < 96 ? 0.7 : hrs < 168 ? 0.3 : 0;
  const ko = new Date(m.utcDate), dow = ko.getUTCDay(), h = ko.getUTCHours();
  const prime = (dow === 0 || dow === 6) && h >= 11 && h <= 20 ? 0.4 : h >= 18 && h <= 21 ? 0.25 : 0; // weekend / evening audiences
  const knockout = comp === 'CL' && m.stage && !/LEAGUE|GROUP|REGULAR/.test(m.stage) ? 1.5 : 0;
  const sv = (t) => { const v = following(t.id); return v == null ? 1 : statureOf(v); };
  const sa = sv(m.homeTeam), sb = sv(m.awayTeam);
  const stature = 2.6 * Math.min(sa, sb) + 1.2 * Math.max(sa, sb); // both clubs being big matters most
  const derby = isDerby(m) ? 2 : 0;
  return (WEIGHT[comp] || 1) * 1.2 + knockout + stature + derby + top * 0.2 + soon + prime;
}

export function createFootball({ db, ledger, treasury, llm, config, log = console }) {
  const reqLog = [];
  const state = { lastFetch: null, lastError: null, source: config.footballKey && !config.offline ? 'football-data.org' : 'simulated', requestsLastMinute: 0 };
  let matches = db.kvGet('football:matches', []);
  const standings = db.kvGet('football:standings', {});
  let marquee = db.kvGet('football:marquee', null);
  const follow = createFollowing({ db, offline: Boolean(config.offline) || state.source === 'simulated', log });
  const crestCache = new Map();

  // ---------------------------------------------------------------- provider (budgeted)
  async function get(path) {
    const now = Date.now();
    while (reqLog.length && now - reqLog[0] > 60_000) reqLog.shift();
    if (reqLog.length >= 6) throw err(429, 'local request budget reached'); // 6 of the free tier's 10/min
    reqLog.push(now); state.requestsLastMinute = reqLog.length;
    const res = await fetch(`${API}${path}`, { headers: { 'X-Auth-Token': config.footballKey }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw err(res.status, `football-data ${res.status} on ${path.split('?')[0]}`);
    return res.json();
  }

  async function refreshFixtures() {
    if (state.source === 'simulated') { matches = simulated(); state.lastFetch = Date.now(); return matches.length; }
    const now = Date.now();
    const j = await get(`/matches?competitions=${COMPETITIONS.join(',')}&dateFrom=${day(now - 2 * 86400_000)}&dateTo=${day(now + 8 * 86400_000)}`);
    matches = (j.matches || []).map((m) => ({
      id: m.id, utcDate: m.utcDate, status: m.status, matchday: m.matchday, stage: m.stage,
      competition: { code: m.competition?.code, name: m.competition?.name, emblem: m.competition?.emblem },
      homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.name, shortName: m.homeTeam?.shortName, tla: m.homeTeam?.tla, crest: m.homeTeam?.crest },
      awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.name, shortName: m.awayTeam?.shortName, tla: m.awayTeam?.tla, crest: m.awayTeam?.crest },
      score: { duration: m.score?.duration, fullTime: m.score?.fullTime, regularTime: m.score?.regularTime },
    })).filter((m) => m.homeTeam.id && m.awayTeam.id);
    db.kvSet('football:matches', matches);
    state.lastFetch = Date.now(); state.lastError = null;
    return matches.length;
  }

  async function refreshStandings() {
    if (state.source === 'simulated') return 0;
    const comps = [...new Set(upcoming().map((m) => m.competition.code))].filter((c) => !standings[c] || Date.now() - standings[c].at > 6 * 3600_000).slice(0, 3);
    for (const c of comps) {
      try {
        const j = await get(`/competitions/${c}/standings`);
        const total = (j.standings || []).find((s) => s.type === 'TOTAL') || j.standings?.[0];
        const rows = (total?.table || []).map((r) => ({ position: r.position, team: { id: r.team.id, name: r.team.name }, playedGames: r.playedGames, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: r.points }));
        const g = rows.reduce((s, r) => s + r.goalsFor, 0), p = rows.reduce((s, r) => s + r.playedGames, 0) / 2;
        standings[c] = { at: Date.now(), rows, avgGoals: p ? g / p : 2.7 };
      } catch (e) { state.lastError = e.message; break; }
    }
    db.kvSet('football:standings', standings);
    return comps.length;
  }

  const upcoming = () => matches.filter((m) => (m.status === 'TIMED' || m.status === 'SCHEDULED') && Date.parse(m.utcDate) > Date.now()).sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
  const rowOf = (m, team) => standings[m.competition.code]?.rows?.find((r) => r.team.id === team.id);
  function pricing(m) {
    const lg = standings[m.competition.code];
    return priceFixture(expectedGoals(rowOf(m, m.homeTeam), rowOf(m, m.awayTeam), lg));
  }

  // ---------------------------------------------------------------- the Fixture Scout (agent)
  const SCOUT_SYSTEM = `You are the Fixture Scout of the Sports Analytics Arena in a satirical luxury financial firm (a game; notional capital only). Follow your briefing below.\n\n${BRIEFING}`;
  const SCOUT_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'integer' }, preview: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } }, required: ['id', 'preview', 'points'] };
  async function scout(reason = 'scheduled') {
    const list = upcoming().filter((m) => Date.parse(m.utcDate) - Date.now() < 7 * 86400_000);
    if (!list.length) { marquee = null; return null; }
    const ranked = list.map((m) => ({ m, s: scoreFixture(m, standings, Date.now(), follow.views) })).sort((a, b) => b.s - a.s);
    let pick = ranked[0].m, preview = null, points = null, by = 'rules';
    // the agent sees a wide field (not just the rule book's favourites), in kick-off order, with neutral facts
    const cands = ranked.slice(0, 20).map(({ m }) => m).sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate)).map((m) => ({
      id: m.id, competition: m.competition.name, stage: m.stage || null, kickoff: m.utcDate, derby: isDerby(m),
      home: { name: m.homeTeam.name, position: rowOf(m, m.homeTeam)?.position ?? null, points: rowOf(m, m.homeTeam)?.points ?? null, following: follow.views(m.homeTeam.id) },
      away: { name: m.awayTeam.name, position: rowOf(m, m.awayTeam)?.position ?? null, points: rowOf(m, m.awayTeam)?.points ?? null, following: follow.views(m.awayTeam.id) },
    }));
    const out = await llm.json({ job: 'fixture_scout', agent: 'fixture_scout', system: SCOUT_SYSTEM, user: JSON.stringify({ now: new Date().toISOString(), note: 'following = last month of encyclopedia readership for the club (null = unknown)', candidates: cands }), schema: SCOUT_SCHEMA, maxTokens: 700, minBreaker: 1 });
    if (out && list.some((m) => m.id === out.id)) { pick = list.find((m) => m.id === out.id); preview = out.preview; points = (out.points || []).slice(0, 3); by = 'llm'; }
    if (!preview) {
      const hp = rowOf(pick, pick.homeTeam)?.position, ap = rowOf(pick, pick.awayTeam)?.position;
      preview = `${pick.competition.name}: ${pick.homeTeam.shortName || pick.homeTeam.name} host ${pick.awayTeam.shortName || pick.awayTeam.name}. Liquidity is positioning accordingly.`;
      points = [isDerby(pick) ? 'A local derby: the whole city is watching' : hp && ap ? `Table: ${hp}${['st', 'nd', 'rd'][hp - 1] || 'th'} v ${ap}${['st', 'nd', 'rd'][ap - 1] || 'th'}` : 'Form under review by the quant desk', `Kick-off ${new Date(pick.utcDate).toUTCString().slice(0, 22)} UTC`, 'House pricing from the Analytics Desk goals model'];
    }
    marquee = { id: pick.id, by, preview, points, at: Date.now(), reason, v: MARQUEE_V };
    db.kvSet('football:marquee', marquee);
    log.log?.(`[football] marquee (${by}): ${pick.homeTeam.name} v ${pick.awayTeam.name}`);
    return marquee;
  }

  // ---------------------------------------------------------------- positions
  function open({ owner, matchId, market, pick, stake, actor }) {
    const m = matches.find((x) => x.id === Number(matchId));
    if (!m) throw err(404, 'Unknown fixture.');
    if (!(m.status === 'TIMED' || m.status === 'SCHEDULED') || Date.parse(m.utcDate) <= Date.now()) throw err(409, 'Pricing has closed for this fixture (kick-off).');
    if (!MARKETS[market]?.picks[pick]) throw err(400, 'Unknown selection.');
    if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) throw err(400, 'Allocation must be between ¤1 and ¤10,000.');
    const price = pricing(m).prices[market][pick];
    const isAgent = owner.startsWith('DEPT:');
    if (!isAgent) {
      const exposure = db.get("SELECT COALESCE(SUM(CAST(stake * price AS INTEGER) - stake), 0) AS s FROM fixture_positions WHERE status = 'open' AND owner LIKE 'PLAYER:%'").s;
      if (ledger.balance(VAULT) < exposure + payoutFor(stake, price) - stake) throw err(409, 'The Treasury Reserve cannot underwrite that allocation right now.');
    }
    const label = `${m.homeTeam.shortName || m.homeTeam.name} v ${m.awayTeam.shortName || m.awayTeam.name} · ${MARKETS[market].label}: ${MARKETS[market].picks[pick]}`;
    return db.tx(() => {
      const { lastInsertRowid } = db.run('INSERT INTO fixture_positions(owner, match_id, market, pick, stake, price, status, created_at, label) VALUES (?,?,?,?,?,?,?,?,?)', owner, m.id, market, pick, stake, price, 'open', Date.now(), label);
      const id = Number(lastInsertRowid);
      ledger.post({ actor, reason: 'WAGER_PLACED', ref: `fx${id}`, idem: `fx:${id}:open`, transfers: [{ from: owner, to: `ESCROW:BET:fx${id}`, amount: stake }] });
      return { id, price, stake, label };
    });
  }

  /** settle every open position whose match is FINISHED (regular time: 90 min + stoppage) */
  function settle() {
    const open = db.all("SELECT * FROM fixture_positions WHERE status = 'open'");
    let n = 0;
    for (const p of open) {
      const m = matches.find((x) => x.id === p.match_id);
      if (!m) continue;
      if (m.status === 'CANCELLED' || m.status === 'POSTPONED') {
        db.tx(() => { ledger.post({ actor: 'system:settlement', reason: 'WAGER_VOID', ref: `fx${p.id}`, idem: `fx:${p.id}:settle`, transfers: [{ from: `ESCROW:BET:fx${p.id}`, to: p.owner, amount: p.stake }] }); db.run("UPDATE fixture_positions SET status='void', payout=?, settled_at=? WHERE id=?", p.stake, Date.now(), p.id); });
        n++; continue;
      }
      if (m.status !== 'FINISHED') continue;
      const s = m.score.duration && m.score.duration !== 'REGULAR' && m.score.regularTime ? m.score.regularTime : m.score.fullTime;
      if (s?.home == null || s?.away == null) continue;
      const win = pickWins(p.pick, s.home, s.away), esc = `ESCROW:BET:fx${p.id}`, agent = p.owner.startsWith('DEPT:');
      const payer = agent ? EXT_BOOK : VAULT; // agents trade against the outside world (money-ledger §4)
      db.tx(() => {
        if (win) {
          const pay = payoutFor(p.stake, p.price);
          ledger.post({ actor: 'system:settlement', reason: agent ? 'EXTERNAL_SETTLE' : 'WAGER_WON', ref: `fx${p.id}`, idem: `fx:${p.id}:settle`, transfers: [{ from: esc, to: p.owner, amount: p.stake }, { from: payer, to: p.owner, amount: pay - p.stake }] });
          db.run("UPDATE fixture_positions SET status='gain', payout=?, settled_at=? WHERE id=?", pay, Date.now(), p.id);
        } else {
          ledger.post({ actor: 'system:settlement', reason: agent ? 'EXTERNAL_SETTLE' : 'WAGER_LOST', ref: `fx${p.id}`, idem: `fx:${p.id}:settle`, transfers: [{ from: esc, to: payer, amount: p.stake }] });
          db.run("UPDATE fixture_positions SET status='contributed', payout=0, settled_at=? WHERE id=?", Date.now(), p.id);
        }
      });
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- the Sports Desk agent stakes the marquee (rule book: back the model's value edge)
  function agentTick() {
    if (!marquee) return null;
    const m = matches.find((x) => x.id === marquee.id);
    if (!m || db.get("SELECT 1 FROM fixture_positions WHERE owner = ? AND match_id = ?", DEPT_SPORTS, m.id)) return null;
    const bal = ledger.balance(DEPT_SPORTS);
    if (bal < 50_000) return null;
    const pr = pricing(m), p = pr.probs;
    const pick = p.H >= p.A ? (p.H > 0.45 ? 'H' : 'O25') : (p.A > 0.45 ? 'A' : 'O25'), market = pick === 'O25' ? 'OU25' : '1X2';
    const stake = Math.min(MAX_STAKE, Math.max(MIN_STAKE, Math.floor(bal * 0.02 / 100) * 100));
    try { return open({ owner: DEPT_SPORTS, matchId: m.id, market, pick, stake, actor: 'agent:sports_desk' }); } catch (e) { log.warn?.('[football agent]', e.message); return null; }
  }

  // ---------------------------------------------------------------- crests (proxied so the 3D canvas stays same-origin; cached)
  async function crest(url) {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !/(^|\.)football-data\.org$/.test(u.hostname)) throw err(400, 'Crests come from football-data.org only.');
    if (crestCache.has(u.href)) return crestCache.get(u.href);
    const res = await fetch(u.href, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw err(502, 'Crest unavailable.');
    const type = res.headers.get('content-type') || 'image/png';
    if (!/^image\/(png|svg\+xml|jpeg|webp|gif)/.test(type)) throw err(415, 'Not an image.');
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > 1_000_000) throw err(413, 'Crest too large.');
    const out = { type, body };
    if (crestCache.size > 400) crestCache.clear();
    crestCache.set(u.href, out);
    return out;
  }

  // ---------------------------------------------------------------- views
  const view = (m) => m && ({ ...m, pricing: (m.status === 'TIMED' || m.status === 'SCHEDULED') ? pricing(m) : null });
  function snapshot(owner) {
    const mq = marquee && matches.find((m) => m.id === marquee.id);
    return {
      source: state.source, attribution: ATTRIBUTION, simulated: state.source === 'simulated', pricingNote: 'House pricing (Analytics Desk goals model). The free data tier carries no bookmaker prices.',
      marquee: mq ? { ...view(mq), preview: marquee.preview, points: marquee.points, by: marquee.by } : null,
      fixtures: upcoming().slice(0, 30).map(view), markets: MARKETS, lastFetch: state.lastFetch, lastError: state.lastError,
      mine: owner ? db.all('SELECT id, match_id, label, stake, price, status, payout, created_at FROM fixture_positions WHERE owner = ? ORDER BY id DESC LIMIT 30', owner) : [],
      desk: { balance: ledger.balance(DEPT_SPORTS), positions: db.all('SELECT label, stake, price, status, payout FROM fixture_positions WHERE owner = ? ORDER BY id DESC LIMIT 8', DEPT_SPORTS) },
    };
  }

  // ---------------------------------------------------------------- schedule
  const timers = [];
  async function cycle(reason) {
    try { await refreshFixtures(); } catch (e) { state.lastError = e.message; log.warn?.('[football]', e.message); }
    try { await refreshStandings(); } catch (e) { state.lastError = e.message; }
    // club following for the scouting window (Wikimedia, free, cached a week)
    let fresh = 0;
    try { fresh = await follow.refresh(upcoming().filter((m) => Date.parse(m.utcDate) - Date.now() < 7 * 86400_000).flatMap((m) => [m.homeTeam, m.awayTeam])); } catch (e) { log.warn?.('[football] following', e.message); }
    settle();
    if (!marquee || marquee.v !== MARQUEE_V || fresh > 0 || !upcoming().some((m) => m.id === marquee.id) || Date.now() - marquee.at > 3 * 3600_000) await scout(reason);
    agentTick();
  }
  function start() {
    cycle('boot').catch(() => {});
    timers.push(setInterval(() => cycle('scheduled').catch(() => {}), 30 * 60_000));
    // results while positions are open: one fixtures call every 10 min (same endpoint)
    timers.push(setInterval(() => { if (db.get("SELECT 1 FROM fixture_positions WHERE status = 'open' LIMIT 1")) refreshFixtures().then(settle).catch(() => {}); }, 10 * 60_000));
  }
  const stop = () => timers.forEach(clearInterval);

  return { start, stop, cycle, scout, open, settle, agentTick, snapshot, crest, refreshFixtures, state, _setMatches: (ms) => { matches = ms; }, matches: () => matches, playerAccount: player };
}
