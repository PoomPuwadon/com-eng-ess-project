import * as THREE from 'three';

// ================================================================= OT-02 — the quant desk monitors (2026-11-12)
// User spec: no generic charts. 24 distinct screens = 4 types x 6 variants (palette + layout), Thai + English:
//   0 DREAM DECODER   ตำราทำนายฝัน run as a data terminal (real traditional dream → number pairings, fake confidence)
//   1 LAST-2 HISTORY  สถิติเลขท้าย 2 ตัว tables, hot / cold digits, streaks (sample data until the real feed lands)
//   2 STREET PRICE    a Bloomberg-style terminal quoting street ticket prices against the official 80 บาท
//   3 ALT-DATA        superstition signal feed: incense-stick numbers, rubbed tree trunks, fortune sticks, plates...
// All 24 live in one canvas atlas redrawn at 2 Hz; every monitor is one instance of ONE InstancedMesh (1 draw call)
// with a per-instance atlas offset. Synced to the draw: each ball flashes on every screen, then the data updates.
// Dream pairings: the common ตำรา numbers (e.g. งู 5-6, ช้าง 9-1, ปลา 8-0, คนตาย 0-4, น้ำท่วม 0-2, ไฟไหม้ 0-9).

const COLS = 6, ROWS = 4, CW = 256, CHH = 180;
const THAI = '"Leelawadee UI", "Leelawadee", Tahoma, sans-serif';
const MONO = 'Consolas, "Courier New", monospace';
const PAL = [
  { bg: '#0b1426', fg: '#e8f0ff', acc: '#ffd34d', dim: '#6f86b0', bar: '#2a7fc4', head: '#14294f' }, // navy
  { bg: '#000000', fg: '#ffb000', acc: '#ff5a3c', dim: '#8a6a20', bar: '#ffb000', head: '#1a1200' }, // terminal amber
  { bg: '#f4f6fa', fg: '#14213d', acc: '#d0191f', dim: '#8a94a8', bar: '#2a7fc4', head: '#dfe5ef' }, // white report
  { bg: '#03140a', fg: '#58ff8a', acc: '#ffffff', dim: '#2a7a44', bar: '#58ff8a', head: '#062a14' }, // green phosphor
  { bg: '#2a0a14', fg: '#ffe6ea', acc: '#ffcf5a', dim: '#a06070', bar: '#d8607a', head: '#45101f' }, // maroon
  { bg: '#062a2e', fg: '#d8fffb', acc: '#5ff2ff', dim: '#3a8a88', bar: '#5ff2ff', head: '#0b3f44' }, // teal
];
const DREAMS = [
  ['ฝันเห็นงูทอง', 'golden snake', '56 65 59'], ['ฝันว่าถูกงูไล่', 'chased by a snake', '56 65 52'],
  ['ฝันเห็นช้าง', 'elephant', '91 19 39'], ['ฝันเห็นช้างเผือก', 'white elephant', '91 19 99'],
  ['ฝันว่าจับปลา', 'catching fish', '08 80 18'], ['ฝันเห็นเต่า', 'turtle', '48 84 88'],
  ['ฝันเห็นกวาง', 'deer', '27 72 57'], ['ฝันเห็นคนตาย', 'the dead', '04 40 45'],
  ['ฝันเห็นคนท้อง', 'pregnant woman', '07 70 76'], ['ฝันว่าได้ลูกแฝด', 'twins', '22 11 12'],
  ['ฝันว่ามีคนมาบอกเลข', 'someone gives you a number', '19 91 99'], ['ฝันเห็นพระพรหม', 'Brahma', '49 94 44'],
  ['ฝันเห็นท้าวเวสสุวรรณ', 'Vessavana', '59 95 99'], ['ฝันเห็นพระบิณฑบาต', 'monk on alms round', '08 80 85'],
  ['ฝันว่าน้ำท่วม', 'flood', '02 20 28'], ['ฝันว่าไฟไหม้', 'fire', '09 90 97'],
  ['ฝันว่าฟันหลุด', 'tooth falls out', '37 73 03'], ['ฝันว่าได้ทำบุญ', 'making merit', '09 90 59'],
];
const SIGNALS = [
  ['เลขธูป', 'incense-stick ash', 'วัดดัง (famous temple)'], ['ขูดต้นตะเคียน', 'rubbed tree trunk', 'ต้นตะเคียนทอง'],
  ['เซียมซี', 'fortune stick no.', 'ศาลเจ้า (shrine)'], ['ทะเบียนรถ', 'licence plate', 'รถคันแรกของงวด'],
  ['ลูกวัวลาย', 'calf with markings', 'ฟาร์มต่างจังหวัด'], ['เลขหลวงพ่อ', 'abbot\'s hint', 'วัดป่า (forest temple)'],
  ['ขันน้ำมนต์', 'holy-water bowl', 'พิธีเช้า'], ['วันเกิดคนดัง', 'celebrity birthday', 'ข่าวบันเทิง'],
  ['เลขบ้านเลขที่', 'house number (viral)', 'โซเชียล'], ['ไข่เต่า', 'turtle eggs counted', 'ชายหาด'],
];
const DATES = ['16 พ.ย. 69', '1 พ.ย. 69', '16 ต.ค. 69', '1 ต.ค. 69', '16 ก.ย. 69', '1 ก.ย. 69', '16 ส.ค. 69', '1 ส.ค. 69', '16 ก.ค. 69'];
const QUOTES = ['**99', '**88', '**56', '**91', '*789', '**08', '**47', '*123', '**24', '**69'];

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pad = (n, k = 2) => String(n).padStart(k, '0');
function fit(g, text, maxW, px, weight = '700', family = THAI) { let s = px; do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 7); }

export function deskScreens(ctx, monitors) {
  const e = ctx.e, r = rng(424);
  const canvas = document.createElement('canvas'); canvas.width = COLS * CW; canvas.height = ROWS * CHH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // live state shared by all 24 screens
  const S = {
    t: 0, flash: 0, ball: 0, digit: 0, draws: 0,
    rehearsal: [], // digits of the rehearsal in progress
    history: DATES.map((d, i) => ({ d, n: pad(Math.floor(r() * 100)), live: false })),
    freq: Array.from({ length: 10 }, () => 6 + Math.floor(r() * 14)),
    quotes: QUOTES.map((q) => { const p = 96 + r() * 60; return { q, p, o: p, hist: Array.from({ length: 24 }, () => p + (r() - 0.5) * 12) }; }),
    feed: Array.from({ length: 12 }, () => ({ s: Math.floor(r() * SIGNALS.length), n: pad(Math.floor(r() * 100)), st: 0.4 + r() * 0.6, hh: 8 + Math.floor(r() * 12), mm: Math.floor(r() * 60) })),
    recal: 0,
  };

  function header(x, y, P, th, en, right) {
    g.fillStyle = P.head; g.fillRect(x, y, CW, 28);
    g.fillStyle = P.acc; fit(g, th, 150, 13); g.fillText(th, x + 6, y + 14); // Thai title, English line under it
    g.fillStyle = P.fg; g.font = `700 8px ${MONO}`; g.fillText(en, x + 6, y + 25);
    if (right) { g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.textAlign = 'right'; g.fillText(right, x + CW - 6, y + 14); g.textAlign = 'left'; }
  }
  const bar = (x, y, w, h, f, P) => { g.fillStyle = P.head; g.fillRect(x, y, w, h); g.fillStyle = P.bar; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); };

  // ---- 0: dream decoder
  function dream(x, y, P, vr) {
    const off = Math.floor(S.t / 3) + vr * 3;
    header(x, y, P, 'ตำราทำนายฝัน', 'DREAM→NUMBER v4', S.recal > 0 ? 'RECALIBRATING' : 'LIVE');
    if (vr % 2 === 0) { // list
      for (let i = 0; i < 5; i++) {
        const [th, en, nums] = DREAMS[(off + i) % DREAMS.length], yy = y + 44 + i * 27;
        g.fillStyle = P.fg; fit(g, th, 126, 13); g.fillText(th, x + 6, yy);
        g.fillStyle = P.dim; g.font = `400 9px ${MONO}`; g.fillText(en, x + 6, yy + 11);
        g.fillStyle = P.acc; g.font = `800 15px ${MONO}`; g.fillText(nums, x + 138, yy + 2);
        bar(x + 138, yy + 6, 104, 4, 0.55 + ((off + i) * 37 % 45) / 100, P);
      }
    } else { // hero card
      const [th, en, nums] = DREAMS[off % DREAMS.length];
      g.fillStyle = P.dim; g.font = `700 10px ${MONO}`; g.fillText('TOP SIGNAL · INPUT', x + 8, y + 42);
      g.fillStyle = P.fg; fit(g, th, CW - 16, 20); g.fillText(th, x + 8, y + 64);
      g.fillStyle = P.dim; g.font = `400 10px ${MONO}`; g.fillText(`"${en}"`, x + 8, y + 78);
      g.fillStyle = P.acc; g.font = `800 34px ${MONO}`; g.fillText(nums, x + 8, y + 116);
      const conf = 88 + ((off * 13) % 12) + (S.t % 1) * 0.9;
      g.fillStyle = P.fg; g.font = `700 10px ${MONO}`; g.fillText(`MODEL CONFIDENCE ${conf.toFixed(1)}%`, x + 8, y + 138); bar(x + 8, y + 144, CW - 16, 6, conf / 100, P);
      g.fillStyle = P.dim; g.font = `400 9px ${THAI}`; g.fillText(`ตามตำรา · p-value 0.${pad((off * 7) % 50, 2)} (significant)`, x + 8, y + 166);
    }
  }
  // ---- 1: last-2 history
  function history(x, y, P, vr) {
    header(x, y, P, 'สถิติเลขท้าย 2 ตัว', 'LAST-2 HISTORY', 'sample');
    if (vr % 2 === 0) { // table + digit bars
      const rows = S.history.slice(0, 6);
      rows.forEach((h, i) => {
        const yy = y + 42 + i * 18;
        if (h.live) { g.fillStyle = P.head; g.fillRect(x + 2, yy - 13, 130, 17); }
        g.fillStyle = h.live ? P.acc : P.dim; g.font = `400 11px ${THAI}`; g.fillText(h.live ? 'REHEARSAL' : h.d, x + 6, yy);
        g.fillStyle = h.live ? P.acc : P.fg; g.font = `800 15px ${MONO}`; g.fillText(h.n, x + 92, yy);
      });
      const mx = Math.max(...S.freq);
      for (let d = 0; d < 10; d++) {
        const hh = (S.freq[d] / mx) * 92, bx = x + 140 + d * 11;
        g.fillStyle = S.freq[d] === mx ? P.acc : P.bar; g.fillRect(bx, y + 140 - hh, 8, hh);
        g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.fillText(String(d), bx + 1, y + 152);
      }
      g.fillStyle = P.fg; g.font = `700 9px ${THAI}`; g.fillText('เลขร้อน · HOT DIGITS', x + 140, y + 40);
      const hot = S.freq.indexOf(mx);
      g.fillStyle = P.acc; g.font = `800 11px ${THAI}`; g.fillText(`เลขเด่น ${hot} · streak ${3 + (S.draws % 4)}`, x + 6, y + 168);
    } else { // 10x10 grid of last-2 frequency
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
        const v = ((i * 31 + j * 17 + vr * 11 + S.draws * 3) % 23) / 22, cx = x + 8 + j * 15, cy = y + 32 + i * 14;
        g.fillStyle = v > 0.8 ? P.acc : v > 0.5 ? P.bar : P.head; g.fillRect(cx, cy, 13, 12);
        g.fillStyle = v > 0.5 ? P.bg : P.dim; g.font = `700 7px ${MONO}`; g.fillText(`${i}${j}`, cx + 2, cy + 9);
      }
      g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.fillText('FREQ', x + 166, y + 44); g.fillText('ALL TIME', x + 166, y + 55);
      g.fillStyle = P.acc; g.font = `800 26px ${MONO}`; g.fillText(S.history[0].n, x + 166, y + 92);
      g.fillStyle = P.fg; g.font = `700 9px ${THAI}`; g.fillText('งวดล่าสุด', x + 166, y + 106);
      g.fillStyle = P.dim; g.font = `400 9px ${MONO}`; g.fillText(`n=${412 + S.draws}`, x + 166, y + 124); g.fillText('χ² ok', x + 166, y + 136);
    }
  }
  // ---- 2: street price terminal
  function street(x, y, P, vr) {
    header(x, y, P, 'สลากเกินราคา', 'STREET PX <GO>', 'OFFICIAL 80.00');
    if (vr % 2 === 0) {
      g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.fillText('TICKET   BID    ASK    CHG', x + 6, y + 38);
      for (let i = 0; i < 6; i++) {
        const q = S.quotes[(i + vr) % S.quotes.length], yy = y + 54 + i * 18, chg = (q.p - q.o) / q.o * 100, up = chg >= 0;
        g.fillStyle = P.fg; g.font = `700 11px ${MONO}`; g.fillText(q.q.padEnd(6), x + 6, yy);
        g.fillText((q.p - 2).toFixed(0).padStart(4), x + 58, yy); g.fillText((q.p + 3).toFixed(0).padStart(4), x + 100, yy);
        g.fillStyle = up ? '#2fe07a' : '#ff4d4d'; g.fillText(`${up ? '+' : ''}${chg.toFixed(1)}%`, x + 142, yy);
        if (q.p > 120) { g.fillStyle = '#d0191f'; g.fillRect(x + 196, yy - 9, 54, 11); g.fillStyle = '#fff'; g.font = `800 8px ${MONO}`; g.fillText('OVERPRICED', x + 198, yy - 1); }
      }
      g.fillStyle = P.acc; g.font = `700 9px ${THAI}`; g.fillText(`พรีเมียมเฉลี่ย +${(S.quotes.reduce((a, q) => a + q.p, 0) / S.quotes.length / 80 * 100 - 100).toFixed(0)}% vs 80 บาท`, x + 6, y + 170);
    } else { // one number: chart + order book
      const q = S.quotes[vr % S.quotes.length], h = q.hist, lo = Math.min(...h, 80) - 4, hi = Math.max(...h) + 4;
      g.fillStyle = P.fg; g.font = `800 18px ${MONO}`; g.fillText(`${q.q}  ${q.p.toFixed(2)}`, x + 6, y + 46);
      g.strokeStyle = P.dim; g.setLineDash([3, 3]); const y80 = y + 150 - ((80 - lo) / (hi - lo)) * 90; g.beginPath(); g.moveTo(x + 6, y80); g.lineTo(x + 170, y80); g.stroke(); g.setLineDash([]);
      g.fillStyle = P.dim; g.font = `700 8px ${MONO}`; g.fillText('80 OFFICIAL', x + 6, y80 - 2);
      g.strokeStyle = P.bar; g.lineWidth = 2; g.beginPath(); h.forEach((v, i) => { const px = x + 6 + i * 7, py = y + 150 - ((v - lo) / (hi - lo)) * 90; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); g.lineWidth = 1;
      g.fillStyle = P.dim; g.font = `700 8px ${MONO}`; g.fillText('BOOK', x + 182, y + 40);
      for (let i = 0; i < 6; i++) { const w = 10 + ((i * 29 + vr * 7 + Math.floor(S.t)) % 50); g.fillStyle = i < 3 ? '#ff4d4d' : '#2fe07a'; g.fillRect(x + 182, y + 48 + i * 15, w, 10); g.fillStyle = P.fg; g.fillText((q.p + (2.5 - i) * 2).toFixed(0), x + 236, y + 56 + i * 15); }
      g.fillStyle = P.acc; g.font = `700 9px ${THAI}`; g.fillText('ราคาตลาด (street) · ล็อตเตอรี่แผงลอย', x + 6, y + 172);
    }
  }
  // ---- 3: alternative-data superstition feed
  function signals(x, y, P, vr) {
    header(x, y, P, 'สัญญาณทางเลือก', 'ALT-DATA FEED', `${pad(9 + (Math.floor(S.t / 60) % 12))}:${pad(Math.floor(S.t) % 60)}`);
    if (vr % 2 === 0) {
      for (let i = 0; i < 5; i++) {
        const f = S.feed[(i + vr + Math.floor(S.t / 4)) % S.feed.length], [th, en] = SIGNALS[f.s], yy = y + 44 + i * 27;
        g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.fillText(`${pad(f.hh)}:${pad(f.mm)}`, x + 6, yy);
        g.fillStyle = P.fg; fit(g, th, 92, 13); g.fillText(th, x + 40, yy);
        g.fillStyle = P.dim; g.font = `400 8px ${MONO}`; g.fillText(en, x + 40, yy + 10);
        g.fillStyle = P.acc; g.font = `800 17px ${MONO}`; g.fillText(f.n, x + 150, yy + 2);
        bar(x + 182, yy - 6, 66, 6, f.st, P);
      }
    } else { // radar of signal strength + strongest signal
      const cx = x + 66, cy = y + 104, R = 58;
      g.strokeStyle = P.dim; for (const rr of [R, R * 0.66, R * 0.33]) { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); }
      const a = S.t * 1.6 + vr; g.strokeStyle = P.bar; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); g.lineWidth = 1;
      S.feed.slice(0, 7).forEach((f, i) => { const aa = i * 0.9 + vr, rr = R * (1 - f.st * 0.8); g.fillStyle = P.acc; g.beginPath(); g.arc(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, 3, 0, Math.PI * 2); g.fill(); });
      const best = S.feed.reduce((b, f) => (f.st > b.st ? f : b)), [th, en, where] = SIGNALS[best.s];
      g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.fillText('STRONGEST', x + 134, y + 44);
      g.fillStyle = P.fg; fit(g, th, 116, 14); g.fillText(th, x + 134, y + 62);
      g.fillStyle = P.dim; fit(g, where, 116, 9, '400'); g.fillText(where, x + 134, y + 76);
      g.fillStyle = P.acc; g.font = `800 34px ${MONO}`; g.fillText(best.n, x + 134, y + 116);
      g.fillStyle = P.fg; g.font = `700 9px ${MONO}`; g.fillText(`STRENGTH ${(best.st * 100).toFixed(0)}%`, x + 134, y + 134); bar(x + 134, y + 140, 112, 6, best.st, P);
      g.fillStyle = P.dim; g.font = `400 8px ${MONO}`; g.fillText(en, x + 134, y + 160);
    }
  }
  // ---- the ball flash (every screen at once, in its own palette)
  function flash(x, y, P, v) {
    g.fillStyle = v % 2 ? P.acc : P.bar; g.fillRect(x, y, CW, CHH);
    g.fillStyle = P.bg; g.font = `700 14px ${THAI}`; g.fillText(`ลูกที่ ${S.ball} · BALL ${S.ball} OF 6`, x + 10, y + 26);
    g.font = `800 112px ${MONO}`; g.textAlign = 'center'; g.fillText(String(S.digit), x + CW / 2, y + 140); g.textAlign = 'left';
    g.font = `700 10px ${MONO}`; g.fillText(S.rehearsal.join(' ').padEnd(11, '·'), x + 10, y + 168);
  }
  const TYPES = [dream, history, street, signals];
  function draw() {
    for (let v = 0; v < 24; v++) {
      const x = (v % COLS) * CW, y = Math.floor(v / COLS) * CHH, type = v % 4, vr = Math.floor(v / 4), P = PAL[vr];
      g.save(); g.beginPath(); g.rect(x, y, CW, CHH); g.clip();
      g.fillStyle = P.bg; g.fillRect(x, y, CW, CHH); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      if (S.flash > 0) flash(x, y, P, v); else TYPES[type](x, y, P, vr);
      g.restore();
    }
    tex.needsUpdate = true;
  }
  draw();

  // ---- one InstancedMesh for every monitor (per-instance atlas cell)
  const geo = new THREE.PlaneGeometry(0.4, 0.28);
  const off = new Float32Array(monitors.length * 2);
  monitors.forEach((m, i) => { off[i * 2] = (m.v % COLS) / COLS; off[i * 2 + 1] = 1 - (Math.floor(m.v / COLS) + 1) / ROWS; });
  geo.setAttribute('cellOff', new THREE.InstancedBufferAttribute(off, 2));
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nattribute vec2 cellOff;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vMapUv * vec2(${(1 / COLS).toFixed(6)}, ${(1 / ROWS).toFixed(6)}) + cellOff;`);
  };
  mat.customProgramCacheKey = () => 'ot02-desk-atlas';
  const mesh = new THREE.InstancedMesh(geo, mat, monitors.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  monitors.forEach((m, i) => mesh.setMatrixAt(i, m4.compose(p.set(m.x, e + m.y, m.z), q.setFromAxisAngle(up, m.yaw), one)));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  ctx.add(mesh, geo, mat, tex);

  let acc = 0;
  return {
    stats: () => ({ monitors: monitors.length, variants: new Set(monitors.map((m) => m.v)).size }),
    update(dt) {
      S.t += dt;
      if (S.recal > 0) S.recal -= dt;
      if (S.flash > 0) { S.flash -= dt; if (S.flash <= 0) draw(); return; }
      if ((acc += dt) < 0.5) return;
      acc = 0;
      for (const qq of S.quotes) { qq.p = Math.max(84, qq.p + (Math.random() - 0.48) * 1.6); qq.hist.push(qq.p); qq.hist.shift(); }
      draw();
    },
    onBall(digit, n) {
      const i = (n - 1) % 6;
      if (i === 0) S.rehearsal = [];
      S.rehearsal[i] = digit; S.ball = i + 1; S.digit = digit; S.flash = 0.8; S.recal = 2.5;
      S.freq[digit]++;
      for (const qq of S.quotes) if (qq.q.endsWith(String(digit))) qq.p += 4 + Math.random() * 6; // tickets ending in the drawn digit spike
      S.feed.unshift({ s: Math.floor(Math.random() * SIGNALS.length), n: pad(digit * 10 + Math.floor(Math.random() * 10)), st: 0.5 + Math.random() * 0.5, hh: 9 + Math.floor(Math.random() * 10), mm: Math.floor(Math.random() * 60) }); S.feed.pop();
      if (i === 5) { S.draws++; S.history = S.history.filter((h) => !h.live); S.history.unshift({ d: 'REHEARSAL', n: S.rehearsal.slice(-2).join(''), live: true }); S.history.length = DATES.length; }
      draw();
    },
  };
}
