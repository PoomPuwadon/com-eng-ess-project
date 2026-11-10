// PROTOTYPE touch controls: left thumbstick = walk (push fully = run), drag anywhere else = look,
// buttons for Use (E), chat and the floor/role menu.
export function setupTouch(player, canvas, { onUse, onChat }) {
  document.body.classList.add('touch');
  const ui = document.createElement('div');
  ui.id = 'touch';
  ui.innerHTML = `<div id="stick"><div id="knob"></div></div>
    <button id="t-full" aria-label="Full screen">⛶</button>
    <div id="tbtns"><button id="t-use">USE</button><button id="t-chat">💬</button><button id="t-menu">☰</button></div>`;
  document.body.appendChild(ui);
  const stick = ui.querySelector('#stick'), knob = ui.querySelector('#knob');
  const R = 50;
  let stickId = null, sx = 0, sy = 0;
  player.touch = { f: 0, s: 0, run: false };

  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    setKnob(dx, dy);
    const m = Math.min(1, len / R);
    player.touch.f = -dy / R; player.touch.s = dx / R; player.touch.run = m > 0.92;
    if (m < 0.15) player.touch.f = player.touch.s = 0; // dead zone
  };
  const end = (e) => { if (e.pointerId !== stickId) return; stickId = null; setKnob(0, 0); Object.assign(player.touch, { f: 0, s: 0, run: false }); };
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  // look: any touch on the 3D view
  const looks = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    player.yaw -= (e.clientX - l.x) * 0.006;
    player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch - (e.clientY - l.y) * 0.006));
    l.x = e.clientX; l.y = e.clientY;
  });
  const lookEnd = (e) => looks.delete(e.pointerId);
  canvas.addEventListener('pointerup', lookEnd);
  canvas.addEventListener('pointercancel', lookEnd);

  ui.querySelector('#t-use').onclick = onUse;
  ui.querySelector('#t-chat').onclick = onChat;
  ui.querySelector('#t-menu').onclick = () => document.body.classList.toggle('menu-open');

  // full screen (Android / iPad). iPhone Safari has no page full screen: there, "Add to Home Screen" is the way.
  const full = ui.querySelector('#t-full'), root = document.documentElement;
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const paint = () => { full.textContent = isFull() ? '✕' : '⛶'; };
  full.onclick = async () => {
    if (!req) { full.blur(); alert('Full screen is not available in this browser. On iPhone: Share → Add to Home Screen, then open it from there.'); return; }
    try {
      if (isFull()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await req.call(root, { navigationUI: 'hide' });
    } catch { /* refused */ }
  };
  document.addEventListener('fullscreenchange', paint);
  document.addEventListener('webkitfullscreenchange', paint);
  if (window.matchMedia('(display-mode: standalone)').matches) full.style.display = 'none'; // already app-like
  document.getElementById('help')?.classList.add('hidden');
  document.getElementById('perf')?.classList.remove('hidden'); // fps always visible while testing on phones
}
