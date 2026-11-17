// Technical indicators over daily bars [t, o, h, l, c, v]. Pure functions.

export const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const ret = (c, n) => (c.length > n ? c[c.length - 1] / c[c.length - 1 - n] - 1 : null);
const sma = (c, n) => (c.length >= n ? mean(c.slice(-n)) : null);

export function rsi(c, n = 14) {
  if (c.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export const logReturns = (c) => c.slice(1).map((x, i) => Math.log(x / c[i]));

export function features(bars) {
  const c = bars.map((b) => b[4]);
  if (c.length < 60) return null;
  const last = c[c.length - 1];
  const r = logReturns(c);
  const vol20 = std(r.slice(-20)) * Math.sqrt(252);
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200);
  const sd20 = std(c.slice(-20));
  const hi63 = Math.max(...c.slice(-63));
  return {
    last, ret1m: ret(c, 21), ret3m: ret(c, 63), ret6m: ret(c, 126), ret12_1: c.length > 252 ? c[c.length - 22] / c[c.length - 253] - 1 : ret(c, Math.min(c.length - 1, 230)),
    sma20: s20, sma50: s50, sma200: s200, trend50: s50 ? last / s50 - 1 : 0, above200: s200 ? last > s200 : null,
    rsi14: rsi(c), vol20, z20: sd20 ? (last - s20) / sd20 : 0, drawdown3m: last / hi63 - 1,
  };
}

/** Cross-sectional z-scores of a numeric field. */
export function zscore(rows, field) {
  const v = rows.map((r) => r[field]).filter((x) => x != null && Number.isFinite(x));
  const m = mean(v), s = std(v) || 1;
  return (r) => (r[field] == null ? 0 : (r[field] - m) / s);
}

/** Sample covariance matrix of aligned daily log returns (last n days). */
export function covariance(series, n = 60) {
  const k = series.length;
  const len = Math.min(n, ...series.map((s) => s.length));
  const X = series.map((s) => s.slice(-len));
  const mu = X.map(mean);
  const cov = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
    let s = 0; for (let t = 0; t < len; t++) s += (X[i][t] - mu[i]) * (X[j][t] - mu[j]);
    cov[i][j] = cov[j][i] = s / Math.max(len - 1, 1);
  }
  return cov;
}
