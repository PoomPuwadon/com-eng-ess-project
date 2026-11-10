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

// "Graphics" button for every device: Auto → Low → High. Antialiasing is fixed when the renderer is
// created, so switching saves the choice and reloads the page.
export function mountQualityButton() {
  const b = document.createElement('button');
  b.id = 'q-btn';
  const label = { auto: `Auto (${AUTO === 'low' ? 'Low' : 'High'})`, low: 'Low', high: 'High' };
  b.textContent = `Graphics: ${label[QUALITY_MODE]}`;
  b.title = 'Low = no glow, shadows, lamp lights or antialiasing, adaptive resolution. Best for older laptops and phones.';
  b.onclick = (e) => {
    e.stopPropagation();
    const next = { auto: 'low', low: 'high', high: 'auto' }[QUALITY_MODE];
    try { if (next === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* ignore */ }
    const u = new URL(location.href);
    u.searchParams.delete('q');
    if (next !== 'auto') u.searchParams.set('q', next); // still works when storage is blocked
    location.replace(u);
  };
  document.body.appendChild(b);
}
