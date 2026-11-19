// OT-01 Chart Desk terminal: a real kiosk by the trading floor portal, with its whole interface drawn on the kiosk's
// own monitor (a CanvasTexture in the world, not a DOM overlay). Walk up and press E (or tap the prompt on a phone):
// the camera steps up to the screen and every click / tap is ray-cast onto the monitor and mapped to its buttons.
// Charts come in by paste (Ctrl+V, or the PASTE button), drag and drop, or UPLOAD (the photo / file picker on phones).
// The reading itself is the existing Chart Desk pipeline (src/apps/chartDesk.js → POST /api/vision/chart).
// Between visitors the screen keeps showing the last call, so people walking in see what the desk just said.
import * as THREE from 'three';
import { readChart, analyseChart } from './chartDesk.js';
import { plaque } from '../world/lux.js';

const W = 1280, H = 800; // screen canvas (16:10)
export const KIOSK = { x: -52.3, z: -6.95, yaw: 0, screenY: 1.47, tilt: 0.16, w: 1.28, h: 0.8, ctx: null, mesh: null }; // faces +z, onto the aisle
const C = { bg: '#070a12', panel: '#0f1524', line: '#26324a', gold: '#e3c27a', ink: '#eef1f8', mute: '#8b95a8', up: '#34e08a', down: '#ff5a6a', claude: '#ff9a3c', gemini: '#4aa8ff' };

// ---------------------------------------------------------------- the screen (one canvas, shared by the model and the controller)
const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');
let tex = null;
const big = () => matchMedia('(pointer: coarse)').matches || innerWidth < 900; // phones / tablets: larger type and buttons on the screen
const S = { mode: 'idle', img: null, file: '', dataUrl: null, hint: null, verdict: null, msg: '', hover: null, t: 0, user: false, buttons: [] };

function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function wrap(text, x, y, maxW, lh, maxLines = 4) {
  const words = String(text || '').split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); n++; line = w; if (n >= maxLines) return n; } else line = t;
  }
  if (line) { g.fillText(line, x, y + n * lh); n++; }
  return n;
}
function button(id, label, x, y, w, h, { primary = false, disabled = false } = {}) {
  const hot = S.hover === id && !disabled;
  rr(x, y, w, h, 14); g.fillStyle = disabled ? '#151b29' : primary ? (hot ? '#f2d58f' : C.gold) : (hot ? '#24304a' : '#18203a'); g.fill();
  g.lineWidth = 2; g.strokeStyle = primary ? C.gold : hot ? C.gold : C.line; g.stroke();
  g.fillStyle = disabled ? '#4a5368' : primary ? '#1a1305' : C.ink; g.font = `800 ${big() ? 30 : 26}px "Segoe UI", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2 + 1);
  if (!disabled) S.buttons.push({ id, x, y, w, h });
}
function draw() {
  S.buttons = [];
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // header
  const hg = g.createLinearGradient(0, 0, W, 0); hg.addColorStop(0, '#1b1407'); hg.addColorStop(1, '#0a0e18'); g.fillStyle = hg; g.fillRect(0, 0, W, 84);
  g.fillStyle = C.gold; g.fillRect(0, 84, W, 3);
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = C.gold; g.font = '900 40px Georgia, serif'; g.fillText('CHART DESK', 36, 44);
  const tw = g.measureText('CHART DESK').width;
  g.fillStyle = C.mute; g.font = '600 22px "Segoe UI", Arial'; g.fillText('AI chart reading · the desk calls UP or DOWN', 36 + tw + 24, 46);
  g.textAlign = 'right'; g.fillStyle = C.ink; g.font = '700 22px Consolas, monospace'; g.fillText(new Date().toLocaleTimeString('en-GB'), W - 36, 46);
  // left: the chart (or the drop zone)
  const L = { x: 36, y: 112, w: 700, h: 520 };
  rr(L.x, L.y, L.w, L.h, 18); g.fillStyle = C.panel; g.fill();
  if (S.img) {
    const k = Math.min((L.w - 32) / S.img.width, (L.h - 70) / S.img.height), iw = S.img.width * k, ih = S.img.height * k;
    g.drawImage(S.img, L.x + (L.w - iw) / 2, L.y + 16 + (L.h - 70 - ih) / 2, iw, ih);
    g.fillStyle = C.mute; g.font = '600 20px "Segoe UI", Arial'; g.textAlign = 'center'; g.fillText(S.file, L.x + L.w / 2, L.y + L.h - 26);
  } else {
    g.setLineDash([16, 12]); g.lineWidth = 3; g.strokeStyle = S.user ? C.gold : C.line; rr(L.x + 24, L.y + 24, L.w - 48, L.h - 48, 16); g.stroke(); g.setLineDash([]);
    // a little live sparkline so the idle screen breathes
    g.beginPath(); g.lineWidth = 4; g.strokeStyle = 'rgba(227,194,122,0.55)';
    for (let i = 0; i <= 60; i++) { const x = L.x + 90 + i * 8.6, y = L.y + 200 + Math.sin(i * 0.33 + S.t * 1.4) * 34 + Math.sin(i * 0.11 - S.t * 0.6) * 22 - i * 1.2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const B = big() && S.user;
    g.textAlign = 'center'; g.fillStyle = C.ink; g.font = `800 ${B ? 46 : 34}px "Segoe UI", Arial`;
    g.fillText(S.user ? (B ? 'Upload or paste a chart' : 'Paste, drop or upload a chart') : 'Walk up and press E', L.x + L.w / 2, L.y + 330);
    g.fillStyle = C.mute; g.font = `600 ${B ? 28 : 22}px "Segoe UI", Arial`;
    g.fillText(B ? 'PNG, JPG or WebP · up to 4 MB' : S.user ? 'Ctrl+V pastes a copied image · PNG, JPG or WebP up to 4 MB' : 'Tap the prompt on a phone · paste, drop or upload a stock chart', L.x + L.w / 2, L.y + (B ? 384 : 372));
    if (!B) g.fillText('A screenshot of any price chart works best (line or candles, axes visible)', L.x + L.w / 2, L.y + 404);
  }
  // right: the verdict
  const R = { x: 760, y: 112, w: 484, h: 520 };
  rr(R.x, R.y, R.w, R.h, 18); g.fillStyle = C.panel; g.fill();
  g.textAlign = 'left'; g.fillStyle = C.gold; g.font = '800 24px "Segoe UI", Arial'; g.fillText(S.mode === 'busy' ? 'READING…' : 'VERDICT', R.x + 26, R.y + 36);
  const v = S.verdict;
  if (S.mode === 'busy') {
    const cx = R.x + R.w / 2, cy = R.y + 220;
    g.lineWidth = 12; g.strokeStyle = C.line; g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = C.gold; g.beginPath(); g.arc(cx, cy, 70, S.t * 5, S.t * 5 + 1.6); g.stroke();
    g.textAlign = 'center'; g.fillStyle = C.ink; g.font = '700 26px "Segoe UI", Arial'; g.fillText('The desk is reading your chart…', cx, cy + 130);
  } else if (v) {
    const up = v.direction === 'UP';
    g.fillStyle = up ? C.up : C.down; g.font = '900 104px "Segoe UI", Arial'; g.fillText(up ? '▲ UP' : '▼ DOWN', R.x + 24, R.y + 128);
    g.fillStyle = C.mute; g.font = '600 20px "Segoe UI", Arial';
    const meta = `${v.mode === 'ai' ? `AI reading · ${v.provider || ''}` : 'DEMO MODE · heuristic, no AI key'} · confidence ${Math.round((v.confidence || 0) * 100)}%${v.ticker ? ` · ${v.ticker}` : ''}`;
    wrap(meta, R.x + 26, R.y + 196, R.w - 52, 26, 2);
    if (v.isChart === false) { g.fillStyle = C.down; g.font = '700 20px "Segoe UI", Arial'; g.fillText('Not recognised as a price chart', R.x + 26, R.y + 252); }
    const B = big(); g.fillStyle = C.ink; g.font = `800 ${B ? 30 : 25}px "Segoe UI", Arial`; const n = wrap(v.headline || '', R.x + 26, R.y + 288, R.w - 52, B ? 36 : 32, 3);
    g.font = `500 ${B ? 25 : 21}px "Segoe UI", Arial`; g.fillStyle = '#c9d0de'; let y = R.y + 300 + n * 32;
    for (const r of (v.reasons || []).slice(0, 4)) { if (y > R.y + R.h - 96) break; g.fillStyle = C.gold; g.fillText('•', R.x + 26, y); g.fillStyle = '#c9d0de'; y += wrap(r, R.x + 48, y, R.w - 76, 26, 2) * 26 + 8; }
    g.fillStyle = C.mute; g.font = '500 16px "Segoe UI", Arial'; wrap(v.notice || 'Notional analysis, not advice.', R.x + 26, R.y + R.h - 46, R.w - 52, 20, 2);
  } else {
    g.fillStyle = C.mute; g.font = '600 24px "Segoe UI", Arial'; wrap('Upload a chart to receive the desk\'s call. The reading comes from the firm\'s AI desk (or a labelled demo heuristic when no key is set).', R.x + 26, R.y + 90, R.w - 52, 34, 6);
  }
  // buttons + status
  const by = 664;
  if (S.user) {
    button('upload', 'UPLOAD IMAGE', 36, by, 250, 74);
    button('paste', 'PASTE', 302, by, 170, 74, { disabled: !navigator.clipboard?.read });
    button('go', S.mode === 'busy' ? 'READING…' : 'ANALYSE CHART', 488, by, 290, 74, { primary: true, disabled: !S.dataUrl || S.mode === 'busy' });
    button('leave', 'LEAVE · Esc', W - 36 - 220, by, 220, 74);
  } else {
    g.textAlign = 'left'; g.fillStyle = C.mute; g.font = '600 22px "Segoe UI", Arial'; g.fillText('OT-01 Trading Floor · notional analysis, not advice', 36, by + 38);
  }
  g.textAlign = 'left'; g.fillStyle = S.msgBad ? C.down : C.mute; g.font = `600 ${big() ? 25 : 20}px "Segoe UI", Arial`; g.fillText(S.msg || '', 36, H - 24);
  if (tex) tex.needsUpdate = true;
}

/** Built by the OT-01 floor (src/floors/tradingFloor.js): the podium, the monitor and its live screen. */
export function buildChartKiosk(L, ctx) {
  const { x, z } = KIOSK, Y = KIOSK.screenY;
  L.box(x - 0.55, x + 0.55, 0, 0.06, z - 0.42, z + 0.42, 'gold');
  L.box(x - 0.5, x + 0.5, 0.06, 0.95, z - 0.36, z + 0.2, 'gunmetal', { collide: true }); // podium
  L.box(x - 0.52, x + 0.52, 0.95, 1.0, z - 0.38, z + 0.36, 'cream'); // writing ledge
  L.box(x - 0.5, x + 0.5, 0.12, 0.18, z + 0.2, z + 0.205, 'claudeGlow');
  L.box(x - 0.07, x + 0.07, 1.0, Y - 0.2, z - 0.3, z - 0.2, 'gunDark'); // monitor arm
  // the monitor shell (tilted back) and a gold bezel
  const back = new THREE.BoxGeometry(KIOSK.w + 0.1, KIOSK.h + 0.1, 0.07).rotateX(-KIOSK.tilt).translate(x, Y, z - 0.16); L.geo(back, 'gunDark');
  const bez = new THREE.BoxGeometry(KIOSK.w + 0.06, KIOSK.h + 0.06, 0.02).rotateX(-KIOSK.tilt).translate(x, Y, z - 0.12); L.geo(bez, 'brushedBronze');
  const panel = new THREE.PlaneGeometry(KIOSK.w, KIOSK.h); // the live screen
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(panel, mat); mesh.position.set(x, ctx.e + Y, z - 0.105); mesh.rotation.x = -KIOSK.tilt; mesh.name = 'chart-kiosk-screen';
  ctx.add(mesh, panel, mat, tex);
  KIOSK.ctx = ctx; KIOSK.mesh = mesh;
  L.box(x - 0.015, x + 0.015, Y + KIOSK.h / 2 + 0.05, 2.62, z - 0.22, z - 0.18, 'gunDark'); // sign post
  plaque(ctx, 'CHART DESK', x, 2.78, z - 0.2, 0, { h: 0.26, color: '#e3c27a', bg: '#0b0f18', sub: 'Upload a stock graph · UP or DOWN' });
  draw();
  let acc = 0;
  ctx.onUpdate((dt) => { if (!ctx.group.visible) return; S.t += dt; acc += dt; if (acc > (S.user ? 0.05 : 0.5)) { acc = 0; if (S.user || S.mode === 'busy' || !S.img) draw(); } });
}

/** distance check for the E / Tap prompt (src/interact.js) */
export function nearKiosk(player) {
  return KIOSK.ctx && player.floor?.id === 'OT-01' && Math.abs(player.pos.x - KIOSK.x) < 1.6 && player.pos.z - KIOSK.z > -0.6 && player.pos.z - KIOSK.z < 2.6;
}

// ---------------------------------------------------------------- the controller (camera, input, paste / drop / upload)
export function createChartKiosk({ camera, canvas, player, hud }) {
  let open = false, prevFov = 50;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', hidden: true });
  document.body.appendChild(input);
  input.onchange = () => { take(input.files[0]); input.value = ''; };

  const say = (msg, bad = false) => { S.msg = msg; S.msgBad = bad; draw(); };
  async function take(file) {
    if (!file) return;
    try {
      const r = await readChart(file);
      const img = new Image(); img.onload = () => { S.img = img; draw(); }; img.src = r.dataUrl;
      Object.assign(S, { dataUrl: r.dataUrl, hint: r.hint, file: `${file.name || 'pasted image'} · ${(file.size / 1024).toFixed(0)} KB`, verdict: null, mode: 'ready' });
      say('Chart loaded. Press ANALYSE CHART.');
    } catch (e) { say(e.message, true); }
  }
  async function go() {
    if (!S.dataUrl || S.mode === 'busy') return;
    S.mode = 'busy'; say('');
    try { S.verdict = await analyseChart(S.dataUrl, S.hint); S.mode = 'done'; say(''); }
    catch (e) { S.mode = 'ready'; say(/Request failed ((5dd))|Failed to fetch|NetworkError/.test(e.message || '') ? 'The desk is offline right now. Try again in a moment.' : (e.message || 'The desk could not read that chart.'), true); }
  }
  async function pasteButton() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { const b = await it.getType(t); return take(new File([b], 'pasted image', { type: t })); } }
      say('The clipboard has no image. Copy a chart first (or use UPLOAD).', true);
    } catch { say('Paste was blocked by the browser. Use Ctrl+V, or UPLOAD.', true); }
  }
  const act = (id) => { if (id === 'upload') input.click(); else if (id === 'paste') pasteButton(); else if (id === 'go') go(); else if (id === 'leave') close(); };

  // ---- pointer → screen (ray cast onto the monitor plane)
  function hit(e) {
    if (!KIOSK.mesh) return null;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const h = ray.intersectObject(KIOSK.mesh, false)[0];
    if (!h?.uv) return null;
    const px = h.uv.x * W, py = (1 - h.uv.y) * H;
    return S.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)?.id || 'screen';
  }
  const onMove = (e) => { const id = hit(e); const b = id && id !== 'screen' ? id : null; if (b !== S.hover) { S.hover = b; draw(); } canvas.style.cursor = b ? 'pointer' : ''; };
  const onUp = (e) => { const id = hit(e); if (id && id !== 'screen') { e.preventDefault(); act(id); } else if (!id) close(); }; // pointerup: counts as a user gesture on phones (needed for the file picker)
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); go(); return; }
    if (['KeyE', 'KeyC', 'KeyM', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && !(e.ctrlKey || e.metaKey)) { e.stopImmediatePropagation(); }
  };
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); take(f); } else say('The clipboard has no image. Copy a chart first (or use UPLOAD).', true); };
  const onDrag = (e) => { e.preventDefault(); };
  const onDrop = (e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); };

  function target() {
    const { x, z } = KIOSK, e0 = KIOSK.ctx.e, Y = e0 + KIOSK.screenY, t = Math.tan((50 * Math.PI) / 360), aspect = innerWidth / Math.max(1, innerHeight);
    const d = Math.max(0.9, (KIOSK.h * 0.56) / t, (KIOSK.w * 0.53) / (t * aspect)); // fit height and width: a portrait phone steps back to see the whole monitor
    tPos.set(x, Y + Math.sin(KIOSK.tilt) * d + 0.02, z - 0.105 + Math.cos(KIOSK.tilt) * d); tLook.set(x, Y, z - 0.105);
  }
  function openKiosk() {
    if (open || !KIOSK.ctx) return false;
    open = true; S.user = true; S.hover = null; if (S.mode === 'idle') S.mode = S.dataUrl ? 'ready' : 'idle';
    document.exitPointerLock?.();
    player.enabled = false; player.keys.clear();
    player.place(KIOSK.x, KIOSK.ctx.e, KIOSK.z + 1.35, 0); // stand at the terminal
    prevFov = camera.fov; camPos.copy(camera.position); camLook.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3())); target();
    document.body.classList.add('seated');
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
    addEventListener('keydown', onKey, true); addEventListener('paste', onPaste); addEventListener('dragover', onDrag); addEventListener('drop', onDrop);
    hud?.prompt('');
    say(innerWidth < innerHeight && big() ? 'Tip: turn your phone sideways for a bigger screen.' : navigator.clipboard?.read ? 'Paste (Ctrl+V), drop a file, or UPLOAD.' : 'Drop a file or UPLOAD (Ctrl+V also pastes on a keyboard).');
    return true;
  }
  function close() {
    if (!open) return;
    open = false; S.user = false; S.hover = null; canvas.style.cursor = '';
    canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
    removeEventListener('keydown', onKey, true); removeEventListener('paste', onPaste); removeEventListener('dragover', onDrag); removeEventListener('drop', onDrop);
    document.body.classList.remove('seated');
    camera.fov = prevFov; camera.updateProjectionMatrix();
    player.enabled = true; player.pitch = -0.15;
    S.msg = ''; draw();
  }
  function update(dt) {
    if (!open) return;
    if (!KIOSK.ctx?.group?.parent) { close(); return; } // the floor was unloaded under us
    target(); const k = 1 - Math.exp(-dt * 4);
    camPos.lerp(tPos, k); camLook.lerp(tLook, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    const fov = 50; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
    player.keys.clear();
  }
  return { KIOSK, open: openKiosk, close, update, active: () => open, state: () => ({ open, mode: S.mode, hasImage: Boolean(S.dataUrl), verdict: S.verdict?.direction || null, buttons: S.buttons.map((b) => b.id) }), take };
}
