// Full-screen "Teleporting…" veil (user, 2026-11-18): building a floor takes a moment and the frame
// freezes meanwhile, so whoever is moved sees where they are going first. The veil is painted, the
// move runs two frames later (so the browser has shown it), and it fades once the new floor has drawn.
import { FLOOR_BY_ID } from '../layout/building.js';

const CSS = `
#tp-veil { position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px;
  background: radial-gradient(ellipse at center, rgba(20,24,44,.94), rgba(4,5,10,.98)); color: #fff; font-family: "Segoe UI", system-ui, sans-serif;
  opacity: 0; pointer-events: all; }
#tp-veil.fading { transition: opacity .25s ease; } /* shows at once (it must cover the freeze), fades out */
#tp-veil.on { display: flex; }
#tp-veil.shown { opacity: 1; }
#tp-veil .k { font: 900 15px system-ui; letter-spacing: .32em; color: #e3c27a; }
#tp-veil .t { font: 900 clamp(30px, 6vw, 58px) system-ui; letter-spacing: .06em; text-shadow: 0 0 24px rgba(227,194,122,.45); }
#tp-veil .d { font: 700 clamp(16px, 2.6vw, 24px) system-ui; color: #f3ecdf; text-align: center; padding: 0 16px; }
#tp-veil .s { font: 600 13px system-ui; color: rgba(255,255,255,.6); }
#tp-veil .bar { width: min(340px, 70vw); height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; margin-top: 8px; }
#tp-veil .bar i { display: block; height: 100%; width: 40%; background: linear-gradient(90deg, transparent, #e3c27a, transparent); animation: tpSweep 0.9s linear infinite; }
@keyframes tpSweep { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
`;

let el = null;
function mount() {
  if (el) return el;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  el = document.createElement('div'); el.id = 'tp-veil';
  el.innerHTML = '<div class="k">EXECUTIVE TRANSFER</div><div class="t">TELEPORTING…</div><div class="d"></div><div class="s"></div><div class="bar"><i></i></div>';
  document.body.append(el);
  return el;
}
const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
let seq = 0;

export const floorLabel = (id) => { const f = FLOOR_BY_ID[id]; return f ? `${id} · ${f.sign || f.short || ''}` : String(id || ''); };

/**
 * Show the veil with the destination, run move() once it is on screen, hide it after the new floor drew.
 * opts: { title, sub, minMs }. Returns a promise for move()'s result.
 */
export async function withVeil(floorId, move, { title = 'TELEPORTING…', sub = '', minMs = 650 } = {}) {
  const v = mount(), my = ++seq, t0 = performance.now();
  v.querySelector('.t').textContent = title;
  v.querySelector('.d').textContent = floorId ? `to ${floorLabel(floorId)}` : '';
  v.querySelector('.s').textContent = sub;
  v.classList.remove('fading'); v.classList.add('on', 'shown');
  await Promise.race([frames(2), wait(120)]); // painted (a hidden tab has no frames: never wait for ever)
  let out;
  try { out = move(); } finally {
    await Promise.race([frames(2), wait(300)]); // the new floor has rendered
    const left = minMs - (performance.now() - t0);
    if (left > 0) await wait(left);
    if (my === seq) { v.classList.add('fading'); v.classList.remove('shown'); setTimeout(() => { if (my === seq) v.classList.remove('on', 'fading'); }, 260); }
  }
  return out;
}
export const veilShown = () => Boolean(el && el.classList.contains('on'));
