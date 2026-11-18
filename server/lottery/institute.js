// Probability Research Institute: the research pipeline (Lottery Quant), the ticket decision (Head of
// Thai Markets), draw participation certificates for visitors, and settlement on official results.
import { DEPT, VAULT, EXT_LOTTERY, player as playerAcct } from '../ledger.js';
import { bkkDate, bkkTime, addDays } from '../time.js';
import { TARGETS, MODELS, evaluate, audit, monteCarlo, beam, positionalDigits, markovDigits, topK } from './models.js';
import { ATTRIBUTION } from './data.js';

export const TICKET_PRICE = 8_000; // ¤ 80.00 (leisure-rules §7)
const PRIZES = { first: 600_000_000, near1: 10_000_000, second: 20_000_000, third: 8_000_000, fourth: 4_000_000, fifth: 2_000_000, last3f: 400_000, last3b: 400_000, last2: 200_000 };
export const PRIZE_LABEL = { first: '1st prize', near1: 'Adjacent to 1st', second: '2nd prize', third: '3rd prize', fourth: '4th prize', fifth: '5th prize', last3f: 'Front 3 digits', last3b: 'Back 3 digits', last2: 'Last 2 digits' };
const SALES_CLOSE_MIN = 13 * 60 + 30; // 1 h before the 14:30 draw
const MAX_PER_PLAYER_DRAW = 200;
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Every prize a 6-digit number earns against a draw (a ticket may win several categories). */
export function prizesFor(number, d) {
  const out = [];
  if (number === d.first) out.push('first');
  if ((d.near1 || []).includes(number)) out.push('near1');
  for (const k of ['second', 'third', 'fourth', 'fifth']) if (d[k].includes(number)) out.push(k);
  for (const v of d.last3f || []) if (number.slice(0, 3) === v) out.push('last3f');
  for (const v of d.last3b || []) if (number.slice(3) === v) out.push('last3b');
  if (number.slice(4) === d.last2) out.push('last2');
  return { prizes: out, payout: out.reduce((s, k) => s + PRIZES[k], 0) };
}

/** Next official draw date: 1st and 16th, with the usual shifts (Jan 1 -> Dec 30, Jan 16 -> 17, May 1 -> 2). */
export function nextDrawDate(today, latestDrawDate) {
  const [y, m] = today.split('-').map(Number);
  const c = [];
  for (let i = -1; i < 3; i++) {
    const yy = y + Math.floor((m - 1 + i) / 12), mm = ((m - 1 + i) % 12 + 12) % 12 + 1;
    const p = (d) => `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    c.push(mm === 1 ? addDays(p(1), -2) : mm === 5 ? p(2) : p(1));
    c.push(mm === 1 ? p(17) : p(16));
  }
  return c.sort().find((d) => d >= today && (!latestDrawDate || d > latestDrawDate));
}

const SYSTEM = `You are the Head of Thai Markets at a satirically over-confident luxury financial firm. Your Probability Research Institute
treats the Thai Government Lottery like a quant fund: real models, walk-forward backtests, Monte Carlo — all dead serious.
Each draw you receive the Lottery Quant's pipeline output (model picks with probabilities, backtest metrics vs the uniform null,
Monte Carlo p-value, model-implied value per certificate vs the fair-draw value) and the department budget.

Choose which draw participation certificates (6-digit numbers) to buy, from the candidate list only, between 0 and 8.
Then write "note": a research note for the public wall, 3-5 sentences, max 110 words, deadpan corporate quant voice.
Be truthful about the numbers you were given: if the backtest shows no edge over the uniform null, say so with a straight face
(e.g. "the lift is statistically indistinguishable from 1.0; conviction remains high"). Never invent numbers or results.
Never use the words casino, gambling, gamble, jackpot, rigged.`;
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tickets', 'note'],
  properties: { tickets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['number', 'rationale'], properties: { number: { type: 'string' }, rationale: { type: 'string' } } } }, note: { type: 'string' } },
};

const QUANT_SYSTEM = `You are the Lottery Quant (Principal Quantitative Researcher) at a satirically over-confident luxury financial firm's
Probability Research Institute, which treats the Thai Government Lottery like a quant fund. You receive the research pipeline output for the
next draw: stage summaries, candidate certificates with model-implied value, backtest metrics vs the uniform null, Monte Carlo p-value.
Rank the candidates into a "shortlist" (best first, 3-8 numbers, ONLY from the candidate list) for the Head of Thai Markets, and write
"note": 2-4 sentences (max 80 words), deadpan, rigorous-sounding, truthful about the numbers (if there is no edge over chance, say so
with a straight face). Never invent numbers. Never use the words casino, gambling, gamble, jackpot, rigged.`;
const QUANT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['shortlist', 'note'],
  properties: { shortlist: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } },
};

export function createInstitute({ db, ledger, data, gateway, llm, bus, players, log = console }) {
  let running = false;

  // ---------------------------------------------------------------- calendar / sales window
  function calendar(now = Date.now()) {
    const today = bkkDate(now);
    const latest = db.get('SELECT date FROM lottery_draws ORDER BY date DESC LIMIT 1')?.date || null;
    const next = nextDrawDate(today, latest);
    const closed = today === next && bkkTime(now) >= SALES_CLOSE_MIN;
    return { today, next, latest, salesOpen: !closed, salesCloseLocal: `${next} 13:30 (Asia/Bangkok)`, drawTimeLocal: `${next} ~14:30–16:00 (Asia/Bangkok)` };
  }

  // ---------------------------------------------------------------- the research pipeline
  function runPipeline(trigger = 'scheduled') {
    const draws = data.draws();
    if (draws.length < 40) return null;
    const cal = calendar();
    const stages = [];
    const stage = (id, name, agent, fn) => { const t0 = performance.now(); const out = fn(); stages.push({ id, name, agent, ms: Math.round(performance.now() - t0), ...out }); return out; };

    stage('ingest', 'Data ingestion', 'Lottery Quant', () => ({
      summary: `${draws.length} confirmed official draws, ${draws[0].date} → ${draws[draws.length - 1].date}.`,
      data: { draws: draws.length, from: draws[0].date, to: draws[draws.length - 1].date, source: ATTRIBUTION, recent: draws.slice(-8).reverse().map((d) => ({ date: d.date, first: d.first, last2: d.last2, last3f: d.last3f, last3b: d.last3b })) },
    }));
    const au = stage('audit', 'Randomness audit', 'Lottery Quant', () => {
      const a = audit(draws);
      const dev = a.tests.filter((t) => t.p < 0.01).length;
      return { summary: `${a.tests.length} χ² uniformity tests: ${dev ? `${dev} flagged at p < 0.01` : 'none flagged at p < 0.01'}; lag-1 autocorrelation r = ${a.autocorrelation.r.toFixed(3)} (p = ${a.autocorrelation.p.toFixed(2)}); runs test p = ${a.runs.p.toFixed(2)}.`, data: a };
    });
    const hists = Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, draws.map((d) => t.get(d).map(Number))]));
    stage('features', 'Feature engineering', 'Lottery Quant', () => {
      const gaps = {};
      const l2 = hists.L2;
      for (let v = 0; v < 100; v++) { let g = 0; for (let t = l2.length - 1; t >= 0 && !l2[t].includes(v); t--) g++; gaps[String(v).padStart(2, '0')] = g; }
      const coldest = Object.entries(gaps).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { summary: `Digit-position frequencies, decayed posteriors, Markov transition tensors and gap statistics built. Longest-absent last-2: ${coldest.map(([v, g]) => `${v} (${g >= l2.length ? `never in ${g} draws` : `${g} draws`})`).join(', ')}.`, data: { heatmap: au.data.heatmap, last2Grid: au.data.last2Grid, coldest } };
    });
    const ev = {};
    stage('models', 'Model fitting + walk-forward backtest', 'Lottery Quant', () => {
      for (const [id, t] of Object.entries(TARGETS)) ev[id] = evaluate(hists[id].filter((h) => h.length), t.k, { topK: t.topK });
      const e = ev.L2.metrics.find((m) => m.id === 'ensemble');
      return {
        summary: `${MODELS.length} models × 3 targets, walk-forward over ${e.draws} draws. Last-2 DMA ensemble: ${e.hits}/${e.draws} top-5 hits (${(e.hitRate * 100).toFixed(1)}% vs ${(e.baselineRate * 100).toFixed(1)}% null), log-loss ${e.logLossBits} vs ${e.baselineBits} bits.`,
        data: Object.fromEntries(Object.entries(ev).map(([id, r]) => [id, { label: TARGETS[id].label, k: r.k, topK: r.topK, metrics: r.metrics, perModelNext: Object.fromEntries(Object.entries(r.perModelNext).map(([m, a]) => [m, a.map((x) => ({ v: String(x.v).padStart(r.k, '0'), p: x.p }))])) }])),
      };
    });
    stage('ensemble', 'Dynamic Model Averaging', 'Lottery Quant', () => {
      const w = ev.L2.weights.slice().sort((a, b) => b.w - a.w);
      return { summary: `Posterior model weights (last 2): ${w.map((x) => `${x.name} ${(x.w * 100).toFixed(0)}%`).join(', ')}.`, data: Object.fromEntries(Object.entries(ev).map(([id, r]) => [id, { weights: r.weights, path: r.weightPath }])) };
    });
    const mc = stage('montecarlo', 'Null-hypothesis Monte Carlo', 'Lottery Quant', () => {
      const e = ev.L2.metrics.find((m) => m.id === 'ensemble');
      const m = monteCarlo(e.hits, e.draws, e.baselineRate, 20000, draws.length);
      return { summary: `20,000 simulated seasons of random picks: ${(m.empiricalP * 100).toFixed(1)}% score at least ${e.hits} hits. ${m.empiricalP < 0.05 ? 'Nominally significant (multiple-testing caveats apply).' : 'Not distinguishable from chance.'}`, data: { ...m, hitPath: ev.L2.hitPath } };
    });
    const picks = stage('picks', 'Portfolio construction', 'Lottery Quant', () => {
      const pL2 = ev.L2.next, pF = ev.L3F.next, pB = ev.L3B.next;
      const fr = (p, k, n) => topK(p, n).map((v) => ({ v: String(v).padStart(k, '0'), p: p[v] }));
      const f6pd = positionalDigits(draws.map((d) => [+d.first]), 6).map((row, i) => row.map((x, d) => 0.5 * x + 0.5 * markovDigits(draws.map((dd) => [+dd.first]), 6)[i][d]));
      // model-implied value of a ticket = Σ prize × P(category) (front/back 3 are 2 draws each)
      const valueOf = (num) => (2 * pF[+num.slice(0, 3)] * PRIZES.last3f + 2 * pB[+num.slice(3)] * PRIZES.last3b + pL2[+num.slice(4)] * PRIZES.last2) / 100
        + (1e-6 * 6_000_000 + 2e-6 * 100_000 + 5e-6 * 200_000 + 1e-5 * 80_000 + 5e-5 * 40_000 + 1e-4 * 20_000); // 1st–5th tiers at the fair rate (= 12.00)
      const fronts = fr(pF, 3, 6), backs = topK(pB, 60).map((v) => String(v).padStart(3, '0'))
        .map((b) => ({ v: b, score: 2 * pB[+b] * PRIZES.last3b + pL2[+b.slice(1)] * PRIZES.last2 })).sort((a, b) => b.score - a.score).slice(0, 8);
      const candidates = [];
      for (let i = 0; i < 8; i++) { const num = fronts[i % fronts.length].v + backs[i].v; candidates.push({ number: num, modelValue: +valueOf(num).toFixed(2) }); }
      const flagship = beam(f6pd, 3).map((b) => ({ number: b.s, p: b.p }));
      return {
        summary: `Candidate certificates assembled from top front-3 × back-3/last-2 scores. Model-implied value ≈ ¤${(candidates.reduce((s, c) => s + c.modelValue, 0) / candidates.length).toFixed(2)} per ¤80 certificate vs ¤48.00 for a fair draw.`,
        data: { last2: fr(pL2, 2, 10), last2Dist: Array.from(pL2, (x) => +x.toFixed(6)), front3: fronts, back3: fr(pB, 3, 6), flagship, candidates, fairValue: 48, price: TICKET_PRICE / 100, f6Digits: f6pd.map((r) => r.map((x) => +x.toFixed(4))) },
      };
    });

    const run = { target: cal.next, createdAt: Date.now(), trigger, draws: draws.length, stages, picks: picks.data, decision: null, settlement: null };
    const { lastInsertRowid } = db.run('INSERT INTO lottery_runs(target_date, created_at, json) VALUES (?,?,?)', cal.next, run.createdAt, JSON.stringify(run));
    run.id = Number(lastInsertRowid);
    bus.emit('lottery', { type: 'run', id: run.id, target: cal.next });
    void mc;
    return run;
  }

  const saveRun = (run) => db.run('UPDATE lottery_runs SET json = ? WHERE id = ?', JSON.stringify(run), run.id);
  const getRun = (id) => { const r = id ? db.get('SELECT id, json FROM lottery_runs WHERE id = ?', id) : db.get('SELECT id, json FROM lottery_runs ORDER BY id DESC LIMIT 1'); return r ? { ...JSON.parse(r.json), id: r.id } : null; };

  // ---------------------------------------------------------------- Head of Thai Markets: the decision
  async function decide(run) {
    const cal = calendar();
    if (!cal.salesOpen || run.target !== cal.next) return null;
    if (db.get("SELECT 1 FROM lottery_tickets WHERE owner = ? AND target_date = ?", DEPT.thai, run.target)) return null;
    const e = run.stages.find((s) => s.id === 'models').data.L2.metrics.find((m) => m.id === 'ensemble');
    const mc = run.stages.find((s) => s.id === 'montecarlo').data;
    let cands = run.picks.candidates;
    const budget = ledger.balance(DEPT.thai);
    if (budget < 8 * TICKET_PRICE) return null; // budget still in transit with the ALC: decide on a later cycle
    // Lottery Quant (its own model, llm.js ROUTES): ranks the candidates and writes the research note
    const backtest = { hits: e.hits, draws: e.draws, hitRate: e.hitRate, nullRate: e.baselineRate, lift: e.lift, ci95: e.ci95, pValue: e.pValue, logLossBits: e.logLossBits, nullBits: e.baselineBits };
    const lq = await llm.ask({ job: 'lottery_research', agent: 'lottery_quant', system: QUANT_SYSTEM, schema: QUANT_SCHEMA, maxTokens: 900, user: JSON.stringify({
      targetDraw: run.target, stages: run.stages.map((s) => ({ stage: s.name, summary: s.summary })), candidates: cands, backtestLast2: backtest, monteCarloEmpiricalP: mc.empiricalP, fairValuePerCertificate: 48, certificatePrice: TICKET_PRICE / 100 }) });
    let quantModel = null, quantNote = null;
    if (lq && Array.isArray(lq.data.shortlist)) {
      const byNum = new Map(cands.map((c) => [c.number, c]));
      const ranked = [...new Set(lq.data.shortlist.map(String))].filter((n) => byNum.has(n)).map((n) => byNum.get(n));
      if (ranked.length) { cands = [...ranked, ...cands.filter((c) => !ranked.includes(c))]; quantModel = lq.model; quantNote = lq.data.note; }
    }
    let chosen = cands.slice(0, 5).map((c) => ({ number: c.number, rationale: quantModel ? `Lottery Quant shortlist (model-implied ¤${c.modelValue}).` : `Highest model-implied value (¤${c.modelValue}).` }));
    let note = null, usedLLM = false, model = null;
    const out = await llm.ask({ job: 'lottery_decision', agent: 'thai_head', system: SYSTEM, maxTokens: 2000, user: JSON.stringify({
      targetDraw: run.target, budget: budget / 100, certificatePrice: TICKET_PRICE / 100, candidates: cands, lotteryQuantNote: quantNote,
      backtestLast2: backtest,
      monteCarloEmpiricalP: mc.empiricalP, fairValuePerCertificate: 48, modelWeights: run.stages.find((s) => s.id === 'ensemble').data.L2.weights,
    }), schema: SCHEMA });
    if (out && Array.isArray(out.data.tickets)) {
      const valid = new Set(cands.map((c) => c.number));
      chosen = out.data.tickets.filter((t) => valid.has(t.number)).slice(0, 8);
      note = out.data.note; usedLLM = true; model = out.model;
    }
    note ||= `For the ${run.target} draw the Institute deploys ${chosen.length} certificates. The DMA ensemble scored ${e.hits}/${e.draws} top-5 hits on the last two digits against ${(e.baselineRate * e.draws).toFixed(1)} expected by chance (lift ${e.lift.toFixed(2)}×, 95% CI ${(e.ci95[0] / e.baselineRate).toFixed(2)}–${(e.ci95[1] / e.baselineRate).toFixed(2)}×, p = ${e.pValue.toFixed(2)}). Statistically, this is indistinguishable from a fair draw. Conviction remains exceptionally high.`;
    const bought = [], rejected = [];
    const spend = chosen.length * TICKET_PRICE;
    try {
      const commit = gateway.check('thai_head', 'BUY_TICKETS', spend);
      db.tx(() => {
        for (const t of chosen) bought.push(buyFor(DEPT.thai, t.number, run.target, { runId: run.id, source: 'agent', actor: 'agent:thai_head', model: model || 'rules' }));
        commit();
      });
    } catch (e2) { gateway.reject('thai_head', { tickets: chosen.map((t) => t.number) }, e2.message); rejected.push(e2.message); }
    run.decision = { agent: 'Head of Thai Markets', at: Date.now(), usedLLM, model, quantModel, quantNote, note, tickets: chosen.map((t) => ({ ...t, bought: bought.some((b) => b.number === t.number) })), spend: bought.length * TICKET_PRICE, rejected };
    saveRun(run);
    gateway.report('thai_head', note, { target: run.target, tickets: run.decision.tickets, spend: run.decision.spend }, model || false);
    gateway.report('lottery_quant', quantNote || run.stages.map((s) => s.summary).slice(1, 6).join(' '), { runId: run.id, shortlist: cands.slice(0, 8).map((c) => c.number) }, quantModel || false);
    bus.emit('lottery', { type: 'decision', id: run.id });
    return run.decision;
  }

  // ---------------------------------------------------------------- certificates
  function buyFor(owner, number, target, { runId = null, source = 'player', actor, model = null } = {}) {
    if (!/^\d{6}$/.test(number)) throw err('A certificate number has exactly six digits.');
    const { lastInsertRowid } = db.run('INSERT INTO lottery_tickets(owner, number, target_date, sale_day, price, status, run_id, source, created_at, model) VALUES (?,?,?,?,?,?,?,?,?,?)',
      owner, number, target, bkkDate(), TICKET_PRICE, 'pending', runId, source, Date.now(), model);
    const id = Number(lastInsertRowid);
    const internal = owner.startsWith('PLAYER:'); // visitors buy from the firm; the desk buys from the real-world market
    ledger.post({ actor: actor || owner, reason: 'LOTTERY_TICKET', ref: `ticket:${id}`, idem: `ticket:${id}:buy`,
      transfers: [{ from: owner, to: internal ? `ESCROW:TICKET:${id}` : EXT_LOTTERY, amount: TICKET_PRICE }] });
    return { id, number, target };
  }

  function buy(pid, number, qty = 1) {
    const cal = calendar();
    if (!cal.salesOpen) throw err('Participation for this draw has closed. Results are being verified with the Government Lottery Office.', 409);
    number = String(number || '').trim();
    qty = Number(qty);
    if (!/^\d{6}$/.test(number)) throw err('A certificate number has exactly six digits.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw err('You may acquire 1–50 certificates at a time.');
    const owner = playerAcct(pid);
    const held = db.get('SELECT COUNT(*) AS n FROM lottery_tickets WHERE owner = ? AND target_date = ?', owner, cal.next).n;
    if (held + qty > MAX_PER_PLAYER_DRAW) throw err(`Allocation limit is ${MAX_PER_PLAYER_DRAW} certificates per draw.`);
    if (ledger.balance(owner) < qty * TICKET_PRICE) throw err('You are currently liquidity-constrained for this allocation.', 402);
    if (ledger.balance(VAULT) < 601_000_000) throw err('The Treasury Reserve cannot underwrite new certificates right now.', 409);
    const out = db.tx(() => Array.from({ length: qty }, () => buyFor(owner, number, cal.next, { runId: getRun()?.id || null })));
    bus.emit('lottery', { type: 'sale', qty, name: players.nameOf(pid) });
    return { tickets: out, balance: ledger.balance(owner) };
  }

  // ---------------------------------------------------------------- settlement on confirmed official results
  function settle() {
    const pending = db.all("SELECT * FROM lottery_tickets WHERE status = 'pending' ORDER BY id");
    let n = 0;
    for (const t of pending) {
      const draw = db.get('SELECT date, json FROM lottery_draws WHERE confirmed = 1 AND date >= ? AND first_seen > ? ORDER BY date LIMIT 1', t.sale_day, t.created_at);
      if (!draw) continue;
      const d = JSON.parse(draw.json);
      const { prizes, payout } = prizesFor(t.number, d);
      db.tx(() => {
        const internal = t.owner.startsWith('PLAYER:');
        const transfers = internal
          ? [{ from: `ESCROW:TICKET:${t.id}`, to: VAULT, amount: t.price }, ...(payout ? [{ from: VAULT, to: t.owner, amount: payout }] : [])]
          : (payout ? [{ from: EXT_LOTTERY, to: t.owner, amount: payout }] : []);
        if (transfers.length) ledger.post({ actor: 'system:settlement', reason: payout ? 'WAGER_WON' : 'WAGER_LOST', ref: `ticket:${t.id}`, idem: `ticket:${t.id}:settle`, transfers });
        db.run("UPDATE lottery_tickets SET status = 'settled', payout = ?, prizes = ?, settled_date = ? WHERE id = ?", payout, JSON.stringify(prizes), d.date, t.id);
      });
      n++;
    }
    if (n) {
      // attach a settlement summary to the run that made the picks
      for (const r of db.all('SELECT DISTINCT run_id FROM lottery_tickets WHERE run_id IS NOT NULL AND status = \'settled\'')) {
        const run = getRun(r.run_id);
        if (!run || run.settlement) continue;
        const draw = data.byDate(db.get('SELECT settled_date FROM lottery_tickets WHERE run_id = ? AND settled_date IS NOT NULL LIMIT 1', r.run_id).settled_date);
        if (!draw) continue;
        const l2 = run.picks.last2.findIndex((x) => x.v === draw.last2);
        const agentT = db.all('SELECT number, payout, prizes FROM lottery_tickets WHERE run_id = ? AND owner = ?', r.run_id, DEPT.thai);
        run.settlement = { date: draw.date, first: draw.first, last2: draw.last2, last3f: draw.last3f, last3b: draw.last3b, last2Rank: l2 >= 0 ? l2 + 1 : null,
          front3Hit: run.picks.front3.some((x) => draw.last3f.includes(x.v)), back3Hit: run.picks.back3.some((x) => draw.last3b.includes(x.v)),
          agentTickets: agentT.map((t) => ({ ...t, prizes: JSON.parse(t.prizes || '[]') })), agentReturn: agentT.reduce((s, t) => s + (t.payout || 0), 0), agentCost: agentT.length * TICKET_PRICE };
        saveRun(run);
      }
      bus.emit('lottery', { type: 'settled', count: n });
    }
    return n;
  }

  // ---------------------------------------------------------------- scheduler hook
  async function cycle(trigger) {
    if (running) return;
    running = true;
    try {
      settle();
      const cal = calendar();
      const last = getRun();
      const latestDraw = db.get('SELECT date FROM lottery_draws WHERE confirmed = 1 ORDER BY date DESC LIMIT 1')?.date;
      const stale = !last || !last.picks?.last2Dist || last.target !== cal.next || last.draws < data.count() || Date.now() - last.createdAt > 24 * 3600_000;
      let run = last;
      if (stale && data.count() >= 40 && !data.state.backfilling) run = runPipeline(trigger);
      if (run && !run.decision) { // a re-run for a draw the desk already bought for keeps that decision (and its certificates)
        const prior = db.all('SELECT id, json FROM lottery_runs WHERE target_date = ? AND id < ? ORDER BY id DESC', run.target, run.id || 0)
          .map((r) => ({ ...JSON.parse(r.json), id: r.id })).find((r) => r.decision);
        if (prior) { run.decision = { ...prior.decision, carriedFrom: prior.id }; saveRun(run); bus.emit('lottery', { type: 'decision', id: run.id }); }
      }
      if (run && !run.decision && run.target === cal.next) await decide(run);
      void latestDraw;
    } finally { running = false; }
  }

  function history(limit = 12) {
    return db.all('SELECT id, json FROM lottery_runs ORDER BY id DESC LIMIT 60').map((r) => ({ id: r.id, ...JSON.parse(r.json) }))
      .filter((r, i, a) => a.findIndex((x) => x.target === r.target) === i) // latest run per target draw
      .slice(0, limit).map((r) => ({ id: r.id, target: r.target, createdAt: r.createdAt, last2: r.picks.last2.slice(0, 5), front3: r.picks.front3.slice(0, 3), back3: r.picks.back3.slice(0, 3), decision: r.decision && { tickets: r.decision.tickets, spend: r.decision.spend, usedLLM: r.decision.usedLLM }, settlement: r.settlement }));
  }
  // visitors' certificates for a draw (shown live on the OT-02 screens)
  const sales = (target) => db.get("SELECT COUNT(*) AS n, COUNT(DISTINCT owner) AS buyers FROM lottery_tickets WHERE owner LIKE 'PLAYER:%' AND target_date = ?", target);
  const tickets = (owner, limit = 100) => db.all('SELECT * FROM lottery_tickets WHERE owner = ? ORDER BY id DESC LIMIT ?', owner, limit).map((t) => ({ ...t, prizes: t.prizes ? JSON.parse(t.prizes) : [] }));

  return { runPipeline, decide, buy, settle, cycle, calendar, getRun, history, tickets, sales, PRIZE_LABEL };
}
