import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Lux, LM, plaque, graniteTex } from '../world/lux.js';
import { marketBoard } from '../world/lobbyScreens.js';
import { buildTradingScreens, tcell } from '../world/tradingScreens.js';
import { luxLiftHall, ceiling } from './luxHall.js';

// ================================================================= PHASE 1 — OT-01 TRADING FLOOR
// Stylised exchange floor in the tone of the user's reference: warm tan oak floor, cream walls and a
// cream coffered ceiling with warm light panels, a heavy gunmetal truss grid with diagonals, yellow
// pendant lamps, a recessed bay of blue windows on the back (west) wall with the navy firm banner
// and the bell balcony, the flag on the north wall, a hanging bell sign over the aisle.
// The trading posts keep the hollow-ring design approved from the real exchange photo (base wall →
// ring counter → open gap → crown of screens → logo band → ring deck), recoloured grey with red
// accent stripes and blue screens. Every screen samples one sharp, static atlas (no text overlap).
// The lift hall (X -50..-35) is rebuilt in the same style; The Link checkpoint sits in a recess.
// World coords: trading space X -109..-50, Z -39..39, H 12. The aisle |Z| < 6 runs west from the portal.

const H = 11.7; // underside of the ceiling slab
const G = [-104, -88, -72, -56]; // N-S trusses / column lines
const B = [-36, -28, -20.75, -12, -4, 4, 12, 20.75, 28, 36]; // E-W trusses
const SKIN = ['#d8a47f', '#c68c62', '#8d5a3b', '#f0c8a0', '#b07850'].map((c) => new THREE.Color(c).getHex());
const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x8a6a40];
const JACKETS = [0x2f62b8, 0x7fb2e5, 0x1f2a44, 0x2f62b8, 0x2f7a4a, 0x3b5a8a];

// ---------------------------------------------------------------- materials for this floor
function tex(key, w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function initMaterials() {
  if (LM.oak) return;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const oak = tex('oak', 512, 512, (g, w, h) => { // warm tan planks, 0.25 m wide (texture = 4 m)
    const r = rng(31), tones = ['#d9a066', '#cf9558', '#e2ac70', '#c98d50', '#d49c5e'];
    for (let row = 0; row < 16; row++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 128 + r() * 140;
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x, row * 32, len, 32);
        for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(120,70,30,${0.05 + r() * 0.08})`; g.fillRect(x, row * 32 + r() * 30, len, 1); }
        g.fillStyle = 'rgba(90,50,20,0.45)'; g.fillRect(x, row * 32, 1.5, 32);
        x += len;
      }
      g.fillStyle = 'rgba(90,50,20,0.35)'; g.fillRect(0, row * 32, w, 1);
    }
  });
  const win = tex('window', 32, 256, (g, w, h) => { // daylight gradient for the blue window bay
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#a9d2ff'); grd.addColorStop(0.55, '#5c97e0'); grd.addColorStop(1, '#3b6fc0');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, false);
  Object.assign(LM, {
    oak: std({ map: oak, roughness: 0.6, metalness: 0, envMapIntensity: 0.3 }),
    cream: std({ color: 0xe3d2ae, roughness: 0.85, metalness: 0, envMapIntensity: 0.7 }),
    terrazzo: std({ map: graniteTex('terrazzoTan', '#b08f68', [150, 120, 85]), roughness: 0.72, metalness: 0, envMapIntensity: 0.25 }),
    creamDeep: std({ color: 0xe2d0aa, roughness: 0.8, metalness: 0 }),
    gunmetal: std({ color: 0x4a4f57, roughness: 0.42, metalness: 0.6 }),
    gunDark: std({ color: 0x2f3339, roughness: 0.5, metalness: 0.5 }),
    navy: std({ color: 0x1c2a4e, roughness: 0.6, metalness: 0.05 }),
    redAccent: std({ color: 0xb3262d, roughness: 0.45, metalness: 0.1 }),
    satin: std({ color: 0xb9bdc3, roughness: 0.3, metalness: 0.85 }),
    ceilPanel: std({ color: 0xffe7a8, emissive: 0xffcf70, emissiveIntensity: 0.62, roughness: 0.6 }),
    windowBlue: std({ map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.85, roughness: 0.1, metalness: 0.2 }),
    pendantShell: std({ color: 0xf0bb2a, roughness: 0.35, metalness: 0.45 }),
    pendantGlow: std({ color: 0xfff3d0, emissive: 0xffd77a, emissiveIntensity: 2.0 }),
    postPaint: std({ vertexColors: true, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide }),
  });
}

// ---------------------------------------------------------------- helpers
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a)); // facing away from a centre
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
function fitFont(g, text, maxW, size, weight, family) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 8);
}
function stdTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// ---------------------------------------------------------------- trading posts
// Post dimensions (R = outer radius of the counter).
const Y = { counter: 1.1, crown0: 2.7, crown1: 4.2, logo1: 5.0 };
const N_CROWN = 16, N_ARM = 14, N_IN = 8, N_STAND = 4, N_STOOL = 10;
const PC = { base: 0x8a9099, counter: 0xdcd6c8, red: 0xb3262d, mat: 0x24365e, dark: 0x30343a, crown: 0x6b717a, under: 0x3a3e45, deck: 0xa8adb4, rail: 0xc9ccd1, tray: 0x4a4e55, key: 0x17191d, chrome: 0xb8bcc2, seat: 0x1c2a4e };
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const at = (geo, x, y, z) => { geo.translate(x, y, z); return geo; };
const ring = (r0, r1, y, n, up = true) => new THREE.RingGeometry(r0, r1, n).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0);
const tube = (r, h, y, n, rTop = r) => new THREE.CylinderGeometry(rTop, r, h, n, 1, true).translate(0, y + h / 2, 0);
// a monitor back plate behind a screen plane (r = radius of the screen, a = angle, inward = faces the centre)
function monitorBack(r, a, y, w, h, tilt, inward) {
  const yaw = yawOut(a) + (inward ? Math.PI : 0);
  const g = new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.05);
  g.translate(0, 0, -0.035); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-tilt, yaw, 0, 'YXZ')));
  const [x, z] = polar(r, a);
  return at(g, x, y, z);
}
function postTemplate(R) {
  const p = [];
  const add = (g, c) => p.push(colored(g, c));
  add(tube(R, Y.counter, 0, 32), PC.base); // base wall
  add(tube(R + 0.005, 0.12, 0.08, 32), PC.red); // red kick stripe
  add(tube(R - 1.0, Y.counter, 0, 32), PC.base); // inner face of the counter ring
  add(ring(R - 1.0, R + 0.25, Y.counter, 32), PC.counter); // counter top
  add(tube(R + 0.26, 0.08, Y.counter - 0.08, 32), PC.red); // red counter edge
  add(ring(R - 2.3, R - 1.0, 0.025, 32), PC.mat); // navy mat inside the ring
  for (let i = 0; i < 8; i++) { // thin supports carrying the crown (the open gap)
    const [x, z] = polar(R - 0.7, (i / 8) * Math.PI * 2 + 0.2);
    add(at(new THREE.BoxGeometry(0.14, Y.crown0 - Y.counter, 0.14), x, (Y.counter + Y.crown0) / 2, z), PC.dark);
  }
  add(new THREE.CylinderGeometry(R + 0.5, R - 0.2, Y.crown1 - Y.crown0, N_CROWN, 1, true).translate(0, (Y.crown0 + Y.crown1) / 2, 0), PC.crown); // crown (screens sit on it)
  add(new THREE.CylinderGeometry(R - 0.17, R - 0.2, 0.14, N_CROWN, 1, true).translate(0, Y.crown0 + 0.07, 0).scale(1.0, 1, 1.0), PC.red); // red stripe at the crown foot
  add(ring(R - 1.3, R - 0.2, Y.crown0, 32, false), PC.under); // crown underside
  add(tube(R - 1.3, Y.logo1 - Y.crown0, Y.crown0, 32), PC.crown); // crown inner face
  add(ring(R - 1.3, R + 0.85, Y.logo1, 32), PC.deck); // top deck, open in the middle
  add(tube(R + 0.86, 0.1, Y.logo1 - 0.1, 32), PC.red); // red deck edge
  add(tube(R + 0.82, 0.45, Y.logo1, 32), PC.rail); // deck railing
  add(tube(R - 1.25, 0.35, Y.logo1, 32), PC.rail);
  for (let i = 0; i < 6; i++) { // cable trays on the deck
    const a = (i / 6) * Math.PI * 2 + 0.5, [x, z] = polar(R - 0.2, a);
    add(at(new THREE.BoxGeometry(0.35, 0.18, 1.9).rotateY(Math.PI / 2 - a), x, Y.logo1 + 0.1, z), PC.tray);
  }
  for (let i = 0; i < N_ARM; i++) { // monitor arms on the counter (outer edge) + backs + keyboards
    const a = (i / N_ARM) * Math.PI * 2, [x, z] = polar(R - 0.45, a);
    add(at(new THREE.BoxGeometry(0.06, 0.36, 0.06), x, Y.counter + 0.18, z), PC.dark);
    add(monitorBack(R - 0.42, a, Y.counter + 0.55, 0.62, 0.4, 0.15, false), PC.dark);
    const [kx, kz] = polar(R - 0.05, a);
    add(at(new THREE.BoxGeometry(0.45, 0.04, 0.45).rotateY(Math.PI / 2 - a), kx, Y.counter + 0.02, kz), PC.key);
  }
  for (let i = 0; i < N_IN; i++) { const a = ((i + 0.5) / N_IN) * Math.PI * 2; add(monitorBack(R - 1.15, a, Y.counter + 0.45, 0.7, 0.45, 0.15, true), PC.dark); }
  for (let i = 0; i < N_STAND; i++) { // free-standing monitor stands outside
    const a = (i / N_STAND) * Math.PI * 2 + 0.39, [x, z] = polar(R + 1.3, a);
    add(at(new THREE.BoxGeometry(0.08, 1.3, 0.08), x, 0.65, z), PC.dark);
    add(at(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 8), x, 0.02, z), PC.dark);
    add(monitorBack(R + 1.3, a, 1.55, 0.75, 0.48, 0, true), PC.dark);
  }
  for (let i = 0; i < N_STOOL; i++) { // stools
    const [x, z] = polar(R + 0.75, (i / N_STOOL) * Math.PI * 2 + 0.15);
    add(at(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), x, 0.36, z), PC.chrome);
    add(at(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 10), x, 0.75, z), PC.seat);
  }
  return mergeGeometries(p);
}
// base-wall lettering and member-logo band (made-up names only); every label measured to fit its segment
let LETTER = null, LOGOS = null;
function letteringTexture() {
  return LETTER ||= stdTexture(2048, 96, (g, w, h) => {
    g.fillStyle = '#1c2a4e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3262d'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.fillStyle = '#f0e4c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) { fitFont(g, '{FIRM NAME} MEMBERS EXCHANGE', w / 2 - 80, 46, '600', 'Georgia, serif'); g.fillText('{FIRM NAME} MEMBERS EXCHANGE', w / 4 + (i * w) / 2, h / 2 + 2); }
  });
}
function logoTexture() {
  return LOGOS ||= stdTexture(2048, 128, (g, w, h) => {
    const segs = [['#1c2a4e', '#ffffff', '{FIRM NAME}', '#ffc65a'], ['#f0e4c8', '#1c2a4e', 'QUANTRIX', '#b3262d'], ['#b3262d', '#ffffff', 'ROSEMONT & CO', null],
      ['#1c2a4e', '#ffffff', 'ALPHAGATE', '#4fd1ff'], ['#f0e4c8', '#1c2a4e', '{FIRM NAME}', '#b3262d'], ['#0b1e5b', '#ffffff', 'BLUE CHIP PARTNERS', null],
      ['#1c2a4e', '#ffffff', 'LIQUIDITY LABS', '#3dff7a'], ['#f0e4c8', '#b3262d', 'Thinkwell Equity', null]];
    const sw = w / segs.length;
    segs.forEach(([bg, fg, t, mark], i) => {
      g.fillStyle = bg; g.fillRect(i * sw, 0, sw, h);
      g.fillStyle = '#2f3339'; g.fillRect(i * sw, 0, 3, h);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitFont(g, t, sw - (mark ? 64 : 28), 40, 'bold', 'sans-serif');
      g.fillText(t, i * sw + sw / 2 - (mark ? 14 : 0), h / 2 + 3);
      if (mark) { g.fillStyle = mark; g.fillRect(i * sw + sw - 40, 18, 22, 6); g.fillRect(i * sw + sw - 24, 18, 6, 22); }
    });
  });
}
function flagTexture() {
  return stdTexture(1024, 540, (g, w, h) => {
    const sh = h / 13;
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#b22234'; g.fillRect(0, i * sh, w, Math.ceil(sh)); }
    const cw = w * 0.4, ch = sh * 7;
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#f4f1ea';
    const star = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.4 : r, a = -Math.PI / 2 + (k * Math.PI) / 5; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    for (let row = 0; row < 9; row++) { const n = row % 2 ? 5 : 6; for (let k = 0; k < n; k++) star(cw * ((k * 2 + (row % 2 ? 2 : 1)) / 12), ch * ((row + 1) / 10), sh * 0.32); }
  });
}

function posts(ctx, L) {
  const e = ctx.e;
  const BIG = [], MED = [];
  for (const x of [-97, -80, -63]) for (const z of [-29, -12.5, 12.5]) BIG.push([x, z]);
  MED.push([-97, 26.8], [-80, 26.8]);
  const letterMat = new THREE.MeshStandardMaterial({ map: letteringTexture(), roughness: 0.5, emissive: 0xffffff, emissiveMap: letteringTexture(), emissiveIntensity: 0.15 });
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false });
  const m4 = new THREE.Matrix4();
  const screens = [];
  let k = 0;
  const CROWN_KINDS = ['CHART', 'QUOTE', 'CANDLES', 'QUOTE', 'BARS', 'HEAT', 'CHART', 'BOOK'];
  for (const [list, R] of [[BIG, 6], [MED, 4.5]]) {
    const parts = [
      [postTemplate(R), LM.postPaint],
      [new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.55, 48, 1, true).translate(0, 0.62, 0), letterMat], // lettering on the base wall
      [new THREE.CylinderGeometry(R + 0.86, R + 0.52, Y.logo1 - Y.crown1, N_CROWN, 1, true).translate(0, (Y.crown1 + Y.logo1) / 2, 0), logoMat], // logo band
    ];
    for (const [geo, m] of parts) {
      const inst = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach(([x, z], i) => inst.setMatrixAt(i, m4.makeTranslation(x, e, z)));
      inst.computeBoundingSphere();
      ctx.add(inst, geo);
    }
    const rMid = R + 0.15, ap = rMid * Math.cos(Math.PI / N_CROWN), fw = 2 * rMid * Math.sin(Math.PI / N_CROWN) * 0.94;
    const tilt = -Math.atan(0.7 / (Y.crown1 - Y.crown0)), fh = ((Y.crown1 - Y.crown0) / Math.cos(tilt)) * 0.9;
    list.forEach(([cx, cz], pi) => {
      ctx.colliders.push({ x0: cx - R - 0.3, x1: cx + R + 0.3, z0: cz - R - 0.3, z1: cz + R + 0.3, y0: e, y1: e + Y.counter + 0.3 });
      for (let i = 0; i < N_CROWN; i++) { // crown facets, tilted down towards the floor
        const a = Math.PI / 2 - ((i + 0.5) / N_CROWN) * Math.PI * 2, [x, z] = polar(ap + 0.04, a);
        screens.push({ x: cx + x, y: e + (Y.crown0 + Y.crown1) / 2, z: cz + z, yaw: yawOut(a), w: fw, h: fh, tilt, cell: tcell(pick(CROWN_KINDS, i + pi * 3), k++) });
      }
      for (let i = 0; i < N_ARM; i++) { // monitors on the arms, facing the traders outside
        const a = (i / N_ARM) * Math.PI * 2, [x, z] = polar(R - 0.42, a);
        screens.push({ x: cx + x, y: e + Y.counter + 0.55, z: cz + z, yaw: yawOut(a), w: 0.62, h: 0.4, tilt: 0.15, cell: tcell(i % 2 ? 'CANDLES' : 'CHART', k++) });
      }
      for (let i = 0; i < N_IN; i++) { // specialists' monitors inside the ring
        const a = ((i + 0.5) / N_IN) * Math.PI * 2, [x, z] = polar(R - 1.15, a);
        screens.push({ x: cx + x, y: e + Y.counter + 0.45, z: cz + z, yaw: yawOut(a) + Math.PI, w: 0.7, h: 0.45, tilt: 0.15, cell: tcell(i % 2 ? 'BOOK' : 'QUOTE', k++) });
      }
      for (let i = 0; i < N_STAND; i++) { // free-standing monitors
        const a = (i / N_STAND) * Math.PI * 2 + 0.39, [x, z] = polar(R + 1.3, a);
        screens.push({ x: cx + x + Math.cos(a) * 0.01, y: e + 1.55, z: cz + z + Math.sin(a) * 0.01, yaw: yawOut(a) + Math.PI, w: 0.75, h: 0.48, cell: tcell('QUOTE', k++) });
      }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.8, [x, z] = polar(R - 0.2, a); L.box(cx + x - 0.05, cx + x + 0.05, Y.logo1, 9.5, cz + z - 0.05, cz + z + 0.05, 'gunDark'); } // cable drops
      const nIn = R > 5 ? 8 : 6, nC = R > 5 ? 13 : 10, n2 = R > 5 ? 12 : 9;
      for (let i = 0; i < nIn; i++) { // specialists inside
        const a = (i / nIn) * Math.PI * 2 + 0.3, [x, z] = polar(R - 1.8 + (i % 2) * 0.25, a);
        L.person(cx + x, cz + z, { yaw: yawOut(a), suit: pick([0x1f2a44, 0x3a3f47, 0x2f62b8], i + pi), skin: pick(SKIN, i * 3 + pi), hair: pick(HAIR, i + pi * 2), fidget: 0.6 });
      }
      for (let i = 0; i < nC; i++) { // traders packed against the counter
        const a = (i / nC) * Math.PI * 2 + 0.1 + pi * 0.37, [x, z] = polar(R + 0.85 + (i % 3) * 0.12, a);
        L.person(cx + x, cz + z, { yaw: yawOut(a) + Math.PI, suit: pick(JACKETS, i + pi * 2), skin: pick(SKIN, i + pi), hair: pick(HAIR, i * 2 + pi), fidget: 1 });
      }
      for (let i = 0; i < n2; i++) { // a second rank pushing in behind them
        const a = ((i + 0.5) / n2) * Math.PI * 2 + pi * 0.53;
        if ([0, 1, 2, 3].some((s) => Math.abs(Math.atan2(Math.sin(a - (s / 4) * Math.PI * 2 - 0.39), Math.cos(a - (s / 4) * Math.PI * 2 - 0.39))) < 0.14)) continue; // monitor stands
        const [x, z] = polar(R + 1.7 + (i % 2) * 0.2, a);
        L.person(cx + x, cz + z, { yaw: yawOut(a) + Math.PI, suit: pick(JACKETS, i * 5 + pi), skin: pick(SKIN, i * 2 + pi), hair: pick(HAIR, i + pi), fidget: 1 });
      }
    });
  }
  for (const m of buildTradingScreens(screens)) ctx.add(m, m.geometry);
  return screens.length;
}

// ---------------------------------------------------------------- lift hall (shared Phase 1 design, see luxHall.js)
const OTP = { wall: 'cream', wallDeep: 'creamDeep', panel: 'ceilPanel', frame: 'gunmetal', frameDark: 'gunDark', dado: 'navy', cap: 'redAccent',
  floor: 'terrazzo', runner: 'navy', edge: 'redAccent', liner: 'satin', ink: '#1c2a4e', kioskBg: '#0d1a33', kioskBtn: '#1c2a4e', kioskEdge: '#b3262d' };
function liftHall(ctx, L) {
  luxLiftHall(ctx, L, {
    s: -1, H, P: OTP, ceo: 'ceo',
    banks: [['ot_low', 'OFFICE LOW-RISE · B1 · L · 1–2', true], ['ot_high', 'OFFICE HIGH-RISE · L · 3–5', true], ['freight_ot', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['ot_low', ['B1', 'L', '1', '2']], ['ot_high', ['L', '3', '4', '5']]],
    link: { text: 'THE LINK  →  WELLNESS TOWER', id: 'ot_bridge_checkpoint' },
    portalText: 'TRADING FLOOR', portalSub: 'Open outcry · 24/7 · Members & cleared guests',
    board: (c, x, y, z, yaw, w, h) => marketBoard(c, x, y, z, yaw, w, h, 'US EQUITIES'),
    pylon: (list) => { for (const m of buildTradingScreens(list.map((it, i) => ({ ...it, cell: tcell(it.k ? 'QUOTE' : 'CHART', i * 5) })))) ctx.add(m, m.geometry); },
  });
}

// ---------------------------------------------------------------- the crowd and the clutter
const POSTS = [[-97, -29, 6], [-97, -12.5, 6], [-97, 12.5, 6], [-80, -29, 6], [-80, -12.5, 6], [-80, 12.5, 6], [-63, -29, 6], [-63, -12.5, 6], [-63, 12.5, 6], [-97, 26.8, 4.5], [-80, 26.8, 4.5]];
const RUNNER = [0xe8e2d0, 0x7fb2e5, 0xf0c23a, 0x2f62b8, 0x9b2d30, 0x2f7a4a, 0xd8d8d8];
const person = (L, r, x, z, o = {}) => L.person(x, z, { suit: pick(JACKETS, Math.floor(r() * 99)), skin: pick(SKIN, Math.floor(r() * 99)), hair: pick(HAIR, Math.floor(r() * 99)), ...o });

// broker booths along the walls: counter, monitors facing the broker, a quote board on a canopy rail
// facing the floor, a broker behind every segment. axis: the wall the row runs along.
function boothRow(L, scr, ctx, r, { along, a0, a1, wall, dir }) {
  // dir: +1 = the floor is on the + side of the wall coordinate. Broker stands at wall+dir*0.55,
  // counter from wall+dir*1.0 to wall+dir*1.9, board rail at wall+dir*1.95.
  const P = (a, d) => (along === 'z' ? [wall + dir * d, a] : [a, wall + dir * d]);
  const B = (a0_, a1_, d0, d1, y0, y1, m, o) => { const [x0, z0] = P(a0_, d0), [x1, z1] = P(a1_, d1); L.box(x0, x1, y0, y1, z0, z1, m, o); };
  const yawFloor = along === 'z' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const n = Math.floor((a1 - a0) / 2.8);
  for (let i = 0; i < n; i++) {
    const s0 = a0 + i * 2.8 + 0.2, s1 = s0 + 2.4, sm = (s0 + s1) / 2;
    B(s0, s1, 1.0, 1.9, 0, 1.0, 'gunmetal', { collide: true });
    B(s0 - 0.03, s1 + 0.03, 0.97, 1.93, 1.0, 1.05, 'cream');
    B(s0 - 0.03, s1 + 0.03, 1.92, 1.935, 0.82, 0.92, 'redAccent');
    for (const k of [-0.8, 0, 0.8]) { // monitors facing the broker (backs to the floor)
      const [mx, mz] = P(sm + k, 1.25);
      B(sm + k - 0.3, sm + k + 0.3, 1.27, 1.31, 1.05, 1.45, 'gunDark');
      scr.push({ x: mx - (along === 'z' ? dir * 0.0 : 0), y: ctx.e + 1.25, z: mz, yaw: yawFloor + Math.PI, w: 0.55, h: 0.34, tilt: 0.1, cell: tcell(pick(['CHART', 'QUOTE', 'CANDLES', 'BOOK'], i + Math.round(k * 2)), Math.floor(r() * 999)) });
      const [ux, uz] = P(sm + k, 1.235);
      scr[scr.length - 1].x = ux; scr[scr.length - 1].z = uz;
    }
    for (const k of [-1.1, 1.1]) B(sm + k - 0.04, sm + k + 0.04, 1.85, 1.93, 1.05, 2.9, 'gunDark'); // canopy rail posts
    B(s0, s1, 1.85, 1.95, 2.25, 2.95, 'navy');
    const [bx, bz] = P(sm, 1.96);
    scr.push({ x: bx, y: ctx.e + 2.6, z: bz, yaw: yawFloor, w: 2.1, h: 0.6, cell: tcell(pick(['QUOTE', 'BOOK', 'CHART'], i), Math.floor(r() * 999)) });
    const [px, pz] = P(sm + (r() - 0.5) * 0.8, 0.55);
    person(L, r, px, pz, { yaw: yawFloor, fidget: 0.8 });
    if (r() < 0.45) { const [qx, qz] = P(sm + (r() > 0.5 ? 0.9 : -0.9), 2.45); person(L, r, qx, qz, { yaw: yawFloor + Math.PI, fidget: 1 }); } // a trader at the counter
  }
}

// monitor pods: poles with back-to-back screens dropped into the gaps between the posts
function pods(L, scr, ctx, r, n = 26) {
  const spots = [];
  const ok = (x, z) => Math.abs(z) > 5.8 && x > -104.5 && x < -54.5 && z > -37.4 && z < 34.8
    && POSTS.every(([px, pz, R]) => Math.hypot(x - px, z - pz) > R + 2.6)
    && G.every((gx) => [-20.75, 20.75].every((gz) => Math.hypot(x - gx, z - gz) > 1.6))
    && !(x > -69 && x < -53 && z > 17.5 && z < 32) && spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 3.2);
  for (let t = 0; t < 4000 && spots.length < n; t++) { const x = -104.5 + r() * 50, z = -37.4 + r() * 72.2; if (ok(x, z)) spots.push([x, z]); }
  for (const [x, z] of spots) {
    const yaw = r() * Math.PI;
    L.cyl(x, z, 0.32, 0, 0.05, 'gunDark', { seg: 10 }); L.cyl(x, z, 0.05, 0.05, 2.05, 'gunmetal', { seg: 6 });
    ctx.colliders.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: ctx.e, y1: ctx.e + 2 });
    for (const s of [0, Math.PI]) {
      const a = yaw + s, dx = Math.sin(a) * 0.07, dz = Math.cos(a) * 0.07;
      const g = new THREE.BoxGeometry(0.9, 0.58, 0.05); g.rotateY(a); g.translate(x, 1.78, z); L.geo(g, 'gunDark');
      scr.push({ x: x + dx * 0.55, y: ctx.e + 1.78, z: z + dz * 0.55, yaw: a, w: 0.84, h: 0.52, cell: tcell(pick(['QUOTE', 'CHART', 'CANDLES', 'HEAT'], Math.floor(r() * 9)), Math.floor(r() * 999)) });
      if (r() < 0.8) person(L, r, x + Math.sin(a) * 0.9, z + Math.cos(a) * 0.9, { yaw: a + Math.PI, fidget: 1 });
    }
  }
  return spots.length;
}

// trading slips all over the floor (one instanced mesh)
function paper(ctx, r, count = 2600) {
  const geo = new THREE.PlaneGeometry(0.12, 0.08).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z;
    if (i % 3) { const [px, pz, R] = POSTS[i % POSTS.length], a = r() * Math.PI * 2, d = R + 0.4 + Math.pow(r(), 1.6) * 3.4; x = px + Math.cos(a) * d; z = pz + Math.sin(a) * d; }
    else { x = -106 + r() * 54; z = (r() - 0.5) * 11; }
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    mesh.setMatrixAt(i, m4.compose(p.set(x, ctx.e + 0.016 + r() * 0.004, z), q, s));
    mesh.setColorAt(i, c.set(pick([0xffffff, 0xf6f0dc, 0xfff6b0, 0xe6f0ff, 0xffd6d6], i)));
  }
  mesh.computeBoundingSphere();
  ctx.add(mesh, geo, mat);
}

// people on the move: runners circling the posts, traffic in the aisle, pacing along the booths
function walkers(L, r) {
  const loop = (cx, cz, rad, n, cw) => Array.from({ length: n }, (_, k) => { const a = ((cw ? -k : k) / n) * Math.PI * 2; return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]; });
  let n = 0;
  for (const [px, pz, R] of POSTS) for (let k = 0; k < 3; k++) {
    const pts = loop(px, pz, R + 2.3 + r() * 0.35, 16, k % 2 === 1);
    const st = Math.floor(r() * 16); // start somewhere round the ring
    person(L, r, pts[st][0], pts[st][1], { suit: pick(RUNNER, n++), walk: [...pts.slice(st), ...pts.slice(0, st)], speed: 1.4 + r() * 1.3 });
  }
  for (let k = 0; k < 28; k++) { // aisle traffic
    const a = -104 + r() * 22, b = -76 + r() * 22, z1 = (r() - 0.5) * 9, z2 = (r() - 0.5) * 9;
    const pts = r() < 0.5 ? [[a, z1], [b, z1], [b, z2], [a, z2]] : [[b, z1], [a, z1], [a, z2], [b, z2]];
    person(L, r, pts[0][0], pts[0][1], { suit: pick(r() < 0.5 ? RUNNER : JACKETS, k), walk: pts, speed: 1.1 + r() * 1.2 });
  }
  for (const [x0, z0, x1, z1] of [[-104, 35.6, -56, 35.6], [-104, 35.0, -60, 35.0], [-105.2, -28, -105.2, 28], [-53.6, -35, -53.6, -10], [-53.6, 10, -53.6, 35]]) for (let k = 0; k < 2; k++) { // pacing in front of the booths
    const pts = [[x0, z0], [x1, z1], [x1 + (z0 === z1 ? 0 : 0.6), z1 + (z0 === z1 ? -0.6 : 0)], [x0 + (z0 === z1 ? 0 : 0.6), z0 + (z0 === z1 ? -0.6 : 0)]];
    person(L, r, x0, z0, { suit: pick(RUNNER, k + 3), walk: k ? [...pts.slice(2), ...pts.slice(0, 2)] : pts, speed: 1.0 + r() * 0.8 });
  }
  for (let k = 0; k < 10; k++) { // the lift hall: arrivals, departures, the Link
    const z = (r() - 0.5) * 66, z2 = z + (r() - 0.5) * 8, pts = [[-44, z], [z2 > -27 && z2 < -19.5 ? -40.2 : -36.6, z2], [-44.5, (r() - 0.5) * 3], [-52, (r() - 0.5) * 3], [-44.5, (r() - 0.5) * 3]];
    person(L, r, pts[0][0], pts[0][1], { suit: pick([0x1f2a44, 0x3a3f47, 0x2f62b8, 0x111418], k), walk: pts, speed: 1.1 + r() * 0.5 });
  }
}

// ================================================================= OT-01
export function trading(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true }; // this floor is lit without sun shadows

  // ---- floor: warm tan oak, navy + red inlay stripes across the aisle
  L.floor(-108.9, -50.1, -38.9, 38.9, 0.012, 'oak', 4);
  for (const x of [-60, -72, -88]) for (const [o, m] of [[-0.55, 'navy'], [-0.25, 'redAccent'], [0.05, 'navy'], [0.35, 'redAccent']]) L.box(x + o, x + o + 0.14, 0.012, 0.022, -6, 6, m);
  L.box(-50.14, -49.56, 0.012, 0.03, -7.96, 7.96, 'gunmetal'); // threshold under the portal

  // ---- walls: cream plaster, gunmetal pilasters on the truss lines, skirting, cornice
  const pil = (x0, x1, z0, z1) => L.box(x0, x1, 0, H - 0.15, z0, z1, 'gunmetal');
  for (const [z, s] of [[-38.9, 1], [38.9, -1]]) { // north / south
    const zf = z, zb = z - s * 0.06;
    L.box(-108.9, -50.1, 0, H - 0.15, Math.min(zf, zb), Math.max(zf, zb), 'cream');
    L.box(-108.9, -50.1, 0, 0.3, Math.min(zf, zf + s * 0.06), Math.max(zf, zf + s * 0.06), 'gunmetal');
    L.box(-108.9, -50.1, H - 0.9, H - 0.7, Math.min(zf, zf + s * 0.12), Math.max(zf, zf + s * 0.12), 'gunmetal');
    for (const x of G) pil(x - 0.4, x + 0.4, Math.min(zf, zf + s * 0.32), Math.max(zf, zf + s * 0.32));
  }
  L.box(-108.96, -108.9, 0, H - 0.15, -38.9, 38.9, 'cream'); // west
  L.box(-108.9, -108.84, 0, 0.3, -38.9, -30.3, 'gunmetal'); L.box(-108.9, -108.84, 0, 0.3, 30.3, 38.9, 'gunmetal');
  L.box(-50.1, -50.04, 0, H - 0.15, -38.9, -8.6, 'cream'); L.box(-50.1, -50.04, 0, H - 0.15, 8.6, 38.9, 'cream'); // portal wall
  L.box(-50.1, -50.04, 8.6, H - 0.15, -8.6, 8.6, 'cream');
  L.box(-50.16, -50.1, 0, 0.3, -38.9, -8.6, 'gunmetal'); L.box(-50.16, -50.1, 0, 0.3, 8.6, 38.9, 'gunmetal');
  for (const zz of [-34, -26, -18, 18, 26, 34]) L.box(-50.4, -50.1, 0, H - 0.15, zz - 0.4, zz + 0.4, 'gunmetal');
  // the portal: gunmetal frame through the wall, red band
  for (const s of [-1, 1]) L.box(-50.14, -49.56, 0, 8.6, s < 0 ? -8.6 : 7.96, s < 0 ? -7.96 : 8.6, 'gunmetal', { collide: true });
  L.box(-50.14, -49.56, 7.96, 8.6, -8.6, 8.6, 'gunmetal');
  for (const x of [-50.152, -49.56]) L.box(x, x + 0.012, 8.15, 8.3, -8.6, 8.6, 'redAccent');
  marketBoard(ctx, -50.16, 9.85, 0, -Math.PI / 2, 15, 2.8, 'FIRM POSITIONS');

  // ---- back (west) wall: recessed bays of tall blue windows, navy banner + bell balcony between them
  for (const [za, zb] of [[-29.6, -8.6], [8.6, 29.6]]) {
    const pane = new THREE.PlaneGeometry(zb - za, 8.8).rotateY(Math.PI / 2); pane.translate(-108.86, 6.2, (za + zb) / 2); L.geo(pane, 'windowBlue');
    const n = Math.round((zb - za) / 2.6);
    for (let i = 1; i < n; i++) { const zz = za + (i * (zb - za)) / n; L.box(-108.86, -108.7, 1.8, 10.6, zz - 0.07, zz + 0.07, 'gunmetal'); }
    for (const y of [4.7, 7.6]) L.box(-108.86, -108.72, y - 0.06, y + 0.06, za, zb, 'gunmetal');
    L.box(-108.9, -108.0, 1.2, 1.8, za - 0.6, zb + 0.6, 'gunmetal'); L.box(-108.02, -107.99, 1.62, 1.72, za - 0.6, zb + 0.6, 'redAccent'); // sill
    L.box(-108.9, -108.0, 10.6, 11.2, za - 0.6, zb + 0.6, 'gunmetal'); // head
    for (const zz of [za - 0.6, zb]) L.box(-108.9, -108.0, 1.8, 10.6, zz, zz + 0.6, 'gunmetal'); // jambs
  }
  L.box(-108.9, -108.8, 5.6, 11.2, -7.6, 7.6, 'navy'); L.box(-108.8, -108.78, 5.6, 6.0, -7.6, 7.6, 'redAccent');
  plaque(ctx, '{FIRM NAME}', -108.76, 9.0, 0, Math.PI / 2, { h: 1.5, color: '#f3e7cc', sub: 'Members Exchange' });
  // bell balcony
  L.box(-108.9, -104.0, 4.2, 4.6, -6, 6, 'gunmetal', { collide: true });
  L.box(-104.1, -104.0, 3.6, 4.6, -6, 6, 'navy'); L.box(-104.0, -103.985, 3.72, 3.84, -6, 6, 'redAccent');
  for (const zz of [-5.5, 5.5]) L.box(-104.8, -104.4, 0, 4.2, zz - 0.2, zz + 0.2, 'gunmetal', { collide: true });
  for (let zz = -6; zz <= 6.01; zz += 1.5) L.box(-104.3, -104.22, 4.6, 5.6, zz - 0.04, zz + 0.04, 'gold');
  L.box(-104.32, -104.2, 5.55, 5.66, -6, 6, 'gold');
  plaque(ctx, 'THE BELL · RUNG ON EVERY TRADE · 24/7', -103.97, 4.12, 0, Math.PI / 2, { h: 0.34, color: '#f3e7cc' });
  L.box(-108.8, -106.3, 6.85, 6.97, -0.06, 0.06, 'gunmetal'); // bell bracket
  L.cyl(-106.5, 0, 0.45, 5.9, 6.5, 'gold', { rTop: 0.2, seg: 14 }); L.cyl(-106.5, 0, 0.2, 6.5, 6.75, 'gold', { rTop: 0.08, seg: 10 });
  L.box(-105.4, -104.9, 4.6, 5.7, -0.5, 0.5, 'walnut'); // lectern
  for (const [zz, suit] of [[-2.2, 0x1c2a4e], [1.6, 0x2f62b8], [3.4, 0x3a3f47]]) L.person(-105.6, zz, { y: 4.6, yaw: Math.PI / 2, suit, skin: pick(SKIN, zz * 3), hair: pick(HAIR, zz) });

  // ---- flag (north wall) and market boards between the pilasters
  { const ft = flagTexture(); const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 });
    const fmesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.8), fm); fmesh.position.set(-80, ctx.e + 7.9, -38.84); ctx.add(fmesh, fmesh.geometry, fm, ft);
    L.box(-85.9, -74.1, 10.85, 10.97, -38.9, -38.7, 'gunmetal'); }
  for (const [x, z, yaw] of [[-96, -38.84, 0], [-64, -38.84, 0], [-96, 38.84, Math.PI], [-80, 38.84, Math.PI]]) {
    marketBoard(ctx, x, 6.7, z, yaw, 13, 3.6, x === -96 ? 'US EQUITIES' : 'FIRM POSITIONS');
    L.box(x - 6.7, x + 6.7, 4.74, 4.84, Math.min(z, z + Math.cos(yaw) * 0.12), Math.max(z, z + Math.cos(yaw) * 0.12), 'gunmetal');
  }

  // ---- ceiling, truss grid, columns, pendant lamps
  ceiling(L, OTP, H, -108.9, -50.1, -38.9, 38.9, 3.9);
  const Y0 = 9.5, Y1 = 11.15, P = 2.6;
  const member = (ax, ay, az, bx, by, bz, s, m = 'gunmetal') => {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const g = new THREE.BoxGeometry(s, s, len);
    g.lookAt(new THREE.Vector3(bx - ax, by - ay, bz - az)); g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    L.geo(g, m);
  };
  for (const x of G) { // N-S trusses
    L.box(x - 0.15, x + 0.15, Y1 - 0.25, Y1, -38.9, 38.9, 'gunmetal'); L.box(x - 0.15, x + 0.15, Y0, Y0 + 0.25, -38.9, 38.9, 'gunmetal');
    const n = Math.round(77.8 / P);
    for (let i = 0; i <= n; i++) { const z = -38.9 + (i * 77.8) / n; L.box(x - 0.08, x + 0.08, Y0 + 0.25, Y1 - 0.25, z - 0.08, z + 0.08, 'gunmetal');
      if (i < n) { const z2 = -38.9 + ((i + 1) * 77.8) / n; i % 2 ? member(x, Y0 + 0.25, z, x, Y1 - 0.25, z2, 0.14) : member(x, Y1 - 0.25, z, x, Y0 + 0.25, z2, 0.14); } }
  }
  for (const z of B) { // E-W trusses (slightly slimmer chords, so crossings never share a face)
    L.box(-108.9, -50.1, Y1 - 0.235, Y1 - 0.015, z - 0.11, z + 0.11, 'gunmetal'); L.box(-108.9, -50.1, Y0 + 0.015, Y0 + 0.235, z - 0.11, z + 0.11, 'gunmetal');
    const n = Math.round(58.8 / P);
    for (let i = 0; i <= n; i++) { const x = -108.9 + (i * 58.8) / n; if (G.some((g) => Math.abs(g - x) < 0.5)) continue; L.box(x - 0.07, x + 0.07, Y0 + 0.235, Y1 - 0.235, z - 0.07, z + 0.07, 'gunmetal');
      if (i < n) { const x2 = -108.9 + ((i + 1) * 58.8) / n; i % 2 ? member(x, Y0 + 0.235, z, x2, Y1 - 0.235, z, 0.12) : member(x, Y1 - 0.235, z, x2, Y0 + 0.235, z, 0.12); } }
  }
  for (const x of G) for (const z of [-20.75, 20.75]) { // columns with base plates and knee braces
    L.box(x - 0.45, x + 0.45, 0, Y0, z - 0.45, z + 0.45, 'gunmetal', { collide: true });
    L.box(x - 0.7, x + 0.7, 0, 0.3, z - 0.7, z + 0.7, 'gunDark');
    L.box(x - 0.47, x + 0.47, 1.0, 1.08, z - 0.47, z + 0.47, 'redAccent');
    for (const s of [-1, 1]) { member(x, 7.6, z + s * 0.4, x, Y0, z + s * 2.2, 0.22); member(x + s * 0.4, 7.6, z, x + s * 2.2, Y0, z, 0.22); }
  }
  for (const x of G) for (const z of [-34, -28, -16, -10, -4, 4, 10, 16, 28, 34]) { // yellow pendant lamps
    L.box(x - 0.015, x + 0.015, 8.42, Y0, z - 0.015, z + 0.015, 'gunDark');
    L.cyl(x, z, 0.44, 8.0, 8.42, 'pendantShell', { rTop: 0.12, seg: 12 });
    const d = new THREE.CircleGeometry(0.4, 16).rotateX(Math.PI / 2); d.translate(x, 7.99, z); L.geo(d, 'pendantGlow');
  }
  // hanging bell sign over the aisle
  { const sx = -72;
    L.box(sx - 0.25, sx + 0.25, 7.0, 8.7, -3.2, 3.2, 'navy');
    for (const y of [7.0, 8.62]) L.box(sx - 0.28, sx + 0.28, y - 0.04, y + 0.08, -3.24, 3.24, 'gold');
    L.box(sx - 0.27, sx + 0.27, 7.12, 7.24, -3.2, 3.2, 'redAccent');
    for (const zz of [-2.6, 2.6]) L.box(sx - 0.03, sx + 0.03, 8.7, Y0, zz - 0.03, zz + 0.03, 'gunDark');
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) plaque(ctx, '{FIRM NAME}', sx + (yaw > 0 ? 0.26 : -0.26), 7.95, 0, yaw, { h: 0.9, color: '#f3e7cc', sub: 'Ring the bell' });
    L.cyl(sx, 0, 0.36, 6.25, 6.75, 'gold', { rTop: 0.16, seg: 14 }); L.box(sx - 0.02, sx + 0.02, 6.75, 7.0, -0.02, 0.02, 'gunDark'); }

  // ---- TV broadcast booth on a platform (south-east), rope stanchions in front
  L.box(-67, -55, 0, 1.0, 20.5, 30.5, 'gunmetal', { collide: true });
  L.box(-67.02, -54.98, 0.86, 0.96, 20.48, 30.52, 'redAccent');
  for (const [x0, x1, z0, z1] of [[-67, -55, 20.5, 20.62], [-67, -66.88, 20.5, 30.5], [-55.12, -55, 20.5, 30.5]]) { L.box(x0, x1, 1.0, 4.0, z0, z1, 'glass'); ctx.colliders.push({ x0, x1, z0, z1, y0: ctx.e + 1, y1: ctx.e + 4 }); }
  L.box(-67, -55, 1.0, 4.0, 30.3, 30.5, 'navy'); // back panel
  L.box(-67.4, -54.6, 4.0, 4.5, 20.1, 30.9, 'navy'); L.box(-67.42, -54.58, 4.08, 4.2, 20.08, 30.92, 'redAccent');
  plaque(ctx, '{FIRM NAME} TV · LIVE FROM THE FLOOR', -61, 4.27, 20.07, Math.PI, { h: 0.34, color: '#f3e7cc' });
  L.box(-64, -58, 1.0, 1.8, 25, 26.2, 'cream'); L.box(-64.05, -57.95, 1.8, 1.86, 24.95, 26.25, 'gunmetal'); // anchor desk
  for (const x of [-63, -61, -59]) L.person(x, 27, { y: 1.0, yaw: Math.PI, suit: pick([0x1c2a4e, 0xb3262d, 0x3a3f47], x), skin: pick(SKIN, x), hair: pick(HAIR, x) });
  marketBoard(ctx, -61, 2.85, 30.28, Math.PI, 5.6, 1.9, 'FIRM TV');
  L.box(-61.15, -60.85, 0, 1.6, 17.25, 17.55, 'gunDark'); L.box(-61.4, -60.6, 1.6, 2.1, 17.0, 17.8, 'gunDark'); // camera
  for (let x = -68; x <= -54; x += 2.8) L.box(x - 0.06, x + 0.06, 0, 1.0, 18.94, 19.06, 'gold', { collide: true });
  L.box(-68, -54, 0.84, 0.9, 18.96, 19.04, 'redAccent'); // rope

  // ---- posts, people in the aisle
  const n = posts(ctx, L);
  const r = rng(2024), scr = [];
  boothRow(L, scr, ctx, r, { along: 'z', a0: -29.6, a1: -8.6, wall: -108.0, dir: 1 }); // window wall (in front of the sills)
  boothRow(L, scr, ctx, r, { along: 'z', a0: 8.6, a1: 29.6, wall: -108.0, dir: 1 });
  boothRow(L, scr, ctx, r, { along: 'z', a0: -37.5, a1: -10, wall: -50.4, dir: -1 }); // portal wall
  boothRow(L, scr, ctx, r, { along: 'z', a0: 10, a1: 37.5, wall: -50.4, dir: -1 });
  boothRow(L, scr, ctx, r, { along: 'x', a0: -107.5, a1: -52.5, wall: 38.9, dir: -1 }); // south wall
  const nPods = pods(L, scr, ctx, r);
  for (const m of buildTradingScreens(scr)) ctx.add(m, m.geometry);
  paper(ctx, r);
  walkers(L, r);
  ctx.tradingScreens = n + scr.length; ctx.tradingPods = nPods;

  liftHall(ctx, L);
  L.build();
}
