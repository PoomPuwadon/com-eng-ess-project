// Thai Government Lottery results from the official Government Lottery Office (GLO) website API
// (free-data-sources skill). Attribution: "Results: Government Lottery Office of Thailand".
//   POST https://www.glo.or.th/api/lottery/getLatestLottery   {}
//   POST https://www.glo.or.th/api/lottery/getLotteryAward    {"date":"16","month":"10","year":"2026"}
// Backfill history once (≈1 request / 1.5 s, cached forever). Draw day: poll every 5 min 14:30–17:30
// Bangkok until complete; a result is confirmed only when two reads ≥ 10 min apart match.
import { bkkDate, bkkTime, addDays } from '../time.js';

const BASE = 'https://www.glo.or.th/api/lottery';
const HEAD = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (firm-sim; personal non-commercial)' };
export const ATTRIBUTION = 'Results: Government Lottery Office of Thailand (glo.or.th)';
const COUNTS = { first: 1, second: 5, third: 10, fourth: 50, fifth: 100, last2: 1, last3f: 2, last3b: 2, near1: 2 };

async function post(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(`${BASE}/${path}`, { method: 'POST', headers: HEAD, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`GLO HTTP ${r.status}`), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

/** GLO response -> normalised draw, or null when absent/incomplete. */
export function normalise(resp) {
  const d = resp?.response;
  if (!d || !d.date || !d.data) return null;
  const out = { date: d.date };
  for (const [k, n] of Object.entries(COUNTS)) {
    const arr = (d.data[k]?.number || []).map((x) => String(x.value).trim()).filter((v) => /^\d+$/.test(v));
    if (k !== 'near1' && arr.length < n) return null; // not complete yet (live draw in progress) or old format
    out[k] = k === 'first' || k === 'last2' ? arr[0] : arr.sort();
  }
  if (out.first.length !== 6 || out.last2.length !== 2) return null;
  return out;
}

/** Candidate calendar days for the two draws of a month (official dates shift around holidays). */
function slotCandidates(y, m) {
  const p = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const first = p(1);
  return [
    [first, addDays(first, 1), addDays(first, -2), addDays(first, -1), addDays(first, -3), addDays(first, 2), addDays(first, 3)],
    [p(16), p(17), p(15), p(18), p(19)],
  ];
}

export function createLotteryData(db, bus, config, log = console) {
  const state = { backfilling: false, backfillDone: 0, backfillTotal: 0, lastPoll: null, lastError: null };

  function store(draw, { confirmed, source = 'GLO' }) {
    const json = JSON.stringify(draw);
    const prev = db.get('SELECT * FROM lottery_draws WHERE date = ?', draw.date);
    if (!prev) {
      db.run('INSERT INTO lottery_draws(date, json, confirmed, first_seen, fetched_at, source) VALUES (?,?,?,?,?,?)', draw.date, json, confirmed ? 1 : 0, Date.now(), Date.now(), source);
      bus.emit('lottery', { type: confirmed ? 'draw_confirmed' : 'draw_seen', date: draw.date });
      return confirmed;
    }
    if (prev.confirmed) return false;
    if (prev.json === json && Date.now() - prev.first_seen >= 10 * 60_000) {
      db.run('UPDATE lottery_draws SET confirmed = 1, fetched_at = ? WHERE date = ?', Date.now(), draw.date);
      bus.emit('lottery', { type: 'draw_confirmed', date: draw.date });
      return true;
    }
    if (prev.json !== json) db.run('UPDATE lottery_draws SET json = ?, first_seen = ?, fetched_at = ? WHERE date = ?', json, Date.now(), Date.now(), draw.date);
    return false;
  }

  async function fetchDate(date) {
    const [y, m, d] = date.split('-');
    return normalise(await post('getLotteryAward', { date: d, month: m, year: y }));
  }

  async function backfill() {
    if (config.offline || state.backfilling) return;
    state.backfilling = true;
    try {
      const today = bkkDate();
      const [sy, sm] = config.lotteryBackfillFrom.split('-').map(Number);
      const [ty, tm] = today.split('-').map(Number);
      const slots = [];
      for (let y = sy, m = sm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) slots.push(...slotCandidates(y, m));
      state.backfillTotal = slots.length;
      state.backfillDone = 0;
      for (const cands of slots) {
        state.backfillDone++;
        const past = cands.filter((c) => c < today);
        if (!past.length) continue;
        if (past.some((c) => db.get('SELECT 1 FROM lottery_draws WHERE date = ?', c))) continue;
        for (const c of past) {
          const probe = db.get('SELECT found, checked_at FROM lottery_probe WHERE date = ?', c);
          const recent = c >= addDays(today, -20);
          if (probe && !(recent && Date.now() - probe.checked_at > 6 * 3600_000)) continue;
          let draw = null;
          try { draw = await fetchDate(c); } catch (e) { state.lastError = `${c}: ${e.message}`; await new Promise((r) => setTimeout(r, 10_000)); continue; }
          db.run('INSERT OR REPLACE INTO lottery_probe(date, found, checked_at) VALUES (?,?,?)', c, draw ? 1 : 0, Date.now());
          await new Promise((r) => setTimeout(r, 1500));
          if (draw) { store(draw, { confirmed: draw.date < addDays(today, -1) }); break; }
        }
      }
      bus.emit('lottery', { type: 'backfill_done', draws: count() });
    } finally { state.backfilling = false; }
  }

  async function pollLatest() {
    if (config.offline) return null;
    state.lastPoll = Date.now();
    try {
      const draw = normalise(await post('getLatestLottery', {}));
      if (draw) return store(draw, { confirmed: draw.date < addDays(bkkDate(), -1) });
    } catch (e) { state.lastError = `latest: ${e.message}`; }
    return null;
  }

  /** Poll cadence: every 5 min on a draw afternoon (Bangkok), else every 6 h. */
  function nextPollDelay(nextDrawDate) {
    const t = bkkTime();
    const today = bkkDate();
    const unconfirmed = db.get('SELECT 1 FROM lottery_draws WHERE confirmed = 0');
    if (unconfirmed) return 5 * 60_000;
    if (today === nextDrawDate && t >= 14 * 60 + 30 && t <= 17 * 60 + 30) return 5 * 60_000;
    if (today === nextDrawDate && t < 14 * 60 + 30) return Math.max(60_000, (14 * 60 + 30 - t) * 60_000);
    return 6 * 3600_000;
  }

  const count = () => db.get('SELECT COUNT(*) AS n FROM lottery_draws WHERE confirmed = 1').n;
  const draws = () => db.all('SELECT json FROM lottery_draws WHERE confirmed = 1 ORDER BY date').map((r) => JSON.parse(r.json));
  const latest = () => { const r = db.get('SELECT json, confirmed FROM lottery_draws ORDER BY date DESC LIMIT 1'); return r ? { ...JSON.parse(r.json), confirmed: !!r.confirmed } : null; };
  const byDate = (date) => { const r = db.get('SELECT json, confirmed FROM lottery_draws WHERE date = ?', date); return r ? { ...JSON.parse(r.json), confirmed: !!r.confirmed } : null; };

  return { backfill, pollLatest, nextPollDelay, draws, latest, byDate, count, store, state };
}
