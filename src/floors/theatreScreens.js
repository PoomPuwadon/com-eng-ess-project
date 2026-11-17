import * as THREE from 'three';
import { thDate } from '../world/lottoFeed.js';

// ================================================================= OT-02 — the quant desk monitors
// 24 distinct screens = 4 types x 6 variants (palette + layout), Thai + English. Every number on them is REAL
// (user, 2026-11-15: "not random props — real things going on in the room and real guesses"), read from the
// Probability Research Institute's latest server run (src/world/lottoFeed.js):
//   0 MODEL DESK      the six models + the DMA ensemble: posterior weight, real next-draw guesses, backtest hits
//   1 LAST-2 HISTORY  official GLO results: recent draws, digit frequencies, the 10x10 last-2 count grid, χ² verdict
//   2 CERTIFICATES    the Head of Thai Markets' actual certificates for the next draw, visitor sales, track record
//   3 PIPELINE        the seven research stages of the run, timings, and the null-hypothesis Monte Carlo
// The robot's draws on the stage are live too: Monte Carlo rehearsals sampled from the model's own digit
// probabilities, or a replay of the latest official result. Each ball flashes on every screen as it lands.
// All 24 live in one canvas atlas; every monitor is one instance of ONE InstancedMesh (1 draw call) with a
// per-instance atlas offset. Redrawn on new data, on each ball and every 2 s (hero cards rotate), never per frame.

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
const SHORT = { ensemble: 'DMA ENSEMBLE', uniform: 'UNIFORM NULL', frequency: 'HOT NUMBERS', recency: 'MOMENTUM', overdue: 'OVERDUE HAZARD', positional: 'BAYES POSITIONAL', markov: 'MARKOV CHAIN' };
const ORDER = ['ensemble', 'uniform', 'frequency', 'recency', 'overdue', 'positional', 'markov'];

const pad = (n, k = 2) => String(n).padStart(k, '0');
const pct = (p, d = 2) => `${(p * 100).toFixed(d)}%`;
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function fit(g, text, maxW, px, weight = '700', family = THAI) { let s = px; do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 7); }

export function deskScreens(ctx, monitors) {
  const e = ctx.e;
  const canvas = document.createElement('canvas'); canvas.width = COLS * CW; canvas.height = ROWS * CHH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // D = the Institute's state (lottoFeed), R = the stage's rehearsal state (owned by drawTheatre)
  const S = { t: 0, flash: 0, ball: 0, digit: 0, D: null, R: { mode: 'model', digits: [], sets: 0, label: '' } };

  function header(x, y, P, th, en, right) {
    g.fillStyle = P.head; g.fillRect(x, y, CW, 28);
    g.fillStyle = P.acc; fit(g, th, 150, 13); g.fillText(th, x + 6, y + 14); // Thai title, English line under it
    g.fillStyle = P.fg; g.font = `700 8px ${MONO}`; g.fillText(en, x + 6, y + 25);
    if (right) { g.fillStyle = P.dim; g.font = `700 9px ${MONO}`; g.textAlign = 'right'; g.fillText(right, x + CW - 6, y + 14); g.textAlign = 'left'; }
  }
  const bar = (x, y, w, h, f, P) => { g.fillStyle = P.head; g.fillRect(x, y, w, h); g.fillStyle = P.bar; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); };
  const text = (s, x, y, color, px, weight = '700', family = MONO) => { g.fillStyle = color; g.font = `${weight} ${px}px ${family}`; g.fillText(s, x, y); };
  function waiting(x, y, P, th, en) {
    header(x, y, P, th, en, 'OFFLINE');
    text('AWAITING INSTITUTE RUN', x + 10, y + 82, P.acc, 13, '800');
    text('connecting to the research server…', x + 10, y + 102, P.dim, 9, '400');
  }

  // ---- 0: model desk
  function modelDesk(x, y, P, vr) {
    const run = S.D?.run;
    if (!run?.metrics.length) return waiting(x, y, P, 'ทีมโมเดล', 'MODEL DESK · LAST 2');
    const ms = ORDER.map((id) => run.metrics.find((m) => m.id === id)).filter(Boolean);
    if (vr % 2 === 0) { // every model: DMA weight, top guess, backtest hits
      header(x, y, P, 'ทีมโมเดล · เลขท้าย 2 ตัว', 'MODEL DESK · NEXT DRAW GUESSES', thDate(run.target));
      text('MODEL           WEIGHT   GUESS  HITS', x + 6, y + 40, P.dim, 8);
      ms.forEach((m, i) => {
        const yy = y + 56 + i * 16, ens = m.id === 'ensemble';
        if (ens) { g.fillStyle = P.head; g.fillRect(x + 2, yy - 11, CW - 4, 15); }
        text(SHORT[m.id] || m.name, x + 6, yy, ens ? P.acc : P.fg, 9);
        if (!ens) bar(x + 104, yy - 7, 40, 6, m.w, P);
        text(ens ? 'blend' : pct(m.w, 0), x + 148, yy, P.dim, 8);
        text(m.next[0]?.v ?? '--', x + 178, yy + 1, ens ? P.acc : P.fg, 13, '800');
        text(`${m.hits}/${m.draws}`, x + 206, yy, P.dim, 8);
      });
      const en = run.ensemble;
      if (en) text(`LOG-LOSS ${en.logLossBits.toFixed(3)} vs ${en.baselineBits.toFixed(3)} bits (null)`, x + 6, y + 173, P.dim, 8);
    } else { // hero card: one model at a time, rotating every 6 s
      const m = ms[(Math.floor(S.t / 6) + vr) % ms.length];
      header(x, y, P, 'โมเดลเด่น', `MODEL SPOTLIGHT · ${SHORT[m.id] || m.name}`, m.id === 'ensemble' ? 'BLEND' : `w ${pct(m.w, 0)}`);
      text('NEXT LAST-2 · TOP GUESSES', x + 8, y + 42, P.dim, 9);
      m.next.slice(0, 3).forEach((n, i) => {
        text(n.v, x + 8 + i * 82, y + 80, i ? P.fg : P.acc, i ? 26 : 34, '800');
        text(pct(n.p), x + 8 + i * 82, y + 94, P.dim, 9);
      });
      const exp = m.baselineRate * m.draws;
      text(`BACKTEST ${m.hits} hits / ${exp.toFixed(1)} expected`, x + 8, y + 118, P.fg, 10);
      bar(x + 8, y + 124, CW - 16, 6, m.hits / Math.max(1, exp * 2), P);
      g.fillStyle = P.acc; g.fillRect(x + 8 + (CW - 16) / 2 - 1, y + 121, 2, 12); // the chance line
      text(`lift ${m.lift.toFixed(2)}× · p = ${m.pValue.toFixed(2)} · walk-forward ${m.draws} draws`, x + 8, y + 148, P.dim, 9);
      text(`log-loss ${m.logLossBits.toFixed(3)} vs ${m.baselineBits.toFixed(3)} bits`, x + 8, y + 164, P.dim, 9);
    }
  }
  // ---- 1: official history
  function history(x, y, P, vr) {
    const D = S.D, run = D?.run;
    if (!D?.recent.length) return waiting(x, y, P, 'สถิติเลขท้าย 2 ตัว', 'LAST-2 HISTORY · GLO');
    if (vr % 2 === 0) { // recent official draws + digit frequency bars
      header(x, y, P, 'สถิติเลขท้าย 2 ตัว', 'LAST-2 HISTORY · OFFICIAL GLO', `n=${D.draws}`);
      D.recent.slice(0, 7).forEach((h, i) => {
        const yy = y + 44 + i * 17;
        if (i === 0) { g.fillStyle = P.head; g.fillRect(x + 2, yy - 13, 132, 16); }
        g.fillStyle = i ? P.dim : P.acc; g.font = `400 10px ${THAI}`; g.fillText(thDate(h.date), x + 6, yy);
        text(h.last2, x + 64, yy, i ? P.fg : P.acc, 14, '800');
        text(h.first, x + 90, yy, P.dim, 9);
      });
      const f = run?.digitFreq;
      if (f) {
        const mx = Math.max(...f), hot = f.indexOf(mx);
        g.fillStyle = P.fg; g.font = `700 9px ${THAI}`; g.fillText('เลขร้อน · DIGIT COUNT', x + 140, y + 40);
        for (let d = 0; d < 10; d++) {
          const hh = (f[d] / mx) * 92, bx = x + 140 + d * 11;
          g.fillStyle = d === hot ? P.acc : P.bar; g.fillRect(bx, y + 140 - hh, 8, hh);
          text(String(d), bx + 1, y + 152, P.dim, 9);
        }
        g.fillStyle = P.acc; g.font = `800 10px ${THAI}`; g.fillText(`เลขเด่น ${hot} · ${f[hot]} times in last-2`, x + 140, y + 168);
      }
    } else { // the real 10x10 last-2 count grid
      header(x, y, P, 'ตารางเลขท้าย 2 ตัว', 'LAST-2 COUNTS · ALL OFFICIAL DRAWS', `n=${D.draws}`);
      const gr = run?.grid;
      if (gr) {
        const flat = gr.flat(), hi = Math.max(...flat) || 1;
        for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
          const v = gr[i][j] / hi, cx = x + 8 + j * 15, cy = y + 32 + i * 14;
          g.fillStyle = v > 0.75 ? P.acc : v > 0.4 ? P.bar : gr[i][j] ? P.head : P.bg; g.fillRect(cx, cy, 13, 12);
          g.strokeStyle = P.head; g.strokeRect(cx + 0.5, cy + 0.5, 12, 11);
          text(`${i}${j}`, cx + 2, cy + 9, v > 0.4 ? P.bg : P.dim, 7);
        }
      }
      text('LATEST', x + 166, y + 44, P.dim, 9);
      text(D.latest?.last2 ?? '--', x + 166, y + 76, P.acc, 28, '800');
      g.fillStyle = P.fg; g.font = `700 9px ${THAI}`; g.fillText(D.latest ? thDate(D.latest.date) : '', x + 166, y + 90);
      const flagged = run?.audit ? run.audit.tests.filter((t) => t.p < 0.01).length : null;
      text('χ² AUDIT', x + 166, y + 112, P.dim, 9);
      text(flagged == null ? '--' : flagged ? `${flagged} FLAGGED` : 'FAIR', x + 166, y + 126, flagged ? P.acc : P.fg, 11, '800');
      if (run?.coldest?.length) { text('NEVER SEEN', x + 166, y + 146, P.dim, 8); text(run.coldest.slice(0, 3).map(([v]) => v).join(' '), x + 166, y + 160, P.fg, 10, '800'); }
    }
  }
  // ---- 2: the desk's certificates, visitor sales, track record
  function certificates(x, y, P, vr) {
    const D = S.D, run = D?.run;
    if (!run?.picks) return waiting(x, y, P, 'สลากของสถาบัน', 'INSTITUTE CERTIFICATES');
    if (vr % 2 === 0) {
      const dec = run.decision, vals = Object.fromEntries((run.picks.candidates || []).map((c) => [c.number, c.modelValue]));
      header(x, y, P, 'สลากของสถาบัน', `CERTIFICATES · DRAW ${thDate(run.target)}`, dec ? 'HELD' : 'PENDING');
      text('NUMBER   MODEL VALUE   STATUS', x + 6, y + 40, P.dim, 8);
      const rows = dec ? dec.tickets : (run.picks.candidates || []).slice(0, 5).map((c) => ({ number: c.number, bought: false }));
      rows.slice(0, 6).forEach((t, i) => {
        const yy = y + 58 + i * 17;
        text(t.number, x + 6, yy, P.fg, 14, '800');
        text(vals[t.number] != null ? `¤${vals[t.number].toFixed(2)}` : '--', x + 92, yy, P.fg, 10);
        text(t.bought ? 'BOUGHT' : dec ? 'REJECTED' : 'CANDIDATE', x + 176, yy, t.bought ? P.acc : P.dim, 9, '800');
      });
      text(`fair value ¤${run.picks.fairValue.toFixed(2)} · price ¤${run.picks.price.toFixed(2)}${dec ? ` · spent ¤${(dec.spend / 100).toLocaleString('en-US')}` : ''}`, x + 6, y + 160, P.dim, 8);
      g.fillStyle = P.acc; g.font = `700 9px ${THAI}`; g.fillText(`ผู้เยี่ยมชมซื้อแล้ว ${D.sales.n} ใบ · visitors: ${D.sales.n} certificates, ${D.sales.buyers} buyers`, x + 6, y + 174);
    } else { // track record: settled runs, else the backtest's cumulative hits against chance
      const settled = D.history.filter((h) => h.settlement);
      header(x, y, P, 'ผลงานย้อนหลัง', 'TRACK RECORD', settled.length ? `${settled.length} settled` : 'backtest');
      if (settled.length) {
        text('DRAW      TOP-5 PICKS      RESULT', x + 6, y + 40, P.dim, 8);
        settled.slice(0, 6).forEach((h, i) => {
          const yy = y + 58 + i * 18, st = h.settlement, hit = h.last2.some((p) => p.v === st.last2);
          g.fillStyle = P.dim; g.font = `400 10px ${THAI}`; g.fillText(thDate(h.target), x + 6, yy);
          text(h.last2.map((p) => p.v).join(' '), x + 62, yy, P.fg, 9);
          text(st.last2, x + 192, yy, hit ? P.acc : P.fg, 13, '800');
          text(hit ? 'HIT' : '—', x + 220, yy, hit ? P.acc : P.dim, 9, '800');
        });
      } else if (run.mc?.hitPath?.length) {
        // hitPath is cumulative: { hits so far, hits expected by chance so far }
        const hp = run.mc.hitPath, n = hp.length, last = hp[n - 1], top = Math.max(last.hits, last.expected, 1) * 1.15;
        const X = (i) => x + 10 + (i / Math.max(1, n - 1)) * (CW - 20), Y = (v) => y + 150 - (v / top) * 100;
        const line = (k) => { g.beginPath(); hp.forEach((h, i) => (i ? g.lineTo(X(i), Y(h[k])) : g.moveTo(X(i), Y(h[k])))); g.stroke(); };
        g.strokeStyle = P.dim; g.setLineDash([4, 3]); line('expected'); g.setLineDash([]);
        g.strokeStyle = P.bar; g.lineWidth = 2; line('hits'); g.lineWidth = 1;
        text(`ENSEMBLE ${last.hits} hits`, x + 10, y + 44, P.acc, 11, '800');
        text(`CHANCE ${last.expected.toFixed(1)} (dashed)`, x + 130, y + 44, P.dim, 9);
        text(`walk-forward, ${n} official draws · first live settlement ${thDate(run.target)}`, x + 6, y + 170, P.dim, 8);
      }
    }
  }
  // ---- 3: the research pipeline + Monte Carlo
  function pipeline(x, y, P, vr) {
    const run = S.D?.run;
    if (!run?.stages) return waiting(x, y, P, 'เวิร์กโฟลว์', 'RESEARCH PIPELINE');
    if (vr % 2 === 0) {
      header(x, y, P, 'เวิร์กโฟลว์การวิจัย', `RESEARCH PIPELINE · RUN #${run.id}`, hhmm(run.createdAt));
      run.stages.forEach((s, i) => {
        const yy = y + 44 + i * 17;
        text('✓', x + 6, yy, P.acc, 11, '800');
        text(s.name.slice(0, 28), x + 20, yy, P.fg, 9);
        text(`${s.ms} ms`, x + 210, yy, P.dim, 8);
      });
      const dec = run.decision;
      text(dec ? `${dec.agent}: ${dec.tickets.filter((t) => t.bought).length} certificates${dec.usedLLM ? ' (LLM)' : ''}` : 'Head of Thai Markets: decision pending', x + 6, y + 168, P.acc, 9);
    } else { // null-hypothesis Monte Carlo histogram, with the ensemble's real score marked
      header(x, y, P, 'มอนติคาร์โล', 'NULL MONTE CARLO · 20,000 SEASONS', run.mc ? `p = ${run.mc.empiricalP.toFixed(2)}` : '');
      const h = run.mc?.histogram;
      if (h?.length) {
        const mx = Math.max(...h) || 1, bw = (CW - 20) / h.length;
        h.forEach((c, i) => { const hh = (c / mx) * 100; g.fillStyle = i >= run.mc.hits ? P.bar : P.head; g.fillRect(x + 10 + i * bw, y + 140 - hh, bw - 1, hh); });
        const mxX = x + 10 + (run.mc.hits + 0.5) * bw;
        g.fillStyle = P.acc; g.fillRect(mxX - 1, y + 34, 2, 108);
        text(`ENSEMBLE ${run.mc.hits}`, Math.min(mxX + 4, x + CW - 80), y + 46, P.acc, 10, '800');
        text('hits per season →', x + 10, y + 154, P.dim, 8);
        text(`${pct(run.mc.empiricalP, 1)} of random seasons do at least as well`, x + 6, y + 170, P.fg, 9);
      }
    }
  }
  // ---- the ball flash (every screen at once, in its own palette)
  function flash(x, y, P, v) {
    const R = S.R;
    g.fillStyle = v % 2 ? P.acc : P.bar; g.fillRect(x, y, CW, CHH);
    g.fillStyle = P.bg; g.font = `700 13px ${THAI}`; g.fillText(`ลูกที่ ${S.ball} · BALL ${S.ball} OF 6`, x + 10, y + 24);
    g.font = `700 9px ${MONO}`; g.fillText(R.label, x + 10, y + 38);
    g.font = `800 104px ${MONO}`; g.textAlign = 'center'; g.fillText(String(S.digit), x + CW / 2, y + 140); g.textAlign = 'left';
    g.font = `700 11px ${MONO}`; g.fillText([0, 1, 2, 3, 4, 5].map((i) => R.digits[i] ?? '·').join(' '), x + 10, y + 168);
  }
  const TYPES = [modelDesk, history, certificates, pipeline];
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
    setData(D) { S.D = D; if (S.flash <= 0) draw(); },
    update(dt) {
      S.t += dt;
      if (S.flash > 0) { S.flash -= dt; if (S.flash <= 0) draw(); return; }
      if ((acc += dt) < 2) return;
      acc = 0;
      draw();
    },
    /** a ball landed on the stage: R = the rehearsal state ({ mode, digits, label }) */
    onBall(digit, n, R) {
      S.R = R; S.ball = ((n - 1) % 6) + 1; S.digit = digit; S.flash = 0.8;
      draw();
    },
  };
}
