// Probability Research Institute — the prediction models. Real algorithms, honestly evaluated.
//
// Each model maps the draw history to a probability distribution over the next draw's outcome
// for a k-digit target (last 2 digits: 100 outcomes; front/back 3 digits: 1,000 outcomes).
//   uniform     — the null hypothesis: every outcome equally likely (what a fair draw implies)
//   frequency   — Laplace-smoothed all-time frequency ("hot numbers")
//   recency     — exponentially-weighted frequency, λ = 0.96 (≈ 17-draw half-life)
//   overdue     — gap/hazard score: numbers unseen for longer get more weight (tests the gambler's fallacy)
//   positional  — independent Dirichlet–multinomial posterior per digit position with decay (Bayesian)
//   markov      — first-order Markov chain per digit position: P(digit | same position last draw)
// The ensemble is Dynamic Model Averaging (Raftery et al., 2010): Bayesian model weights updated
// walk-forward by each model's predictive likelihood, with a forgetting factor so weights can adapt.
// Every model is scored by a walk-forward backtest (train on draws < t, predict draw t) against
// the uniform baseline: log-loss in bits, top-K hit rate, Wilson 95% CI, exact binomial p-value.
import { chiSquareUniform, autocorr1, runsTest, binomTail, wilson, rng } from './stats.js';

export const TARGETS = {
  L2: { k: 2, label: 'Last 2 digits', get: (d) => [d.last2], prize: 2000, topK: 5 },
  L3F: { k: 3, label: 'Front 3 digits', get: (d) => d.last3f || [], prize: 4000, topK: 10 },
  L3B: { k: 3, label: 'Back 3 digits', get: (d) => d.last3b || [], prize: 4000, topK: 10 },
};

const digits = (v, k) => { const out = new Array(k); for (let i = k - 1; i >= 0; i--) { out[i] = v % 10; v = Math.floor(v / 10); } return out; };
const normalise = (p) => { let s = 0; for (const x of p) s += x; for (let i = 0; i < p.length; i++) p[i] /= s; return p; };

// ---------------------------------------------------------------- models: (hist: int[][], k) => Float64Array
const uniform = (hist, k) => new Float64Array(10 ** k).fill(1 / 10 ** k);

function frequency(hist, k) {
  const p = new Float64Array(10 ** k).fill(1);
  for (const vals of hist) for (const v of vals) p[v] += 1;
  return normalise(p);
}

function recency(hist, k, lambda = 0.96) {
  const p = new Float64Array(10 ** k).fill(0.5);
  let w = 1;
  for (let t = hist.length - 1; t >= 0; t--, w *= lambda) for (const v of hist[t]) p[v] += w;
  return normalise(p);
}

function overdue(hist, k) {
  const N = 10 ** k, T = hist.length;
  const m = hist.reduce((s, h) => s + h.length, 0) / Math.max(T, 1) || 1;
  const E = N / m; // expected gap between appearances under a fair draw
  const last = new Int32Array(N).fill(-1);
  hist.forEach((vals, t) => { for (const v of vals) last[v] = t; });
  const p = new Float64Array(N);
  for (let v = 0; v < N; v++) { const gap = last[v] < 0 ? T + E : T - 1 - last[v]; p[v] = 1 + 0.5 * Math.min(gap / E, 4); }
  return normalise(p);
}

/** per-position digit distributions (k x 10) — exponentially-decayed Dirichlet posterior means */
export function positionalDigits(hist, k, lambda = 0.985, alpha = 1) {
  const c = Array.from({ length: k }, () => new Float64Array(10).fill(alpha));
  let w = 1;
  for (let t = hist.length - 1; t >= 0; t--, w *= lambda) for (const v of hist[t]) digits(v, k).forEach((d, i) => { c[i][d] += w; });
  return c.map(normalise);
}
function fromDigits(pd, k) {
  const N = 10 ** k, p = new Float64Array(N);
  for (let v = 0; v < N; v++) { let x = 1; const ds = digits(v, k); for (let i = 0; i < k; i++) x *= pd[i][ds[i]]; p[v] = x; }
  return normalise(p);
}
const positional = (hist, k) => fromDigits(positionalDigits(hist, k), k);

export function markovDigits(hist, k, lambda = 0.99) {
  const T = Array.from({ length: k }, () => Array.from({ length: 10 }, () => new Float64Array(10).fill(1)));
  let w = 1;
  for (let t = hist.length - 1; t >= 1; t--, w *= lambda) {
    for (const a of hist[t - 1]) for (const b of hist[t]) { const da = digits(a, k), db = digits(b, k); for (let i = 0; i < k; i++) T[i][da[i]][db[i]] += w; }
  }
  const prev = hist[hist.length - 1] || [];
  return Array.from({ length: k }, (_, i) => {
    const row = new Float64Array(10);
    if (!prev.length) return row.fill(0.1);
    for (const a of prev) { const r = T[i][digits(a, k)[i]]; const s = r.reduce((x, y) => x + y, 0); for (let d = 0; d < 10; d++) row[d] += r[d] / s; }
    return normalise(row);
  });
}
const markov = (hist, k) => fromDigits(markovDigits(hist, k), k);

export const MODELS = [
  { id: 'uniform', name: 'Uniform null', desc: 'Fair-draw baseline: every outcome equally likely.', fn: uniform },
  { id: 'frequency', name: 'Hot numbers', desc: 'Laplace-smoothed all-time frequency.', fn: frequency },
  { id: 'recency', name: 'Momentum', desc: 'Exponentially-weighted frequency, λ = 0.96.', fn: recency },
  { id: 'overdue', name: 'Overdue hazard', desc: 'Long-unseen outcomes up-weighted (tests the "due number" fallacy).', fn: overdue },
  { id: 'positional', name: 'Bayesian positional', desc: 'Dirichlet–multinomial posterior per digit position, decayed.', fn: positional },
  { id: 'markov', name: 'Markov chain', desc: 'First-order digit transitions from the previous draw.', fn: markov },
];

const topK = (p, K) => Array.from(p.keys()).sort((a, b) => p[b] - p[a] || a - b).slice(0, K);
const mix = (dists, w) => { const out = new Float64Array(dists[0].length); dists.forEach((d, i) => { for (let v = 0; v < d.length; v++) out[v] += w[i] * d[v]; }); return out; };
const softmax = (lw) => { const m = Math.max(...lw); const e = lw.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };

/**
 * Walk-forward backtest + Dynamic Model Averaging for one target.
 * hist: int[][] in date order. Returns metrics per model and the ensemble, the weight trajectory,
 * and the ensemble's distribution for the NEXT draw.
 */
export function evaluate(hist, k, { topK: K = 5, warmup = 24, forget = 0.97 } = {}) {
  const N = 10 ** k, ids = [...MODELS.map((m) => m.id), 'ensemble'];
  const stat = Object.fromEntries(ids.map((id) => [id, { bits: 0, obs: 0, hits: 0, draws: 0 }]));
  let lw = MODELS.map(() => 0);
  const weightPath = [], hitPath = [];
  let p0sum = 0;
  for (let t = warmup; t < hist.length; t++) {
    const past = hist.slice(0, t), obs = hist[t];
    if (!obs.length) continue;
    const dists = MODELS.map((m) => m.fn(past, k));
    const w = softmax(lw);
    const ens = mix(dists, w);
    [...dists, ens].forEach((d, i) => {
      const s = stat[ids[i]], top = new Set(topK(d, K));
      for (const v of obs) { s.bits += -Math.log2(d[v]); s.obs++; }
      s.draws++;
      if (obs.some((v) => top.has(v))) s.hits++;
    });
    const p0 = 1 - (1 - K / N) ** obs.length;
    p0sum += p0;
    hitPath.push({ t, hits: stat.ensemble.hits, expected: +p0sum.toFixed(3) });
    // DMA update: forget, then multiply by each model's predictive likelihood of what was drawn
    lw = lw.map((x, i) => forget * x + obs.reduce((s, v) => s + Math.log(dists[i][v]), 0));
    if ((t - warmup) % 4 === 0 || t === hist.length - 1) weightPath.push({ t, w: softmax(lw).map((x) => +x.toFixed(4)) });
  }
  const finalW = softmax(lw);
  const nextDists = MODELS.map((m) => m.fn(hist, k));
  const next = mix(nextDists, finalW);
  const metrics = ids.map((id) => {
    const s = stat[id];
    const draws = s.draws || 1, p0 = p0sum / draws;
    const [lo, hi] = wilson(s.hits, s.draws);
    return {
      id, name: id === 'ensemble' ? 'DMA ensemble' : MODELS.find((m) => m.id === id).name,
      logLossBits: +(s.bits / Math.max(s.obs, 1)).toFixed(4), baselineBits: +Math.log2(N).toFixed(4),
      draws: s.draws, hits: s.hits, hitRate: s.hits / draws, baselineRate: p0, lift: (s.hits / draws) / p0,
      ci95: [lo, hi], pValue: binomTail(s.hits, s.draws, p0),
    };
  });
  return {
    k, N, topK: K, warmup, metrics, weights: MODELS.map((m, i) => ({ id: m.id, name: m.name, w: finalW[i] })), weightPath, hitPath,
    next, perModelNext: Object.fromEntries(MODELS.map((m, i) => [m.id, topK(nextDists[i], 5).map((v) => ({ v, p: nextDists[i][v] }))])),
  };
}

/** Randomness audit over the whole history. */
export function audit(draws) {
  const firstPos = Array.from({ length: 6 }, () => new Array(10).fill(0));
  const all = new Array(10).fill(0);
  for (const d of draws) {
    [...d.first].forEach((ch, i) => { firstPos[i][+ch]++; all[+ch]++; });
    for (const n of [d.last2, ...(d.last3f || []), ...(d.last3b || [])]) for (const ch of n) all[+ch]++;
  }
  const l2 = draws.map((d) => +d.last2);
  const l2t = new Array(10).fill(0), l2u = new Array(10).fill(0);
  for (const v of l2) { l2t[Math.floor(v / 10)]++; l2u[v % 10]++; }
  const tests = [
    ...firstPos.map((c, i) => ({ name: `1st prize · digit ${i + 1}`, ...chiSquareUniform(c) })),
    { name: 'Last 2 · tens digit', ...chiSquareUniform(l2t) },
    { name: 'Last 2 · units digit', ...chiSquareUniform(l2u) },
    { name: 'All published digits', ...chiSquareUniform(all) },
  ].map((t) => ({ ...t, verdict: t.p < 0.01 ? 'deviation' : 'consistent with fair' }));
  return { tests, autocorrelation: autocorr1(l2), runs: runsTest(l2), heatmap: firstPos, last2Grid: (() => { const g = Array.from({ length: 10 }, () => new Array(10).fill(0)); for (const v of l2) g[Math.floor(v / 10)][v % 10]++; return g; })() };
}

/** Null-hypothesis Monte Carlo: how often would random picks score at least this many hits? */
export function monteCarlo(hits, draws, p0, sims = 20000, seed = 1) {
  const r = rng(seed);
  const hist = new Array(draws + 1).fill(0);
  let atLeast = 0;
  for (let s = 0; s < sims; s++) {
    let h = 0;
    for (let i = 0; i < draws; i++) if (r() < p0) h++;
    hist[h]++;
    if (h >= hits) atLeast++;
  }
  const last = hist.findLastIndex((x) => x > 0);
  return { sims, hits, draws, p0, empiricalP: atLeast / sims, histogram: hist.slice(0, Math.max(last, hits) + 2) };
}

/** Highest-probability k-digit strings from per-position digit distributions (beam search). */
export function beam(pd, n = 5, width = 40) {
  let beams = [{ s: '', p: 1 }];
  for (const row of pd) {
    const next = [];
    for (const b of beams) row.forEach((p, d) => next.push({ s: b.s + d, p: b.p * p }));
    beams = next.sort((a, b) => b.p - a.p).slice(0, width);
  }
  return beams.slice(0, n);
}

export { topK, digits };
