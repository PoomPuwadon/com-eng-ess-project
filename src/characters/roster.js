// Character roster — every character type in the firm, built from kit.js (style approved 2026-11-18).
// Each entry: { key, label, note, make() → { char?, robot?, horse?, root, tag? } }.
import * as THREE from 'three';
import { Character, Horse, Robot, mat, gold, texMat, add, rbox, box, cylC, cyl, sph, torus, plane, canvasTex, headPoint, makeTag, rifle, D, HC } from './kit.js';

// even global mix of skin tones (user: "fully international, even mix")
export const SKINS = [0xf3d5c0, 0xe8bf9f, 0xd9a47f, 0xc68a62, 0xa8694a, 0x8a5236, 0x6b3d26, 0x4a2a1a];
export const HAIR_COLORS = [0x141414, 0x2a1b12, 0x4b2e1a, 0x6e3a1c, 0xb48a4a, 0xd9c9a3, 0x8f8f8f];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- accessories
export const A = {
  shirtV(c, color, yBot = 0.3, wTop = 0.2) {
    const s = new THREE.Shape(); s.moveTo(-wTop / 2, 0.62 - 0.45); s.lineTo(wTop / 2, 0.62 - 0.45); s.lineTo(0, yBot - 0.45); s.closePath();
    c.onChest(new THREE.Mesh(new THREE.ShapeGeometry(s), mat(color, { rough: 0.6 })), 0, 0.45, 0.004);
  },
  tie(c, color, len = 0.27) {
    const m = mat(color, { rough: 0.45 });
    c.onChest(new THREE.Mesh(rbox(0.05, 0.04, 0.03, 0.01), m), 0, 0.585, 0.012);
    c.onChest(new THREE.Mesh(rbox(0.055, len, 0.014, 0.006), m), 0, 0.58 - len / 2 - 0.02, 0.012);
  },
  bowTie(c, color) {
    const m = mat(color, { rough: 0.5 });
    for (const s of [-1, 1]) c.onChest(new THREE.Mesh(rbox(0.05, 0.035, 0.02, 0.008), m), s * 0.028, 0.585, 0.014).rotation.z = s * 0.3;
    c.onChest(new THREE.Mesh(rbox(0.02, 0.025, 0.025, 0.006), m), 0, 0.585, 0.018);
  },
  lapels(c, color) {
    for (const s of [-1, 1]) { const l = c.onChest(new THREE.Mesh(rbox(0.05, 0.3, 0.016, 0.006), mat(color, { rough: 0.55 })), s * 0.075, 0.46, 0.01); l.rotation.z = -s * 0.3; }
  },
  buttons(c, color, ys = [0.24, 0.14]) { for (const y of ys) c.onChest(new THREE.Mesh(cylC(0.014, 0.014, 0.01, 8, 'z'), color), 0, y, 0.006); },
  pocketSquare(c) { c.onChest(new THREE.Mesh(rbox(0.06, 0.035, 0.015, 0.005), gold()), 0.14, 0.45, 0.006).rotation.z = 0.2; },
  badge(c) {
    c.onChest(new THREE.Mesh(cylC(0.028, 0.028, 0.012, 14, 'z'), gold()), 0.145, 0.43, 0.01);
    c.onChest(new THREE.Mesh(rbox(0.07, 0.016, 0.01, 0.004), gold()), 0.145, 0.39, 0.008);
  },
  lanyard(c, color, cardTex) {
    const m = mat(color, { rough: 0.7 });
    for (const s of [-1, 1]) { const l = c.onChest(new THREE.Mesh(box(0.016, 0.3, 0.006), m), s * 0.035, 0.45, 0.008); l.rotation.z = s * 0.2; }
    const card = c.onChest(new THREE.Mesh(rbox(0.075, 0.1, 0.008, 0.004), cardTex ? texMat(cardTex) : mat(0xf2f2f2)), 0, 0.27, 0.012);
    card.castShadow = false;
  },
  chestPatch(c, tex, w, h, x, y) { c.onChest(new THREE.Mesh(plane(w, h), texMat(tex, { rough: 0.6 })), x, y, 0.006).castShadow = false; },
  watch(c, arm = 'armL', color) { add(c[arm].elbow, torus(0.056, 0.016, 6, 12), color || gold(), 0, -D.fore + 0.03, 0, Math.PI / 2); },
  chain(c) { const t = add(c.torso, torus(0.1, 0.012, 5, 16), gold(), 0, 0.58, 0.05, Math.PI / 2 - 0.5); t.scale.set(1, 1.3, 1); },
  sunglasses(c, onHead = false) {
    const m = mat(0x0a0a0c, { rough: 0.1, metal: 0.6 }), lat = onHead ? 0.62 : 0.15, k = onHead ? 1.1 : 1.03;
    for (const s of [-1, 1]) { const p = headPoint(lat, s * 0.36, k); add(c.head, rbox(0.075, 0.048, 0.02, 0.012), m, p.x, p.y, p.z, onHead ? -0.6 : 0, s * 0.36); }
    const p = headPoint(lat, 0, k); add(c.head, box(0.1, 0.014, 0.014), m, p.x, p.y + 0.008, p.z, onHead ? -0.6 : 0);
  },
  glasses(c, color = 0x1a1a1a) {
    const m = mat(color, { rough: 0.4, metal: 0.5 });
    for (const s of [-1, 1]) { const p = headPoint(0.15, s * 0.36, 1.04); add(c.head, torus(0.032, 0.006, 4, 12), m, p.x, p.y, p.z, 0, s * 0.36); }
    const p = headPoint(0.16, 0, 1.04); add(c.head, box(0.04, 0.008, 0.008), m, p.x, p.y, p.z);
  },
  cigar(c) {
    add(c.armR.grip, cylC(0.013, 0.013, 0.13, 8, 'z'), mat(0x5a3415, { rough: 0.9 }), 0.02, -0.03, 0.07);
    add(c.armR.grip, sph(0.014, 6, 4), mat(0x220800, { emissive: 0xff5a10, ei: 2.5 }), 0.02, -0.03, 0.137);
  },
  phone(c, arm = 'armR') { add(c[arm].grip, rbox(0.06, 0.12, 0.016, 0.008), mat(0x0d0d0f, { rough: 0.2, metal: 0.5 }), 0, -0.03, 0.045, 0.3); },
  headset(c) {
    const m = mat(0x18181b, { rough: 0.5 });
    add(c.head, torus(D.headR * 1.13, 0.012, 4, 16, Math.PI), m, 0, HC.y + 0.01, -0.01);
    for (const s of [-1, 1]) add(c.head, cylC(0.05, 0.05, 0.035, 12, 'x'), m, s * D.headR * 1.08, HC.y - 0.01, 0);
    add(c.head, box(0.012, 0.012, 0.15), m, -0.13, HC.y - 0.09, 0.08, 0, -0.55);
    add(c.head, sph(0.017, 6, 4), mat(0x2bd17e, { emissive: 0x16a85f, ei: 1 }), -0.075, HC.y - 0.1, 0.15);
  },
  hood(c, color) {
    const m = mat(color, { rough: 0.85 });
    add(c.torso, torus(0.13, 0.055, 6, 12), m, 0, 0.6, -0.07, Math.PI / 2 - 0.45);
    for (const s of [-1, 1]) c.onChest(new THREE.Mesh(box(0.01, 0.13, 0.01), mat(0xeeeeee)), s * 0.04, 0.5, 0.01);
    c.onChest(new THREE.Mesh(rbox(0.24, 0.1, 0.03, 0.01), m), 0, 0.12, 0.01);
  },
  collar(c, color = 0xffffff) { for (const s of [-1, 1]) c.onChest(new THREE.Mesh(rbox(0.06, 0.035, 0.015, 0.006), mat(color)), s * 0.045, 0.6, 0.01).rotation.z = s * 0.5; },
  cuffs(c, color = 0xffffff) { for (const a of ['armL', 'armR']) add(c[a].elbow, cyl(0.054, 0.054, 0.04), mat(color), 0, -D.fore + 0.03, 0); },
  garters(c) { for (const a of ['armL', 'armR']) add(c[a].upper, torus(0.066, 0.01, 4, 12), gold(), 0, -0.16, 0, Math.PI / 2); },
  prop(c, obj, x, y, z, rx = 0) { obj.position.set(x, y, z); obj.rotation.x = rx; c.torso.add(obj); return obj; },
  // Muay Thai
  mongkol(c) {
    const m = mat(0xf4efe4, { rough: 0.7 }), r = mat(0xb31b26, { rough: 0.6 });
    add(c.head, torus(D.headR * 1.04, 0.024, 6, 18), m, 0, HC.y + 0.07, 0, Math.PI / 2 + 0.12);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(c.head, box(0.012, 0.05, 0.05), r, Math.sin(a) * D.headR * 1.04, HC.y + 0.07 - Math.cos(a) * 0.02, Math.cos(a) * D.headR * 1.04, 0, a); }
    add(c.head, rbox(0.03, 0.03, 0.2, 0.01), m, 0, HC.y + 0.02, -D.headR - 0.1, 0.6);
  },
  prajioud(c, color) { for (const a of ['armL', 'armR']) { add(c[a].upper, torus(0.072, 0.02, 6, 12), mat(color), 0, -0.08, 0, Math.PI / 2); add(c[a].upper, rbox(0.02, 0.1, 0.01, 0.004), mat(color), c[a].side * 0.075, -0.14, 0); } },
  shorts(c, color, band = 0xf4efe4) {
    const m = mat(color, { rough: 0.45 });
    for (const l of ['legL', 'legR']) add(c[l].hip, cyl(0.108, 0.1, 0.2), m, 0, 0.02, 0);
    add(c.body, G_band(c.rb), mat(band, { rough: 0.5 }), 0, D.hipY + 0.04, 0);
  },
  gloves(c, color) { for (const a of ['armL', 'armR']) { c[a].hand.material = mat(color, { rough: 0.35 }); c[a].hand.scale.setScalar(1.45); } },
  ankleWraps(c) { for (const l of ['legL', 'legR']) add(c[l].knee, cyl(0.07, 0.07, 0.06), mat(0xf2f2f2), 0, -D.shin + 0.04, 0); },
  jockeyCap(c, color) {
    add(c.head, sph(D.headR * 1.12, 12, 6, 0, Math.PI * 2, 0, 1.45), mat(color, { rough: 0.4 }), HC.x, HC.y, HC.z).scale.set(1, 1.08, 1);
    add(c.head, rbox(0.15, 0.014, 0.09, 0.006), mat(color, { rough: 0.4 }), 0, HC.y + 0.06, D.headR + 0.02, -0.15);
  },
};
const _bands = new Map();
function G_band(rb) { let g = _bands.get(rb); if (!g) { g = new THREE.CylinderGeometry(rb * 1.06, rb * 1.06, 0.07, 8); g.rotateY(Math.PI / 8); g.scale(1, 1, D.depth); _bands.set(rb, g); } return g; }

// ---------------------------------------------------------------- textures
function hawaiianTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#12a3a0'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 10;
      g.fillStyle = '#1f6e3b'; g.beginPath(); g.ellipse(x + r, y + r * 0.6, r * 1.3, r * 0.45, 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = Math.random() < 0.5 ? '#ff5a7a' : '#ffd23f';
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.38, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill();
    }
  });
}
function silksTex(a, b) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 128, 128); g.fillStyle = b;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) { g.beginPath(); g.moveTo(x * 32 + 16, y * 32); g.lineTo(x * 32 + 32, y * 32 + 16); g.lineTo(x * 32 + 16, y * 32 + 32); g.lineTo(x * 32, y * 32 + 16); g.fill(); }
  });
}
const cardTex = (top, text, bg = '#ffffff') => canvasTex(96, 128, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, 96, 128); g.fillStyle = top; g.fillRect(0, 0, 96, 34);
  g.fillStyle = '#222'; g.font = '700 18px Arial'; g.textAlign = 'center'; g.fillText(text, 48, 80);
});
const traderBadge = (n) => canvasTex(128, 80, (g) => { g.fillStyle = '#ffe14d'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#111'; g.font = '800 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 64, 42); });
const newHireTex = () => canvasTex(160, 96, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 96); g.fillStyle = '#d62b2b'; g.fillRect(0, 0, 160, 30); g.fillStyle = '#fff'; g.font = '800 20px Arial'; g.textAlign = 'center'; g.fillText('HELLO, I\'M', 80, 22); g.fillStyle = '#111'; g.font = '700 28px "Comic Sans MS", Arial'; g.fillText('NEW!', 80, 72); });

// ---------------------------------------------------------------- tags
const agentTag = (name, title) => makeTag([{ t: '◉ LIVE AI AGENT', px: 20, c: '#00e5a8', w: 800 }, { t: name, px: 32 }, { t: title, px: 20, c: '#e3c27a', w: 600 }], { bg: 'rgba(8,12,14,.82)', border: '#00e5a8' });
const staffTag = (name) => makeTag([{ t: '★ STAFF', px: 22, c: '#e3c27a', w: 800 }, { t: name, px: 28 }], { bg: 'rgba(14,12,8,.8)', border: '#c9a24a' });
const visitorTag = (name) => makeTag([{ t: name, px: 26, w: 600 }], { bg: 'rgba(10,10,14,.6)', radius: 18 });
const ceoTag = () => makeTag([{ t: '♛ CHIEF EXECUTIVE OFFICER', px: 24, c: '#1a1305', w: 800 }], { bg: 'rgba(240,206,110,.95)', border: '#fff2c4', radius: 20 });
function withTag(char, tag) { tag.position.y = char.tagY; char.root.add(tag); char.tag = tag; return char; }

// ---------------------------------------------------------------- materials shortcuts
const M = (c, o) => mat(c, o);
const skinOf = (s) => s ?? pick(SKINS);

// ---------------------------------------------------------------- principals (players)
export function makeCEO() {
  const cream = M(0xefe4c8, { rough: 0.55 });
  const c = new Character({
    scale: 1.25, build: 'broad', skin: 0xc68a62, hair: 'slick', hairColor: 0x1a1512, face: 'smug', pose: 'cigar',
    top: cream, pants: cream, shoes: M(0xf6f1e6, { rough: 0.3 }),
    extras: [(c) => A.shirtV(c, 0x111114, 0.27, 0.22), (c) => A.tie(c, 0xd9ad3c), (c) => A.lapels(c, 0xe0d0a8), (c) => A.buttons(c, gold()), A.pocketSquare, (c) => A.watch(c, 'armL'), A.chain, (c) => A.sunglasses(c), A.cigar, (c) => A.cuffs(c, 0x111114)],
  });
  return withTag(c, ceoTag());
}
export function makeAdmin(name = 'J. Okonkwo-Lind') {
  const suit = M(0x2a2c32, { rough: 0.6 });
  const c = new Character({
    build: 'broad', skin: 0x8a5236, hair: 'short', hairColor: 0x141414, face: 'neutral', pose: 'admin',
    top: suit, pants: suit, shoes: M(0x0c0c0c, { rough: 0.25 }),
    extras: [(c) => A.shirtV(c, 0xf4f4f4), (c) => A.tie(c, 0x6b1f2e), (c) => A.lapels(c, 0x24262b), A.badge, (c) => A.buttons(c, M(0x111111)), (c) => A.watch(c, 'armL', M(0xc0c0c8, { metal: 0.9, rough: 0.3 }))],
  });
  return withTag(c, staffTag(name));
}
let _haw;
export function makeVisitor(name = 'high_roller_88', skin) {
  _haw ??= texMat(hawaiianTex(), { rough: 0.7 });
  const khaki = M(0xcdb68a, { rough: 0.8 }), sk = skinOf(skin);
  const c = new Character({
    build: 'heavy', skin: sk, hair: pick(['short', 'curly', 'bob', 'buzz']), hairColor: pick(HAIR_COLORS), face: 'happy', pose: 'drink',
    top: _haw, sleeves: _haw, fore: M(sk, { rough: 0.8 }), pants: khaki, thighs: khaki, shins: M(sk, { rough: 0.8 }), shoes: M(0x6b4a2b),
    extras: [(c) => A.sunglasses(c, true), A.chain, (c) => A.lanyard(c, 0xd9ad3c, cardTex('#d9ad3c', 'GUEST')),
      (c) => { for (const l of ['legL', 'legR']) add(c[l].knee, cyl(0.064, 0.064, 0.09), M(0xffffff), 0, -D.shin + 0.06, 0); },
      (c) => {
        const g = new THREE.Group(), glass = M(0xcfefff, { opacity: 0.45, rough: 0.1 });
        add(g, cyl(0.055, 0.006, 0.07, 10, false), glass, 0, 0.07, 0);
        add(g, cyl(0.045, 0.005, 0.055, 10, false), M(0x9be36b, { rough: 0.3 }), 0, 0.075, 0);
        add(g, cyl(0.005, 0.005, 0.07, 6, false), glass);
        add(g, sph(0.012, 6, 4), M(0xc0392b), 0.03, 0.15, 0);
        A.prop(c, g, -0.17, 0.3, 0.31);
      }],
  });
  return withTag(c, visitorTag(name));
}

// ---------------------------------------------------------------- key agents (LLM-driven)
export function makeHeadTrader() {
  const c = new Character({
    build: 'broad', skin: 0xf3d5c0, hair: 'slick', hairColor: 0xb48a4a, face: 'smug', pose: 'twoPhones',
    top: M(0x1d2a44, { rough: 0.5 }), sleeves: M(0x9cc3e6, { rough: 0.7 }), pants: M(0xc7b48a, { rough: 0.8 }), shoes: M(0x5a3417, { rough: 0.4 }),
    extras: [(c) => A.collar(c, 0x9cc3e6), (c) => A.phone(c, 'armR'), (c) => A.phone(c, 'armL'), (c) => A.watch(c, 'armL'),
      (c) => { for (const y of [0.12, 0.24, 0.36, 0.48]) c.onChest(new THREE.Mesh(box(c.rt * 1.6, 0.006, 0.006), M(0x16213a)), 0, y, 0.002); }],
  });
  return withTag(c, agentTag('Chad Whitmore III', 'Head of Trading · OT-01'));
}
export function makeLeadQuant() {
  const blazer = M(0x34363d, { rough: 0.7 });
  const c = new Character({
    build: 'slim', skin: 0x6b3d26, hair: 'afro', hairColor: 0x141414, face: 'focus', pose: 'tablet',
    top: blazer, pants: M(0x2e2f35), shoes: M(0xf2f2f2, { rough: 0.6 }),
    extras: [(c) => A.shirtV(c, 0x8d939c, 0.28, 0.24), (c) => A.hood(c, 0x8d939c), (c) => A.lapels(c, 0x2d2f35), (c) => A.glasses(c, 0xd9ad3c),
      (c) => { const t = new THREE.Group(); add(t, rbox(0.27, 0.19, 0.012, 0.01), M(0x111114)); add(t, plane(0.24, 0.16), new THREE.MeshBasicMaterial({ color: 0x46ffb0 }), 0, 0, 0.007); A.prop(c, t, 0, 0.29, 0.36, -0.6); }],
  });
  return withTag(c, agentTag('Dr. Imani Okafor', 'Lead Probability Scientist · OT-02'));
}
export function makeCFO() {
  const suit = M(0x1a2440, { rough: 0.55 });
  const c = new Character({
    build: 'avg', skin: 0xe8bf9f, hair: 'bob', hairColor: 0x2a1b12, face: 'smug', pose: 'clipboard',
    top: suit, pants: suit, shoes: M(0x7a1222, { rough: 0.3 }),
    extras: [(c) => A.shirtV(c, 0xf4f0e8, 0.34, 0.2), (c) => A.lapels(c, 0x151d35), (c) => A.buttons(c, gold(), [0.26, 0.17, 0.08]), (c) => A.glasses(c, 0x111111), (c) => A.watch(c, 'armR'),
      (c) => { const g = new THREE.Group(); add(g, rbox(0.23, 0.3, 0.014, 0.01), M(0x6b4423)); add(g, plane(0.19, 0.24), M(0xffffff), 0, -0.02, 0.008); add(g, rbox(0.08, 0.03, 0.02, 0.006), gold(), 0, 0.14, 0.01); A.prop(c, g, 0.04, 0.3, 0.34, -0.55); }],
  });
  return withTag(c, agentTag('Margaux Sterling-Wu', 'Chief Financial Officer · OT-05'));
}
// Desk B's Co-Head Trader and the Risk Officer: untagged bodies (the walking AI desk, src/characters/aiTraders.js, adds the live tags)
export function makeCoHeadTrader() {
  return new Character({
    build: 'avg', skin: 0xc68a62, hair: 'pony', hairColor: 0x141414, face: 'focus', pose: 'phone',
    top: M(0x2b3a67, { rough: 0.55 }), sleeves: M(0xe8eef7, { rough: 0.7 }), pants: M(0x2b3a67, { rough: 0.55 }), shoes: M(0xf2f2f2, { rough: 0.5 }),
    extras: [(c) => A.collar(c, 0xe8eef7), (c) => A.tie(c, 0x4285f4, 0.2), (c) => A.phone(c, 'armR'), (c) => A.watch(c, 'armL'), (c) => A.glasses(c, 0x4285f4)],
  });
}
export function makeRiskOfficer() {
  const suit = M(0x1b1d24, { rough: 0.55 });
  return new Character({
    build: 'broad', skin: 0xa8694a, hair: 'bald', face: 'neutral', pose: 'clipboard',
    top: suit, pants: suit, shoes: M(0x0e0e10, { rough: 0.35 }),
    extras: [(c) => A.shirtV(c, 0xf4f0e8, 0.34, 0.2), (c) => A.lapels(c, 0x101218), (c) => A.tie(c, 0xb3262d, 0.24), (c) => A.glasses(c, 0x111111), (c) => A.watch(c, 'armR', gold())],
  });
}
export function makeSecurityChief() {
  const under = M(0x1b1d22, { rough: 0.95 });
  const c = new Character({ build: 'broad', helmet: true, top: under, pants: under, pose: 'cross', armor: { trim: true, chief: true, visor: 0xffcf5a } });
  return withTag(c, agentTag('Cmdr. Rhea Voss', 'Head of Asset Protection · OT-04'));
}

// ---------------------------------------------------------------- background staff (department uniform + random kit)
const JACKETS = [0xd62b2b, 0x1f5fd6, 0x1f9d55, 0xf2c014, 0xef7a1a, 0x7b3fc4];
export function makeTrader(skin) {
  const j = pick(JACKETS), sk = skinOf(skin);
  return new Character({
    build: pick(['avg', 'broad', 'heavy']), skin: sk, hair: pick(['slick', 'short', 'buzz', 'curly', 'bald']), hairColor: pick(HAIR_COLORS), face: 'shout', pose: 'shout',
    top: M(j, { rough: 0.6 }), pants: M(pick([0x1d1f26, 0x2b2b30, 0x3a3f4a])), shoes: M(0x111111, { rough: 0.4 }),
    extras: [(c) => A.shirtV(c, 0xdfe9f5, 0.4, 0.16), (c) => A.tie(c, pick([0x1a1a1a, 0x8a1c2b, 0x2b3a67]), 0.15), (c) => A.chestPatch(c, traderBadge(pick(['GSX', 'KRZ', 'BNK', 'DUD', 'YOL', 'MOON'])), 0.1, 0.062, 0.14, 0.42), (c) => A.phone(c, 'armL')],
  });
}
export function makeQuant(skin) {
  const sk = skinOf(skin);
  return new Character({
    build: pick(['slim', 'avg']), skin: sk, hair: pick(['short', 'bun', 'pony', 'curly', 'long', 'buzz']), hairColor: pick(HAIR_COLORS), face: 'focus', pose: pick(['cross', 'idle', 'tablet']),
    top: M(pick([0xf4f4f4, 0xcfe0f5, 0xd8cdea, 0xe9e4d6])), pants: M(pick([0x8a8270, 0x3a3f4a, 0x24262b])), shoes: M(pick([0x2b1d14, 0xf0f0f0])),
    extras: [(c) => A.collar(c, 0xffffff), (c) => A.lanyard(c, 0x1a6bd6, cardTex('#1a6bd6', 'PRI')), (c) => A.glasses(c)],
  });
}
export function makeOperator(skin) {
  const sk = skinOf(skin), hoodie = Math.random() < 0.5, col = pick([0x2b2f38, 0x4a4f5a, 0x6b1f2e, 0x1f3b5a, 0x3b4a2a]);
  return new Character({
    build: pick(['slim', 'avg', 'heavy']), skin: sk, hair: pick(['short', 'bob', 'pony', 'buzz', 'curly', 'long']), hairColor: pick(HAIR_COLORS), face: 'happy', pose: 'headset',
    top: M(col, { rough: 0.85 }), pants: M(0x2c3e5a, { rough: 0.85 }), shoes: M(0xf2f2f2, { rough: 0.6 }),
    extras: [A.headset, (c) => (hoodie ? A.hood(c, col) : A.collar(c, col)), (c) => A.lanyard(c, 0xd62b2b, cardTex('#d62b2b', 'GCO'))],
  });
}
export function makeDealer(skin) {
  return new Character({
    build: 'avg', skin: skinOf(skin), hair: pick(['slick', 'bun', 'short']), hairColor: pick(HAIR_COLORS), face: 'neutral', pose: 'deal',
    top: M(0x111114, { rough: 0.5 }), sleeves: M(0xf6f6f6, { rough: 0.6 }), pants: M(0x111114), shoes: M(0x0b0b0b, { rough: 0.25 }),
    extras: [(c) => A.shirtV(c, 0xf6f6f6, 0.26, 0.24), (c) => A.bowTie(c, 0x9e1b2b), A.garters, (c) => A.buttons(c, gold(), [0.2, 0.12, 0.04]), (c) => A.chestPatch(c, cardTex('#d9ad3c', 'HOST', '#1a1a1a'), 0.05, 0.065, 0.15, 0.42)],
  });
}
export function makeFired(skin) {
  return new Character({
    build: 'avg', skin: skinOf(skin), hair: pick(['short', 'bob', 'curly']), hairColor: pick(HAIR_COLORS), face: 'cry', pose: 'carry',
    top: M(0x5a5d66, { rough: 0.8 }), pants: M(0x3a3c42), shoes: M(0x1a1a1a),
    extras: [(c) => A.shirtV(c, 0xeeeeee, 0.36), (c) => { A.tie(c, 0x2b3a67, 0.2); c.torso.children.at(-1).rotation.z = 0.35; c.torso.children.at(-1).position.x += 0.04; },
      (c) => {
        const g = new THREE.Group();
        add(g, rbox(0.42, 0.24, 0.3, 0.01), M(0xb08a57, { rough: 0.95 }));
        add(g, cyl(0.04, 0.03, 0.08, 8, false), M(0xb5562e), -0.1, 0.1, 0);
        add(g, sph(0.08, 7, 5), M(0x3f8f3a), -0.1, 0.24, 0);
        add(g, rbox(0.12, 0.1, 0.012, 0.004), gold(), 0.08, 0.15, -0.04, -0.2);
        add(g, cylC(0.035, 0.035, 0.07, 10), M(0xffffff), 0.12, 0.13, 0.07);
        A.prop(c, g, 0, 0.18, 0.36);
      }],
  });
}
export function makeNewHire(skin) {
  const suit = M(0x22305a, { rough: 0.6 });
  return new Character({
    build: 'slim', skin: skinOf(skin), hair: pick(['short', 'pony', 'bob']), hairColor: pick(HAIR_COLORS), face: 'happy', pose: 'drink',
    top: suit, pants: suit, shoes: M(0x111111, { rough: 0.3 }),
    extras: [(c) => A.shirtV(c, 0xffffff), (c) => A.tie(c, 0xd62b2b), (c) => A.lapels(c, 0x1b274a), (c) => A.chestPatch(c, newHireTex(), 0.12, 0.072, 0.13, 0.42),
      (c) => { const g = new THREE.Group(); add(g, cyl(0.045, 0.036, 0.13, 10, false), M(0xffffff)); add(g, cyl(0.047, 0.044, 0.05, 10, false), M(0x8a5a2b), 0, 0.04, 0); add(g, cyl(0.048, 0.048, 0.015, 10, false), M(0x222222), 0, 0.13, 0); A.prop(c, g, -0.17, 0.27, 0.31); }],
  });
}

// ---------------------------------------------------------------- Asset Protection
export function makeGuard({ frontOfHouse = false } = {}) {
  const under = M(0x1b1d22, { rough: 0.95 });
  return new Character({ build: 'broad', helmet: true, top: under, pants: under, pose: 'rifle', armor: frontOfHouse ? { trim: true, visor: 0xfff0c0 } : { visor: 0xff2a2a }, extras: [rifle] });
}

// ---------------------------------------------------------------- arena talent
export function makeFighter(corner = 'red', skin) {
  const col = corner === 'red' ? 0xc81e2a : 0x1f4fd6, sk = skinOf(skin), sm = M(sk, { rough: 0.7 });
  return new Character({
    build: 'avg', skin: sk, hair: pick(['buzz', 'short', 'bald']), hairColor: 0x141414, face: 'focus', pose: 'fight',
    top: sm, sleeves: sm, pants: M(col, { rough: 0.45 }), thighs: sm, shins: sm, shoes: sm,
    extras: [A.mongkol, (c) => A.prajioud(c, col), (c) => A.shorts(c, col), (c) => A.gloves(c, col), A.ankleWraps],
  });
}
/** a player in a live VT-03 bout (user, 2026-11-18): the fighter kit for the round only, guard pose;
 * the skin tone follows the name so a player keeps the same look round after round */
export function makeBoxer(corner = 'red', name = '') {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = makeFighter(corner, SKINS[h % SKINS.length]);
  c.pose = 'box'; c.fighter = corner;
  return c;
}
export function makeReferee(skin) {
  return new Character({
    build: 'avg', skin: skinOf(skin), hair: 'short', hairColor: 0x8f8f8f, face: 'focus', pose: 'ref',
    top: M(0xf2f2f2, { rough: 0.7 }), pants: M(0x141414), shoes: M(0x0b0b0b, { rough: 0.3 }),
    extras: [(c) => A.bowTie(c, 0x111111), (c) => A.collar(c), (c) => A.buttons(c, M(0x222222), [0.4, 0.3, 0.2, 0.1])],
  });
}
export function makeJockeyOnHorse(skin) {
  const s = silksTex('#ffd23f', '#7b1fa2'), sm = texMat(s, { rough: 0.4 });
  const horse = new Horse({ coat: 0x6b3a1f, dark: 0x1e1410, cloth: 0x7b1fa2, number: 7 });
  const scale = 0.88;
  const j = new Character({
    scale, build: 'slim', skin: skinOf(skin), hair: 'short', hairColor: 0x141414, face: 'focus', pose: 'ride',
    top: sm, sleeves: sm, hands: M(0xf2f2f2), pants: M(0xf2f2f2), thighs: M(0xf2f2f2), shins: M(0x0b0b0b, { rough: 0.3 }), shoes: M(0x0b0b0b, { rough: 0.3 }),
    extras: [(c) => A.jockeyCap(c, 0xffd23f)],
  });
  j.root.position.set(0, horse.saddleY - D.hipY * scale + 0.02, -0.08);
  horse.body.add(j.root);
  return { horse, jockey: j, root: horse.root };
}

// ---------------------------------------------------------------- random kit (background staff)
const STAFF_MAKERS = [makeTrader, makeQuant, makeOperator, makeDealer];
export const makeRandomStaff = () => pick(STAFF_MAKERS)();
export { Robot };

/** The player's own avatar for a role: CEO (one tycoon), admins (dark suit + badge), everyone else the visitor look. */
export function avatarFor(role, name) {
  if (role === 'ceo') return makeCEO();
  if (role === 'admin') return makeAdmin(name || 'Staff');
  return makeVisitor(name || 'you');
}
