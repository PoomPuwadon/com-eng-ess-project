import * as THREE from 'three';
import { CH, tickerMaterial } from '../world/screens.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Office Tower: X -110..-30. The lift hall is the strip X -50..-30; main spaces are X -110..-50.
// Everything here is in world coordinates except control() (old tower coords, shifted +30).
const DESK = 0x5a4632, SUIT = 0x1f2a44, SCREENCASE = 0x111111, GOLD = 0xc9a23a;
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a)); // screen facing away from a centre

function deskRows(ctx, x0, x1, z0, z1, { pitchX = 2, pitchZ = 5, channels = [CH.TICKER, CH.CHART], npcEvery = 3, aisleX = null } = {}) {
  let n = 0;
  for (let zz = z0; zz <= z1; zz += pitchZ) {
    for (let x = x0; x <= x1; x += pitchX) {
      if (aisleX != null && Math.abs(x - aisleX) < 3) continue;
      ctx.box(x - 0.8, x + 0.8, 0, 0.75, zz - 0.45, zz + 0.45, DESK);
      ctx.deco(x - 0.8, x + 0.8, 0.75, 1.3, zz - 0.42, zz - 0.36, SCREENCASE);
      ctx.screen(x - 0.4, 1.05, zz - 0.35, 0, 0.75, 0.45, channels[n % channels.length]);
      ctx.screen(x + 0.4, 1.05, zz - 0.35, 0, 0.75, 0.45, channels[(n + 1) % channels.length]);
      if (n % npcEvery === 0) ctx.npc(x, zz + 1.0, SUIT, Math.PI);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- OT-01 Trading Floor
// Modelled on the user's photo of a real exchange floor. Each trading post is a big HOLLOW ring:
//   plain dark base wall with the firm's name lettered round it (no screens) →
//   waist-high ring counter with a blue-lit edge, monitors on arms, keyboards; stools outside →
//   an OPEN GAP on thin supports (you see the specialists working inside) →
//   a raised CROWN of large data screens tilted down at the floor →
//   a sloped band of member logos above it →
//   a flat grey ring DECK on top with a railing and cable trays, open in the middle;
//   cable bundles drop from the ceiling. Light parquet floor with inlaid blue/black stripes,
//   a glass TV broadcast booth on a platform, rope stanchions. Posts are big and crowded.
// World coords: X -109..-50.3, Z -39..39, H 12. The aisle from the lift-hall portal (|Z| < 6) stays clear.
const STEEL = 0x4b4f57, STEEL_D = 0x3a3e45, NAVY = 0x1b2438;
const BASE = 0x262a31, COUNTER = 0x3a3f47, BLUE_EDGE = 0x3d8fd6, CROWN = 0x30343b, DECK = 0x5f646d;

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
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// Post dimensions (R = outer radius of the counter).
const Y = { counter: 1.1, crown0: 2.7, crown1: 4.2, logo1: 5.0 };
const N_CROWN = 16, N_ARM = 14, N_IN = 8, N_STAND = 4, N_STOOL = 10;

// Structure of one post (identical posts share it through instancing).
function postTemplate(R) {
  const p = [];
  const add = (g, c) => p.push(colored(g, c));
  add(tube(R, Y.counter, 0, 32), BASE); // base wall
  add(tube(R - 1.0, Y.counter, 0, 32), BASE); // inner face of the counter ring
  add(ring(R - 1.0, R + 0.25, Y.counter, 32), COUNTER); // counter top
  add(tube(R + 0.26, 0.07, Y.counter - 0.07, 32), BLUE_EDGE); // blue-lit edge
  add(ring(R - 2.3, R - 1.0, 0.025, 32), 0x2c4a7a); // blue mat inside the ring
  for (let i = 0; i < 8; i++) { // thin supports carrying the crown (the open gap)
    const [x, z] = polar(R - 0.7, (i / 8) * Math.PI * 2 + 0.2);
    add(at(new THREE.BoxGeometry(0.14, Y.crown0 - Y.counter, 0.14), x, (Y.counter + Y.crown0) / 2, z), 0x1e2126);
  }
  add(new THREE.CylinderGeometry(R + 0.5, R - 0.2, Y.crown1 - Y.crown0, N_CROWN, 1, true).translate(0, (Y.crown0 + Y.crown1) / 2, 0), CROWN); // crown (screens sit on it)
  add(ring(R - 1.3, R - 0.2, Y.crown0, 32, false), 0x1e2126); // crown underside
  add(tube(R - 1.3, Y.logo1 - Y.crown0, Y.crown0, 32), CROWN); // crown inner face
  add(ring(R - 1.3, R + 0.85, Y.logo1, 32), DECK); // top deck, open in the middle
  add(tube(R + 0.82, 0.45, Y.logo1, 32), 0x8a8f98); // deck railing
  add(tube(R - 1.25, 0.35, Y.logo1, 32), 0x8a8f98);
  for (let i = 0; i < 6; i++) { // cable trays on the deck
    const a = (i / 6) * Math.PI * 2 + 0.5, [x, z] = polar(R - 0.2, a);
    add(at(new THREE.BoxGeometry(0.35, 0.18, 1.9).rotateY(Math.PI / 2 - a), x, Y.logo1 + 0.1, z), 0x44484f);
  }
  for (let i = 0; i < N_ARM; i++) { // monitor arms on the counter (outer edge)
    const [x, z] = polar(R - 0.45, (i / N_ARM) * Math.PI * 2);
    add(at(new THREE.BoxGeometry(0.06, 0.36, 0.06), x, Y.counter + 0.18, z), 0x1e2126);
    const [kx, kz] = polar(R - 0.05, (i / N_ARM) * Math.PI * 2);
    add(at(new THREE.BoxGeometry(0.45, 0.04, 0.45).rotateY(Math.PI / 2 - (i / N_ARM) * Math.PI * 2), kx, Y.counter + 0.02, kz), 0x15171b); // keyboard
  }
  for (let i = 0; i < N_STAND; i++) { // free-standing monitor stands outside
    const [x, z] = polar(R + 1.3, (i / N_STAND) * Math.PI * 2 + 0.39);
    add(at(new THREE.BoxGeometry(0.08, 1.3, 0.08), x, 0.65, z), 0x1e2126);
    add(at(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 8), x, 0.02, z), 0x1e2126);
  }
  for (let i = 0; i < N_STOOL; i++) { // stools
    const [x, z] = polar(R + 0.75, (i / N_STOOL) * Math.PI * 2 + 0.15);
    add(at(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), x, 0.36, z), 0x8a8f98);
    add(at(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 10), x, 0.75, z), 0x15171b);
  }
  return mergeGeometries(p);
}

// Canvas bands: the base-wall lettering and the member-logo band (made-up names only).
function bandTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
let LETTER = null, LOGOS = null;
function letteringTexture() {
  return LETTER ||= bandTexture(2048, 96, (g, w, h) => {
    g.fillStyle = '#262a31'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9dde3'; g.font = '600 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) g.fillText('{FIRM NAME} MEMBERS EXCHANGE', w / 4 + (i * w) / 2, h / 2 + 2);
  });
}
function logoTexture() {
  return LOGOS ||= bandTexture(2048, 128, (g, w, h) => {
    const segs = [['#111418', '#ffffff', '{FIRM NAME}', '#4fd1ff'], ['#111418', '#ffffff', 'QUANTRIX', '#ffc65a'], ['#b3171f', '#ffffff', 'ROSEMONT & CO', null],
      ['#111418', '#ffffff', 'ALPHAGATE', '#4fd1ff'], ['#111418', '#ffffff', '{FIRM NAME}', '#4fd1ff'], ['#0b1e5b', '#ffffff', 'BLUE CHIP PARTNERS', null],
      ['#111418', '#ffffff', 'LIQUIDITY LABS', '#3dff7a'], ['#111418', '#5ad1e6', 'Thinkwell Equity', null]];
    const sw = w / segs.length;
    segs.forEach(([bg, fg, t, mark], i) => {
      g.fillStyle = bg; g.fillRect(i * sw, 0, sw, h);
      g.fillStyle = '#000'; g.fillRect(i * sw, 0, 3, h);
      g.fillStyle = fg; g.font = `bold ${t.length > 12 ? 30 : 40}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, i * sw + sw / 2, h / 2 + 4);
      if (mark) { g.fillStyle = mark; g.fillRect(i * sw + sw - 40, 18, 22, 6); g.fillRect(i * sw + sw - 24, 18, 6, 22); }
    });
  });
}
function parquetTexture() {
  return bandTexture(512, 512, (g) => {
    const tones = ['#d9b47c', '#cfa86e', '#e2bf88', '#c99f63'];
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) { // basket weave: 4 planks per block, alternating
      const vert = (bx + by) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = tones[(bx * 3 + by * 5 + k) % 4];
        if (vert) g.fillRect(bx * 128 + k * 32, by * 128, 32, 128); else g.fillRect(bx * 128, by * 128 + k * 32, 128, 32);
        g.fillStyle = 'rgba(90,60,30,0.35)';
        if (vert) g.fillRect(bx * 128 + k * 32, by * 128, 1.5, 128); else g.fillRect(bx * 128, by * 128 + k * 32, 128, 1.5);
      }
    }
  });
}

export function trading(ctx) {
  const e = ctx.e, H = ctx.floor.height;
  // ---- light parquet floor with inlaid stripes across the aisle
  const ft = parquetTexture(); ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(58.7 / 3, 78 / 3);
  const fg = new THREE.PlaneGeometry(58.7, 78).rotateX(-Math.PI / 2);
  const fm = new THREE.MeshLambertMaterial({ map: ft });
  const floor = new THREE.Mesh(fg, fm); floor.position.set(-79.65, e + 0.02, 0);
  ctx.add(floor, fg, fm, ft);
  for (const x of [-60, -72, -88]) for (const [o, c] of [[-0.55, 0x15171b], [-0.25, 0x5aa9e6], [0.05, 0x15171b], [0.35, 0x5aa9e6]]) ctx.deco(x + o, x + o + 0.14, 0.025, 0.035, -6, 6, c);

  // ---- trading posts: 9 big (R 6, 12.5 m across) + 2 medium (R 4.5), crowded round the aisle
  const BIG = [], MED = [];
  for (const x of [-97, -80, -63]) for (const z of [-29, -12.5, 12.5]) BIG.push([x, z]);
  MED.push([-97, 26.8], [-80, 26.8]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const letterMat = new THREE.MeshBasicMaterial({ map: letteringTexture(), toneMapped: false });
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false });
  const m4 = new THREE.Matrix4();
  let screens = 0;
  for (const [list, R] of [[BIG, 6], [MED, 4.5]]) {
    const parts = [
      [postTemplate(R), mat],
      [new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.55, 48, 1, true).translate(0, 0.62, 0), letterMat], // lettering on the base wall
      [new THREE.CylinderGeometry(R + 0.86, R + 0.52, Y.logo1 - Y.crown1, N_CROWN, 1, true).translate(0, (Y.crown1 + Y.logo1) / 2, 0), logoMat], // logo band
    ];
    for (const [geo, m] of parts) {
      const inst = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach(([x, z], i) => inst.setMatrixAt(i, m4.makeTranslation(x, e, z)));
      inst.computeBoundingSphere();
      ctx.add(inst, geo);
    }
    // crown screen facets: tilted down towards the floor
    const rMid = R + 0.15, ap = rMid * Math.cos(Math.PI / N_CROWN), fw = 2 * rMid * Math.sin(Math.PI / N_CROWN) * 0.94;
    const tilt = -Math.atan(0.7 / (Y.crown1 - Y.crown0)), fh = (Y.crown1 - Y.crown0) / Math.cos(tilt) * 0.9;
    list.forEach(([cx, cz], pi) => {
      ctx.colliders.push({ x0: cx - R - 0.3, x1: cx + R + 0.3, z0: cz - R - 0.3, z1: cz + R + 0.3, y0: e, y1: e + Y.counter + 0.3 });
      for (let i = 0; i < N_CROWN; i++) {
        const a = Math.PI / 2 - ((i + 0.5) / N_CROWN) * Math.PI * 2; // facet centres of the 16-sided crown
        const [x, z] = polar(ap + 0.04, a);
        ctx.screen(cx + x, (Y.crown0 + Y.crown1) / 2, cz + z, yawOut(a), fw, fh, [CH.TICKER, CH.CHART, CH.PNL, CH.TICKER][(i + pi) % 4], tilt);
      }
      for (let i = 0; i < N_ARM; i++) { // monitors on the arms, facing the traders outside
        const a = (i / N_ARM) * Math.PI * 2, [x, z] = polar(R - 0.42, a);
        ctx.screen(cx + x, Y.counter + 0.55, cz + z, yawOut(a), 0.62, 0.4, [CH.CHART, CH.TICKER][(i + pi) % 2], 0.15);
      }
      for (let i = 0; i < N_IN; i++) { // specialists' monitors inside the ring
        const a = ((i + 0.5) / N_IN) * Math.PI * 2, [x, z] = polar(R - 1.15, a);
        ctx.screen(cx + x, Y.counter + 0.45, cz + z, yawOut(a) + Math.PI, 0.7, 0.45, [CH.PNL, CH.CHART][i % 2], 0.15);
      }
      for (let i = 0; i < N_STAND; i++) { // free-standing monitors
        const a = (i / N_STAND) * Math.PI * 2 + 0.39, [x, z] = polar(R + 1.3, a);
        ctx.screen(cx + x, 1.55, cz + z, yawOut(a) + Math.PI, 0.75, 0.48, CH.TICKER);
      }
      screens += N_CROWN + N_ARM + N_IN + N_STAND;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.8, [x, z] = polar(R - 0.2, a); ctx.deco(cx + x - 0.05, cx + x + 0.05, Y.logo1, H - 1.7, cz + z - 0.05, cz + z + 0.05, 0x15171b); } // cable drops
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, [x, z] = polar(R - 1.8, a); ctx.npc(cx + x, cz + z, 0x2b3a55, yawOut(a)); } // specialists inside
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.1, [x, z] = polar(R + 0.9, a); if (i % 3 !== 1) ctx.npc(cx + x, cz + z, [SUIT, 0x3b5a8a, 0x111111][i % 3], yawOut(a) + Math.PI); }
    });
  }

  // ---- steel roof: girders (N-S), beams (E-W), columns, knee braces, X-bracing, skylights, lamps
  const G = [-104, -88, -72, -56];
  const B = [-35, -26, -18.75, -11.5, -4, 4, 11.5, 18.75, 26, 35];
  for (const x of G) ctx.deco(x - 0.35, x + 0.35, H - 2.4, H - 0.25, -39, 39, STEEL);
  for (const z of B) ctx.deco(-109, -50.3, H - 1.7, H - 1.2, z - 0.22, z + 0.22, STEEL_D);
  const steel = [];
  for (const x of G) for (const z of [-20.75, 20.75]) {
    ctx.box(x - 0.45, x + 0.45, 0, H - 2.4, z - 0.45, z + 0.45, STEEL);
    ctx.deco(x - 0.7, x + 0.7, 0, 0.3, z - 0.7, z + 0.7, STEEL_D);
    for (const sz of [-1, 1]) steel.push(colored(new THREE.BoxGeometry(0.28, 3.6, 0.28).rotateX(sz * Math.PI / 4).translate(x, e + H - 3.65, z + sz * 1.25), STEEL));
  }
  for (let gi = 0; gi < G.length - 1; gi++) for (let bi = 0; bi < B.length - 1; bi += 2) {
    const x0 = G[gi], x1 = G[gi + 1], z0 = B[bi], z1 = B[bi + 1];
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    for (const sg of [-1, 1]) steel.push(colored(new THREE.BoxGeometry(0.22, 0.22, L).rotateY(sg * ang).translate((x0 + x1) / 2, e + H - 1.05, (z0 + z1) / 2), STEEL_D));
  }
  const steelGeo = mergeGeometries(steel);
  ctx.add(new THREE.Mesh(steelGeo, mat), steelGeo, mat);
  for (let gi = 0; gi < G.length - 1; gi++) for (let bi = 0; bi < B.length - 1; bi++) {
    const xc = (G[gi] + G[gi + 1]) / 2, zc = (B[bi] + B[bi + 1]) / 2, hz = (B[bi + 1] - B[bi]) / 2 - 0.8;
    ctx.deco(xc - 6.4, xc + 6.4, H - 0.32, H - 0.27, zc - hz, zc + hz, 0xf6ead0);
  }

  // ---- back (west) wall: tall blue windows with mullions, bell balcony in the middle
  ctx.deco(-109, -108.9, 2.6, 10.6, -37, 37, 0x2f6fb5);
  for (let z = -37; z <= 37; z += 2.4) ctx.deco(-108.92, -108.8, 2.6, 10.6, z - 0.09, z + 0.09, 0x2a2e35);
  for (const y of [2.6, 5.3, 8.0, 10.6]) ctx.deco(-108.92, -108.8, y - 0.1, y + 0.1, -37, 37, 0x2a2e35);
  for (let z = -36; z < 36; z += 7.2) ctx.deco(-108.95, -108.9, 5.4, 7.9, z, z + 2.2, 0x5a9ae0);
  ctx.deco(-109, -104, 4.2, 4.6, -6, 6, 0x3b2414); // bell balcony
  for (const z of [-5.5, 5.5]) ctx.deco(-104.5, -104.2, 0, 4.2, z - 0.2, z + 0.2, 0x3b2414);
  ctx.deco(-104.4, -104.2, 4.6, 5.6, -6, 6, GOLD);
  ctx.deco(-107, -106, 5.0, 6.4, -0.7, 0.7, GOLD);
  ctx.sign('THE BELL — rung on every trade, 24/7', -104, 7.0, 0, { size: 0.8 });

  // ---- glass TV broadcast booth on a platform (south-east), rope stanchions in front
  ctx.box(-67, -55, 0, 1.0, 20.5, 30.5, 0x2a2e35);
  ctx.deco(-67.05, -54.95, 0.9, 1.0, 20.45, 30.55, BLUE_EDGE);
  for (const [x0, x1, z0, z1] of [[-67, -55, 20.5, 20.7], [-67, -66.8, 20.5, 30.5], [-55.2, -55, 20.5, 30.5]]) ctx.glassBox(x0, x1, 1.0, 4.0, z0, z1, 0xbfe6ff, false);
  ctx.deco(-67.4, -54.6, 4.0, 4.5, 20.1, 30.9, 0x15171b); // canopy
  ctx.deco(-67.45, -54.55, 4.5, 4.7, 20.05, 20.2, BLUE_EDGE);
  ctx.box(-64, -58, 1.0, 1.8, 25, 26.2, 0xe8e8e8, { collide: false }); // anchor desk
  for (const x of [-63, -61, -59]) ctx.npc(x, 27, 0x1f2a44, Math.PI, 1.0);
  ctx.screen(-61, 2.9, 30.4, Math.PI, 5.6, 1.9, CH.PNL);
  ctx.box(-61.2, -60.8, 0, 1.6, 17.2, 17.6, 0x15171b, { collide: false }); // camera on a tripod
  ctx.deco(-61.4, -60.6, 1.6, 2.1, 17.0, 17.8, 0x15171b);
  ctx.sign('{FIRM NAME} TV — Live from the Floor', -61, 5.4, 20.4, { size: 0.7 });
  for (let x = -68; x <= -54; x += 2.8) ctx.box(x - 0.06, x + 0.06, 0, 1.0, 18.9, 19.1, 0xc9a23a, { collide: false });
  ctx.deco(-68, -54, 0.85, 0.9, 18.95, 19.05, 0x15171b); // rope

  // ---- side walls: tall firm banner (north), flag (south), screens, tickers
  ctx.deco(-107, -98, 1.5, 11, -39, -38.85, NAVY);
  ctx.deco(-107, -98, 10.4, 11, -38.85, -38.8, 0xc0262d);
  ctx.sign('{FIRM NAME}', -102.5, 7.6, -38.5, { size: 1.6, sub: 'Members Exchange' });
  for (let i = 0; i < 7; i++) ctx.deco(-107, -93, 5 + i * 0.75, 5.75 + i * 0.75, 38.85, 39, i % 2 ? 0xffffff : 0xb22234);
  ctx.deco(-107, -100.5, 7.9, 10.25, 38.8, 38.85, 0x3c3b6e);
  for (let i = 0; i < 7; i++) ctx.screen(-92 + i * 6, 6.6, -38.9, 0, 5.6, 3.2, [CH.CHART, CH.PNL, CH.TICKER][i % 3]);
  for (let i = 0; i < 4; i++) ctx.screen(-88 + i * 6, 7.0, 38.9, Math.PI, 5.6, 3.2, [CH.TICKER, CH.CHART][i % 2]);
  const band = (len, x, zz, yaw) => {
    const g = new THREE.PlaneGeometry(len, 1.0);
    const m = new THREE.Mesh(g, tickerMaterial);
    m.position.set(x, e + 9.0, zz); m.rotation.y = yaw;
    ctx.add(m, g);
  };
  band(44, -73, -38.95, 0);
  band(40, -71, 38.95, Math.PI);

  ctx.sign(`${BIG.length + MED.length} trading posts · ${screens} screens · shouting 24/7`, -51.2, 9.6, 0, { size: 0.7, gold: false });
  ctx.box(-104, -54, 0, 1.1, 32.6, 32.9, GOLD); // guest viewing gallery rail
  ctx.npc(-90, 36, 0xd0a070, Math.PI); ctx.npc(-75, 36, 0xd0a070, Math.PI);
  for (let i = 0; i < 10; i++) ctx.npc(-100 + i * 5, (i % 2 ? -1 : 1) * (2 + (i % 3)), [SUIT, 0x111111, 0x3b5a8a][i % 3], i % 2 ? 0 : Math.PI); // runners in the aisle
}

// ---------------------------------------------------------------- OT-03 / OT-04 department floors
// Open plan behind the lift hall portal (X -109..-50.5); a clear aisle runs west from the portal.
export function department(ctx) {
  const id = ctx.floor.id;
  const I = { x0: -109, x1: -50.5, z0: -39, z1: 39 };
  if (id === 'OT-04') {
    // Asset Protection HQ: CCTV desks (north), lockers, roll-call benches + standing guards (south)
    deskRows(ctx, -104, -56, -32, -10, { pitchX: 2.4, pitchZ: 5.5, channels: [CH.SCORE, CH.TICKER], npcEvery: 2, aisleX: -80 });
    for (let i = 0; i < 16; i++) { const x = I.x0 + 2 + i * 3.4; ctx.box(x, x + 2, 0, 2.2, I.z0 + 0.2, I.z0 + 1.2, 0x3b4048); }
    for (let i = 0; i < 5; i++) ctx.box(-100, -62, 0, 0.5, 12 + i * 4, 12.8 + i * 4, 0x555);
    for (let i = 0; i < 30; i++) ctx.npc(-96 + (i % 10) * 3.6, 33 + Math.floor(i / 10) * 1.6, 0x050505, Math.PI);
    for (let i = 0; i < 8; i++) ctx.screen(-105 + i * 7, 2.8, I.z1 + 0.1, Math.PI, 6, 2.5, i % 8);
    ctx.sign('Roll-call assembly area', -81, 3.6, 22, { size: 0.8, gold: false });
  } else {
    const ch = [CH.FIGHT, CH.LOTTO, CH.RACE];
    deskRows(ctx, -105, -56, -33, -6, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    deskRows(ctx, -105, -56, 6, 33, { pitchX: 2.2, pitchZ: 6.5, channels: ch, npcEvery: 2, aisleX: -80 });
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z0 - 0.1, 0, 6, 2.6, ch[i % 3]);
    for (let i = 0; i < 7; i++) ctx.screen(-104 + i * 8, 3, I.z1 + 0.1, Math.PI, 6, 2.6, ch[(i + 1) % 3]);
  }
}

// ---------------------------------------------------------------- OT-02 Probability Research Institute
// Thai lottery run like a quant shop: rows of quants at triple monitors, walls of equations,
// probability heat-maps and "predictive models" — all dead serious. X -109..-50.5, 10 m tall.
let eqTex = null;
function equationTexture() {
  if (eqTex) return eqTex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f8f8f4'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#1b2a6b'; g.font = 'italic 34px Georgia, serif';
  const eqs = ['P(N=n) = 1/10⁶', 'E[R] = Σ pᵢ·vᵢ = 0.60', 'σ² = E[X²] − μ²', '∂L/∂θ = 0 (vibes)', 'H = −Σ p log p',
    'P(last2 | moon) ≈ 0.01', 'β = Cov(r, lotto)/Var', 'lim n→∞ hope = 0', 'Bayes: P(A|B)P(B)=P(B|A)P(A)', '6,000,000 × 10⁻⁶'];
  eqs.forEach((t, i) => g.fillText(t, 30 + (i % 2) * 500, 60 + Math.floor(i / 2) * 95));
  eqTex = new THREE.CanvasTexture(c);
  eqTex.colorSpace = THREE.SRGBColorSpace;
  return eqTex;
}
export function lottery(ctx) {
  const e = ctx.e;
  ctx.deco(-109, -50.5, 0.012, 0.025, -39, 39, 0xdfe5ec);
  let quants = 0;
  for (let zz = -32; zz <= 32; zz += 5) {
    if (Math.abs(zz) < 4) continue; // aisle from the lift hall portal
    for (let x = -103; x <= -57; x += 3.3) {
      ctx.box(x - 1.3, x + 1.3, 0, 0.75, zz - 0.5, zz + 0.5, 0x444b55);
      for (let k = -1; k <= 1; k++) ctx.screen(x + k * 0.8, 1.15, zz - 0.4, 0, 0.75, 0.5, [CH.LOTTO, CH.CHART, CH.LOTTO][k + 1]);
      ctx.npc(x, zz + 1.0, 0x2b3a55, Math.PI);
      quants++;
    }
  }
  const mat = new THREE.MeshBasicMaterial({ map: equationTexture() });
  for (const [x, zz, yaw, w] of [[-108.9, 0, Math.PI / 2, 70], [-80, -38.9, 0, 54]]) {
    const g = new THREE.PlaneGeometry(w, 6);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, e + 5, zz); m.rotation.y = yaw;
    ctx.add(m, g);
  }
  ctx.screen(-88, 5.4, 38.9, Math.PI, 34, 6.5, CH.LOTTO); // draw results wall
  // probability heat-map (south wall, east end)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
    const v = Math.abs(Math.sin(i * 1.7 + j * 2.3));
    ctx.deco(-68 + i * 1.5, -66.6 + i * 1.5, 2.5 + j * 1.1, 3.5 + j * 1.1, 38.85, 38.95, v > 0.8 ? 0xd62839 : v > 0.55 ? 0xf28c28 : v > 0.3 ? 0xf6d55c : 0x3d8fd6);
  }
  ctx.sign('Probability Heat-Map — last two digits', -61, 9.4, 38.4, { size: 0.6, gold: false });
  // free-standing whiteboards along the aisle
  for (const x of [-96, -82, -68]) for (const zz of [-3.6, 3.6]) ctx.box(x - 2, x + 2, 0.6, 2.6, zz - 0.05, zz + 0.05, 0xffffff, { collide: false });
  ctx.sign(`${quants} quants · 1 lottery · 0 doubts`, -80, 7.6, 0, { size: 1.0, gold: false });
  ctx.sign('Next draw: 1st & 16th · Results: Government Lottery Office (placeholder)', -88, 9.2, 38.4, { size: 0.6, gold: false });
}

// ---------------------------------------------------------------- OT-05 Executive Floor (old tower coords, shifted +30)
export function control(ctx) {
  // CEO office
  ctx.box(-130, -122, 0, 0.8, 30, 33, 0x3b2414);
  ctx.box(-127, -125, 0, 1.4, 34, 35, 0x111);
  ctx.npc(-126, 34.5, 0xc9a23a, 0); // the one and only CEO marker (gold)
  ctx.screen(-125.5, 3, 37.6, Math.PI, 10, 3.5, CH.PNL);
  // boardroom table
  ctx.box(-104, -86, 0, 0.8, 28, 33, 0x3b2414);
  for (let i = 0; i < 7; i++) { ctx.npc(-102 + i * 2.6, 26.8, 0x1f2a44, 0); ctx.npc(-102 + i * 2.6, 34.2, 0x1f2a44, Math.PI); }
  // CFO desk (CFO office: world X -62..-52, Z -38..-26)
  ctx.box(-89, -83, 0, 0.8, -33, -31, 0x3b2414); ctx.npc(-86, -34.5, 0x1f2a44, 0);
  // legal / IT / HR desks
  for (const [zz, c] of [[-31, 0x1f2a44], [-12, 0x2f4f2f], [6, 0x4f2f4f]]) {
    for (let i = 0; i < 3; i++) { ctx.box(-135 + i * 6, -131 + i * 6, 0, 0.75, zz - 1, zz + 1, 0x5a4632); ctx.npc(-133 + i * 6, zz + 2, c, Math.PI); }
  }
  ctx.box(-126, -120, 0, 3, 9, 13.7, 0xcccccc); // HR exit-interview booth
  ctx.sign('Exit Interview', -123, 3.6, 8.5, { size: 0.5, gold: false });
  // security monitoring: wall of camera feeds (4 x 8, shared channels)
  for (let rr = 0; rr < 4; rr++) for (let c = 0; c < 8; c++) ctx.screen(-112.4 + c * 2.15, 1 + rr * 1.1, -37.55, 0, 2.0, 1.0, (rr * 8 + c) % 8);
  for (let i = 0; i < 4; i++) ctx.npc(-110 + i * 4, -31, 0x050505, 0);
  // cigar lounge bar
  ctx.box(-112, -96, 0, 1.15, -10, -9, 0x3b2414);
  for (let i = 0; i < 4; i++) ctx.box(-111 + i * 4, -109 + i * 4, 0, 0.5, -19, -16, 0x6b2b1b);
  // master dashboards wall
  [-112, -108.5, -105, -98, -94.5, -91].forEach((x, i) => ctx.screen(x, 3.2, -1.6, 0, 3.2, 2.2, [CH.PNL, CH.CHART, CH.ODDS, CH.SCORE, CH.FIGHT, CH.LOTTO][i])); // door kept clear
  // trophy & art wall
  ctx.box(-113, -98, 0, 4.5, 20.5, 21, 0x2b1d4a);
  for (let i = 0; i < 6; i++) ctx.deco(-111 + i * 2.2, -110.4 + i * 2.2, 1, 2.2 + (i % 3) * 0.4, 20.1, 20.5, GOLD);
}
