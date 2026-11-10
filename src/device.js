// PROTOTYPE device detection + quality tier.
//   ?touch=1 / ?touch=0  force touch controls on/off
//   ?q=low / ?q=high     force the quality tier for this visit
// Otherwise the player's saved choice (Graphics button) wins, else auto: low on touch devices, high elsewhere.
const q = new URLSearchParams(location.search);
const KEY = 'firm.quality';
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const IS_TOUCH = q.has('touch') ? q.get('touch') !== '0' : coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

let saved = null;
try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
const valid = (v) => v === 'low' || v === 'high';
const AUTO = IS_TOUCH ? 'low' : 'high';
export const QUALITY_MODE = valid(q.get('q')) ? q.get('q') : valid(saved) ? saved : 'auto';
export const QUALITY = QUALITY_MODE === 'auto' ? AUTO : QUALITY_MODE;
export const LOW = QUALITY === 'low';

// "Graphics" button for every device: Auto → Low → High, applied live via onChange(low) — no reload.
export function mountQualityButton(onChange) {
  let mode = QUALITY_MODE;
  const b = document.createElement('button');
  b.id = 'q-btn';
  const label = { auto: `Auto (${AUTO === 'low' ? 'Low' : 'High'})`, low: 'Low', high: 'High' };
  const paint = () => { b.textContent = `Graphics: ${label[mode]}`; };
  b.title = 'Low = no glow, shadows, lamp lights or antialiasing, adaptive resolution. Best for older laptops and phones.';
  b.onclick = (e) => {
    e.stopPropagation(); b.blur();
    mode = { auto: 'low', low: 'high', high: 'auto' }[mode];
    try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    const u = new URL(location.href);
    if (u.searchParams.has('q')) { u.searchParams.delete('q'); history.replaceState(null, '', u); } // the button now owns it
    paint();
    onChange((mode === 'auto' ? AUTO : mode) === 'low');
  };
  paint();
  document.body.appendChild(b);
}
