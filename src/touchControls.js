// Touch controls for phones/tablets (the game was keyboard + mouse only):
//   left thumb  = virtual joystick (walk; push to the rim to run)
//   anywhere else on the 3D view = drag to turn the camera, two fingers to zoom
//   Run button; the contextual "Tap · …" prompt (ui.js) replaces the E key
// Loaded only on touch devices. Movement goes through player.stick; buttons send the same key events the
// keyboard would, so every existing interaction (lifts, roulette, terminals) works unchanged.
const css = `
#tc { position: fixed; inset: 0; pointer-events: none; z-index: 15; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
#tc .pad { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(96px, calc(env(safe-area-inset-bottom) + 80px)); width: 132px; height: 132px; border-radius: 50%;
  background: rgba(20,24,34,.45); border: 2px solid rgba(201,162,58,.55); pointer-events: auto; touch-action: none; }
#tc .nub { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(201,162,58,.75); }
#tc .btns { position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(96px, calc(env(safe-area-inset-bottom) + 80px)); display: grid; grid-template-columns: 64px; gap: 10px; pointer-events: none; }
#tc button { width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(201,162,58,.7); background: rgba(20,24,34,.62); color: #f0d18a;
  font: 700 13px system-ui, sans-serif; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
body.touch #minimap, body.touch #floors, body.touch #roles, body.touch #notice, body.touch #help-btn { display: none !important; }
body.touch #prompt { top: auto; bottom: max(250px, calc(env(safe-area-inset-bottom) + 234px)); max-width: 80vw; text-align: center; }
body.touch #prompt.tap { pointer-events: auto; background: rgba(201,162,58,.92); color: #111; font-weight: 700; border-radius: 28px; padding: 12px 20px; border: 2px solid #f0d18a; touch-action: none; }
#tc button.on, #tc button:active { background: rgba(201,162,58,.8); color: #111; }
`;

export function startTouchControls({ player, canvas }) {
  const style = Object.assign(document.createElement('style'), { textContent: css });
  const root = Object.assign(document.createElement('div'), { id: 'tc' });
  root.innerHTML = `<div class="pad"><div class="nub"></div></div>
    <div class="btns"><button data-run>RUN</button></div>`;
  document.body.classList.add('touch'); document.head.append(style); document.body.append(root);
  canvas.style.touchAction = 'none';

  // ---- joystick
  const pad = root.querySelector('.pad'), nub = root.querySelector('.nub'), R = 52;
  let sid = null, cx = 0, cy = 0;
  const setStick = (x, y) => { // x,y px from the pad centre
    const d = Math.hypot(x, y), k = d > R ? R / d : 1;
    nub.style.transform = `translate(${x * k}px, ${y * k}px)`;
    const nx = (x * k) / R, ny = (y * k) / R, dead = Math.hypot(nx, ny) < 0.12;
    player.stick.x = dead ? 0 : nx; player.stick.y = dead ? 0 : -ny; // up on screen = forward
    if (!runBtn.classList.contains('on')) player.stick.run = Math.hypot(nx, ny) > 0.95;
  };
  const release = () => { sid = null; nub.style.transform = ''; player.stick.x = 0; player.stick.y = 0; if (!runBtn.classList.contains('on')) player.stick.run = false; };
  pad.addEventListener('pointerdown', (e) => { sid = e.pointerId; try { pad.setPointerCapture(sid); } catch { /* not a live pointer */ } const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; setStick(e.clientX - cx, e.clientY - cy); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e.clientX - cx, e.clientY - cy); });
  pad.addEventListener('pointerup', (e) => { if (e.pointerId === sid) release(); });
  pad.addEventListener('pointercancel', release);

  // ---- the contextual prompt ("Tap · Markets terminal") is the Use button: it only exists next to something usable
  const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
  const prompt = document.getElementById('prompt');
  prompt?.addEventListener('pointerdown', (e) => { if (!prompt.classList.contains('tap')) return; e.preventDefault(); key('keydown', 'KeyE'); setTimeout(() => key('keyup', 'KeyE'), 80); });

  // ---- buttons
  const runBtn = root.querySelector('[data-run]');
  runBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); runBtn.classList.toggle('on'); player.stick.run = runBtn.classList.contains('on'); });
  for (const b of root.querySelectorAll('[data-k]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); key('keydown', b.dataset.k); });
    b.addEventListener('pointerup', () => key('keyup', b.dataset.k));
    b.addEventListener('pointercancel', () => key('keyup', b.dataset.k));
  }

  // ---- look: one-finger drag on the 3D view; two-finger pinch = zoom
  const touches = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !player.enabled) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t || e.pointerType !== 'touch') return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) player.camDist = Math.max(1.6, Math.min(12, player.camDist * (pinch / d)));
      pinch = d; return;
    }
    player.yaw -= dx * 0.006;
    player.pitch = Math.max(-1.05, Math.min(0.55, player.pitch - dy * 0.005));
  });
  const up = (e) => { touches.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  document.addEventListener('contextmenu', (e) => { if (root.contains(e.target) || e.target === canvas) e.preventDefault(); });
  return { root };
}
