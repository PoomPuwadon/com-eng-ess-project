import * as THREE from 'three';
import { Lux, LM, plaque } from '../world/lux.js';
import { luxLiftHall } from './luxHall.js';
import { WHEEL } from '../../server/games/roulette.js';

let _activeSpin = null;

export function spinTo(result, durationSec = 12) {
  _activeSpin = {
    result: typeof result === 'number' ? result : 0,
    duration: Math.max(2, durationSec),
    elapsed: 0
  };
}

// ================================================================= PHASE 1 — VT-01 EXECUTIVE LEISURE SUITE
// Built to the user's reference image: a long promenade of red carpet with a gold dragon motif and
// purple borders between cream marble walkways; a glowing orange faceted vault over it with cream
// ribs, stepped cream/gold tiers with warm coves, gold chandeliers hung with glowing lanterns down the
// centre line; lower purple faceted soffits over the floor either side with rows of cone pendants.
// Floor games (Phase 1 = visual only; rules come in Phase 4, `leisure-rules`):
//   north front: Rotational Variance Instruments (roulette, top priority: 34 tables, wheels spinning)
//   north back:  Automated Yield Terminals (banks + two Mega Reserve Progressive carousels)
//   south front: Twenty-One Advisory Tables, Private Banking Tables, Kinetic Probability Pit
//   south back:  more terminals + a third progressive carousel
//   south-east:  Private Card Salon (Strategic Negotiation) + High-Conviction Salon, glass partition
// World coords: X 50..209, Z -59..59, H 22. The portal from the lift hall is X 50, Z ±9, 12 m high.

const W = { x0: 50.1, x1: 208.9, z0: -58.9, z1: 58.9 };
const PROM = 6, WALK = 9.6, VAULT = 14.5;
const SOFFIT = 12.3, STEP = 13.45; // facet mid-heights (low soffit |z| > 16, step 12.5..16)
const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48c];
const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x8a6a40, 0xc9a26a];
const OUTFIT = [0x1c1c22, 0xf2efe6, 0x8a1c2b, 0x2b3a67, 0x3a2a4a, 0xd8c8a8, 0x5b2a86, 0x0f3b4a, 0xc0392b];
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a, i) => a[((Math.floor(i) % a.length) + a.length) % a.length];
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// ---------------------------------------------------------------- textures + materials
function canvasTex(w, h, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function fitFont(g, text, maxW, size, weight, family = 'sans-serif') {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 1; } while (g.measureText(text).width > maxW && s > 8);
}
let MATS = null;
function initMaterials() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // gaming-floor carpet: red with an orange/gold faceted diamond pattern (texture = 4 m)
  const carpet = canvasTex(512, 512, (g, w, h) => {
    const r = rng(41); g.fillStyle = '#b8141f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, s = 10 + r() * 30; g.fillStyle = r() < 0.5 ? 'rgba(150,10,20,0.6)' : 'rgba(225,40,40,0.5)'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); }
    for (const [cx, cy] of [[128, 128], [384, 384], [384, 128], [128, 384]]) {
      g.fillStyle = (cx + cy) % 512 ? '#e9932c' : '#f2c14a';
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); g.lineTo(cx + Math.cos(a + 0.5) * 20, cy + Math.sin(a + 0.5) * 20); g.closePath(); g.fill(); }
    }
  });
  // promenade carpet: red with a gold dragon-scale scroll and a medallion (texture = 12 m x 12 m, centred)
  const prom = canvasTex(1024, 1024, (g, w, h) => {
    const r = rng(77); g.fillStyle = '#cf1d26'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { const x = r() * w, y = r() * h, s = 14 + r() * 26; g.fillStyle = r() < 0.5 ? 'rgba(170,12,22,0.55)' : 'rgba(235,60,50,0.45)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s * 0.4); g.lineTo(x + s * 0.3, y + s); g.closePath(); g.fill(); }
    const gold = ['#f2c14a', '#e9a63a', '#ffd877'];
    for (let k = 0; k < 140; k++) { // a sinuous dragon body made of gold scales
      const t = k / 140, x = t * w, y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.22 + Math.sin(t * Math.PI * 6) * 18;
      const s = 16 + 10 * Math.sin(t * Math.PI);
      g.fillStyle = gold[k % 3]; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.6); g.lineTo(x - s * 0.8, y); g.closePath(); g.fill();
    }
    g.fillStyle = '#f2c14a'; // medallion
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.moveTo(w * 0.25, h * 0.25); g.lineTo(w * 0.25 + Math.cos(a) * 60, h * 0.25 + Math.sin(a) * 60); g.lineTo(w * 0.25 + Math.cos(a + 0.4) * 34, h * 0.25 + Math.sin(a + 0.4) * 34); g.closePath(); g.fill(); }
  });
  prom.offset.set(0, 0.5);
  // roulette layout (shared by every table)
  const layout = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#17633a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f4eedc'; g.lineWidth = 4; g.textAlign = 'center'; g.textBaseline = 'middle';
    const gx = 150, gy = 70, cw = 62, chh = 100;
    const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    g.fillStyle = '#1f8a4c'; g.fillRect(gx - 90, gy, 86, chh * 3); g.strokeRect(gx - 90, gy, 86, chh * 3);
    g.fillStyle = '#f4eedc'; fitFont(g, '0', 70, 54, '700'); g.fillText('0', gx - 47, gy + chh * 1.5);
    for (let c = 0; c < 12; c++) for (let rr = 0; rr < 3; rr++) {
      const n = c * 3 + (3 - rr), x = gx + c * cw, y = gy + rr * chh;
      g.fillStyle = RED.has(n) ? '#c0141f' : '#121212'; g.fillRect(x + 6, y + 18, cw - 12, chh - 36);
      g.strokeRect(x, y, cw, chh);
      g.fillStyle = '#f4eedc'; fitFont(g, String(n), cw - 18, 34, '700'); g.fillText(String(n), x + cw / 2, y + chh / 2);
    }
    const labels = ['1st 12', '2nd 12', '3rd 12'];
    labels.forEach((t, i) => { const x = gx + i * cw * 4, y = gy + chh * 3; g.strokeRect(x, y, cw * 4, 70); g.fillStyle = '#f4eedc'; fitFont(g, t, cw * 4 - 20, 36, '600'); g.fillText(t, x + cw * 2, y + 35); });
    ['1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'].forEach((t, i) => {
      const x = gx + i * cw * 2, y = gy + chh * 3 + 70; g.strokeRect(x, y, cw * 2, 64);
      if (t === 'RED' || t === 'BLACK') { g.fillStyle = t === 'RED' ? '#c0141f' : '#121212'; g.beginPath(); g.moveTo(x + cw, y + 10); g.lineTo(x + cw * 1.7, y + 32); g.lineTo(x + cw, y + 54); g.lineTo(x + cw * 0.3, y + 32); g.closePath(); g.fill(); }
      else { g.fillStyle = '#f4eedc'; fitFont(g, t, cw * 2 - 16, 30, '600'); g.fillText(t, x + cw, y + 32); }
    });
  }, { repeat: false });
  // roulette wheel (top of the spinning rotor)
  const wheel = canvasTex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#3a1d0e'; g.beginPath(); g.arc(cx, cy, 255, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 37; k++) { const a0 = (k / 37) * Math.PI * 2, a1 = ((k + 1) / 37) * Math.PI * 2; g.fillStyle = k === 0 ? '#1f8a4c' : k % 2 ? '#c0141f' : '#121212'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 230, a0, a1); g.closePath(); g.fill(); }
    g.fillStyle = '#5a2e14'; g.beginPath(); g.arc(cx, cy, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d9a441'; for (let k = 0; k < 4; k++) { g.save(); g.translate(cx, cy); g.rotate((k * Math.PI) / 2); g.fillRect(-10, -130, 20, 260); g.restore(); }
    g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
  }, { repeat: false });
  // slot screens: 8 reel games (made-up names), 4 x 2 atlas
  const slots = canvasTex(1024, 512, (g) => {
    const games = [['LIQUIDITY 7s', '#1d4fd6', '#7a3cff'], ['DIAMOND DIVIDEND', '#7a1fd1', '#ff3cac'], ['BULL RUN', '#0f7a6a', '#2dd4bf'], ['GOLDEN HEDGE', '#a5550a', '#ffc94a'],
      ['MEGA RESERVE', '#5b0f8a', '#ff9f1c'], ['TRIPLE ALPHA', '#0b3c91', '#3db7ff'], ['YIELD STARS', '#8a0f3c', '#ff5a7a'], ['DELTA DELUXE', '#1b5e20', '#a3e635']];
    const SYM = [['7', '#ff3b3b'], ['BAR', '#111111'], ['◆', '#3db7ff'], ['★', '#ffd23f'], ['♣', '#2dbf5a'], ['7', '#ffd23f']];
    games.forEach(([name, c0, c1], i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
      g.save(); g.beginPath(); g.rect(x, y, 256, 256); g.clip();
      const grd = g.createLinearGradient(x, y, x, y + 256); grd.addColorStop(0, c1); grd.addColorStop(1, c0); g.fillStyle = grd; g.fillRect(x, y, 256, 256);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 230, 30, '800'); g.fillText(name, x + 128, y + 30);
      for (let k = 0; k < 3; k++) {
        const rx = x + 16 + k * 76; g.fillStyle = '#fbf6e8'; g.fillRect(rx, y + 64, 70, 130);
        for (let j = 0; j < 3; j++) { const [sy, col] = SYM[(i * 2 + k * 3 + j) % SYM.length]; g.fillStyle = col; fitFont(g, sy, 60, 34, '900'); g.fillText(sy, rx + 35, y + 86 + j * 43); }
      }
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 12, y + 128, 232, 3);
      g.fillStyle = '#ffd23f'; fitFont(g, 'CREDITS 1,000', 230, 22, '700', 'monospace'); g.fillText('CREDITS 1,000', x + 128, y + 222);
      g.restore();
    });
  }, { repeat: false });
  Object.assign(LM, {
    lsCarpet: std({ map: carpet, roughness: 0.95, envMapIntensity: 0.15 }),
    lsProm: std({ map: prom, roughness: 0.95, envMapIntensity: 0.15 }),
    lsCream: std({ color: 0xf1dfbd, roughness: 0.6, envMapIntensity: 0.6 }),
    lsGold: std({ color: 0xd9a441, roughness: 0.32, metalness: 0.9 }),
    lsPurple: std({ color: 0x5b2a86, roughness: 0.55, emissive: 0x2a0d4a, emissiveIntensity: 0.6 }),
    lsRed: std({ color: 0xb3172a, roughness: 0.7 }),
    lsCove: std({ color: 0xffe2a0, emissive: 0xffbe55, emissiveIntensity: 1.5 }),
    lsLantern: std({ color: 0xfff6dc, emissive: 0xffedc0, emissiveIntensity: 1.6 }),
    lsPanel: std({ color: 0xffe7b0, emissive: 0xffc870, emissiveIntensity: 0.75 }),
    lsFelt: std({ color: 0x17633a, roughness: 0.95 }),
    lsLayout: std({ map: layout, roughness: 0.95 }),
    lsMahogany: std({ color: 0x5a2416, roughness: 0.45, metalness: 0.05 }),
    lsLeather: std({ color: 0x2b1410, roughness: 0.55 }),
    lsChair: std({ color: 0xf3e5c9, roughness: 0.7 }),
    lsVelvet: std({ color: 0x8a1020, roughness: 0.8 }),
    lsSalon: std({ color: 0x3a1656, roughness: 0.95 }),
  });
  const facet = (emissive, ei) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, emissive, emissiveIntensity: ei, side: THREE.DoubleSide });
  MATS = {
    facetOrange: facet(0x7a2a08, 0.55), facetPurple: facet(0x3c1468, 0.6),
    wheel: new THREE.MeshStandardMaterial({ map: wheel, roughness: 0.35, metalness: 0.2 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x1c1530, roughness: 0.35, metalness: 0.5 }),
    topper: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    stool: new THREE.MeshStandardMaterial({ color: 0xb3172a, roughness: 0.6 }),
    slots,
  };
  return MATS;
}

// ---------------------------------------------------------------- faceted ceilings (own meshes: per-triangle colours)
function facetSurface(x0, x1, z0, z1, y, cell, jitter, palette, r) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
  const P = (i, j) => { const k = (i * 7919 + j * 104729) % 1000 / 1000; return [x0 + (i / nx) * (x1 - x0), y + (k - 0.5) * 2 * jitter * (i > 0 && i < nx && j > 0 && j < nz ? 1 : 0.3), z0 + (j / nz) * (z1 - z0)]; };
  const pos = [], col = [], c = new THREE.Color();
  const tri = (a, b, d) => { c.set(palette[Math.floor(r() * palette.length)]); for (const p of [a, b, d]) { pos.push(...p); col.push(c.r, c.g, c.b); } };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = P(i, j), b = P(i + 1, j), d = P(i, j + 1), e = P(i + 1, j + 1);
    if ((i + j) % 2) { tri(a, b, e); tri(a, e, d); } else { tri(a, b, d); tri(b, e, d); }
  }
  return { pos, col };
}
function facetMesh(ctx, parts, mat) {
  const pos = parts.flatMap((p) => p.pos), col = parts.flatMap((p) => p.col);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.position.y = ctx.e; ctx.add(m, g);
}

// ---------------------------------------------------------------- the Mega Reserve Progressive meter (one shared live texture)
function progressiveMeter(ctx) {
  const c = document.createElement('canvas'); c.width = 1000; c.height = 300;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  let value = 12483927.18;
  const draw = () => {
    const grd = g.createLinearGradient(0, 0, 0, 300); grd.addColorStop(0, '#3a0d5e'); grd.addColorStop(1, '#16052a'); g.fillStyle = grd; g.fillRect(0, 0, 1000, 300);
    g.strokeStyle = '#f2c14a'; g.lineWidth = 10; g.strokeRect(8, 8, 984, 284);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd877'; fitFont(g, 'MEGA RESERVE PROGRESSIVE', 900, 54, '800'); g.fillText('MEGA RESERVE PROGRESSIVE', 500, 62);
    const t = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    g.shadowColor = '#ff6a1a'; g.shadowBlur = 24; g.fillStyle = '#ff9a2e'; fitFont(g, t, 900, 128, '800', 'monospace'); g.fillText(t, 500, 160); g.shadowBlur = 0;
    g.fillStyle = '#e8d6ff'; fitFont(g, 'EXCEPTIONAL YIELD EVENT · LINKED TERMINALS · NOTIONAL CREDITS', 900, 28, '600'); g.fillText('EXCEPTIONAL YIELD EVENT · LINKED TERMINALS · NOTIONAL CREDITS', 500, 250);
    tex.needsUpdate = true;
  };
  draw();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  ctx.disposables.push(tex, mat);
  let acc = 0;
  ctx.onUpdate((dt) => { if (!ctx.group.visible) return; acc += dt; if (acc > 0.6) { acc = 0; value += 0.37 + Math.random() * 4.6; draw(); } });
  return (x, y, z, yaw, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3), mat); m.position.set(x, ctx.e + y, z); m.rotation.y = yaw; ctx.add(m, m.geometry); return m; };
}

// ---------------------------------------------------------------- furniture
function chair(L, x, z, yaw) { // cream seat, red back on the side away from the table
  const f = [Math.sin(yaw), Math.cos(yaw)];
  const seat = new THREE.BoxGeometry(0.5, 0.1, 0.5).rotateY(yaw).translate(x, 0.5, z); L.geo(seat, 'lsChair');
  const back = new THREE.BoxGeometry(0.5, 0.62, 0.08).rotateY(yaw).translate(x - f[0] * 0.24, 0.86, z - f[1] * 0.24); L.geo(back, 'lsRed');
  L.cyl(x, z, 0.05, 0, 0.45, 'lsGold', { seg: 6 });
}
function seated(L, r, x, z, yaw, extra = {}) { L.person(x, z, { y: -0.42, yaw, suit: pick(OUTFIT, r() * 99), skin: pick(SKIN, r() * 99), hair: pick(HAIR, r() * 99), fidget: 0.35, ...extra }); }
function standing(L, r, x, z, yaw, fidget = 0.6) { L.person(x, z, { yaw, suit: pick(OUTFIT, r() * 99), skin: pick(SKIN, r() * 99), hair: pick(HAIR, r() * 99), fidget }); }
const DEALER = { suit: 0x111114, hair: 0x111111 };

function roulette(L, ctx, r, wheels, x, z, flip) { // long side faces the players (+z side if !flip)
  const s = flip ? -1 : 1;
  L.box(x - 1.6, x + 1.6, 0, 0.78, z - 0.8, z + 0.8, 'lsMahogany', { collide: true });
  L.box(x - 1.68, x + 1.68, 0.78, 0.86, z - 0.88, z + 0.88, 'lsLeather');
  const top = new THREE.PlaneGeometry(2.3, 1.3).rotateX(-Math.PI / 2); if (flip) top.rotateY(Math.PI); top.translate(x + 0.35, 0.87, z); L.geo(top, 'lsLayout');
  const wx = x - 1.05; // the wheel at the table's end
  L.cyl(wx, z, 0.62, 0.78, 0.95, 'lsMahogany', { seg: 20 });
  wheels.push({ x: wx, z, a: r() * 6.28, w: 0.8 + r() * 1.6 });
  L.cyl(wx, z, 0.05, 0.95, 1.18, 'lsGold', { seg: 6 });
  L.person(wx - 0.1, z - s * 1.25, { ...DEALER, yaw: s > 0 ? 0 : Math.PI, skin: pick(SKIN, r() * 9) });
  for (let k = 0; k < 5; k++) {
    const cx = x - 0.9 + k * 0.62, cz = z + s * 1.25, yaw = s > 0 ? Math.PI : 0;
    chair(L, cx, cz, yaw);
    if (r() < 0.78) seated(L, r, cx, cz, yaw);
  }
  for (let k = 0; k < 3; k++) if (r() < 0.55) standing(L, r, x - 1 + k * 1.1 + (r() - 0.5) * 0.4, z + s * (1.9 + r() * 0.5), s > 0 ? Math.PI : 0, 0.9);
}
function blackjack(L, ctx, r, x, z, s) { // half-moon: dealer on the flat side (toward the promenade if s = -1 for north)
  const yawT = s > 0 ? 0 : Math.PI; // the arc opens towards +z*s
  const body = new THREE.CylinderGeometry(1.9, 1.9, 0.78, 24, 1, false, -Math.PI / 2, Math.PI).rotateY(yawT).translate(x, 0.39, z); L.geo(body, 'lsMahogany');
  const felt = new THREE.CylinderGeometry(1.8, 1.8, 0.06, 24, 1, false, -Math.PI / 2, Math.PI).rotateY(yawT).translate(x, 0.81, z); L.geo(felt, 'lsFelt');
  const arc = new THREE.TorusGeometry(1.2, 0.02, 3, 24, Math.PI).rotateX(Math.PI / 2).rotateY(yawT + Math.PI / 2).translate(x, 0.85, z); L.geo(arc, 'lsGold');
  ctx.colliders.push({ x0: x - 1.95, x1: x + 1.95, z0: Math.min(z, z + s * 1.95), z1: Math.max(z, z + s * 1.95), y0: ctx.e, y1: ctx.e + 0.9 });
  L.person(x, z - s * 0.45, { ...DEALER, yaw: s > 0 ? 0 : Math.PI, skin: pick(SKIN, r() * 9) });
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * Math.PI, cx = x + Math.cos(a) * 2.45, cz = z + s * Math.sin(a) * 2.45;
    const yaw = faceTo(cx, cz, x, z); chair(L, cx, cz, yaw);
    if (r() < 0.7) seated(L, r, cx, cz, yaw);
  }
}
function ovalTable(L, ctx, r, x, z, rx, rz, seats, feltKey = 'lsFelt') {
  const body = new THREE.CylinderGeometry(1, 1, 0.78, 28).scale(rx, 1, rz).translate(x, 0.39, z); L.geo(body, 'lsMahogany');
  const rail = new THREE.CylinderGeometry(1, 1, 0.08, 28).scale(rx + 0.08, 1, rz + 0.08).translate(x, 0.82, z); L.geo(rail, 'lsLeather');
  const felt = new THREE.CylinderGeometry(1, 1, 0.02, 28).scale(rx - 0.2, 1, rz - 0.2).translate(x, 0.87, z); L.geo(felt, feltKey);
  ctx.colliders.push({ x0: x - rx, x1: x + rx, z0: z - rz, z1: z + rz, y0: ctx.e, y1: ctx.e + 0.9 });
  L.person(x, z - rz - 0.35, { ...DEALER, yaw: 0, skin: pick(SKIN, r() * 9) });
  for (let k = 0; k < seats; k++) { // round the ellipse, leaving the dealer's place (-z) free
    const ang = -Math.PI / 2 + ((k + 1) / (seats + 1)) * Math.PI * 2;
    const cx = x + Math.cos(ang) * (rx + 0.55), cz = z + Math.sin(ang) * (rz + 0.55);
    const yaw = faceTo(cx, cz, x, z); chair(L, cx, cz, yaw);
    if (r() < 0.75) seated(L, r, cx, cz, yaw);
  }
}
function craps(L, ctx, r, x, z) {
  L.box(x - 2.8, x + 2.8, 0, 0.75, z - 1.2, z + 1.2, 'lsMahogany', { collide: true });
  L.box(x - 2.6, x + 2.6, 0.72, 0.76, z - 1.0, z + 1.0, 'lsFelt');
  for (const sz of [-1, 1]) L.box(x - 2.8, x + 2.8, 0.75, 1.05, z + sz * 1.2 - 0.12, z + sz * 1.2 + 0.12, 'lsLeather');
  for (const sx of [-1, 1]) L.box(x + sx * 2.8 - 0.12, x + sx * 2.8 + 0.12, 0.75, 1.05, z - 1.2, z + 1.2, 'lsLeather');
  for (const sx of [-1, 1]) L.person(x + sx * 0.8, z - 1.6, { ...DEALER, yaw: 0, skin: pick(SKIN, r() * 9) });
  L.person(x, z + 1.6, { ...DEALER, yaw: Math.PI, skin: pick(SKIN, r() * 9) }); // stickman
  for (let k = 0; k < 14; k++) { // a crowd crammed round the rail, bouncing
    const t = k / 14, side = k % 2 ? 1 : -1;
    const px = x + (t - 0.5) * 6.4, pz = z + side * (1.65 + r() * 0.35);
    if (Math.abs(px - x) < 1.2 && side < 0) continue;
    standing(L, r, px, pz, side > 0 ? Math.PI : 0, 1);
  }
  for (const sx of [-1, 1]) { standing(L, r, x + sx * 3.4, z + (r() - 0.5), sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1); }
}

// slot cabinets: instanced (body, screen from the slot atlas, glowing topper, stool), toppers chase-light
function buildSlots(ctx, M, list, r) {
  const n = list.length; if (!n) return;
  const body = new THREE.BoxGeometry(0.7, 1.45, 0.62).translate(0, 0.725, 0);
  const top = new THREE.BoxGeometry(0.72, 0.34, 0.5).translate(0, 1.66, -0.04);
  const scr = new THREE.PlaneGeometry(0.56, 0.5).rotateX(-0.22).translate(0, 1.12, 0.33);
  const stool = new THREE.CylinderGeometry(0.22, 0.12, 0.62, 10).translate(0, 0.31, 0.78);
  const offs = new Float32Array(n * 2); list.forEach((s, i) => { offs[i * 2] = (s.cell % 4) * 0.25; offs[i * 2 + 1] = 1 - (Math.floor(s.cell / 4) + 1) * 0.5; });
  scr.setAttribute('cellOffset', new THREE.InstancedBufferAttribute(offs, 2));
  const scrMat = new THREE.MeshBasicMaterial({ map: M.slots, toneMapped: false });
  scrMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 cellOffset;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(0.25, 0.5) + cellOffset;\n#endif'); };
  scrMat.customProgramCacheKey = () => 'slotAtlas';
  const meshes = [[body, M.cabinet], [top, M.topper], [scr, scrMat], [stool, M.stool]].map(([g, m]) => new THREE.InstancedMesh(g, m, n));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  list.forEach((s, i) => { q.setFromAxisAngle(up, s.yaw); m4.compose(p.set(s.x, ctx.e, s.z), q, sc.set(1, s.tall || 1, 1)); for (const me of meshes) me.setMatrixAt(i, m4); meshes[1].setColorAt(i, c.set(s.color)); });
  for (const me of meshes) { me.instanceMatrix.needsUpdate = true; me.computeBoundingSphere(); ctx.add(me, me.geometry); }
  ctx.disposables.push(scrMat);
  const base = list.map((s) => new THREE.Color(s.color));
  let acc = 0, step = 0;
  ctx.onUpdate((dt) => { // chase lights on the toppers
    if (!ctx.group.visible) return; acc += dt; if (acc < 0.16) return; acc = 0; step++;
    for (let i = 0; i < n; i++) meshes[1].setColorAt(i, c.copy(base[i]).multiplyScalar((i + step) % 4 === 0 ? 1.0 : 0.62));
    meshes[1].instanceColor.needsUpdate = true;
  });
}

// ================================================================= VT-01
export function leisure(ctx) {
  const M = initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const r = rng(909);
  const meter = progressiveMeter(ctx);
  const slots = [];
  const SLOT_COL = [0x3db7ff, 0x9b5cff, 0xffc94a, 0xff4fa3, 0x2dd4bf];

  // ---- floors: gaming carpet, cream marble walkways with purple + gold borders, the dragon promenade
  for (const [z0, z1] of [[W.z0, -WALK], [WALK, W.z1]]) L.floor(W.x0, W.x1, z0, z1, 0.012, 'lsCarpet', 4);
  for (const sz of [-1, 1]) L.floor(W.x0, 206, Math.min(sz * WALK, sz * (PROM + 0.7)), Math.max(sz * WALK, sz * (PROM + 0.7)), 0.014, 'marble', 2.4);
  L.floor(W.x0, 206, -PROM, PROM, 0.016, 'lsProm', 12);
  for (const sz of [-1, 1]) {
    L.box(W.x0, 206, 0.014, 0.024, Math.min(sz * PROM, sz * (PROM + 0.7)), Math.max(sz * PROM, sz * (PROM + 0.7)), 'lsPurple');
    L.box(W.x0, 206, 0.014, 0.028, Math.min(sz * (PROM + 0.25), sz * (PROM + 0.35)), Math.max(sz * (PROM + 0.25), sz * (PROM + 0.35)), 'lsGold');
    L.box(W.x0, 206, 0.014, 0.024, Math.min(sz * WALK, sz * (WALK - 0.35)), Math.max(sz * WALK, sz * (WALK - 0.35)), 'lsPurple');
  }
  for (let x = 66; x < 206; x += 24) L.box(x - 0.25, x + 0.25, 0.016, 0.03, -PROM - 0.7, PROM + 0.7, 'lsPurple'); // cross bands at the bays

  // ---- walls (under the soffits; the vault ends at the focal wall)
  const pil = [];
  for (const [z, s] of [[W.z0, 1], [W.z1, -1]]) {
    L.box(W.x0, W.x1, 0, 12.6, Math.min(z, z - s * 0.06), Math.max(z, z - s * 0.06), 'lsCream');
    for (const [y0, y1, m, t] of [[0, 0.3, 'lsGold', 0.05], [0.3, 1.3, 'lsPurple', 0.03], [1.3, 1.38, 'lsGold', 0.04], [10.8, 11.0, 'lsGold', 0.06]]) L.box(W.x0, W.x1, y0, y1, Math.min(z, z + s * t), Math.max(z, z + s * t), m);
    for (let x = 58; x < 208; x += 8) pil.push([x, z, s]);
  }
  for (const [x, z, s] of pil) L.box(x - 0.35, x + 0.35, 0, 12.6, Math.min(z, z + s * 0.25), Math.max(z, z + s * 0.25), 'lsGold');
  L.box(W.x1, W.x1 + 0.06, 0, 21.7, W.z0, W.z1, 'lsCream'); // focal (east) wall
  L.box(W.x1 - 0.05, W.x1, 0, 0.3, W.z0, W.z1, 'lsGold'); L.box(W.x1 - 0.03, W.x1, 0.3, 1.3, W.z0, W.z1, 'lsPurple');
  // portal wall (suite side) with the gold portal frame through it
  for (const [za, zb] of [[W.z0, -9.6], [9.6, W.z1]]) { L.box(50.04, 50.1, 0, 21.7, za, zb, 'lsCream'); L.box(50.1, 50.15, 0, 0.3, za, zb, 'lsGold'); L.box(50.1, 50.13, 0.3, 1.3, za, zb, 'lsPurple'); }
  L.box(50.04, 50.1, 12.6, 21.7, -9.6, 9.6, 'lsCream');
  for (const sz of [-1, 1]) L.box(49.56, 50.14, 0, 12.6, sz < 0 ? -9.64 : 8.96, sz < 0 ? -8.96 : 9.64, 'lsGold', { collide: true });
  L.box(49.56, 50.14, 11.96, 12.6, -9.64, 9.64, 'lsGold');
  for (const x of [49.54, 50.14]) L.box(x, x + 0.02, 12.15, 12.35, -9.64, 9.64, 'lsCove');

  // ---- ceiling: purple faceted soffits (two steps), the orange faceted vault, tiers with warm coves
  const PURP = [0x6a2c9e, 0x7d3bb8, 0x5b2486, 0x8a4cc8, 0x4d1f78, 0x9a5ad6];
  const ORNG = [0xe8641e, 0xd9481a, 0xf08a2a, 0xc23a18, 0xf5a03a, 0xb8321a];
  const soff = [], vault = [];
  for (const sz of [-1, 1]) {
    soff.push(facetSurface(W.x0, W.x1, Math.min(sz * 16, sz * 58.9), Math.max(sz * 16, sz * 58.9), SOFFIT, 4, 0.25, PURP, r));
    soff.push(facetSurface(W.x0, W.x1, Math.min(sz * 12.5, sz * 16), Math.max(sz * 12.5, sz * 16), STEP, 1.75, 0.15, PURP, r));
    const zf = sz * 16; // fascia between the soffit steps, gold cove under it
    L.box(W.x0, W.x1, 12.0, 13.65, Math.min(zf, zf + sz * 0.15), Math.max(zf, zf + sz * 0.15), 'lsPurple');
    L.box(W.x0, W.x1, 11.86, 12.0, Math.min(zf - sz * 0.05, zf + sz * 0.2), Math.max(zf - sz * 0.05, zf + sz * 0.2), 'lsCove');
    for (const [zz, y0, y1, ledge] of [[12.5, 13.3, 16.0, 13.5], [13.5, 16.0, 18.6, 14.5], [14.5, 18.6, 21.25, null]]) { // stepped tiers
      const z = sz * zz;
      L.box(W.x0, W.x1, y0, y1, Math.min(z, z + sz * 0.15), Math.max(z, z + sz * 0.15), 'lsCream');
      L.box(W.x0, W.x1, y0 - 0.12, y0 + 0.04, Math.min(z - sz * 0.12, z + sz * 0.15), Math.max(z - sz * 0.12, z + sz * 0.15), 'lsGold');
      if (ledge) { const zl = sz * ledge; L.box(W.x0, W.x1, y1 - 0.08, y1, Math.min(z, zl), Math.max(z, zl), 'lsCream'); L.box(W.x0, W.x1, y1 - 0.2, y1 - 0.05, Math.min(z - sz * 0.06, z), Math.max(z - sz * 0.06, z), 'lsCove'); }
    }
  }
  vault.push(facetSurface(W.x0, W.x1, -VAULT, VAULT, 21.05, 3, 0.35, ORNG, r));
  facetMesh(ctx, soff, M.facetPurple); facetMesh(ctx, vault, M.facetOrange);
  for (let x = 58; x < 208; x += 8) L.box(x - 0.3, x + 0.3, 20.15, 20.6, -VAULT, VAULT, 'lsCream'); // cream ribs across the vault
  for (const zz of [-5, 5]) L.box(W.x0, W.x1, 20.2, 20.55, zz - 0.25, zz + 0.25, 'lsCream');
  for (let x = 54; x < 208; x += 4) for (let z = 18; z < 58; z += 4) for (const sz of [-1, 1]) { // soffit downlights
    const d = new THREE.CircleGeometry(0.16, 8).rotateX(Math.PI / 2); d.translate(x, 11.98, sz * z); L.geo(d, 'downlight');
  }

  // ---- chandeliers down the centre (gold frames, glowing lantern cubes, a glowing bowl)
  for (let x = 62; x <= 190; x += 16) {
    L.cyl(x, 0, 0.05, 16.6, 20.6, 'lsGold', { seg: 6 });
    L.cyl(x, 0, 1.0, 16.4, 16.7, 'lsGold', { rTop: 0.6, seg: 12 });
    for (const [n, rad, y, sz] of [[8, 3.1, 13.7, 0.6], [6, 1.9, 15.3, 0.45]]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (n === 6 ? 0.3 : 0), lx = x + Math.cos(a) * rad, lz = Math.sin(a) * rad;
        const arm = new THREE.BoxGeometry(rad, 0.08, 0.08).translate(rad / 2, 0, 0).rotateY(-a).translate(x, y + 0.35, 0); L.geo(arm, 'lsGold');
        L.box(lx - sz / 2, lx + sz / 2, y - sz / 2, y + sz / 2, lz - sz / 2, lz + sz / 2, 'lsLantern');
        L.box(lx - sz / 2 - 0.04, lx + sz / 2 + 0.04, y + sz / 2, y + sz / 2 + 0.07, lz - sz / 2 - 0.04, lz + sz / 2 + 0.04, 'lsGold');
        L.box(lx - 0.03, lx + 0.03, y + sz / 2, y + 0.38, lz - 0.03, lz + 0.03, 'lsGold');
      }
      L.cyl(x, 0, rad * 0.35, y + 0.28, y + 0.42, 'lsGold', { seg: 12 });
    }
    L.cyl(x, 0, 1.5, 13.0, 14.2, 'lsLantern', { rTop: 1.5, seg: 10 }); L.cyl(x, 0, 1.5, 12.2, 13.0, 'lsLantern', { rTop: 1.5, seg: 10 });
    L.cyl(x, 0, 0.3, 11.6, 12.2, 'lsGold', { rTop: 1.4, seg: 10 }); L.cyl(x, 0, 1.58, 14.2, 14.35, 'lsGold', { seg: 10 });
  }
  // cone pendants in rows over the gaming floor
  for (let x = 56; x < 207; x += 6) for (const [zz, top] of [[14.2, 13.3], [21, 12.05], [28, 12.05]]) for (const sz of [-1, 1]) {
    const z = sz * zz, y = 6.8;
    L.box(x - 0.012, x + 0.012, y + 0.8, top, z - 0.012, z + 0.012, 'lsGold');
    L.cyl(x, z, 0.6, y, y + 0.8, 'lsChair', { rTop: 0.18, seg: 10 });
    const d = new THREE.CircleGeometry(0.56, 12).rotateX(Math.PI / 2); d.translate(x, y - 0.01, z); L.geo(d, 'lsLantern');
  }

  // ---- area signs hanging from the soffit edge, facing the promenade
  const sign = (text, x, z) => { const s = Math.sign(z); L.box(x - 4.4, x + 4.4, 9.0, 10.3, z - 0.12, z + 0.12, 'lsPurple'); L.box(x - 4.5, x + 4.5, 8.9, 9.02, z - 0.14, z + 0.14, 'lsCove'); for (const k of [-3.6, 3.6]) L.box(x + k - 0.02, x + k + 0.02, 10.3, 12.0, z - 0.02, z + 0.02, 'lsGold'); plaque(ctx, text, x, 9.65, z - s * 0.13, s < 0 ? 0 : Math.PI, { h: 0.5, color: '#ffd877' }); };
  sign('ROTATIONAL VARIANCE INSTRUMENTS', 92, -13.2); sign('ROTATIONAL VARIANCE INSTRUMENTS', 164, -13.2);
  sign('TWENTY-ONE ADVISORY TABLES', 77, 13.2); sign('PRIVATE BANKING TABLES', 114, 13.2); sign('KINETIC PROBABILITY PIT', 138, 13.2); sign('PRIVATE CARD SALON', 179, 13.2);

  // ---- north front: roulette, two rows down the whole promenade
  const wheels = [];
  for (let x = 58; x <= 202; x += 9) { roulette(L, ctx, r, wheels, x, -14.6, false); roulette(L, ctx, r, wheels, x, -21.5, true); roulette(L, ctx, r, wheels, x, -28.4, false); }
  // ---- north back: terminal banks + two progressive carousels
  const bank = (x0, x1, z, tall = 1) => { // back-to-back double row along x
    for (let x = x0 + 0.55; x < x1; x += 1.05) for (const s of [-1, 1]) {
      slots.push({ x, z: z + s * 0.4, yaw: s > 0 ? 0 : Math.PI, cell: Math.floor(r() * 8), color: pick(SLOT_COL, r() * 9), tall });
      if (r() < 0.32) seated(L, r, x, z + s * 1.18, s > 0 ? Math.PI : 0);
    }
    ctx.colliders.push({ x0, x1, z0: z - 0.75, z1: z + 0.75, y0: ctx.e, y1: ctx.e + 1.8 });
    for (const [a, b] of [[x0 - 0.25, x0], [x1, x1 + 0.25]]) { L.box(a, b, 0, 2.0, z - 0.7, z + 0.7, 'lsPurple'); L.box(a - 0.02, b + 0.02, 2.0, 2.1, z - 0.72, z + 0.72, 'lsGold'); } // bank end caps
  };
  const carousel = (cx, cz) => {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2, x = cx + Math.cos(a) * 3.6, z = cz + Math.sin(a) * 3.6, yaw = Math.atan2(Math.cos(a), Math.sin(a));
      slots.push({ x, z, yaw, cell: 4, color: 0xff9f1c, tall: 1.25 });
      ctx.colliders.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: ctx.e, y1: ctx.e + 1.8 });
      if (r() < 0.6) seated(L, r, x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, yaw + Math.PI);
    }
    L.cyl(cx, cz, 3.2, 0, 0.3, 'lsGold', { seg: 24 }); L.cyl(cx, cz, 0.7, 0.3, 7.2, 'lsGold', { seg: 12, collide: true });
    { const ring = new THREE.TorusGeometry(3.0, 0.07, 4, 40).rotateX(Math.PI / 2).translate(cx, 7.0, cz); L.geo(ring, 'lsCove'); }
    L.cyl(cx, cz, 0.9, 6.95, 7.3, 'lsGold', { seg: 12, rTop: 2.0 });
    L.box(cx - 2.3, cx + 2.3, 7.3, 9.0, cz - 2.3, cz + 2.3, 'lsPurple');
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; meter(cx + Math.sin(a) * 2.32, 8.15, cz + Math.cos(a) * 2.32, a, 4.4); }
    L.box(cx - 2.4, cx + 2.4, 9.0, 9.15, cz - 2.4, cz + 2.4, 'lsGold'); L.box(cx - 2.4, cx + 2.4, 7.15, 7.3, cz - 2.4, cz + 2.4, 'lsGold');
  };
  for (const z of [-35, -45, -55]) for (const [a, b] of [[54, 84], [100, 154], [172, 206]]) bank(a, b, z);
  carousel(92, -45); carousel(163, -45);
  for (const [a, b] of [[86, 98], [156, 170]]) for (const z of [-35, -55]) bank(a, b, z);
  // ---- walkway-edge showcase terminals (as in the reference: machines right at the walkway)

  // ---- south front: twenty-one, private banking, kinetic pit
  for (let i = 0; i < 5; i++) for (const z of [14.4, 21.0, 27.6]) blackjack(L, ctx, r, 58 + i * 9, z, -1);
  for (const bxx of [106.5, 121.5]) for (const z of [16.5, 24.6]) { // private banking: ovals inside velvet ropes
    ovalTable(L, ctx, r, bxx, z, 2.1, 1.05, 7);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, px = bxx + Math.cos(a) * 3.6, pz = z + Math.sin(a) * 2.4; L.cyl(px, pz, 0.06, 0, 1.0, 'lsGold', { seg: 6 }); L.cyl(px, pz, 0.12, 1.0, 1.12, 'lsGold', { seg: 8 }); }
    const rope = new THREE.TorusGeometry(1, 0.035, 4, 32).rotateX(Math.PI / 2).scale(3.6, 1, 2.4).translate(bxx, 0.9, z); L.geo(rope, 'lsVelvet');
  }
  for (const cxx of [133, 145]) for (const z of [16.6, 25.0]) craps(L, ctx, r, cxx, z);

  // ---- south back: terminals + a third progressive carousel
  for (const z of [35, 45, 55]) for (const [a, b] of [[54, 90], [110, 148]]) bank(a, b, z);
  carousel(100, 45); for (const z of [35, 55]) bank(93, 107, z);

  // ---- Private Card Salon (X 152..206, Z 12.5..56): purple carpet, glass partition with gold posts
  const SAL = { x0: 152, x1: 206, z0: 12.5, z1: 56 };
  L.floor(SAL.x0, SAL.x1, SAL.z0, SAL.z1, 0.02, 'lsSalon', 2);
  const part = (x0, x1, z0, z1) => {
    L.box(x0, x1, 0, 1.0, z0, z1, 'lsMahogany', { collide: true });
    L.box(x0 - 0.02, x1 + 0.02, 1.0, 1.06, z0 - 0.02, z1 + 0.02, 'lsGold');
    L.box(x0, x1, 1.06, 2.7, z0, z1, 'glass'); L.box(x0 - 0.03, x1 + 0.03, 2.7, 2.8, z0 - 0.03, z1 + 0.03, 'lsGold');
    ctx.colliders.push({ x0, x1, z0, z1, y0: ctx.e, y1: ctx.e + 2.8 });
    const along = x1 - x0 > z1 - z0, len = along ? x1 - x0 : z1 - z0;
    for (let t = 0; t <= len + 0.01; t += 3) { const px = along ? x0 + t : (x0 + x1) / 2, pz = along ? (z0 + z1) / 2 : z0 + t; L.box(px - 0.08, px + 0.08, 0, 2.85, pz - 0.08, pz + 0.08, 'lsGold'); }
  };
  part(SAL.x0, 176, SAL.z0 - 0.08, SAL.z0 + 0.08); part(182, SAL.x1, SAL.z0 - 0.08, SAL.z0 + 0.08); // north front, entrance X 176..182
  part(SAL.x0 - 0.08, SAL.x0 + 0.08, SAL.z0, 22); part(SAL.x0 - 0.08, SAL.x0 + 0.08, 27, SAL.z1); // west side, entrance Z 22..27
  part(SAL.x0, SAL.x1, SAL.z1 - 0.08, SAL.z1 + 0.08);
  for (const [x, z] of [[176, SAL.z0], [182, SAL.z0], [SAL.x0, 22], [SAL.x0, 27]]) L.box(x - 0.25, x + 0.25, 0, 3.4, z - 0.25, z + 0.25, 'lsGold');
  plaque(ctx, 'PRIVATE CARD SALON', 179, 3.25, SAL.z0 - 0.3, Math.PI, { h: 0.42, color: '#ffd877', sub: 'Strategic Negotiation' });
  for (const x of [163, 175, 187]) for (const z of [21, 32, 43]) { ovalTable(L, ctx, r, x, z, 1.9, 1.05, 8); for (let k = 0; k < 2; k++) if (r() < 0.5) standing(L, r, x + (r() - 0.5) * 4, z + 2.3 + r() * 0.6, Math.PI, 0.4); }
  // High-Conviction Salon (corner room, glass)
  part(193, 205.9, 42.9, 43.05); part(192.9, 193.05, 43, 47.5); part(192.9, 193.05, 50.5, 55.9);
  ovalTable(L, ctx, r, 199.5, 49.5, 2.2, 1.2, 8, 'lsVelvet');
  plaque(ctx, 'HIGH-CONVICTION SALON', 199.4, 3.0, 42.85, Math.PI, { h: 0.3, color: '#ffd877' });
  for (const x of [165, 181, 197]) for (const z of [26, 40]) { // salon chandeliers (smaller)
    L.cyl(x, z, 0.04, 9.6, SOFFIT - 0.2, 'lsGold', { seg: 6 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, lx = x + Math.cos(a) * 1.3, lz = z + Math.sin(a) * 1.3; L.box(lx - 0.22, lx + 0.22, 9.0, 9.44, lz - 0.22, lz + 0.22, 'lsLantern'); const arm = new THREE.BoxGeometry(1.3, 0.06, 0.06).translate(0.65, 0, 0).rotateY(-a).translate(x, 9.55, z); L.geo(arm, 'lsGold'); }
  }

  // ---- focal wall: the giant progressive meter in a gold frame, the responsible-recreation line
  L.box(W.x1 - 0.3, W.x1, 3.4, 12.9, -14.3, 14.3, 'lsGold');
  L.box(W.x1 - 0.32, W.x1 - 0.3, 3.7, 12.6, -14.0, 14.0, 'lsPurple');
  meter(W.x1 - 0.34, 8.15, 0, -Math.PI / 2, 27.4);
  plaque(ctx, 'Projected yield 95.8 % · Responsible Recreation Since Q3', W.x1 - 0.03, 2.6, 0, -Math.PI / 2, { h: 0.5, color: '#ffd877' });

  // ---- the lift hall (shared design, Wellness palette)
  luxLiftHall(ctx, L, {
    s: 1, H: 15, portal: { half: 9, top: 12 },
    P: { wall: 'lsCream', wallDeep: 'lsGold', panel: 'lsPanel', frame: 'lsGold', frameDark: 'lsMahogany', dado: 'lsPurple', cap: 'lsGold', floor: 'marble', floorTile: 2.4,
      runner: 'lsRed', edge: 'lsGold', liner: 'brushedBronze', ink: '#4a1a6a', kioskBg: '#2a0d44', kioskBtn: '#5b2a86', kioskEdge: '#f2c14a', hostSuit: 0x5b2a86 },
    ceo: 'ceo_vt',
    banks: [['vt_low', 'WELLNESS LOW-RISE · L · 1–2', true], ['vt_high', 'WELLNESS HIGH-RISE · L · 3–4', true], ['freight_vt', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['vt_low', ['L', '1', '2']]],
    link: { text: 'THE LINK  →  OFFICE TOWER', id: 'vt_bridge_checkpoint' },
    portalText: 'EXECUTIVE LEISURE SUITE', portalSub: 'Liquidity Recreation · Members & guests',
    board: (c, x, y, z, yaw, w) => meter(x, y, z, yaw, w),
  });

  // ---- people on the move: the promenade, the aisles, the hall
  const walkers = (n, mk) => { for (let k = 0; k < n; k++) { const pts = mk(k); L.person(pts[0][0], pts[0][1], { suit: pick(OUTFIT, r() * 99), skin: pick(SKIN, r() * 99), hair: pick(HAIR, r() * 99), walk: pts, speed: 0.9 + r() * 0.8 }); } };
  walkers(70, () => { const a = 52 + r() * 70, b = 132 + r() * 72, z1 = (r() - 0.5) * 17, z2 = (r() - 0.5) * 17; return r() < 0.5 ? [[a, z1], [b, z1], [b, z2], [a, z2]] : [[b, z1], [a, z1], [a, z2], [b, z2]]; });
  const LANES = { '-1': Array.from({ length: 17 }, (_, i) => 62.5 + 9 * i), 1: [62.5, 71.5, 80.5, 89.5, 98.5, 127.3] }; // clear crossings between the table rows
  walkers(30, (k) => { const sz = k % 2 ? 1 : -1, ln = LANES[sz], i = Math.floor(r() * (ln.length - 1)), j = i + 1 + Math.floor(r() * (ln.length - 1 - i)); return [[ln[i], sz * 31.2], [ln[j], sz * 31.2], [ln[j], sz * 10.2], [ln[i], sz * 10.2]]; });
  walkers(8, () => { const z = (r() - 0.5) * 60; return [[44, z], [z > -27 && z < -19.5 ? 40.2 : 36.8, z + (r() - 0.5) * 6], [44.5, (r() - 0.5) * 3], [56, (r() - 0.5) * 3], [44.5, (r() - 0.5) * 3]]; });

  buildSlots(ctx, M, slots, r);
  // spinning roulette rotors (instanced)
  const rotor = new THREE.CylinderGeometry(0.52, 0.52, 0.06, 32);
  const rot = new THREE.InstancedMesh(rotor, M.wheel, wheels.length);

  // ONE InstancedMesh of small spheres (radius 0.025), one per table
  const ballGeo = new THREE.SphereGeometry(0.025, 12, 8);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.8 });
  const ballMesh = new THREE.InstancedMesh(ballGeo, ballMat, wheels.length);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const placeRotors = () => { wheels.forEach((w, i) => rot.setMatrixAt(i, m4.compose(p.set(w.x, ctx.e + 0.97, w.z), q.setFromAxisAngle(up, w.a), one))); rot.instanceMatrix.needsUpdate = true; };
  placeRotors(); rot.computeBoundingSphere(); ctx.add(rot, rotor);
  ctx.add(ballMesh, ballGeo);

  ctx.onUpdate((dt) => {
    if (!ctx.group.visible) return;

    if (_activeSpin) {
      _activeSpin.elapsed += dt;
      const t = _activeSpin.elapsed;
      const dur = _activeSpin.duration;
      const progress = Math.min(1, t / dur);

      // Speed ramps up then eases down over the phase
      const spinSpeed =
        progress < 0.25
          ? 1.0 + (progress / 0.25) * 11.0
          : 1.0 + 11.0 * Math.pow(1 - (progress - 0.25) / 0.75, 2);
      for (const w of wheels) w.a += dt * spinSpeed;

      const timeLeft = dur - t;
      const k = WHEEL.indexOf(_activeSpin.result);
      const sliceAngle = ((k + 0.5) / 37) * Math.PI * 2;
      const pocketOffset = Math.PI / 2; // slice 0 green alignment

      wheels.forEach((w, i) => {
        let bx, by, bz;
        const pocketPsi = w.a + sliceAngle + pocketOffset;
        const pocketX = w.x + 0.4 * Math.sin(pocketPsi);
        const pocketZ = w.z + 0.4 * Math.cos(pocketPsi);
        const pocketY = ctx.e + 0.97 + 0.025;

        if (timeLeft > 2.0) {
          // Ball circles opposite to rotor and spirals inward
          const spiralProgress = Math.min(1, t / Math.max(0.1, dur - 2.0));
          const ballRadius = 0.48 - 0.08 * spiralProgress;
          const ballAngle = -t * (16.0 * (1 - 0.5 * spiralProgress));
          bx = w.x + ballRadius * Math.sin(ballAngle);
          bz = w.z + ballRadius * Math.cos(ballAngle);
          by = ctx.e + 0.97 + 0.035 + 0.005 * Math.abs(Math.sin(t * 35));
        } else {
          // In the last ~2 s: ease into the pocket, then ride with the rotor
          const dropT = Math.min(1, (2.0 - timeLeft) / 0.6);
          const endSpiralAngle = -(dur - 2.0) * 8.0;
          const startX = w.x + 0.4 * Math.sin(endSpiralAngle);
          const startZ = w.z + 0.4 * Math.cos(endSpiralAngle);
          const startY = ctx.e + 0.97 + 0.035;

          bx = THREE.MathUtils.lerp(startX, pocketX, dropT);
          bz = THREE.MathUtils.lerp(startZ, pocketZ, dropT);
          by = THREE.MathUtils.lerp(startY, pocketY, dropT);
        }

        ballMesh.setMatrixAt(i, m4.compose(p.set(bx, by, bz), q.identity(), one.set(1, 1, 1)));
      });

      ballMesh.instanceMatrix.needsUpdate = true;

      if (progress >= 1) {
        _activeSpin = null;
      }
    } else {
      for (const w of wheels) w.a += dt * w.w;
      // Outside SPINNING: ball hidden
      wheels.forEach((w, i) => {
        ballMesh.setMatrixAt(i, m4.compose(p.set(w.x, ctx.e - 20, w.z), q.identity(), one.set(0, 0, 0)));
      });
      ballMesh.instanceMatrix.needsUpdate = true;
    }

    placeRotors();
  });
  ctx.leisureStats = { slots: slots.length, roulette: wheels.length, people: L.people.length };
  L.build();
}
