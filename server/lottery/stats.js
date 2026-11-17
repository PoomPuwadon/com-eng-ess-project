// Statistics helpers: chi-square, normal and binomial tails, Wilson intervals. Pure functions.

// log-gamma (Lanczos)
export function lgamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// regularized upper incomplete gamma Q(a, x)
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) { // series for P
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d; // continued fraction for Q
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

export const chiSquareP = (stat, df) => gammaQ(df / 2, stat / 2);

/** Pearson chi-square goodness of fit against uniform. */
export function chiSquareUniform(counts) {
  const n = counts.reduce((s, x) => s + x, 0), k = counts.length, e = n / k;
  const stat = counts.reduce((s, o) => s + (o - e) ** 2 / e, 0);
  return { stat, df: k - 1, p: chiSquareP(stat, k - 1), n };
}

export function normCdf(z) { // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** One-sided P(X >= k) for X ~ Binomial(n, p), exact. */
export function binomTail(k, n, p) {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(lgamma(n + 1) - lgamma(i + 1) - lgamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log1p(-p));
  return Math.min(1, s);
}

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const ph = k / n, d = 1 + (z * z) / n;
  const c = ph + (z * z) / (2 * n), w = z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
}

export function autocorr1(x) {
  const n = x.length, m = x.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { den += (x[i] - m) ** 2; if (i) num += (x[i] - m) * (x[i - 1] - m); }
  const r = den ? num / den : 0, z = r * Math.sqrt(n);
  return { r, z, p: 2 * (1 - normCdf(Math.abs(z))), n };
}

/** Wald–Wolfowitz runs test above/below the median. */
export function runsTest(x) {
  const sorted = [...x].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const s = x.filter((v) => v !== med).map((v) => v > med);
  const n1 = s.filter(Boolean).length, n2 = s.length - n1;
  let runs = s.length ? 1 : 0;
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) runs++;
  const mu = (2 * n1 * n2) / (n1 + n2) + 1, v = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / ((n1 + n2) ** 2 * (n1 + n2 - 1));
  const z = v > 0 ? (runs - mu) / Math.sqrt(v) : 0;
  return { runs, expected: mu, z, p: 2 * (1 - normCdf(Math.abs(z))) };
}

/** Seeded PRNG (mulberry32) for reproducible Monte Carlo. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
