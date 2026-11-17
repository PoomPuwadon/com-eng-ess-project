// Small canvas charts (no library): line/area, bars, histogram. Sized to their CSS width at draw time.

function prep(canvas, height) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 400;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, height);
  return { g, w, h: height };
}
const AX = 'rgba(255,255,255,0.35)', GRID = 'rgba(255,255,255,0.06)';
const nice = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

/** series: [{ pts: [[x, y]], color, fill?, width?, dash? }] */
export function lineChart(canvas, series, { height = 180, yFmt = nice, xFmt = null, refY = null, refLabel = '', pad = { l: 52, r: 10, t: 10, b: 22 } } = {}) {
  const { g, w, h } = prep(canvas, height);
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) { g.fillStyle = AX; g.font = '12px system-ui'; g.fillText('Awaiting data…', 12, h / 2); return; }
  let x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  let y0 = Math.min(...all.map((p) => p[1]), refY ?? Infinity), y1 = Math.max(...all.map((p) => p[1]), refY ?? -Infinity);
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) { y1 += Math.abs(y1) * 0.01 || 1; y0 -= Math.abs(y0) * 0.01 || 1; }
  const yp = (y1 - y0) * 0.08; y0 -= yp; y1 += yp;
  const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  g.font = '10px ui-monospace, monospace'; g.fillStyle = AX; g.strokeStyle = GRID; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = y0 + ((y1 - y0) * i) / 4, y = Y(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.fillText(yFmt(v), 4, y + 3); }
  if (xFmt) for (let i = 0; i <= 3; i++) { const v = x0 + ((x1 - x0) * i) / 3; const t = xFmt(v); g.fillText(t, Math.min(w - pad.r - g.measureText(t).width, Math.max(pad.l, X(v) - g.measureText(t).width / 2)), h - 6); }
  if (refY != null) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(240,209,138,0.6)'; g.beginPath(); g.moveTo(pad.l, Y(refY)); g.lineTo(w - pad.r, Y(refY)); g.stroke(); g.setLineDash([]); if (refLabel) { g.fillStyle = 'rgba(240,209,138,0.85)'; g.fillText(refLabel, pad.l + 4, Y(refY) - 4); } }
  for (const s of series) {
    if (s.pts.length < 2) continue;
    g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    if (s.fill) {
      g.save(); g.lineTo(X(s.pts[s.pts.length - 1][0]), h - pad.b); g.lineTo(X(s.pts[0][0]), h - pad.b); g.closePath();
      const gr = g.createLinearGradient(0, pad.t, 0, h - pad.b); gr.addColorStop(0, s.fill); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fill(); g.restore();
      g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    }
    g.strokeStyle = s.color; g.lineWidth = s.width || 2; if (s.dash) g.setLineDash(s.dash); g.stroke(); g.setLineDash([]);
  }
}

/** bars: [{ label, v, color? }] ; ref = horizontal reference line value */
export function barChart(canvas, bars, { height = 160, ref = null, refLabel = '', yFmt = nice, labelEvery = 1, color = '#d6b25e', highlight = null } = {}) {
  const { g, w, h } = prep(canvas, height);
  if (!bars.length) return;
  const pad = { l: 44, r: 8, t: 8, b: 20 };
  const max = Math.max(...bars.map((b) => b.v), ref ?? 0) * 1.1 || 1;
  const bw = (w - pad.l - pad.r) / bars.length;
  const Y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  g.font = '10px ui-monospace, monospace'; g.fillStyle = AX; g.strokeStyle = GRID;
  for (let i = 0; i <= 3; i++) { const v = (max * i) / 3; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(w - pad.r, Y(v)); g.stroke(); g.fillText(yFmt(v), 4, Y(v) + 3); }
  bars.forEach((b, i) => {
    g.fillStyle = b.color || (highlight != null && i === highlight ? '#3ddc84' : color);
    g.fillRect(pad.l + i * bw + bw * 0.12, Y(b.v), bw * 0.76, h - pad.b - Y(b.v));
    if (i % labelEvery === 0) { g.fillStyle = AX; const t = String(b.label); g.fillText(t, pad.l + i * bw + bw / 2 - g.measureText(t).width / 2, h - 6); }
  });
  if (ref != null) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(240,209,138,0.75)'; g.beginPath(); g.moveTo(pad.l, Y(ref)); g.lineTo(w - pad.r, Y(ref)); g.stroke(); g.setLineDash([]); if (refLabel) { g.fillStyle = 'rgba(240,209,138,0.9)'; g.fillText(refLabel, w - pad.r - g.measureText(refLabel).width - 2, Y(ref) - 4); } }
}

/** Colour for a value in [0,1] on a cool→warm scale. */
export const heatColor = (t) => `hsl(${220 - 220 * Math.max(0, Math.min(1, t))}, 70%, ${28 + 30 * Math.max(0, Math.min(1, t))}%)`;
