// Sitting at a Rotational Variance Instrument in VT-01. The table you sit at gets a fully modelled
// wheel and layout (src/world/rouletteTable.js); the camera moves to the seat; you place liquidity
// tokens by clicking the felt; the server decides the pocket and the ball is launched to land in it.
import * as THREE from 'three';
import { api, on, fmt, setBalance, esc } from '../net/api.js';
import { buildLiveTable } from '../world/rouletteTable.js';
import { CHIPS, hitTest, keyOf, coverOf, describe, colorOf, GW, GH } from './rouletteBoard.js';

const VIEWS = {
  layout: { label: 'Layout', fov: 46, pos: [0.66, 2.5, 0.95], look: [0.66, 0.87, 0.05] },
  overview: { label: 'Overview', fov: 52, pos: [0.15, 2.25, 1.35], look: [-0.05, 0.87, -0.05] },
  wheel: { label: 'Wheel', fov: 42, wheel: true, pos: [0.42, 0.62, 0.72], look: [0, 0.0, 0] },
};
const CROUPIER = { open: 'Place your positions, please.', closed: 'No more positions.', idle: 'Positions open whenever you are ready.' };

export function createRouletteSeat({ camera, canvas, player, getLeisureCtx, hud }) {
  let seat = null; // { wheel record, model, s (side sign), view, bets, ... }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
  let ui = null, offRoulette = null, prevFov = camera.fov;

  // ------------------------------------------------------------------ geometry helpers
  function viewTarget(name) {
    const v = VIEWS[name], w = seat.w, e = seat.e, s = seat.s;
    if (v.wheel) {
      tmpPos.set(w.x + v.pos[0], e + 0.95 + v.pos[1], w.z + s * v.pos[2]);
      tmpLook.set(w.x, e + 0.95, w.z);
    } else {
      tmpPos.set(w.tx + v.pos[0], e + v.pos[1], w.z + s * v.pos[2]);
      tmpLook.set(w.tx + v.look[0], e + v.look[1], w.z + s * v.look[2]);
    }
    return v.fov;
  }
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(seat.model.layout, false)[0];
    if (!hit || !hit.uv) return null;
    return hitTest(hit.uv.x * GW, (1 - hit.uv.y) * GH);
  }

  // ------------------------------------------------------------------ chips on the felt
  function refreshStacks(extra = []) {
    seat.model.setStacks([...seat.bets.values(), ...extra]);
    ui.querySelector('.rt-stake').textContent = fmt(total());
  }
  const total = () => [...seat.bets.values()].reduce((s, b) => s + b.amount, 0);
  const say = (text, cls = '') => { const el = ui.querySelector('.rt-croupier'); el.textContent = text; el.className = `rt-croupier ${cls}`; };
  const note = (html) => { ui.querySelector('.rt-outcome').innerHTML = html; };
  function setHistory(list) {
    ui.querySelector('.rt-hist').innerHTML = list.slice(0, 14).map((r) => `<span class="${r.color}">${r.pocket}</span>`).join('');
  }

  // ------------------------------------------------------------------ input
  let hoverKey = null, raf = 0;
  function onMove(ev) {
    if (!seat || seat.busy) return;
    const h = pick(ev);
    const tip = ui.querySelector('.rt-tip');
    if (h) { tip.textContent = describe(h); tip.style.left = `${ev.clientX + 16}px`; tip.style.top = `${ev.clientY + 14}px`; tip.hidden = false; } else tip.hidden = true;
    const k = h ? keyOf(h) : null;
    if (k !== hoverKey) { hoverKey = k; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => seat && seat.model.setLayout(h, seat.winning)); }
    canvas.style.cursor = h ? 'pointer' : 'default';
  }
  function onClick(ev) {
    if (!seat || seat.busy || ev.button !== 0) return;
    const h = pick(ev); if (!h) return;
    if (seat.winning != null) { seat.winning = null; seat.model.setLayout(h, null); }
    const k = keyOf(h), b = seat.bets.get(k) || { ...h, amount: 0 };
    b.amount += seat.chip; seat.bets.set(k, b); seat.stack.push([k, seat.chip]);
    note(''); say(CROUPIER.open); refreshStacks();
  }
  function onContext(ev) {
    if (!seat) return;
    ev.preventDefault();
    if (seat.busy) return;
    const h = pick(ev); if (h && seat.bets.delete(keyOf(h))) refreshStacks();
  }
  function onKey(ev) {
    if (!seat || ev.target.closest?.('input, textarea')) return;
    if (ev.code === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (!seat.busy) stand(); return; }
    if (ev.code === 'Space') { ev.preventDefault(); spin(); }
    if (ev.code === 'KeyV') { const order = Object.keys(VIEWS); setView(order[(order.indexOf(seat.view) + 1) % order.length]); }
    if (ev.code === 'Backspace' || ev.code === 'KeyZ') undo();
    ev.stopImmediatePropagation(); // nothing else (lifts, roles, terminals) while seated
  }
  function undo() {
    if (seat.busy) return;
    const u = seat.stack.pop(); if (!u) return;
    const b = seat.bets.get(u[0]); if (b) { b.amount -= u[1]; if (b.amount <= 0) seat.bets.delete(u[0]); }
    refreshStacks();
  }
  function setView(v) {
    seat.view = v;
    ui.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  }

  // ------------------------------------------------------------------ a round
  async function spin() {
    if (!seat || seat.busy) return;
    if (!seat.bets.size) { say('Place at least one position on the layout.', 'warn'); return; }
    seat.busy = true;
    ui.classList.add('busy');
    say(CROUPIER.closed);
    note('');
    const placed = [...seat.bets.values()];
    try {
      const out = await api('/api/roulette/spin', { method: 'POST', body: { bets: placed.map((b) => (b.outside ? { outside: b.outside, amount: b.amount } : { numbers: b.numbers, amount: b.amount })) } });
      seat.last = new Map([...seat.bets].map(([k, b]) => [k, { ...b }]));
      setView('wheel');
      await seat.model.spin(out.pocket);
      const color = colorOf(out.pocket);
      say(`${out.pocket} · ${color === 'green' ? 'Zero' : color === 'red' ? 'Red' : 'Black'}`, color);
      seat.winning = out.pocket;
      seat.model.setLayout(null, out.pocket);
      setBalance(out.balance);
      seat.recent = [{ pocket: out.pocket, color, at: Date.now() }, ...seat.recent].slice(0, 24); setHistory(seat.recent);
      // losing stacks are swept, winning stacks are paid beside the original position
      await wait(900);
      setView('layout');
      const winners = placed.filter((b) => coverOf(b).includes(out.pocket));
      seat.bets = new Map(winners.map((b) => [keyOf(b), b]));
      refreshStacks(winners.map((b) => ({ ax: b.ax, ay: b.ay, amount: b.amount * (36 / coverOf(b).length - 1), offset: [0.045, 0.0] })));
      note(out.net > 0 ? `<span class="up">Realised gain: ${fmt(out.net, { sign: true })}. Exceptional judgement.</span>`
        : out.net === 0 ? '<span class="gold">Capital preserved. The Treasury nods respectfully.</span>'
          : `<span class="down">Strategic contribution recorded: ${fmt(-out.net)}. The Treasury thanks you.</span>`);
      ui.querySelector('.rt-fair').innerHTML = `Provably fair · seed <span class="mono">${esc(out.seed.slice(0, 14))}…</span> → ${out.pocket}; sha256 matched the commitment <span class="mono">${esc(out.seedHash.slice(0, 10))}…</span> · next <span class="mono">${esc(out.nextSeedHash.slice(0, 10))}…</span>`;
      await wait(2600);
      seat.bets.clear(); seat.stack.length = 0; refreshStacks();
      say(CROUPIER.open);
    } catch (err) {
      say(err.status === 402 ? 'You are currently liquidity-constrained.' : err.message, 'warn');
      if (err.status === 402) note('A member of the Executive team may authorise a capital injection.');
      setView('layout');
    } finally {
      if (seat) { seat.busy = false; ui.classList.remove('busy'); }
    }
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ HUD
  function buildUi() {
    const el = document.createElement('div');
    el.id = 'rt';
    el.innerHTML = `<div class="rt-top"><div class="rt-croupier">${CROUPIER.open}</div><div class="rt-outcome"></div></div>
      <div class="rt-side"><div class="rt-title">Rotational Variance Instrument</div><div class="rt-sub">European single zero · institutional advantage 2.70%</div>
        <div class="rt-label">Recent results</div><div class="rt-hist"></div>
        <div class="rt-label">Camera <span class="muted">(V)</span></div><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<button data-view="${k}">${v.label}</button>`).join('')}</div>
        <button class="btn ghost sm rt-stand">Stand up · Esc</button>
        <details><summary>How to place · fairness</summary><div class="rt-help">Click the felt to place a token: on a number (straight), a line (split), a corner (four numbers), the near edge (street) or a near corner (six line). Right-click removes · Z undo · Space releases the ball.</div><div class="rt-fair"></div></details></div>
      <div class="rt-rail"><div class="rt-chips">${CHIPS.map(([v, c, l]) => `<button class="rt-chip${v === seat.chip ? ' on' : ''}" data-v="${v}" style="--c:${c}" title="¤${(v / 100).toLocaleString()}">${l}</button>`).join('')}</div>
        <div class="rt-btns"><button class="btn ghost sm" data-act="undo">Undo</button><button class="btn ghost sm" data-act="clear">Clear</button><button class="btn ghost sm" data-act="repeat">Repeat</button><button class="btn ghost sm" data-act="double">Double</button></div>
        <div class="rt-total"><span class="muted">Total allocation</span><span class="rt-stake">¤0.00</span></div>
        <button class="btn rt-spin" data-act="spin">Release the ball <kbd>Space</kbd></button></div>
      <div class="rt-tip" hidden></div>`;
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('.rt-chip');
      if (chip) { seat.chip = +chip.dataset.v; el.querySelectorAll('.rt-chip').forEach((c) => c.classList.toggle('on', c === chip)); return; }
      const v = e.target.closest('[data-view]')?.dataset.view; if (v) { setView(v); return; }
      if (e.target.closest('.rt-stand')) { if (!seat.busy) stand(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act || seat.busy) return;
      if (act === 'spin') return spin();
      if (act === 'undo') return undo();
      if (act === 'clear') { seat.bets.clear(); seat.stack.length = 0; }
      if (act === 'repeat' && seat.last) { seat.bets = new Map([...seat.last].map(([k, b]) => [k, { ...b }])); }
      if (act === 'double') for (const b of seat.bets.values()) b.amount *= 2;
      refreshStacks();
    });
    document.body.appendChild(el);
    return el;
  }

  // ------------------------------------------------------------------ sit / stand
  function sit(w) {
    const ctx = getLeisureCtx();
    if (!ctx?.roulette || seat) return false;
    const e = ctx.e;
    const s = w.flip ? -1 : 1;
    const model = buildLiveTable({ tx: w.tx, z: w.z, flip: w.flip, wx: w.x, e });
    ctx.group.add(model.root);
    w.hidden = true;
    seat = { w, e, s, model, ctx, view: 'layout', bets: new Map(), stack: [], chip: 500, busy: false, winning: null, last: null, recent: [] };
    ui = buildUi(); setView('layout');
    document.exitPointerLock?.();
    player.enabled = false; player.keys.clear();
    player.place(w.tx + 0.35, e, w.z + s * 1.45, s > 0 ? 0 : Math.PI); // stand behind your chair
    prevFov = camera.fov;
    camPos.copy(camera.position); camLook.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()));
    viewTarget('layout');
    if (camPos.distanceTo(tmpPos) > 6) { camPos.copy(tmpPos); camLook.copy(tmpLook); } // e.g. arriving from another floor: no long glide
    document.body.classList.add('seated');
    canvas.addEventListener('mousemove', onMove); canvas.addEventListener('mousedown', onClick); canvas.addEventListener('contextmenu', onContext);
    addEventListener('keydown', onKey, true);
    api('/api/roulette/state').then((st) => {
      if (!seat) return;
      seat.recent = st.recent; setHistory(st.recent);
      if (st.commitment) ui.querySelector('.rt-fair').textContent = `Provably fair · next ball seed commitment sha256 ${st.commitment.slice(0, 24)}…`;
    }).catch(() => {});
    offRoulette = on('roulette', (r) => { if (seat && !seat.busy) { seat.recent = [r, ...seat.recent].slice(0, 24); setHistory(seat.recent); } });
    hud?.prompt('');
    return true;
  }

  function stand() {
    if (!seat) return;
    seat.model.dispose();
    seat.w.hidden = false;
    const { w, s, e } = seat;
    seat = null;
    ui.remove(); ui = null; offRoulette?.();
    canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('mousedown', onClick); canvas.removeEventListener('contextmenu', onContext);
    removeEventListener('keydown', onKey, true);
    canvas.style.cursor = '';
    document.body.classList.remove('seated');
    camera.fov = prevFov; camera.updateProjectionMatrix();
    player.enabled = true;
    player.place(w.tx + 0.35, e, w.z + s * 1.6, s > 0 ? 0 : Math.PI);
    player.pitch = -0.25;
  }

  /** Called every frame after the world tick: animate the live table and drive the camera. */
  function update(dt) {
    if (!seat) return;
    seat.model.update(dt);
    const fov = viewTarget(seat.view);
    if (seat.view === 'wheel' && seat.model.spinning()) tmpLook.lerp(seat.model.ballWorld(), 0.25); // follow the ball a little
    const k = 1 - Math.exp(-dt * 3.2);
    camPos.lerp(tmpPos, k); camLook.lerp(tmpLook, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
    player.keys.clear();
  }

  return { sit, stand, update, active: () => Boolean(seat), spin, setView, state: () => seat && { table: [seat.w.tx, seat.w.z], view: seat.view, bets: [...seat.bets.values()].map((b) => ({ key: keyOf(b), amount: b.amount })), busy: seat.busy } };
}
