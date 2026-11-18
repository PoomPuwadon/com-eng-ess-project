// The 3D side of the Leisure Suite machines and tables (the roulette seat's equivalent for slots, blackjack, baccarat, craps and poker).
// When you press E the camera moves to a seat at the real table, real 3D props appear on the real felt (cards that are dealt and flipped, dice that tumble
// and land on the exact faces the server rolled, a slot reel window that spins and stops on the server's symbols, chip stacks for your allocation) and
// every animation shows the result the server already decided. Props are built once, pooled, and only exist while a game is open.
import * as THREE from 'three';
import { FLOOR_BY_ID } from '../layout/building.js';

const SYM = ['seven', 'bar', 'bell', 'cherry', 'lemon', 'plum'];
const SYM_CH = { seven: '7', bar: 'BAR', bell: '🔔', cherry: '🍒', lemon: '🍋', plum: '🍇' };
const SYM_COL = { seven: '#ff3b3b', bar: '#e8e8e8', bell: '#ffd24a', cherry: '#ff5a7a', lemon: '#fff04a', plum: '#a86bff' };
const e0 = () => FLOOR_BY_ID['VT-01'].elevation;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (u) => 1 - (1 - u) ** 3;

// ---------------------------------------------------------------- textures (cached)
const texCache = new Map();
const tex = (key, w, h, draw) => { if (!texCache.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); } return texCache.get(key); };
const RED_SUIT = new Set(['♥', '♦']);
/** card label like "10♥" or "A♠" (blackjack / baccarat) or "T♥" (poker names use T for ten) */
const cardTex = (label) => tex(`c:${label}`, 140, 196, (g, w, h) => {
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9c3b0'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  const suit = label.slice(-1), rank = label.slice(0, -1).replace('T', '10'); g.fillStyle = RED_SUIT.has(suit) ? '#c8102e' : '#15171c';
  g.font = '900 44px Georgia, serif'; g.textAlign = 'left'; g.fillText(rank, 10, 46); g.font = '40px Arial'; g.fillText(suit, 12, 88);
  g.font = '80px Arial'; g.textAlign = 'center'; g.fillText(suit, w / 2, h / 2 + 34);
  g.save(); g.translate(w, h); g.rotate(Math.PI); g.font = '900 44px Georgia, serif'; g.textAlign = 'left'; g.fillText(rank, 10, 46); g.restore();
});
const backTex = () => tex('back', 140, 196, (g, w, h) => { g.fillStyle = '#10234d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e3c27a'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#e3c27a'; for (let y = 24; y < h - 20; y += 22) for (let x = 24; x < w - 20; x += 22) { g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill(); } });
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const dieFace = (n) => tex(`d:${n}`, 128, 128, (g) => { g.fillStyle = '#f6f2e6'; g.fillRect(0, 0, 128, 128); g.fillStyle = n === 1 ? '#c8102e' : '#15171c'; for (const [x, y] of PIPS[n]) { g.beginPath(); g.arc(64 + x * 30, 64 + y * 30, n === 1 ? 17 : 12, 0, 6.3); g.fill(); } });
const reelStrip = () => tex('reel', 160, 160 * SYM.length, (g, w, h) => { SYM.forEach((s, i) => { g.fillStyle = i % 2 ? '#14161d' : '#1c1f29'; g.fillRect(0, i * 160, w, 160); g.fillStyle = SYM_COL[s]; g.font = s === 'seven' || s === 'bar' ? '900 84px Georgia, serif' : '96px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SYM_CH[s], w / 2, i * 160 + 84); }); });

export function createTableSeat({ scene, camera, player }) {
  const group = new THREE.Group(); group.name = 'table-seat'; group.visible = false; scene.add(group);
  const cardGeo = new THREE.PlaneGeometry(0.1, 0.14), diceGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055), chipGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.008, 18);
  const backMat = new THREE.MeshBasicMaterial({ map: backTex(), side: THREE.FrontSide });
  let s = null; // { kind, at, n (toward the player, xz), r (right), center, cards[], dice[], chips, reels, camTarget }
  const frame = (at) => { // local frame: n = unit vector from the table centre towards the player, r = n rotated to the player's right
    const px = player.pos.x - at.x, pz = player.pos.z - at.z, L = Math.hypot(px, pz) || 1, n = new THREE.Vector2(px / L, pz / L);
    return { n, r: new THREE.Vector2(-n.y, n.x) };
  };
  const at3 = (o, a, b, y = 0.9) => new THREE.Vector3(o.x + s.n.x * a + s.r.x * b, e0() + y, o.z + s.n.y * a + s.r.y * b);

  function makeCard() { // a card = group with a face plane (up) and a back plane (down); rotation.z flips it
    const m = new THREE.Group(), face = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: backTex() })), back = new THREE.Mesh(cardGeo, backMat);
    face.rotation.x = -Math.PI / 2; back.rotation.x = Math.PI / 2; back.position.y = -0.002; m.add(face, back); m.userData.face = face; group.add(m); return m;
  }
  const setFace = (c, label) => { c.userData.face.material.map = label ? cardTex(label) : backTex(); c.userData.face.material.needsUpdate = true; };

  // ---- the modelled table: printed felt layout, shoe, discard tray, chip racks (the roulette table's equivalent for the card and dice tables)
  const FELT = {
    blackjack: { w: 2.5, h: 1.45, draw: (g, w, h) => { g.strokeStyle = '#e3c27a'; g.fillStyle = '#e3c27a'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h * 0.02, h * 0.62, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.beginPath(); g.arc(w / 2, h * 0.02, h * 0.82, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
      g.font = '800 40px Georgia, serif'; g.textAlign = 'center'; g.fillText('BLACKJACK PAYS 3 TO 2', w / 2, h * 0.45); g.font = '600 26px Georgia, serif'; g.fillText('DEALER MUST STAND ON ALL 17s', w / 2, h * 0.53); g.font = '600 22px Georgia, serif'; g.fillText('INSURANCE IS NOT OFFERED · DOUBLE ON ANY TWO CARDS', w / 2, h * 0.6);
      g.beginPath(); g.arc(w / 2, h * 0.84, 54, 0, 6.3); g.stroke(); g.font = '700 22px Georgia, serif'; g.fillText('POSITION', w / 2, h * 0.86); } },
    baccarat: { w: 2.5, h: 1.45, draw: (g, w, h) => { g.strokeStyle = '#e3c27a'; g.fillStyle = '#e3c27a'; g.lineWidth = 6; g.textAlign = 'center';
      [['PLAYER', '1 TO 1', 0.14], ['BANKER', '0.95 TO 1', 0.5], ['TIE', '8 TO 1', 0.86]].forEach(([t, p, x]) => { g.strokeRect(w * (x - 0.12), h * 0.55, w * 0.24, h * 0.34); g.font = '800 40px Georgia, serif'; g.fillText(t, w * x, h * 0.72); g.font = '600 24px Georgia, serif'; g.fillText(p, w * x, h * 0.82); });
      g.font = '700 28px Georgia, serif'; g.fillText('PUNTO BANCO · EIGHT DECKS · 5% BANKER COMMISSION', w / 2, h * 0.2); g.beginPath(); g.arc(w * 0.3, h * 0.34, 46, 0, 6.3); g.arc(w * 0.7, h * 0.34, 46, 0, 6.3); g.stroke(); } },
    craps: { w: 4.6, h: 1.7, draw: (g, w, h) => { g.strokeStyle = '#f2f2f2'; g.fillStyle = '#f2f2f2'; g.lineWidth = 5; g.textAlign = 'center'; g.font = '800 40px Georgia, serif';
      g.strokeRect(w * 0.04, h * 0.7, w * 0.92, h * 0.2); g.fillText('PASS LINE', w * 0.5, h * 0.84); g.strokeRect(w * 0.04, h * 0.45, w * 0.92, h * 0.17); g.font = '700 30px Georgia, serif'; g.fillText("DON'T PASS BAR", w * 0.5, h * 0.575);
      ['4', '5', 'SIX', '8', 'NINE', '10'].forEach((n, i) => { const x = w * (0.1 + i * 0.16); g.strokeRect(x - w * 0.06, h * 0.08, w * 0.12, h * 0.3); g.font = '800 44px Georgia, serif'; g.fillText(n, x, h * 0.27); }); g.font = '600 24px Georgia, serif'; g.fillText('FIELD 2 3 4 9 10 11 12', w * 0.5, h * 0.42); } },
    poker: { w: 2.5, h: 1.45, draw: (g, w, h) => { g.strokeStyle = '#e3c27a'; g.fillStyle = '#e3c27a'; g.lineWidth = 5; g.textAlign = 'center';
      for (let i = 0; i < 5; i++) g.strokeRect(w * (0.2 + i * 0.14), h * 0.37, w * 0.12, h * 0.26); g.font = '800 34px Georgia, serif'; g.fillText("PRIVATE CARD SALON · TEXAS HOLD'EM", w / 2, h * 0.18); g.font = '600 24px Georgia, serif'; g.fillText('ANTE · BET 2 UNITS · ONE RAISE PER STREET', w / 2, h * 0.27);
      g.beginPath(); g.arc(w * 0.5, h * 0.78, 50, 0, 6.3); g.stroke(); g.font = '700 22px Georgia, serif'; g.fillText('POT', w * 0.5, h * 0.8); } },
  };
  function buildTable(kind, at) {
    const f = FELT[kind]; if (!f) return;
    const t = tex(`felt:${kind}`, 1024, Math.round(1024 * f.h / f.w), (g, w, h) => { g.clearRect(0, 0, w, h); f.draw(g, w, h); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; const holder = new THREE.Group(); holder.add(m); holder.position.set(at.x, e0() + 0.886, at.z); holder.rotation.y = Math.atan2(s.n.x, s.n.y); group.add(holder);
    if (kind === 'craps') return;
    const steel = new THREE.MeshBasicMaterial({ color: 0x15171c }), gold = new THREE.MeshBasicMaterial({ color: 0xd8a62a });
    const place = (geo, mat, a, b, y, rotY = 0) => { const o = new THREE.Mesh(geo, mat); o.position.copy(at3(at, a, b, y)); o.rotation.y = Math.atan2(s.n.x, s.n.y) + rotY; group.add(o); return o; };
    if (kind !== 'poker') place(new THREE.BoxGeometry(0.16, 0.1, 0.12), steel, -0.7, 0.9, 0.95); // the shoe
    place(new THREE.BoxGeometry(0.18, 0.012, 0.1), gold, -0.78, -0.9, 0.89); // discard tray
    for (let i = 0; i < 5; i++) { const col = [0xc8102e, 0x1f6fe0, 0x1a9a4a, 0x111111, 0xe3c27a][i]; for (let k = 0; k < 6; k++) place(chipGeo, new THREE.MeshBasicMaterial({ color: col }), -0.8, -0.2 + i * 0.07, 0.89 + k * 0.009); } // dealer's chip rack
    if (kind === 'poker') place(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), new THREE.MeshBasicMaterial({ color: 0xf6f2e6 }), 0.15, 0.7, 0.89); // dealer button
  }

  function begin(kind, at) {
    end();
    s = { kind, at, cards: [], dice: [], chips: [], t: 0, reels: null, shoe: null, ...frame(at), busy: null };
    // you sit on the players' side: blackjack's half-moon always opens towards -z; on the ovals the dealer stands at -z, so never look from behind the dealer
    if (kind === 'blackjack') { s.n.set(0, -1); s.r.set(1, 0); } else if (kind === 'baccarat' || kind === 'poker') { if (s.n.y < 0.3) { s.n.set(s.n.x * 0.6, 1).normalize(); s.r.set(-s.n.y, s.n.x); } }
    const c = new THREE.Vector3(at.x, e0(), at.z);
    // camera: behind the player's own position looking down at the felt (slots: close on the reel window)
    if (kind === 'slots') { const yaw = at.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw); s.cam = new THREE.Vector3(at.x + fx * 1.35, e0() + 1.55, at.z + fz * 1.35); s.look = new THREE.Vector3(at.x + fx * 0.3, e0() + 1.3, at.z + fz * 0.3); buildReels(at, fx, fz); }
    else { const d = kind === 'craps' ? 1.5 : 2.05; s.cam = new THREE.Vector3(at.x + s.n.x * d, e0() + (kind === 'craps' ? 2.7 : 1.75), at.z + s.n.y * d); s.look = new THREE.Vector3(at.x, e0() + 0.86, at.z); s.shoe = at3(at, -0.7, 0.9, 1.0); }
    void c; if (kind !== 'slots') buildTable(kind, at); s.fov = kind === 'craps' ? 55 : 48; s.prevFov = camera.fov; group.visible = true;
  }
  function end() {
    if (!s) return; group.clear(); group.visible = false; camera.fov = s.prevFov; camera.updateProjectionMatrix(); s = null;
  }
  const active = () => Boolean(s);

  // ---- chips for the allocation (1..8 stacked)
  function setChips(stake, kind) {
    if (!s || kind === 'slots') return;
    for (const c of s.chips) group.remove(c); s.chips = [];
    const n = Math.max(1, Math.min(8, Math.ceil(Math.log2(stake / 100 + 1)))), p = at3(s.at, 0.38, kind === 'craps' ? -0.7 : 0.55);
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(chipGeo, new THREE.MeshBasicMaterial({ color: [0xc8102e, 0x1f6fe0, 0x1a9a4a, 0x111111, 0xe3c27a][i % 5] })); m.position.set(p.x, p.y + i * 0.009, p.z); group.add(m); s.chips.push(m); }
  }

  // ---- cards
  async function deal(spots, labels, { delay = 260 } = {}) {
    // spots: [{ pos: Vector3, label | null (null = face down) }] animated from the shoe; resolves when the last card has landed
    const ps = [];
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i], c = makeCard(); setFace(c, sp.label); c.position.copy(s.shoe); c.rotation.z = 0; c.userData.from = s.shoe.clone(); c.userData.to = sp.pos.clone(); c.userData.t = -i * delay / 1000; c.userData.down = !sp.label; s.cards.push(c);
      ps.push(new Promise((ok) => { c.userData.done = ok; }));
    }
    void labels; await Promise.all(ps);
  }
  const flip = (c, label) => { setFace(c, label); c.userData.flip = 0; };

  // ---- dice
  const UP = [null, [0, 0, 0], [0, 0, Math.PI / 2], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0], [0, 0, -Math.PI / 2], [Math.PI, 0, 0]]; // euler to bring face n to +y
  function makeDie() { const m = new THREE.Mesh(diceGeo, [2, 5, 1, 6, 3, 4].map((n) => new THREE.MeshBasicMaterial({ map: dieFace(n) }))); group.add(m); return m; }
  async function roll(a, b) {
    const dice = [makeDie(), makeDie()]; s.dice.push(...dice);
    await Promise.all(dice.map((d, i) => new Promise((ok) => {
      const v = [a, b][i], target = new THREE.Quaternion().setFromEuler(new THREE.Euler(...UP[v])), spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const from = at3(s.at, 1.0, -0.9 + i * 0.25, 1.3), to = at3(s.at, -0.1 + i * 0.05, -0.2 + i * 0.22, 0.89 + 0.0275);
      d.userData = { from, to, target, spin, t: 0, ok, turns: 3 + i };
    })));
  }

  // ---- slots
  function buildReels(at, fx, fz) {
    const g = new THREE.Group(); const yaw = at.yaw ?? 0;
    g.position.set(at.x + fx * 0.55, e0() + 1.3, at.z + fz * 0.55); g.rotation.y = yaw; group.add(g);
    const frameM = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.26, 0.03), new THREE.MeshBasicMaterial({ color: 0xd8a62a })); frameM.position.z = -0.02; g.add(frameM);
    const strips = [];
    for (let i = 0; i < 3; i++) {
      const t = reelStrip().clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1 / SYM.length);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.2), new THREE.MeshBasicMaterial({ map: t })); m.position.set((i - 1) * 0.205, 0, 0); g.add(m); strips.push({ t, off: Math.random(), speed: 0, stop: null });
    }
    s.reels = strips;
  }
  async function spin(result) {
    s.reels.forEach((r, i) => { r.speed = 2.6 + i * 0.4; r.stop = null; });
    await sleep(900);
    for (let i = 0; i < 3; i++) {
      await new Promise((ok) => { const r = s.reels[i], k = SYM.indexOf(result[i]); r.stop = { k, ok, t: 0, from: r.off % 1 }; });
    }
  }

  function update(dt) {
    if (!s) return;
    s.t += dt;
    const k = 1 - Math.exp(-5 * dt); camera.position.lerp(s.cam, k); camera.lookAt(s.look); camera.fov += (s.fov - camera.fov) * k; camera.updateProjectionMatrix();
    for (const c of s.cards) { // slide from the shoe, then flip when asked
      const u = c.userData; if (u.t < 1) { u.t += dt * 2.4; const q = ease(Math.max(0, Math.min(1, u.t))); c.position.lerpVectors(u.from, u.to, q); c.position.y += Math.sin(Math.PI * q) * 0.06; c.rotation.y = (1 - q) * 0.8; if (u.t >= 1 && u.done) { u.done(); u.done = null; } }
      c.rotation.z = u.down ? Math.PI : 0;
      if (u.flip != null && u.flip < 1) { u.flip += dt * 3; const q = Math.min(1, u.flip); c.rotation.z = Math.PI * (1 - q); c.position.y = u.to.y + Math.sin(Math.PI * q) * 0.05; if (q >= 1) { u.flip = null; u.down = false; } }
    }
    for (const d of s.dice) {
      const u = d.userData; if (u.t >= 1) continue; u.t += dt / 1.2; const q = Math.min(1, u.t), e = ease(q);
      d.position.lerpVectors(u.from, u.to, e); d.position.y += Math.sin(Math.PI * Math.min(1, q * 1.15)) * 0.28 * (1 - q * 0.4);
      d.quaternion.copy(u.target).multiply(new THREE.Quaternion().setFromAxisAngle(u.spin, (1 - e) * u.turns * Math.PI * 2));
      if (q >= 1 && u.ok) { d.quaternion.copy(u.target); u.ok(); u.ok = null; }
    }
    if (s.reels) for (const r of s.reels) {
      if (r.stop) { r.stop.t += dt / 0.6; const q = Math.min(1, r.stop.t), cur = Math.floor(r.off) + r.stop.k / SYM.length + (q < 1 ? (1 - ease(q)) * 1.2 : 0); r.off = cur; r.speed = 0; if (q >= 1) { r.off = Math.floor(r.off) + r.stop.k / SYM.length; r.stop.ok(); r.stop = null; } }
      else r.off += r.speed * dt;
      r.t.offset.y = -(r.off % 1) + 0; // strip scroll
    }
  }

  // ---- public per-game scenes (each resolves when its animation has finished)
  async function playBlackjack(view, { reveal = false } = {}) {
    if (!s) return;
    const p = view.player, d = view.dealer;
    while (s.cards.length < p.length + d.length) {
      // deal only the cards that are not on the table yet, in order: player cards, then dealer cards
    const have = s.cards.length, mine = s.cards.filter((c) => c.userData.side === 'p').length;
      void have;
      if (mine < p.length) { const c0 = mine; await deal([{ pos: at3(s.at, 0.5, -0.25 + c0 * 0.13), label: p[c0] }]); const c = s.cards[s.cards.length - 1]; c.userData.side = 'p'; c.userData.idx = c0; c.position.y += 0.0005 * c0; continue; }
      const dc = s.cards.filter((c) => c.userData.side === 'd').length, label = d[dc] === '??' ? null : d[dc];
      await deal([{ pos: at3(s.at, -0.45, -0.2 + dc * 0.13), label }]); const c = s.cards[s.cards.length - 1]; c.userData.side = 'd'; c.userData.idx = dc;
    }
    if (reveal) for (const c of s.cards) if (c.userData.side === 'd' && c.userData.down) { flip(c, d[c.userData.idx]); await sleep(350); }
    // dealer drew extra cards after the reveal: handled by the while loop above on the next call
  }
  async function playBaccarat(r) {
    if (!s) return; const P = r.player, B = r.banker, order = [['p', 0], ['b', 0], ['p', 1], ['b', 1], ['p', 2], ['b', 2]].filter(([w, i]) => (w === 'p' ? P : B)[i]);
    for (const [w, i] of order) { const label = (w === 'p' ? P : B)[i]; await deal([{ pos: at3(s.at, 0.0 + (w === 'p' ? 0.15 : -0.15), (w === 'p' ? -0.55 : 0.55) + i * 0.13), label: null }]); const c = s.cards[s.cards.length - 1]; await sleep(120); flip(c, label); await sleep(380); }
  }
  async function playPoker(v, { showBot = false, botLabels = null } = {}) {
    if (!s) return;
    const have = (side) => s.cards.filter((c) => c.userData.side === side).length;
    for (let i = have('h'); i < v.hole.length; i++) { await deal([{ pos: at3(s.at, 0.55, -0.1 + i * 0.13), label: v.hole[i] }]); const c = s.cards[s.cards.length - 1]; c.userData.side = 'h'; }
    if (have('x') < 2) for (let i = have('x'); i < 2; i++) { await deal([{ pos: at3(s.at, -0.5, -0.1 + i * 0.13), label: null }]); s.cards[s.cards.length - 1].userData.side = 'x'; s.cards[s.cards.length - 1].userData.idx = i; }
    for (let i = have('b'); i < v.board.length; i++) { await deal([{ pos: at3(s.at, 0.0, -0.3 + i * 0.13), label: v.board[i] }]); const c = s.cards[s.cards.length - 1]; c.userData.side = 'b'; }
    if (showBot && botLabels) for (const c of s.cards) if (c.userData.side === 'x' && c.userData.down) { flip(c, botLabels[c.userData.idx]); await sleep(300); }
  }
  async function playCraps(rolls) { if (!s) return; for (const [a, b] of rolls) { for (const d of s.dice) group.remove(d); s.dice = []; await roll(a, b); await sleep(450); } }
  async function playSlots(reels) { if (s?.reels) await spin(reels); }
  const clearHands = () => { if (!s) return; for (const c of s.cards) group.remove(c); s.cards = []; for (const d of s.dice) group.remove(d); s.dice = []; };

  const camPose = () => s && { cam: s.cam.toArray(), look: s.look.toArray(), fov: s.fov };
  return { begin, end, active, update, camPose, setChips, playBlackjack, playBaccarat, playPoker, playCraps, playSlots, clearHands };
}
