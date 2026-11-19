// The 3D side of the Leisure Suite machines and tables (the roulette seat's equivalent for slots, blackjack, baccarat, craps and poker).
// When you press E the camera moves to YOUR chair at the real table (src/world/leisureKit.js builds it and hands over its layout):
// rounded playing cards slide out of the shoe and flip, rounded dice fly off the pyramid wall and land on the exact faces the
// server rolled, the puck goes ON the point, the slot terminal's three drums spin behind glass and stop on the server's symbols,
// and your allocation sits on the felt as a real chip stack. Every animation shows the result the server already decided.
// While you sit, that table's ambient dealer pauses (at.setBusy) so nothing doubles up. Props exist only while a game is open.
import * as THREE from 'three';
import { FLOOR_BY_ID } from '../layout/building.js';
import { LM } from '../world/lux.js';
import { drawCardFace, drawCardBack, chipStackGeometry, dieAssets, dieQuat, CARD, DIE } from '../world/leisureKit.js';
import { chipsFor } from './rouletteBoard.js';

const SYM = ['seven', 'bar', 'bell', 'cherry', 'lemon', 'plum'];
const SYM_CH = { seven: '7', bar: 'BAR', bell: '🔔', cherry: '🍒', lemon: '🍋', plum: '🍇' };
const SYM_COL = { seven: '#e8202e', bar: '#15171c', bell: '#e0a800', cherry: '#d4204a', lemon: '#e8c800', plum: '#7a3cc8' };
const e0 = () => FLOOR_BY_ID['VT-01'].elevation;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (u) => 1 - (1 - u) ** 3;
const backOut = (u) => { const c = 1.4; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const TAU = Math.PI * 2;
const SCALE = 1.2; // seat cards are a touch larger than the aisle's, so they read from the chair

// ---------------------------------------------------------------- textures + shared geometry (cached)
const texCache = new Map();
const tex = (key, w, h, draw) => { if (!texCache.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texCache.set(key, t); } return texCache.get(key); };
const cardTex = (label) => tex(`c:${label}`, 256, 358, (g, w, h) => drawCardFace(g, 0, 0, w, h, label));
const backTex = () => tex('back', 256, 358, (g, w, h) => drawCardBack(g, 0, 0, w, h));
const drumTex = () => tex('drum', 768, 160, (g) => { // six symbols round the drum (u = circumference), drawn a quarter turn so they stand upright on the reel
  SYM.forEach((s, i) => {
    const x = i * 128; const grd = g.createLinearGradient(x, 0, x + 128, 0); grd.addColorStop(0, '#e9e3d2'); grd.addColorStop(0.5, '#fffdf6'); grd.addColorStop(1, '#e9e3d2');
    g.fillStyle = grd; g.fillRect(x, 0, 128, 160); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 2, 160);
    g.save(); g.translate(x + 64, 80); g.rotate(Math.PI / 2); g.fillStyle = SYM_COL[s]; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = s === 'seven' ? '900 92px Georgia, serif' : s === 'bar' ? '900 46px Georgia, serif' : '78px "Segoe UI Emoji", Arial';
    if (s === 'bar') { g.fillRect(-58, -30, 116, 60); g.fillStyle = '#f7f2e4'; } g.fillText(SYM_CH[s], 0, 4); g.restore();
  });
});
const puckTex = (on) => tex(`puck:${on}`, 128, 128, (g) => { g.fillStyle = on ? '#f6f3ea' : '#15171c'; g.fillRect(0, 0, 128, 128); g.fillStyle = on ? '#15171c' : '#f6f3ea'; g.font = '900 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(on ? 'ON' : 'OFF', 64, 68); });
function cardShape(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
let G = null;
function geos() {
  if (G) return G;
  const w = CARD.w * SCALE, h = CARD.h * SCALE, face = new THREE.ShapeGeometry(cardShape(w, h, w * 0.09), 4), uv = face.attributes.uv, p = face.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  G = {
    face: face.clone().rotateX(-Math.PI / 2).translate(0, 0.0007, 0), back: face.clone().rotateX(Math.PI / 2),
    edge: new THREE.BoxGeometry(w * 0.985, 0.0006, h * 0.985).translate(0, 0.00035, 0),
    drum: new THREE.CylinderGeometry(0.135, 0.135, 0.17, 48, 1, true).rotateZ(Math.PI / 2),
    puck: new THREE.CylinderGeometry(0.042, 0.042, 0.014, 28),
  };
  return G;
}

export function createTableSeat({ scene, camera, player }) {
  void player;
  const group = new THREE.Group(); group.name = 'table-seat'; group.visible = false; scene.add(group);
  const mats = { back: new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.45 }), edge: new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.7 }) };
  let s = null; // { kind, at, T, L, cards[], dice[], chips, pot, puck, reels, cam, look, fov }
  const W = (lx, lz, y, out = new THREE.Vector3()) => { const c = Math.cos(s.T.yaw), n = Math.sin(s.T.yaw); return out.set(s.T.x + lx * c + lz * n, e0() + y, s.T.z - lx * n + lz * c); };
  const up = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1), xAxis = new THREE.Vector3(1, 0, 0), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  // ---- cards: a rounded face, a navy back and a thin cream edge; rotation = table yaw + spot yaw, flipped about the long axis
  function makeCard(label) {
    const g = geos(), m = new THREE.Group();
    const face = new THREE.Mesh(g.face, new THREE.MeshStandardMaterial({ map: label ? cardTex(label) : backTex(), roughness: 0.42, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.add(face, new THREE.Mesh(g.back, mats.back), new THREE.Mesh(g.edge, mats.edge)); m.userData.face = face; group.add(m); return m;
  }
  const setFace = (c, label) => { c.userData.face.material.map = label ? cardTex(label) : backTex(); c.userData.face.material.needsUpdate = true; };
  /** spot: { x, z, yaw } local. Resolves when the card has landed. */
  function deal(spot, label, { down = !label, side, idx } = {}) {
    const c = makeCard(label); s.cards.push(c);
    Object.assign(c.userData, { side, idx, down, spot, t: 0, layer: s.cards.length * 0.0003 });
    return new Promise((ok) => { c.userData.done = ok; });
  }
  const flip = (c, label, speed = 3) => new Promise((ok) => { setFace(c, label); Object.assign(c.userData, { flip: 0, flipSpeed: speed, flipDone: ok }); });

  // ---- chips: your allocation as a real stack on your betting spot
  function stackMesh(amount, lx, lz) {
    const g = chipStackGeometry(chipsFor(Math.max(100, amount)).slice(0, 16)); if (!g) return null;
    const m = new THREE.Mesh(g, LM.lkChip); m.position.copy(W(lx, lz, s.L.feltY + 0.0005)); group.add(m); return m;
  }
  function setChips(stake, kind) {
    if (!s || kind === 'slots' || !s.L) return;
    if (s.chips) { group.remove(s.chips); s.chips.geometry.dispose(); }
    s.chips = stackMesh(stake, ...s.L.bet);
  }
  function setPot(amount) {
    if (!s?.L?.pot) return;
    if (s.pot) { group.remove(s.pot); s.pot.geometry.dispose(); s.pot = null; }
    if (amount > 0) s.pot = stackMesh(amount, ...s.L.pot);
  }

  // ---- dice + puck
  function makeDie() { const d = dieAssets(), m = new THREE.Mesh(d.geo, d.mat); m.scale.setScalar(1.25); group.add(m); return m; }
  function roll(a, b) {
    const L = s.L, dice = [makeDie(), makeDie()]; s.dice.push(...dice);
    return Promise.all(dice.map((d, i) => new Promise((ok) => {
      const from = W(L.throwFrom[0] - i * 0.06, L.throwFrom[2], L.throwFrom[1]);
      const wall = W(0.35 + i * 0.12 + (Math.random() - 0.5) * 0.3, L.wall + 0.03, L.feltY + 0.05);
      const rest = W(0.15 + i * 0.16 + (Math.random() - 0.5) * 0.25, -0.42 + (Math.random() - 0.5) * 0.3, L.feltY + DIE * 0.625);
      d.userData = { from, wall, rest, t: 0, ok, target: dieQuat([a, b][i], Math.random() * TAU), axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize() };
    })));
  }
  function makePuck() {
    const g = geos(), side = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.4 });
    const m = new THREE.Mesh(g.puck, [side, new THREE.MeshStandardMaterial({ map: puckTex(true), roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: puckTex(false), roughness: 0.4 })]);
    m.position.copy(W(...s.L.puckOff, s.L.feltY + 0.0155)); m.quaternion.setFromAxisAngle(xAxis, Math.PI); group.add(m);
    s.puck = { m, from: m.position.clone(), to: m.position.clone(), on: false, t: 1, ok: null };
  }
  const movePuck = (lx, lz, on) => new Promise((ok) => { const p = s.puck; p.from.copy(p.m.position); p.to.copy(W(lx, lz, s.L.feltY + 0.0155)); p.on = on; p.t = 0; p.ok = ok; });

  // ---- slots: three real drums behind glass in the terminal's reel window
  function buildReels(at) {
    const g = new THREE.Group(), tall = at.tall || 1;
    g.position.set(at.x, e0(), at.z); g.rotation.y = at.yaw ?? 0; group.add(g);
    const win = new THREE.Group(); win.position.set(0, 1.16 * tall, 0.2); win.rotation.x = -0.1; g.add(win);
    const dark = new THREE.MeshStandardMaterial({ color: 0x07070b, roughness: 0.6 }), gold = LM.lsGold || new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); win.add(m); return m; };
    add(new THREE.BoxGeometry(0.62, 0.36, 0.03), dark, 0, 0, -0.21);
    for (const [w, h, x, y] of [[0.64, 0.025, 0, 0.19], [0.64, 0.025, 0, -0.19], [0.025, 0.4, -0.32, 0], [0.025, 0.4, 0.32, 0]]) add(new THREE.BoxGeometry(w, h, 0.03), gold, x, y, 0.035);
    for (const x of [-0.098, 0.098]) add(new THREE.BoxGeometry(0.012, 0.36, 0.28), dark, x, 0, -0.06);
    add(new THREE.BoxGeometry(0.6, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), 0, 0, 0.09); // the payline
    const glass = add(new THREE.PlaneGeometry(0.62, 0.38), new THREE.MeshStandardMaterial({ color: 0xbfd6e6, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false }), 0, 0, 0.1); glass.renderOrder = 7;
    // credit meter above the window (updated after each spin)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const mt = new THREE.CanvasTexture(cv); mt.colorSpace = THREE.SRGBColorSpace;
    const meter = add(new THREE.PlaneGeometry(0.6, 0.075), new THREE.MeshBasicMaterial({ map: mt, toneMapped: false }), 0, 0.245, 0.04);
    const say = (text, color = '#ffd23f') => { const c = cv.getContext('2d'); c.fillStyle = '#05060a'; c.fillRect(0, 0, 512, 64); c.fillStyle = color; c.font = '700 34px Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 34); mt.needsUpdate = true; };
    say('AUTOMATED YIELD TERMINAL'); void meter;
    const drumMat = new THREE.MeshStandardMaterial({ map: drumTex(), roughness: 0.5 });
    s.reels = [-1, 0, 1].map((k) => { const d = add(geos().drum, drumMat, k * 0.196, 0, -0.065); const a = (Math.floor(Math.random() * 6) + 0.5) / 6 * TAU; d.rotation.x = a; return { d, a, speed: 0, stop: null }; });
    s.say = say;
  }
  function spin(result) {
    s.say('SPINNING…', '#7df9ff');
    s.reels.forEach((r, i) => { r.speed = 0; r.accel = 26 + i * 3; r.stop = null; });
    return (async () => {
      await sleep(950);
      for (let i = 0; i < 3; i++) {
        await new Promise((ok) => {
          const r = s.reels[i], k = SYM.indexOf(result[i]), target = ((k + 0.5) / 6) * TAU;
          let d = (target - r.a) % TAU; if (d < 0) d += TAU;
          r.stop = { from: r.a, to: r.a + TAU + d, t: 0, ok };
        });
        await sleep(140);
      }
    })();
  }

  // ---------------------------------------------------------------- life cycle
  function begin(kind, at) {
    end();
    s = { kind, at, T: at, L: at.layout || null, cards: [], dice: [], chips: null, pot: null, puck: null, reels: null, prevFov: camera.fov };
    at.setBusy?.(true);
    if (kind === 'slots') {
      const yaw = at.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), tall = at.tall || 1;
      s.cam = new THREE.Vector3(at.x + fx * 1.05, e0() + 1.42 * tall, at.z + fz * 1.05); s.look = new THREE.Vector3(at.x + fx * 0.2, e0() + 1.13 * tall, at.z + fz * 0.2); s.fov = 48;
      buildReels(at);
    } else if (s.L) {
      s.cam = W(s.L.cam[0], s.L.cam[2], s.L.cam[1]); s.look = W(s.L.look[0], s.L.look[2], s.L.look[1]); s.fov = s.L.fov || 50;
      if (kind === 'craps') makePuck();
    } else { s.cam = camera.position.clone(); s.look = new THREE.Vector3(at.x, e0() + 0.8, at.z); s.fov = camera.fov; }
    group.visible = true;
  }
  function end() {
    if (!s) return;
    s.at.setBusy?.(false);
    group.clear(); group.visible = false; camera.fov = s.prevFov; camera.updateProjectionMatrix(); s = null;
  }
  const active = () => Boolean(s);

  function update(dt) {
    if (!s) return;
    const k = 1 - Math.exp(-5 * dt); camera.position.lerp(s.cam, k); camera.lookAt(s.look); camera.fov += (s.fov - camera.fov) * k; camera.updateProjectionMatrix();
    const L = s.L;
    for (const c of s.cards) { // slide from the shoe with a little lift and turn, then flip when asked
      const u = c.userData, sp = u.spot, y = L.feltY + 0.0008 + u.layer;
      let x = sp.x, z = sp.z, lift = 0, yaw = sp.yaw, flipA = u.down ? Math.PI : 0;
      if (u.t < 1) {
        u.t = Math.min(1, u.t + dt * 2.3); const q = ease(u.t);
        x = L.shoe[0] + (sp.x - L.shoe[0]) * q; z = L.shoe[1] + (sp.z - L.shoe[1]) * q; lift = Math.sin(Math.PI * q) * 0.06 + (1 - q) * 0.06; yaw = sp.yaw + (1 - q) * 1.3;
        if (u.t >= 1 && u.done) { u.done(); u.done = null; }
      }
      if (u.flip != null) {
        u.flip = Math.min(1, u.flip + dt * u.flipSpeed); const q = ease(u.flip);
        flipA = Math.PI * (1 - q); lift += Math.sin(Math.PI * u.flip) * 0.04;
        if (u.flip >= 1) { u.flip = null; u.down = false; u.flipDone?.(); u.flipDone = null; }
      }
      c.position.copy(W(x, z, y + lift));
      c.quaternion.copy(qa.setFromAxisAngle(up, s.T.yaw + yaw)).multiply(qb.setFromAxisAngle(zAxis, flipA));
    }
    for (const d of s.dice) { // a toss to the far wall, a bounce back, a few hops, then the server's faces
      const u = d.userData; if (!u.ok && u.t >= 1) continue;
      u.t = Math.min(1, u.t + dt / 1.5); const q = u.t;
      if (q < 0.45) { const a = q / 0.45; d.position.lerpVectors(u.from, u.wall, a); d.position.y += Math.sin(Math.PI * a) * 0.25; }
      else { const a = (q - 0.45) / 0.55, e = ease(a); d.position.lerpVectors(u.wall, u.rest, e); d.position.y = u.rest.y + Math.abs(Math.sin(a * Math.PI * 3)) * 0.08 * (1 - a) ** 1.4; }
      d.quaternion.copy(u.target).multiply(qb.setFromAxisAngle(u.axis, (1 - ease(q)) * 7 * TAU));
      if (q >= 1 && u.ok) { d.quaternion.copy(u.target); d.position.copy(u.rest); u.ok(); u.ok = null; }
    }
    if (s.puck && s.puck.t < 1) {
      const p = s.puck; p.t = Math.min(1, p.t + dt * 1.6); const e = ease(p.t);
      p.m.position.lerpVectors(p.from, p.to, e); p.m.position.y += Math.sin(Math.PI * p.t) * 0.06;
      const fromA = p.on ? Math.PI : 0, toA = p.on ? 0 : Math.PI; p.m.quaternion.setFromAxisAngle(xAxis, fromA + (toA - fromA) * e);
      if (p.t >= 1 && p.ok) { p.ok(); p.ok = null; }
    }
    if (s.reels) for (const r of s.reels) {
      if (r.stop) { r.stop.t = Math.min(1, r.stop.t + dt / 0.55); r.a = r.stop.from + (r.stop.to - r.stop.from) * backOut(r.stop.t); if (r.stop.t >= 1) { r.a = r.stop.to % TAU; r.speed = 0; r.accel = 0; const ok = r.stop.ok; r.stop = null; ok(); } }
      else if (r.accel) { r.speed = Math.min(22, r.speed + r.accel * dt); r.a += r.speed * dt; }
      r.d.rotation.x = r.a;
    }
  }

  // ---------------------------------------------------------------- public per-game scenes (each resolves when its animation has finished)
  const count = (side) => s.cards.filter((c) => c.userData.side === side).length;
  async function playBlackjack(view, { reveal = false } = {}) {
    if (!s?.L) return;
    const p = view.player, d = view.dealer;
    for (;;) { // deal only the cards that are not on the table yet: yours first, then the dealer's
      if (!s) return;
      const mine = count('p'), theirs = count('d');
      if (mine < p.length) { await deal(s.L.player(mine), p[mine], { side: 'p', idx: mine }); continue; }
      if (theirs < d.length) { const label = d[theirs] === '??' ? null : d[theirs]; await deal(s.L.dealer(theirs), label, { side: 'd', idx: theirs }); continue; }
      break;
    }
    if (reveal) for (const c of s.cards) if (c.userData.side === 'd' && c.userData.down && d[c.userData.idx] !== '??') { await flip(c, d[c.userData.idx]); await sleep(200); }
  }
  async function playBaccarat(r) {
    if (!s?.L) return;
    const P = r.player, B = r.banker, order = [['p', 0], ['b', 0], ['p', 1], ['b', 1], ['p', 2], ['b', 2]].filter(([w, i]) => (w === 'p' ? P : B)[i]);
    const placed = [];
    for (const [w, i] of order.slice(0, 4)) { await deal((w === 'p' ? s.L.playerHand : s.L.bankerHand)(i), null, { side: w, idx: i, down: true }); placed.push([s.cards[s.cards.length - 1], w, i]); await sleep(90); }
    for (const [c, w, i] of placed) { await flip(c, (w === 'p' ? P : B)[i], 1.6); await sleep(260); } // squeezed slowly, one by one
    for (const [w, i] of order.slice(4)) { await deal((w === 'p' ? s.L.playerHand : s.L.bankerHand)(i), null, { side: w, idx: i, down: true }); await flip(s.cards[s.cards.length - 1], (w === 'p' ? P : B)[i], 1.6); await sleep(300); }
  }
  async function playPoker(v, { showBot = false, botLabels = null } = {}) {
    if (!s?.L) return;
    for (let i = count('h'); i < v.hole.length; i++) await deal(s.L.hole(i), v.hole[i], { side: 'h', idx: i });
    for (let i = count('x'); i < 2; i++) await deal(s.L.bot(i), null, { side: 'x', idx: i, down: true });
    for (let i = count('b'); i < v.board.length; i++) await deal(s.L.board(i), v.board[i], { side: 'b', idx: i });
    if (v.pot != null) setPot(v.pot);
    if (showBot && botLabels) for (const c of s.cards) if (c.userData.side === 'x' && c.userData.down) { await flip(c, botLabels[c.userData.idx]); await sleep(200); }
  }
  async function playCraps(rolls) {
    if (!s?.L) return;
    let point = null;
    for (let i = 0; i < rolls.length; i++) {
      for (const d of s.dice) group.remove(d); s.dice = [];
      const [a, b] = rolls[i]; await roll(a, b); await sleep(420);
      const sum = a + b;
      if (i === 0 && s.L.point(sum)) { point = sum; await movePuck(...s.L.point(sum), true); }
    }
    if (point) { await sleep(500); await movePuck(...s.L.puckOff, false); }
  }
  async function playSlots(reels, win = null) {
    if (!s?.reels) return;
    await spin(reels);
    if (win != null) { s.say(win > 0 ? `PAID ${win.toLocaleString('en-US')}` : 'NO YIELD THIS CYCLE', win > 0 ? '#5dff9a' : '#ffd23f'); if (win > 0) s.at.flash?.(); }
  }
  const clearHands = () => { if (!s) return; for (const c of s.cards) group.remove(c); s.cards = []; for (const d of s.dice) group.remove(d); s.dice = []; setPot(0); };

  const camPose = () => s && { cam: s.cam.toArray(), look: s.look.toArray(), fov: s.fov };
  return { begin, end, active, update, camPose, setChips, playBlackjack, playBaccarat, playPoker, playCraps, playSlots, clearHands };
}
