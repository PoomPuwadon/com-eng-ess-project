// European roulette table layout: geometry, hit-testing (which position a point on the felt means)
// and drawing. Shared by the 3D table (layout texture + picking) — board units, not metres.

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
// [value in minor units, colour, label]
export const CHIPS = [[100, '#8a8f9c', '1'], [500, '#c23a3a', '5'], [2500, '#2f8a4f', '25'], [10000, '#26262e', '100'], [50000, '#7a45bd', '500'], [250000, '#d4ac3c', '2.5k']];
const OUT_LABEL = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 to 18', high: '19 to 36', dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12', column1: 'Column 1', column2: 'Column 2', column3: 'Column 3' };
const KIND_NAME = { 1: 'Straight up · 35:1', 2: 'Split · 17:1', 3: 'Street · 11:1', 4: 'Corner · 8:1', 6: 'Six line · 5:1' };

export const Z = 56, CW = 54, CH = 60, ROWS = 3, DZ = 46, OUTH = 46;
export const GW = Z + 12 * CW + 60, GH = ROWS * CH + DZ + OUTH;
const OUTSIDE_ROW = ['low', 'even', 'red', 'black', 'odd', 'high'];
const T = 0.24; // edge tolerance, fraction of a cell
const numAt = (s, r) => 3 * s + (3 - r); // r = 0 far row (3, 6, …), 2 near row (1, 4, …)
export const numberCentre = (n) => (n === 0 ? [Z / 2, (ROWS * CH) / 2] : [Z + (Math.ceil(n / 3) - 1) * CW + CW / 2, (3 - ((n - 1) % 3) - 1) * CH + CH / 2]);

/** Board point -> { numbers | outside, ax, ay } (ax, ay: where the stack sits), or null. */
export function hitTest(x, y) {
  if (y < 0 || y > GH || x < 0 || x > GW) return null;
  if (y < ROWS * CH) {
    if (x < Z - 9) return x > 4 ? { numbers: [0], ax: Z / 2, ay: (ROWS * CH) / 2 } : null;
    if (x < Z) x = Z; // on the zero line: splits / trios / first four with zero
    if (x >= Z + 12 * CW) { const r = Math.floor(y / CH); return { outside: `column${3 - r}`, ax: Z + 12 * CW + 30, ay: r * CH + CH / 2 }; }
    const s = Math.floor((x - Z) / CW), r = Math.floor(y / CH);
    const fx = (x - Z) / CW - s, fy = y / CH - r;
    const hx = fx < T ? -1 : fx > 1 - T ? 1 : 0;
    let vy = fy < T ? -1 : fy > 1 - T ? 1 : 0;
    if (vy === -1 && r === 0) vy = 0;
    const n = numAt(s, r);
    const ax = Z + (s + (hx === 1 ? 1 : hx === -1 ? 0 : 0.5)) * CW, ay = (r + (vy === 1 ? 1 : vy === -1 ? 0 : 0.5)) * CH;
    const bottom = r === 2;
    if (!hx && !vy) return { numbers: [n], ax, ay };
    if (hx && !vy) {
      if (hx < 0) return { numbers: s > 0 ? [n - 3, n] : [0, n], ax, ay };
      return s < 11 ? { numbers: [n, n + 3], ax, ay } : { numbers: [n], ax: ax - CW / 2, ay };
    }
    if (!hx && vy) {
      if (vy < 0) return { numbers: [n, n + 1], ax, ay };
      return bottom ? { numbers: [n, n + 1, n + 2], ax, ay } : { numbers: [n - 1, n], ax, ay };
    }
    if (vy > 0 && bottom) {
      if (hx < 0) return s > 0 ? { numbers: [n - 3, n - 2, n - 1, n, n + 1, n + 2], ax, ay } : { numbers: [0, 1, 2, 3], ax, ay };
      return s < 11 ? { numbers: [n, n + 1, n + 2, n + 3, n + 4, n + 5], ax, ay } : { numbers: [n, n + 1, n + 2], ax: ax - CW / 2, ay };
    }
    const a = vy < 0 ? n : n - 1, b = a + 1;
    if (hx < 0) return s > 0 ? { numbers: [a - 3, b - 3, a, b], ax, ay } : { numbers: [0, a, b], ax, ay };
    return s < 11 ? { numbers: [a, b, a + 3, b + 3], ax, ay } : { numbers: [a, b], ax: ax - CW / 2, ay };
  }
  if (x < Z || x >= Z + 12 * CW) return null;
  const s = Math.floor((x - Z) / CW);
  if (y < ROWS * CH + DZ) { const d = Math.floor(s / 4) + 1; return { outside: `dozen${d}`, ax: Z + (d - 1) * 4 * CW + 2 * CW, ay: ROWS * CH + DZ / 2 }; }
  const i = Math.floor(s / 2);
  return { outside: OUTSIDE_ROW[i], ax: Z + i * 2 * CW + CW, ay: ROWS * CH + DZ + OUTH / 2 };
}
export const keyOf = (h) => (h.outside ? h.outside : [...h.numbers].sort((p, q) => p - q).join('-'));
export function coverOf(h) {
  if (!h.outside) return h.numbers;
  const r = Array.from({ length: 36 }, (_, i) => i + 1), o = h.outside;
  if (o === 'red') return r.filter((n) => RED.has(n)); if (o === 'black') return r.filter((n) => !RED.has(n));
  if (o === 'odd') return r.filter((n) => n % 2); if (o === 'even') return r.filter((n) => !(n % 2));
  if (o === 'low') return r.filter((n) => n <= 18); if (o === 'high') return r.filter((n) => n > 18);
  if (o.startsWith('dozen')) { const d = +o.slice(5); return r.filter((n) => n > (d - 1) * 12 && n <= d * 12); }
  const c = +o.slice(6); return r.filter((n) => n % 3 === c % 3);
}
export const describe = (h) => (h.outside
  ? `${OUT_LABEL[h.outside]} · ${h.outside.startsWith('dozen') || h.outside.startsWith('column') ? '2:1' : '1:1'}`
  : `${h.numbers.join(', ')} — ${h.numbers.includes(0) && h.numbers.length === 3 ? 'Trio · 11:1' : h.numbers.includes(0) && h.numbers.length === 4 ? 'First four · 8:1' : KIND_NAME[h.numbers.length]}`);

/** Split an amount into chip denominations, largest first (for 3D stacks). */
export function chipsFor(amount) {
  const out = [];
  for (const [v, col] of [...CHIPS].reverse()) while (amount >= v && out.length < 24) { out.push(col); amount -= v; }
  return out;
}

/** Draw the layout into a canvas of the given pixel width (felt colour, gold-white lines). */
export function drawLayout(cv, { pixelWidth, hover = null, winning = null } = {}) {
  const scale = pixelWidth / GW;
  if (cv.width !== Math.round(GW * scale)) { cv.width = Math.round(GW * scale); cv.height = Math.round(GH * scale); }
  const g = cv.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const felt = g.createRadialGradient(GW / 2, GH / 2, 40, GW / 2, GH / 2, GW * 0.7);
  felt.addColorStop(0, '#1a7a4d'); felt.addColorStop(1, '#0f5636');
  g.fillStyle = felt; g.fillRect(0, 0, GW, GH);
  const lit = new Set(hover ? coverOf(hover) : []);
  const LINE = 'rgba(248,240,214,0.92)';
  g.lineWidth = 1.6; g.strokeStyle = LINE; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cell = (x, y, w, h, text, font) => { g.strokeRect(x, y, w, h); if (text) { g.fillStyle = '#f8f0d6'; g.font = font; g.fillText(text, x + w / 2, y + h / 2); } };
  // zero (pentagon)
  g.beginPath(); g.moveTo(Z, 0); g.lineTo(14, 0); g.lineTo(2, (ROWS * CH) / 2); g.lineTo(14, ROWS * CH); g.lineTo(Z, ROWS * CH); g.closePath();
  g.fillStyle = winning === 0 ? '#f0d18a' : lit.has(0) ? 'rgba(255,255,255,0.35)' : '#0b7a3e'; g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 22px Georgia'; g.fillText('0', Z / 2 + 4, (ROWS * CH) / 2);
  for (let s = 0; s < 12; s++) for (let r = 0; r < 3; r++) {
    const n = numAt(s, r), x = Z + s * CW, y = r * CH;
    if (lit.has(n)) { g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, CW, CH); }
    g.strokeRect(x, y, CW, CH);
    g.beginPath(); g.ellipse(x + CW / 2, y + CH / 2, 18, 21, 0, 0, Math.PI * 2);
    g.fillStyle = winning === n ? '#f0d18a' : RED.has(n) ? '#c0141f' : '#141416'; g.fill();
    g.fillStyle = winning === n ? '#1b1407' : '#fff'; g.font = '700 18px Georgia'; g.fillText(String(n), x + CW / 2, y + CH / 2 + 1);
  }
  for (let r = 0; r < 3; r++) cell(Z + 12 * CW, r * CH, 60, CH, '2 to 1', '700 14px Georgia');
  for (let d = 0; d < 3; d++) cell(Z + d * 4 * CW, ROWS * CH, 4 * CW, DZ, ['1st 12', '2nd 12', '3rd 12'][d], '700 17px Georgia');
  OUTSIDE_ROW.forEach((o, i) => {
    const x = Z + i * 2 * CW, y = ROWS * CH + DZ;
    cell(x, y, 2 * CW, OUTH, o === 'red' || o === 'black' ? '' : OUT_LABEL[o], '700 16px Georgia');
    if (o === 'red' || o === 'black') {
      g.beginPath(); g.moveTo(x + CW, y + 8); g.lineTo(x + CW + 24, y + OUTH / 2); g.lineTo(x + CW, y + OUTH - 8); g.lineTo(x + CW - 24, y + OUTH / 2); g.closePath();
      g.fillStyle = o === 'red' ? '#c0141f' : '#141416'; g.fill(); g.stroke();
    }
  });
  if (hover?.outside || hover?.numbers?.length > 1) { // ring where the stack would go
    g.beginPath(); g.arc(hover.ax, hover.ay, 12, 0, Math.PI * 2); g.strokeStyle = '#f0d18a'; g.lineWidth = 2.5; g.stroke();
  }
  // brand line under the layout
  return cv;
}
