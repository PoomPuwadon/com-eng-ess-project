// Graphics quality: 'high' (default) or 'low' (performance mode).
//   ?q=low / ?q=high forces it for this visit; otherwise the player's saved choice (Graphics button / G key).
// Low = no glow (post-processing skipped), no sun shadows, no lamp point lights, resolution capped at 1x
// and lowered automatically when the frame rate sags.
const KEY = 'firm.quality';
const valid = (v) => v === 'low' || v === 'high';
const param = new URLSearchParams(location.search).get('q');
let saved = null;
try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }

export const QUALITY = { low: (valid(param) ? param : valid(saved) ? saved : 'high') === 'low' };

export function saveQuality(low) {
  try { localStorage.setItem(KEY, low ? 'low' : 'high'); } catch { /* storage blocked: lasts this visit only */ }
}

// Button beside "Perf tests (F4)". onToggle() flips the mode; paint() refreshes the label.
export function mountQualityButton(onToggle) {
  const b = document.createElement('button');
  b.id = 'q-btn';
  b.title = 'Low = no glow, shadows or lamp lights; lower, adaptive resolution. For slower laptops.';
  b.style.cssText = 'position:fixed;left:140px;top:104px;z-index:30;font:600 12px system-ui;padding:5px 10px;border-radius:6px;border:1px solid #b8924a;background:#14110dcc;color:#e3c27a;cursor:pointer';
  const paint = () => { b.textContent = `Graphics: ${QUALITY.low ? 'Low' : 'High'} (G)`; };
  b.onclick = (e) => { e.stopPropagation(); b.blur(); onToggle(); };
  paint();
  document.body.appendChild(b);
  return paint;
}
