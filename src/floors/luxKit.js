import * as THREE from 'three';
import { FloorCtx, makeSign } from '../world/geom.js';
import { addLuxMaterials, plaque } from '../world/lux.js';

// Phase 1 adapter for floors whose layout was built (and approved) as greybox calls: the same
// box / deco / glassBox / wall / npc / sign calls are routed into the Phase 1 kit (Lux) instead of
// the Lambert greybox batch. Each floor supplies a material picker (colour -> Lux material key),
// so the layout stays exactly as reviewed while the look becomes PBR: real materials, emissive
// neon (bloom), low-poly people instead of capsules, wall plaques instead of floating labels.
// Used by OT-03 (outreach.js) and OT-04 (securityHQ.js).

// ---------------------------------------------------------------- extra materials (shared)
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
let ready = false;
export function kitMaterials() {
  if (ready) return;
  ready = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // board-formed concrete: soft mottling, form-tie holes on a 0.6 m grid, panel joints (texture = 2.4 m)
  const concrete = canvas(512, 512, (g, w, h) => {
    const r = rng(41); g.fillStyle = '#8e9195'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) { const k = r(); g.fillStyle = `rgba(${110 + k * 60},${112 + k * 60},${116 + k * 60},0.12)`; g.fillRect(r() * w, r() * h, 4 + r() * 40, 4 + r() * 40); }
    g.fillStyle = 'rgba(40,42,46,0.55)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(64 + i * 128, 64 + j * 128, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(50,52,56,0.5)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  });
  // dark carpet tiles (0.6 m) with a faint cyan fleck (texture = 2.4 m)
  const carpet = canvas(512, 512, (g, w, h) => {
    const r = rng(43);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const k = 30 + r() * 8; g.fillStyle = `rgb(${k},${k + 4},${k + 14})`; g.fillRect(i * 128, j * 128, 128, 128); }
    for (let i = 0; i < 16000; i++) { const k = r(); g.fillStyle = k > 0.97 ? 'rgba(60,200,220,0.35)' : `rgba(${60 + k * 40},${64 + k * 40},${80 + k * 40},0.25)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; for (let p = 0; p < 4; p++) { g.fillRect(p * 128, 0, 2, h); g.fillRect(0, p * 128, w, 2); }
  });
  // perforated acoustic panel (dark), for studio and pit walls (texture = 1.2 m)
  const acoustic = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#23262e'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { g.beginPath(); g.arc(8 + i * 16, 8 + j * 16, 2.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  });
  // diamond-plate steel (catwalks, stair treads; texture = 0.6 m)
  const plate = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#5b6068'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      g.save(); g.translate(16 + i * 32 + (j % 2) * 16, 16 + j * 32); g.rotate((j % 2 ? 1 : -1) * 0.7);
      g.fillStyle = 'rgba(200,205,212,0.35)'; g.fillRect(-9, -2, 18, 4); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-9, 2, 18, 1.5); g.restore();
    }
  });
  addLuxMaterials({
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), // neon, light panels, LEDs (bloom picks them up)
    metalV: std({ vertexColors: true, roughness: 0.35, metalness: 0.85 }), // painted / powder-coated metal in any colour
    glossV: std({ vertexColors: true, roughness: 0.24, metalness: 0.15, envMapIntensity: 1.1 }), // polished resin / lacquer
    satinV: std({ vertexColors: true, roughness: 0.45, metalness: 0.1 }),
    concrete: std({ map: concrete, roughness: 0.85, metalness: 0 }),
    concreteDark: std({ map: concrete, color: 0x6a6e74, roughness: 0.6, metalness: 0.05 }),
    carpetOT: std({ map: carpet, roughness: 1, metalness: 0 }),
    acoustic: std({ map: acoustic, roughness: 0.9, metalness: 0 }),
    plate: std({ map: plate, roughness: 0.4, metalness: 0.85 }),
    glassTint: std({ color: 0x8fc8e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 0.8 }),
    // OT-03 palette (dark slate, gunmetal, neon)
    slateWall: std({ color: 0x2a3142, roughness: 0.6, metalness: 0.1 }),
    slateDeep: std({ color: 0x1b2030, roughness: 0.55, metalness: 0.15 }),
    gunmetalO: std({ color: 0x3a4150, roughness: 0.32, metalness: 0.85 }),
    coffer: std({ color: 0x0f1e26, emissive: 0x2fe0e0, emissiveIntensity: 0.45, roughness: 0.5 }),
    neonCyan: new THREE.MeshBasicMaterial({ color: 0x2fe0e0, toneMapped: false }),
    deckResin: std({ color: 0x3a4252, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.35 }),
    resinFloor: std({ color: 0x1e2430, roughness: 0.4, metalness: 0.2, envMapIntensity: 0.5 }),
    // OT-04 palette (luxury agency / corporate prison)
    hazard: std({ map: canvas(128, 128, (g, w, h) => { g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h); g.fillStyle = '#16171a'; for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32 + h, h); g.lineTo(i * 64 + h, h); g.fill(); } }), roughness: 0.6 }),
    epoxyGrey: std({ color: 0x8a8e94, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.6 }),
    velvet: std({ color: 0x4b2160, roughness: 0.95 }),
    redCarpet: std({ color: 0x7a1418, roughness: 1 }),
  }, { hazard: 0.6, epoxyGrey: 1, velvet: 1, resinFloor: 2.4, concrete: 2.4, concreteDark: 2.4, carpetOT: 2.4, acoustic: 1.2, plate: 0.6 });
}

const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48a];
const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x111111, 0x6a4a2a];

/**
 * Wrap a FloorCtx so greybox-style calls build Phase 1 geometry.
 * opts.mat(color, { solid, y0, y1 }) -> Lux material key (default 'satinV')
 * opts.glass -> material key for glassBox (default 'glass')
 * opts.person(color, i) -> extra L.person options (e.g. { sit: true })
 * opts.signStyle(opts) -> sprite style for signs that have no wall to sit on
 */
export function luxProxy(ctx, L, opts = {}) {
  kitMaterials();
  const pickMat = opts.mat || (() => 'satinV');
  let n = 0;
  const p = {
    e: ctx.e, floor: ctx.floor, group: ctx.group, colliders: ctx.colliders, barriers: ctx.barriers,
    raw: ctx, L,
    add: (...a) => ctx.add(...a), onUpdate: (fn) => ctx.onUpdate(fn), screen: (...a) => ctx.screen(...a), barrier: (...a) => ctx.barrier(...a),
    box(x0, x1, y0, y1, z0, z1, color, { collide = true } = {}) {
      if (Math.abs(x1 - x0) < 1e-4 || Math.abs(y1 - y0) < 1e-4 || Math.abs(z1 - z0) < 1e-4) return;
      L.box(x0, x1, y0, y1, z0, z1, pickMat(color, { solid: collide, y0, y1 }), { collide, color });
    },
    deco(x0, x1, y0, y1, z0, z1, color) { p.box(x0, x1, y0, y1, z0, z1, color, { collide: false }); },
    glassBox(x0, x1, y0, y1, z0, z1, color, collide = true) { L.box(x0, x1, y0, y1, z0, z1, opts.glass || 'glass', { collide }); },
    wallX(x0, x1, z0, z1, h, color, gaps = []) { FloorCtx.prototype._wall.call(p, 'x', x0, x1, z0, z1, h, color, gaps); },
    wallZ(z0, z1, x0, x1, h, color, gaps = []) { FloorCtx.prototype._wall.call(p, 'z', z0, z1, x0, x1, h, color, gaps); },
    npc(x, z, color = 0x2b3a55, yaw = 0, y = 0, extra = {}) {
      const i = n++;
      L.person(x, z, { yaw, y, suit: color, skin: SKIN[(i * 7 + 3) % SKIN.length], hair: HAIR[(i * 5 + 1) % HAIR.length], ...(opts.person ? opts.person(color, i) : {}), ...extra });
    },
    // sign: with a yaw it becomes a wall plaque; without, a styled floating panel (sprite)
    sign(text, x, y, z, o = {}) {
      if (o.yaw != null) {
        const ink = o.color || (o.gold === false ? '#f4f0e6' : '#e3c27a');
        plaque(ctx, text, x, y, z, o.yaw, { h: (o.size || 1) * 0.75, color: ink, bg: o.bg || null, sub: o.sub || null, font: o.font });
        return;
      }
      const s = makeSign(text, opts.signStyle ? opts.signStyle(o) : o);
      s.position.set(x, ctx.e + y, z);
      ctx.group.add(s);
      ctx.disposables.push(s.material.map, s.material);
    },
  };
  return p;
}
