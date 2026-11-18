// Roulette AI players (VT-01): a Claude seat and a Gemini seat play the Rotational Variance Instruments in the Leisure Suite.
// OWNER RULE: "firm money isn't affected". These two play with their OWN notional bankroll that lives in kv, NOT in the ledger:
// no ledger posting, no vault, no budget, no roulette_rounds row, so the money-ledger invariants and every visitor statistic are untouched.
// The wheel is the real engine (roulette.js normaliseBet / returnsFor / pocketFromSeed, fair random seed). Wins and losses show over their heads.
// Cost control: the model is asked for a PLAN (up to 30 spins of the same bets) about every 15 minutes, never per spin; spins are code
// every ROULETTE_SPIN_MS. Sub-budget ROULETTE_AI_BUDGET_USD ($2/month, job roulette_plan) inside the global cap; no key / budget spent /
// breaker => rule-book plan, labelled RULE BOOK. Agents propose, the server disposes: every bet is normalised and capped in code.
import { randomBytes } from 'node:crypto';
import { normaliseBet, returnsFor, pocketFromSeed, RED } from '../roulette.js';
import { nullFeed } from './feed.js';

export const SEATS = { roulette_claude: { name: 'Claude, Roulette Desk', route: 'claude' }, roulette_gemini: { name: 'Gemini, Roulette Desk', route: 'gemini' } };
export const START_BANK = 1_000_000; // ¤ 10,000.00 notional
export const MAX_SPIN = 50_000; // ¤ 500 per rotation, far below the table limit
const MAX_BETS = 6, MAX_PLAN_SPINS = 30;
const OUTSIDES = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'];
const KEY = 'rouletteai:v1';
const BANNED_NOTE = 'Never use the words casino, gambling, gamble, jackpot, rigged.';

const SYSTEM = `You are an AI player seated at a European roulette table in a satirical luxury financial firm's Executive Leisure Suite (notional chips only, no real money, the firm's money is not involved).
Choose a PLAN: up to ${MAX_PLAN_SPINS} rotations that all use the same positions, and a one-sentence "note" (max 25 words, deadpan, no invented facts) on your approach.
Positions: either {"outside": one of ${OUTSIDES.join(', ')}} or {"numbers": [a valid inside combination: 1-4 numbers, a street or a six-line]}, with "amount" in minor units (100 = 1.00). Max ${MAX_BETS} positions, total stake per rotation at most ${MAX_SPIN} and at most your bank. The wheel is fair: you cannot beat it, play with style. ${BANNED_NOTE}`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['spins', 'bets', 'note'], properties: {
  spins: { type: 'integer' }, note: { type: 'string' },
  bets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['amount'], properties: { outside: { type: 'string' }, numbers: { type: 'array', items: { type: 'integer' } }, amount: { type: 'integer' } } } } } };

const colorOf = (p) => (p === 0 ? 'green' : RED.has(p) ? 'red' : 'black');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Validate a model (or rule-book) plan in code; returns { bets, spins } or null. Illegal or over-cap positions are dropped, never repaired. */
export function validatePlan(raw, bank) {
  if (!raw || !Array.isArray(raw.bets)) return null;
  const bets = [];
  let total = 0;
  for (const b of raw.bets.slice(0, MAX_BETS)) {
    try {
      const nb = normaliseBet(b.outside ? { outside: String(b.outside), amount: b.amount } : { numbers: b.numbers, amount: b.amount });
      if (total + nb.amount > Math.min(MAX_SPIN, bank)) continue;
      total += nb.amount; bets.push(b.outside ? { outside: String(b.outside), amount: nb.amount } : { numbers: nb.nums, amount: nb.amount });
    } catch { /* illegal position: dropped */ }
  }
  if (!bets.length) return null;
  return { bets, spins: clamp(Math.round(Number(raw.spins) || 10), 3, MAX_PLAN_SPINS) };
}

export function createRoulettePlayers({ db, llm, feed = nullFeed, config = {}, isFast = () => false, log = console }) {
  // cadence (owner, 2026-11-19): one rotation every 15 minutes; every 15 seconds ONLY while the CEO runs a tour and is on the Leisure Suite floor (isFast)
  const budgetUsd = config.rouletteAiBudgetUsd ?? 2, spinMs = config.rouletteSpinMs || 15 * 60_000, fastMs = config.rouletteFastMs || 15_000;
  const fresh = () => ({ bank: START_BANK, resets: 0, rounds: 0, wins: 0, plan: null, last: null, recent: [] });
  const saved = db.kvGet(KEY, {});
  const S = Object.fromEntries(Object.keys(SEATS).map((id) => [id, { ...fresh(), ...(saved[id] || {}) }]));
  const planning = new Set();
  const save = () => db.kvSet(KEY, S);
  const monthStart = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  const spent = () => db.get("SELECT COALESCE(SUM(usd), 0) AS s FROM llm_spend WHERE created_at >= ? AND job = 'roulette_plan'", monthStart()).s;
  const net = (s) => s.bank - START_BANK * (1 + s.resets);

  /** the rule book: a flat position for a while, never above 2 % of the bank */
  function rulePlan(s) {
    const unit = clamp(Math.floor((s.bank * 0.02) / 100) * 100, 100, MAX_SPIN), r = Math.random();
    const bets = r < 0.5 ? [{ outside: Math.random() < 0.5 ? 'red' : 'black', amount: unit }]
      : r < 0.8 ? [{ outside: `dozen${1 + Math.floor(Math.random() * 3)}`, amount: unit }]
        : [{ outside: 'red', amount: unit }, { numbers: [17], amount: Math.max(100, Math.floor(unit / 4 / 100) * 100) }];
    return { bets, spins: 12 + Math.floor(Math.random() * 10), note: 'Rule book: flat positions, 2% of the bank. No system beats the wheel.' };
  }

  async function plan(id) {
    const s = S[id];
    if (planning.has(id)) return;
    planning.add(id);
    try {
      let p = null;
      if (llm.enabled() && spent() < budgetUsd) {
        const out = await feed.think({ room: 'VT-01', agent: id, text: 'Choosing a betting plan' }, () => llm.ask({ job: 'roulette_plan', agent: id, system: SYSTEM, schema: SCHEMA, maxTokens: 400, minBreaker: 1,
          user: JSON.stringify({ bank: s.bank / 100, net: net(s) / 100, recent: s.recent.slice(-10).map((r) => ({ pocket: r.pocket, net: r.net / 100 })) }) }));
        const v = out && validatePlan(out.data, s.bank);
        if (v) p = { ...v, note: String(out.data.note || '').slice(0, 160), model: out.model };
      }
      if (!p) { const r = rulePlan(s), v = validatePlan(r, s.bank); p = { ...v, note: r.note, model: null }; }
      s.plan = { ...p, left: p.spins, at: Date.now() }; save();
      feed.emit({ room: 'VT-01', agent: id, model: p.model, stage: 'decision', text: `PLAN ${p.spins} spins: ${p.bets.map((b) => `${b.outside ? b.outside.toUpperCase() : b.numbers.join('/')} ¤${b.amount / 100}`).join(', ')}. ${p.note}`, data: { spins: p.spins, bets: p.bets, note: p.note } });
    } finally { planning.delete(id); }
  }

  /** one rotation for one seat: real wheel, notional bankroll, no ledger */
  function spinOne(id) {
    const s = S[id];
    if (!s.plan || s.plan.left <= 0) { plan(id).catch((e) => log.warn?.('[roulette-ai]', e.message)); if (!s.plan || s.plan.left <= 0) return null; }
    if (s.bank < 100) { s.resets++; s.bank = START_BANK; } // broke: a fresh notional buy-in, counted against its net
    const v = validatePlan(s.plan, s.bank);
    if (!v) { s.plan = null; return null; }
    const bets = v.bets.map((b) => normaliseBet(b.outside ? { outside: b.outside, amount: b.amount } : { numbers: b.numbers, amount: b.amount }));
    const stake = bets.reduce((a, b) => a + b.amount, 0), pocket = pocketFromSeed(randomBytes(32).toString('hex')), returned = returnsFor(bets, pocket);
    s.bank += returned - stake; s.rounds++; s.plan.left--; if (returned > stake) s.wins++;
    const row = { pocket, color: colorOf(pocket), stake, returned, net: returned - stake, at: Date.now() };
    s.last = row; s.recent = [...s.recent, row].slice(-20); save();
    feed.emit({ room: 'VT-01', agent: id, model: s.plan.model, stage: 'result', outcome: row.net > 0 ? 'won' : row.net < 0 ? 'lost' : 'push', persist: false,
      text: `${pocket} ${row.color.toUpperCase()}: staked ¤${(stake / 100).toFixed(2)}, returned ¤${(returned / 100).toFixed(2)}`,
      data: { pocket, color: row.color, stake, returned, net: row.net, bank: s.bank, total: net(s), rounds: s.rounds } });
    return row;
  }

  let nextAt = Date.now() + 5000, timer = null;
  const view = () => Object.entries(S).map(([id, s]) => ({
    id, name: SEATS[id].name, route: SEATS[id].route, provider: /^claude/.test(s.plan?.model || '') ? 'claude' : /^gemini/.test(s.plan?.model || '') ? 'gemini' : 'rules', model: s.plan?.model || null,
    bank: s.bank, net: net(s), rounds: s.rounds, wins: s.wins, resets: s.resets, last: s.last, note: s.plan?.note || null, planAt: s.plan?.at || null, spinsLeft: s.plan?.left ?? 0, nextSpinAt: nextAt,
  }));
  const gap = () => (isFast() ? fastMs : spinMs);
  function tick() {
    for (const id of Object.keys(S)) { try { spinOne(id); } catch (e) { log.warn?.('[roulette-ai]', e.message); } }
    nextAt = Date.now() + gap();
    feed.status('VT-01', { nextAt, label: 'Next rotation' });
  }
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  // a 3 s watcher: spins when due, and pulls the next rotation forward the moment the CEO's tour reaches the Leisure Suite
  const watch = () => { const now = Date.now(); if (isFast()) nextAt = Math.min(nextAt, now + fastMs); if (now >= nextAt) tick(); };
  const start = () => { stop(); nextAt = Date.now() + 5000; timer = setInterval(watch, 3000); };
  return { view, spinOne, plan, tick, start, stop, state: () => S, spent, budgetUsd };
}
