import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Lux, LM, plaque, addLuxMaterials, peopleInstanced } from '../world/lux.js';
import { kitMaterials } from './luxKit.js';
import { luxLiftHall, ceiling } from './luxHall.js';
import { RC, RACE, RUNNERS, buildRaceScreens, updateRaceScreens, setTrackLength } from '../world/raceScreens.js';

// ================================================================= PHASE 1 — VT-04 EQUINE PERFORMANCE CENTRE
// Redesign (user, 2026-11-12): modern Dubai-style night race meeting. White GRC, champagne gold, marble,
// black glass and glowing LED lines; a night sky with floodlight pylons over the track.
// Sequence (world coords; heights relative to the slab, Y 92; H 20):
//   lift hall (X 30..50, "Members' Enclosure": bronze grille screens, turnstile line + glass fence)
//   → the portal (16 x 9 m) with two huge gold grille gate leaves standing open as fins
//   → Champions' Court (X 50..78, Z ±12, double height): the Founder's Stallion (gold rearing horse) over a
//     reflecting pool, then the grand stair (X 66..77.7) up to the concourse level (+7 m)
//   → north: Position Windows hall under the Champions' Lounge deck; south: the Asset Inspection Ring
//     (parade ring, double height) with saddling stalls under the concourse and a viewing balcony above
//   → Panorama Concourse (X 77.7..86, +7 m) behind ONE glass wall (X 86, 7..19.5 m): the track reveal
//   → over the bridge deck (X 86..96, Z -58.9..-46) onto the top walkway of the crescent Members' Grandstand
//     (rows on arcs about (149, 160), front r 200, 17 rows, cantilevered crescent roof).
// Track: dirt oval (centres (128, 0) / (170, 0), R 25..35), turf infield with a lake and a big screen.
// Plain names in code comments only: the racecourse, the betting windows, the paddock.

const TAU = Math.PI * 2;
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a, v) => a[Math.floor(v * a.length) % a.length];

// ---------------------------------------------------------------- layout (exported for the spec / tests)
const X0 = 50, XS = 77.7, XE = 86, ZN = -58.9, ZS = 58.9, DY = 7, CEIL = 19.55;
const COURT_Z = 12;
const STAIR = { x0: 66, x1: 77.7, z: 5, n: 39 };
const RISE = DY / STAIR.n, TREAD = (STAIR.x1 - STAIR.x0) / STAIR.n;
const POOL = { x0: 55, x1: 64, z: 4 };
const RING = { cx: 64, cz: 35.5, a: 12, b: 19, ai: 9, bi: 16 };
const BRIDGE = { x0: XE, x1: 96, z0: ZN, z1: -46 };
const TRK = { x0: 128, x1: 170, rin: 25, rout: 35, rc: 30 };
TRK.len = 2 * (TRK.x1 - TRK.x0) + TAU * TRK.rc;
const GX = 149, GZ = 160, R0 = 200, NROW = 17, RD = 0.85, RY = 0.4, Y0 = 0.6; // grandstand arcs about (GX, GZ)
const WALK = R0 + NROW * RD, BACK = WALK + 4.05; // top walkway r 214.45..218.5 at +7
const angAt = (x, r) => Math.atan2(-Math.sqrt(r * r - (x - GX) ** 2), x - GX);
const A0 = angAt(96, R0), A1 = angAt(202, R0); // stand ends (front corners at x 96 / 202)
const AISLES = Array.from({ length: 8 }, (_, i) => A0 + ((i + 0.5) / 8) * (A1 - A0));
const AISLE_HW = 0.75;
export const EQUINE = { X0, XS, XE, ZN, ZS, DY, STAIR, POOL, RING, BRIDGE, TRK, STAND: { GX, GZ, R0, NROW, RD, RY, WALK, BACK, A0, A1 } };

// ---------------------------------------------------------------- walkable height field
const inEll = (x, z, a, b) => ((x - RING.cx) / a) ** 2 + ((z - RING.cz) / b) ** 2 < 1;
const deckAt = (x, z) => (x >= X0 && x <= XS && z >= ZN && z <= -COURT_Z) || (x >= XS && x <= XE && z >= ZN && z <= ZS) || (x >= BRIDGE.x0 && x <= BRIDGE.x1 && z >= BRIDGE.z0 && z <= BRIDGE.z1);
const inAisle = (a, r) => AISLES.some((ac) => Math.abs(a - ac) * r < AISLE_HW);
function standAt(x, z) {
  const dx = x - GX, dz = z - GZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  if (a < A0 || a > A1 || r < R0 || r > BACK) return null;
  if (r >= WALK) return DY;
  if (inAisle(a, r)) return 0.4 + 0.2 * Math.floor((r - R0) / (RD / 2));
  return Y0 + RY * Math.floor((r - R0) / RD);
}
const inApron = (x, z) => { const a = Math.atan2(z - GZ, x - GX); return a >= A0 - 0.01 && a <= A1 + 0.01 && Math.hypot(x - GX, z - GZ) < R0; };
function groundAt(x, z, yl) {
  if (x >= STAIR.x0 && x < STAIR.x1 && Math.abs(z) <= STAIR.z) return Math.min(DY, (Math.floor((x - STAIR.x0) / TREAD) + 1) * RISE);
  const s = standAt(x, z);
  if (s != null) return s;
  if (deckAt(x, z)) return yl > 3.5 ? DY : 0; // two levels: under the decks (y 0) and on them (+7)
  return 0;
}
const covers = (x, z) => x >= X0 && x <= 208.9 && Math.abs(z) <= 59;
export function equineShape(e, H) {
  return {
    active: (y) => y > e - 1 && y < e + H - 0.5,
    covers,
    ground: (x, z, y = e) => e + groundAt(x, z, y - e),
    blocks(px, pz, x, z, y) {
      if (!covers(x, z)) return false;
      const yl = y - e, g = groundAt(x, z, yl);
      if (g > yl + 0.45 || g < yl - 0.5) return true; // too high to step up, or a drop (deck edges, stand front)
      if (yl < 1.5 && inEll(x, z, RING.a + 0.3, RING.b + 0.3) !== inEll(px, pz, RING.a + 0.3, RING.b + 0.3)) return true; // ring rail
      if ((standAt(px, pz) != null) !== (standAt(x, z) != null) && (inApron(x, z) || inApron(px, pz))) return true; // the glass front barrier
      return false;
    },
    gridBlock: (x, z) => covers(x, z) && (x > XE - 0.6 || (x > STAIR.x0 - 0.6 && Math.abs(z) < STAIR.z + 0.6) || inEll(x, z, RING.a + 0.9, RING.b + 0.9)),
  };
}

// ---------------------------------------------------------------- materials + textures
const canvasT = (w, h, draw, repeat = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
let READY = false;
function initMaterials() {
  if (READY) return;
  READY = true;
  kitMaterials();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const dirt = canvasT(256, 256, (g, w, h) => {
    const r = rng(91); g.fillStyle = '#7a5130'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const k = r(); g.fillStyle = `rgba(${90 + k * 80},${60 + k * 50},${35 + k * 30},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = 'rgba(60,38,20,0.35)'; g.lineWidth = 2; for (let i = 0; i < 22; i++) { const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w / 3, y + (r() - 0.5) * 8, (2 * w) / 3, y + (r() - 0.5) * 8, w, y); g.stroke(); }
  });
  dirt.repeat.set(1 / 6, 1 / 6);
  const turf = canvasT(512, 512, (g, w, h) => {
    const r = rng(93);
    for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#33702f' : '#3e8038'; g.fillRect(0, (i * h) / 2, w, h / 2); }
    for (let i = 0; i < 9000; i++) { const k = r(); g.fillStyle = `rgba(${30 + k * 50},${90 + k * 60},${30 + k * 40},0.3)`; g.fillRect(r() * w, r() * h, 1.5, 2.5); }
  });
  turf.repeat.set(1 / 14, 1 / 14);
  const stars = canvasT(2048, 1024, (g, w, h) => {
    const r = rng(97);
    const grd = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7); grd.addColorStop(0, '#02030a'); grd.addColorStop(1, '#0b1330');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,130,200,0.05)'; for (let i = 0; i < 160; i++) { g.beginPath(); g.ellipse(w * (0.2 + r() * 0.6), h * (0.5 + (r() - 0.5) * 0.5) + (r() - 0.5) * 120, 40 + r() * 140, 10 + r() * 40, -0.35, 0, TAU); g.fill(); } // faint milky band
    for (let i = 0; i < 1400; i++) { const k = r() ** 3; g.fillStyle = `rgba(${210 + k * 45},${215 + k * 40},255,${0.18 + k * 0.6})`; g.fillRect(r() * w, r() * h, 0.8 + k * 1.4, 0.8 + k * 1.4); } // fine, mostly faint stars
  }, false);
  const skyline = canvasT(2048, 384, (g, w, h) => {
    const r = rng(99);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#03050c'); grd.addColorStop(0.55, '#0e1638'); grd.addColorStop(0.82, '#2a2a5a'); grd.addColorStop(1, '#3a2a48');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(220,225,255,${0.2 + r() * 0.5})`; g.fillRect(r() * w, r() * h * 0.45, 1.5, 1.5); }
    const tower = (x, tw, th, spire) => {
      const y = h - 34 - th;
      g.fillStyle = '#070a14'; g.fillRect(x, y, tw, th + 34);
      if (spire) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + tw / 2, y - spire); g.lineTo(x + tw, y); g.fill(); }
      for (let wy = y + 6; wy < h - 40; wy += 7) for (let wx = x + 3; wx < x + tw - 3; wx += 5) if (r() < 0.32) { g.fillStyle = r() < 0.7 ? 'rgba(255,214,150,0.85)' : 'rgba(180,210,255,0.8)'; g.fillRect(wx, wy, 2, 3); }
    };
    for (let x = 0; x < w;) { const tw = 18 + r() * 46, th = 40 + r() * 150; tower(x, tw, th, r() < 0.15 ? 20 + r() * 40 : 0); x += tw + 2 + r() * 14; }
    tower(w * 0.62, 30, 250, 90); // the supertall needle
    g.fillStyle = '#05070d'; g.fillRect(0, h - 34, w, 34);
    for (let x = 0; x < w; x += 6) { g.fillStyle = `rgba(255,${150 + r() * 60},70,${0.4 + r() * 0.5})`; g.fillRect(x, h - 22 + Math.sin(x * 0.01) * 3, 2, 2); } // the road
  });
  skyline.wrapT = THREE.ClampToEdgeWrapping;
  const lattice = canvasT(512, 512, (g, w) => { // modern mashrabiya: 8-point stars on a 4 x 4 grid (texture = 2 m)
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#fff'; g.lineWidth = 9;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = 64 + i * 128, cy = 64 + j * 128, s = 44;
      g.strokeRect(cx - s, cy - s, 2 * s, 2 * s);
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4); g.strokeRect(-s, -s, 2 * s, 2 * s); g.restore();
      g.beginPath(); g.arc(cx, cy, 14, 0, TAU); g.stroke();
    }
    g.lineWidth = 6; for (let p = 0; p <= w; p += 128) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, w); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  });
  lattice.colorSpace = THREE.NoColorSpace;
  addLuxMaterials({
    ecWhite: std({ color: 0xf3f1ec, roughness: 0.32, metalness: 0.05, envMapIntensity: 0.6 }),
    ecWhiteDeep: std({ color: 0xdedbd3, roughness: 0.4 }),
    ecPanel: std({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: 0.9, roughness: 0.6 }),
    ecGold: std({ color: 0xd6b47a, roughness: 0.3, metalness: 1, envMapIntensity: 0.6 }),
    ecBlackGlass: std({ color: 0x0c0e14, roughness: 0.06, metalness: 0.5, envMapIntensity: 1 }),
    ecRunner: std({ color: 0x141a33, roughness: 0.95 }),
    ecDirt: std({ map: dirt, roughness: 0.95 }),
    ecTurf: std({ map: turf, roughness: 0.9 }),
    ecTurfDark: std({ color: 0x17301b, roughness: 0.95 }),
    ecSand: std({ color: 0xcdb184, roughness: 1 }),
    ecGrass: std({ color: 0x3f7d3a, roughness: 0.9 }),
    ecSky: new THREE.MeshBasicMaterial({ map: stars, toneMapped: false }),
    ecSkyline: new THREE.MeshBasicMaterial({ map: skyline, toneMapped: false, color: 0xbfc4d8 }),
    ecLattice: std({ color: 0xd6b47a, roughness: 0.32, metalness: 1, alphaMap: lattice, alphaTest: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.7 }),
    ecBacklight: std({ color: 0x2a1c0c, emissive: 0xffc27a, emissiveIntensity: 0.75, roughness: 0.8 }),
    ecBeam: new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.022, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    ecSeat: std({ color: 0xffffff, roughness: 0.5 }),
    ecHorseDark: std({ color: 0x15110e, roughness: 0.8 }),
    ecJockeyWhite: std({ color: 0xf2f0ea, roughness: 0.7 }),
  }, {});
}

// ---------------------------------------------------------------- geometry helpers
// quads with an expected facing (the winding is fixed to match it), as one non-indexed geometry
function quads() {
  const pos = [];
  return {
    q(a, b, c, d, n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) [b, d] = [d, b];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    },
    get empty() { return !pos.length; },
    geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; },
  };
}
const PP = (r, a, y) => [GX + r * Math.cos(a), y, GZ + r * Math.sin(a)];
const radial = (a) => [Math.cos(a), 0, Math.sin(a)];
const neg = (v) => [-v[0], -v[1], -v[2]];
const angs = (a0, a1, r, seg = 1.6) => { const n = Math.max(1, Math.ceil(((a1 - a0) * r) / seg)); return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n); };
// angular spans of [a0, a1] at radius r with the aisles cut out
function spans(a0, a1, r, pad = 0) {
  const cuts = AISLES.map((ac) => [ac - (AISLE_HW + pad) / r, ac + (AISLE_HW + pad) / r]);
  const out = []; let a = a0;
  for (const [c0, c1] of cuts) { if (c0 > a) out.push([a, c0]); a = Math.max(a, c1); }
  if (a < a1) out.push([a, a1]);
  return out;
}
const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
// box of cross-section w x h from point a to point b (local z along a->b)
function obGeo(a, b, w, h) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, h, len);
  const dir = B.clone().sub(A).normalize();
  const m = new THREE.Matrix4().lookAt(B, A, Math.abs(dir.y) > 0.95 ? _x : _up);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  return g.applyMatrix4(m);
}
// vertical profile (u = radius, v = height) extruded along the tangent at angle a (stand end walls)
function polarProfile(a, pts, thick) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))), { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  const p = g.attributes.position, c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i), w = p.getZ(i); p.setXYZ(i, GX + u * c - w * s, v, GZ + u * s + w * c); }
  g.computeVertexNormals();
  return g;
}
// a plane in the YZ plane (facing +x or -x) with UVs in metres / tile
function planeX(x, y0, y1, z0, z1, facing, tile) {
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (z1 - z0)) / tile, (uv.getY(i) * (y1 - y0)) / tile);
  g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
// stadium (track) outline point at radius R, parameter t in metres along the centre line
function trackPos(s, lane = 0) {
  const R = TRK.rc + lane, S = TRK.x1 - TRK.x0, arc = Math.PI * TRK.rc;
  s = ((s % TRK.len) + TRK.len) % TRK.len;
  if (s < S) return [TRK.x0 + s, -R, Math.PI / 2]; // north straight (in front of the stand), heading +x
  s -= S;
  if (s < arc) { const t = -Math.PI / 2 + s / TRK.rc; return [TRK.x1 + R * Math.cos(t), R * Math.sin(t), Math.atan2(-Math.sin(t), Math.cos(t))]; }
  s -= arc;
  if (s < S) return [TRK.x1 - s, R, -Math.PI / 2];
  s -= S;
  const t = Math.PI / 2 + s / TRK.rc;
  return [TRK.x0 + R * Math.cos(t), R * Math.sin(t), Math.atan2(-Math.sin(t), Math.cos(t))];
}
const stadiumPts = (R, step = 2) => { const n = Math.ceil(TRK.len / step); return Array.from({ length: n }, (_, i) => { const [x, z] = trackPos((i / n) * TRK.len, R - TRK.rc); return [x, z]; }); };
function stadiumShape(R) { // in shape coords (x, -z) so rotateX(-PI/2) puts it at world (x, z)
  const s = new THREE.Shape();
  s.moveTo(TRK.x0, R); s.lineTo(TRK.x1, R);
  s.absarc(TRK.x1, 0, R, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(TRK.x0, -R);
  s.absarc(TRK.x0, 0, R, -Math.PI / 2, -3 * Math.PI / 2, true);
  return s;
}
const flatShape = (shape, y, seg = 48) => { const g = new THREE.ShapeGeometry(shape, seg); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };

// ---------------------------------------------------------------- horses (instanced, low-poly; forward = +z)
let HORSE = null;
function horseGeo() {
  if (HORSE) return HORSE;
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const coat = mergeGeometries([
    B(0.62, 0.7, 1.75, 0, 1.3, 0), B(0.56, 0.62, 0.5, 0, 1.25, 0.85), B(0.6, 0.56, 0.52, 0, 1.38, -0.76),
    obGeo([0, 1.45, 0.95], [0, 2.08, 1.36], 0.3, 0.38), obGeo([0, 2.12, 1.28], [0, 1.74, 1.8], 0.22, 0.3),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => B(0.15, 0.95, 0.17, sx * 0.2, 0.5, sz * 0.68)),
  ]);
  const dark = mergeGeometries([
    obGeo([0, 1.55, -1.0], [0, 0.85, -1.28], 0.14, 0.16), obGeo([0, 2.2, 1.26], [0, 1.7, 0.96], 0.07, 0.14),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => B(0.17, 0.12, 0.2, sx * 0.2, 0.06, sz * 0.68)),
  ]);
  const cloth = B(0.66, 0.42, 0.62, 0, 1.4, 0.02);
  const silk = mergeGeometries([obGeo([0, 1.82, -0.08], [0, 2.14, 0.36], 0.36, 0.26), new THREE.SphereGeometry(0.13, 8, 6).translate(0, 2.3, 0.46),
    obGeo([0.17, 2.06, 0.3], [0.15, 1.82, 0.76], 0.08, 0.08), obGeo([-0.17, 2.06, 0.3], [-0.15, 1.82, 0.76], 0.08, 0.08)]);
  const legs = mergeGeometries([obGeo([0.2, 1.8, -0.02], [0.26, 1.62, 0.3], 0.12, 0.12), obGeo([-0.2, 1.8, -0.02], [-0.26, 1.62, 0.3], 0.12, 0.12),
    obGeo([0.26, 1.62, 0.3], [0.3, 1.3, 0.18], 0.1, 0.1), obGeo([-0.26, 1.62, 0.3], [-0.3, 1.3, 0.18], 0.1, 0.1)]);
  HORSE = { coat, dark, cloth, silk, legs };
  return HORSE;
}
const COATS = [0x6b3e1f, 0x8a4a22, 0xb9b4ad, 0x1d1a18, 0x4a2a16, 0x7a4a2a];

// ---------------------------------------------------------------- the floor
export function equineCentre(ctx) {
  initMaterials();
  const L = new Lux(ctx);
  L.noShadow = { has: () => true };
  const e = ctx.e, H = ctx.floor.height, r = rng(4242);
  const scr = []; // race screens {x, y (world), z, yaw, w, h, cell}
  const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48c];
  const HAIR = [0x111111, 0x2a1a10, 0x3a2a1a, 0x5a3a20, 0x111111];
  const DRESS = [0x0b0e18, 0x1c1c22, 0xf4f2ee, 0xf4f2ee, 0x2a2a30, 0x1b2550, 0x7a1418, 0xd6b47a, 0x14532d, 0x4c1d95, 0xe8e4da, 0x111111]; // suits, kanduras, gowns
  const guest = (x, z, o = {}) => L.person(x, z, { suit: pick(DRESS, r()), skin: pick(SKIN, r()), hair: pick(HAIR, r()), ...o });
  const box = (x0, x1, y0, y1, z0, z1, m, o) => L.box(x0, x1, y0, y1, z0, z1, m, o);
  const screen = (x, y, z, yaw, w, cell) => scr.push({ x, y: e + y, z, yaw, w, h: w * 0.5625, cell });

  // ================================================================ lift hall: Members' Enclosure
  luxLiftHall(ctx, L, {
    s: 1, H: 12.5, z0: -39.65, z1: 39.65, portal: { half: 8, top: 9 },
    P: { wall: 'ecWhite', wallDeep: 'ecWhiteDeep', panel: 'ecPanel', frame: 'ecGold', frameDark: 'blackMetal', dado: 'ecBlackGlass', cap: 'ecGold', floor: 'marble', floorTile: 2.4,
      runner: 'ecRunner', edge: 'ecGold', liner: 'brushedBronze', ink: '#e3c27a', kioskBg: '#0a0d18', kioskBtn: '#1b2550', kioskEdge: '#d6b47a', hostSuit: 0x0b0e18 },
    ceo: 'ceo_vt',
    banks: [['vt_high', 'WELLNESS HIGH-RISE · L · 3–4', true], ['freight_vt', 'FREIGHT · ALC SERVICE', false]],
    kiosks: [['vt_high', ['L', '3', '4']]],
    link: null,
    portalText: "MEMBERS' ENCLOSURE", portalSub: 'Equine Performance Centre · Night Meeting',
    board: (c, x, y, z, yaw) => scr.push({ x: x + 0.02, y: e + y - 0.4, z, yaw, w: 4.8, h: 2.7, cell: RC.PRICING }),
    planters: [-30, 30, -20, 20],
  });
  // bronze grille screens on the portal wall, back-lit (between the pilasters at ±18 / ±26 / ±34)
  for (const sg of [-1, 1]) for (const [a, b] of [[9.4, 17.5], [18.5, 25.5], [26.5, 33.5], [34.5, 39.2]]) {
    const z0 = sg < 0 ? -b : a, z1 = sg < 0 ? -a : b;
    L.geo(planeX(49.57, 1.4, 11.6, z0, z1, -1, 1), 'ecBacklight');
    L.geo(planeX(49.45, 1.4, 11.6, z0, z1, -1, 2), 'ecLattice');
    box(49.3, 49.6, 11.6, 11.75, z0, z1, 'ecGold');
  }
  // turnstile line (6 lanes) and a glass fence across the whole hall at X 46.5
  for (let i = 0; i < 7; i++) {
    const z = -8 + i * (16 / 6);
    box(45.7, 47.3, 0, 1.02, z - 0.15, z + 0.15, 'ecBlackGlass', { collide: true });
    box(45.68, 47.32, 1.02, 1.07, z - 0.17, z + 0.17, 'ecGold');
    box(46.95, 47.15, 1.07, 1.09, z - 0.06, z + 0.06, 'glow', { color: 0x3cff9a });
    for (const s of [-1, 1]) if ((i > 0 || s > 0) && (i < 6 || s < 0)) box(46.1, 46.9, 0.5, 1.6, z + s * 0.15, z + s * 0.62, 'glass');
  }
  for (const [z0, z1] of [[-39.65, -8.15], [8.15, 39.65]]) {
    box(46.45, 46.55, 0, 1.3, z0, z1, 'glass', { collide: true });
    box(46.42, 46.58, 1.3, 1.36, z0, z1, 'ecGold');
  }
  plaque(ctx, 'MEMBERS ONLY BEYOND THIS POINT', 46.62, 1.9, -23, Math.PI / 2, { h: 0.32, color: '#e3c27a' });
  plaque(ctx, 'MEMBERS ONLY BEYOND THIS POINT', 46.62, 1.9, 23, Math.PI / 2, { h: 0.32, color: '#e3c27a' });
  for (const z of [-9.3, 9.3]) L.person(47.9, z, { yaw: -Math.PI / 2, suit: 0x0b0e18, skin: pick(SKIN, r()), hair: 0x111111 });
  for (const z of [-4, 4]) L.person(44.6, z, { yaw: Math.PI / 2, suit: 0x0b0e18, skin: pick(SKIN, r()), hair: 0x111111 });
  for (let i = 0; i < 10; i++) guest(37 + r() * 7, -30 + r() * 60, { walk: [[36, -30 + i * 6], [44, -30 + i * 6 + 2], [44.8, 0], [36.5, 1 + i]], speed: 1 + r() * 0.4 });

  // ================================================================ the west block shell (court, windows hall, ring, concourse)
  L.floor(X0, XE, ZN, ZS, 0.012, 'marble');
  for (const z of [-COURT_Z, COURT_Z]) box(X0, STAIR.x0, 0.012, 0.024, z - 0.06, z + 0.06, 'ecGold'); // inlaid gold lines along the court
  box(X0, STAIR.x0, 0.012, 0.022, -2.2, 2.2, 'ecRunner'); // runner from the gate to the pool
  // walls: west (around the portal), north, south, the ground-level east wall, glass wall above
  box(X0, X0 + 0.12, 0, CEIL, ZN, -8, 'ecWhite'); box(X0, X0 + 0.12, 0, CEIL, 8, ZS, 'ecWhite'); box(X0, X0 + 0.12, 9, CEIL, -8, 8, 'ecWhite');
  for (const z of [-8.25, 8.25]) box(X0, X0 + 0.6, 0, 9.5, z - 0.25, z + 0.25, 'ecGold');
  box(X0, X0 + 0.6, 9, 9.5, -8.5, 8.5, 'ecGold');
  for (let z = -54; z <= 54; z += 6) if (Math.abs(z) > 9) box(X0 + 0.12, X0 + 0.16, 0, CEIL, z - 0.04, z + 0.04, 'ecGold');
  box(X0, XE, 0, CEIL, ZN - 0.1, ZN + 0.02, 'ecWhite'); box(X0, XE, 0, CEIL, ZS - 0.02, ZS + 0.1, 'ecWhite');
  box(XE - 0.2, XE + 0.2, 0, 6.7, BRIDGE.z1, ZS, 'ecWhite', { collide: true });
  box(XE - 0.21, XE + 0.21, 6.2, 6.7, BRIDGE.z1, ZS, 'ecGold');
  box(XE - 0.05, XE + 0.05, DY, CEIL, BRIDGE.z1, ZS, 'glass'); // THE glass wall
  for (let z = BRIDGE.z1; z <= ZS + 0.01; z += 4.2) box(XE - 0.1, XE + 0.1, DY, CEIL, Math.min(z, ZS) - 0.08, Math.min(z, ZS) + 0.08, 'ecGold');
  box(XE - 0.1, XE + 0.1, 13.2, 13.35, BRIDGE.z1, ZS, 'ecGold');
  box(XE - 0.05, XE + 0.05, 10.5, CEIL, ZN, BRIDGE.z1, 'glass'); box(XE - 0.12, XE + 0.12, 10.3, 10.6, ZN, BRIDGE.z1, 'ecGold'); // over the bridge doorway
  plaque(ctx, "MEMBERS' GRANDSTAND", XE - 0.16, 11.6, (ZN + BRIDGE.z1) / 2, -Math.PI / 2, { h: 0.5, color: '#e3c27a', sub: 'This way to your allocation' });
  ceiling(L, { wall: 'ecWhite', wallDeep: 'ecWhiteDeep', panel: 'ecPanel' }, CEIL, X0, XE, ZN, ZS, 4.2);
  plaque(ctx, 'EQUINE PERFORMANCE CENTRE', X0 + 0.2, 12.2, 0, Math.PI / 2, { h: 1.5, color: '#e3c27a', sub: 'Velocity · Pedigree · Conviction' });

  // decks (+7): Champions' Lounge (north), Panorama Concourse (east), the bridge block onto the stand
  const deck = (x0, x1, z0, z1) => {
    box(x0, x1, 6.7, DY, z0, z1, 'ecWhite');
    L.floor(x0, x1, z0, z1, DY + 0.012, 'stone');
    for (let x = x0 + 1.5; x < x1 - 1; x += 3) for (let z = z0 + 1.5; z < z1 - 1; z += 3) box(x - 0.18, x + 0.18, 6.68, 6.7, z - 0.18, z + 0.18, 'downlight');
  };
  deck(X0, XS, ZN, -COURT_Z);
  deck(XS, XE, ZN, ZS);
  box(BRIDGE.x0, BRIDGE.x1, 0, DY, BRIDGE.z0, BRIDGE.z1, 'ecWhite', { collide: true });
  L.floor(BRIDGE.x0, BRIDGE.x1, BRIDGE.z0, BRIDGE.z1, DY + 0.012, 'stone');
  box(BRIDGE.x0, BRIDGE.x1 + 0.02, 6.2, 6.7, BRIDGE.z1 - 0.02, BRIDGE.z1 + 0.02, 'ecGold');
  box(BRIDGE.x0, BRIDGE.x1, DY, CEIL, ZN - 0.1, ZN + 0.02, 'ecWhite'); // north wall beside the bridge (was bare shell)

  box(XS, XE, 0, 6.7, -COURT_Z, COURT_Z, 'ecWhite', { collide: true }); // structure under the concourse behind the stair
  for (const [z0, z1] of [[-11.5, -5.5], [5.5, 11.5]]) box(XS - 0.08, XS, 0.3, 6.4, z0, z1, 'onyx'); // back-lit onyx either side of the stair
  // deck edges: gold fascia + glass balustrade with a gold rail
  const rail = (x0, x1, z0, z1) => {
    box(x0, x1, 6.55, DY, z0, z1, 'ecGold');
    box(x0, x1, DY, DY + 1.1, z0, z1, 'glass');
    const wx = Math.abs(x1 - x0) < 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (wx) box(cx - 0.05, cx + 0.05, DY + 1.1, DY + 1.16, z0, z1, 'ecGold'); else box(x0, x1, DY + 1.1, DY + 1.16, cz - 0.05, cz + 0.05, 'ecGold');
  };
  rail(X0, XS, -COURT_Z - 0.06, -COURT_Z + 0.06);
  rail(XS - 0.06, XS + 0.06, -COURT_Z, -STAIR.z); rail(XS - 0.06, XS + 0.06, STAIR.z, ZS);
  rail(BRIDGE.x0 + 0.2, BRIDGE.x1, BRIDGE.z1 - 0.06, BRIDGE.z1 + 0.06); // open south edge of the bridge deck
  rail(BRIDGE.x1 - 0.06, BRIDGE.x1 + 0.06, BRIDGE.z1, -47.6); // short east edge before the stand walkway
  // columns under the deck edges
  for (const [x, z] of [[54, -12], [61, -12], [68, -12], [75, -12], ...[12, 19, 26, 33, 40, 47, 54].map((zz) => [XS, zz])]) {
    L.cyl(x, z, 0.42, 0, 6.55, 'ecWhite', { seg: 20, collide: true });
    L.cyl(x, z, 0.5, 0, 0.3, 'ecGold', { seg: 20 }); L.cyl(x, z, 0.5, 6.3, 6.55, 'ecGold', { seg: 20 });
  }

  // ================================================================ the grand stair (+7)
  for (let k = 0; k < STAIR.n; k++) {
    const x0 = STAIR.x0 + k * TREAD, top = (k + 1) * RISE;
    box(x0, x0 + TREAD + 0.01, 0, top, -STAIR.z, STAIR.z, 'marble');
    box(x0, x0 + 0.04, top - 0.03, top + 0.004, -STAIR.z, STAIR.z, 'ecGold');
  }
  box(STAIR.x0, STAIR.x1, 0.012, 0.03, -1.6, 1.6, 'ecRunner');
  {
    const q = quads(), side = quads();
    for (const sz of [-1, 1]) {
      const z = sz * (STAIR.z + 0.15), n = [0, 0, sz];
      side.q([STAIR.x0, 0, z], [STAIR.x1, 0, z], [STAIR.x1, DY + 0.25, z], [STAIR.x0, 0.25, z], n); // cheek wall
      side.q([STAIR.x0, 0.25, z], [STAIR.x1, DY + 0.25, z], [STAIR.x1, DY + 0.25, z - sz * 0.15], [STAIR.x0, 0.25, z - sz * 0.15], [0, 1, 0]);
      for (const dz of [0.02, -0.02]) q.q([STAIR.x0, 0.25, z + dz - sz * 0.07], [STAIR.x1, DY + 0.25, z + dz - sz * 0.07], [STAIR.x1, DY + 1.3, z + dz - sz * 0.07], [STAIR.x0, 1.3, z + dz - sz * 0.07], [0, 0, dz > 0 ? 1 : -1]);
      L.geo(obGeo([STAIR.x0, 1.32, z - sz * 0.07], [STAIR.x1, DY + 1.32, z - sz * 0.07], 0.08, 0.08), 'ecGold');
    }
    L.geo(side.geo(), 'ecWhite'); L.geo(q.geo(), 'glass');
  }

  // ================================================================ Champions' Court: the reflecting pool and the Founder's Stallion
  for (const [x0, x1, z0, z1] of [[POOL.x0, POOL.x1, -POOL.z, -POOL.z + 0.4], [POOL.x0, POOL.x1, POOL.z - 0.4, POOL.z], [POOL.x0, POOL.x0 + 0.4, -POOL.z, POOL.z], [POOL.x1 - 0.4, POOL.x1, -POOL.z, POOL.z]]) {
    box(x0, x1, 0, 0.5, z0, z1, 'ecWhite', { collide: true }); box(x0, x1, 0.5, 0.53, z0, z1, 'ecGold');
  }
  box(POOL.x0 + 0.4, POOL.x1 - 0.4, 0, 0.05, -POOL.z + 0.4, POOL.z - 0.4, 'ecBlackGlass');
  box(POOL.x0 + 0.4, POOL.x1 - 0.4, 0.05, 0.36, -POOL.z + 0.4, POOL.z - 0.4, 'water');
  const SX = 59.5;
  box(SX - 1.2, SX + 1.2, 0.36, 2.0, -1.3, 1.3, 'ecBlackGlass', { collide: true }); box(SX - 1.25, SX + 1.25, 1.85, 2.0, -1.35, 1.35, 'ecGold');
  plaque(ctx, "THE FOUNDER'S STALLION", SX - 1.23, 1.35, 0, -Math.PI / 2, { h: 0.2, color: '#e3c27a', sub: 'Unrealised potential, fully priced' });
  {
    const G = horseGeo(), statue = mergeGeometries([G.coat.clone(), G.dark.clone()]);
    const m = new THREE.Matrix4().makeTranslation(SX - 1.1, 2.0, 0) // hind hooves land on the plinth, the forehand rears out over the pool
      .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(2.5, 2.5, 2.5))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.68)).multiply(new THREE.Matrix4().makeRotationX(-0.42)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.68));
    L.geo(statue.applyMatrix4(m), 'gold');
  }
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; if (Math.abs(Math.sin(a)) < 0.45) continue; guest(SX + Math.cos(a) * 7.2, Math.sin(a) * 6.2 * (Math.abs(Math.sin(a)) > 0.5 ? 1 : 1.1), { yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), fidget: 0.3 }); }
  for (const z of [-6.6, 6.6]) L.person(51.6, z, { yaw: Math.PI / 2, suit: 0x0b0e18, skin: pick(SKIN, r()), hair: 0x111111 });
  for (let i = 0; i < 16; i++) { const sz = i % 2 ? 1 : -1; guest(52 + r() * 10, sz * (6 + r() * 4), { walk: [[51.5, sz * 6.2], [65, sz * 6.2], [65.4, sz * 10.5], [52, sz * 10.8]], speed: 1 + r() * 0.5 }); }
  // giant gold grille gate leaves, standing open as fins either side of the entrance
  for (const sz of [-1, 1]) {
    const z = sz * 7.55;
    const g = new THREE.PlaneGeometry(7.9, 8.75); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 7.9) / 2, (uv.getY(i) * 8.75) / 2);
    g.translate(X0 + 0.5 + 3.95, 0.25 + 4.375, z);
    L.geo(g, 'ecLattice');
    box(X0 + 0.4, X0 + 8.5, 0, 0.25, z - 0.12, z + 0.12, 'ecGold', { collide: true });
    box(X0 + 0.4, X0 + 8.5, 9.0, 9.2, z - 0.12, z + 0.12, 'ecGold');
    box(X0 + 0.3, X0 + 0.6, 0, 9.2, z - 0.15, z + 0.15, 'ecGold'); box(X0 + 8.4, X0 + 8.6, 0, 9.2, z - 0.1, z + 0.1, 'ecGold');
    box(X0 + 4.4, X0 + 4.55, 0.25, 9.0, z - 0.06, z + 0.06, 'ecGold');
    ctx.colliders.push({ x0: X0 + 0.4, x1: X0 + 8.5, z0: z - 0.1, z1: z + 0.1, y0: e, y1: e + 9 });
  }

  // ================================================================ Position Windows (north, under the lounge deck)
  for (let i = 0; i < 12; i++) {
    const x0 = 53 + i * 2.5, xc = x0 + 1.25;
    box(x0 + 0.1, x0 + 2.4, 0, 1.1, ZN, -57.4, 'walnut', { collide: true }); box(x0 + 0.08, x0 + 2.42, 1.1, 1.15, ZN, -57.35, 'ecGold');
    box(x0 + 0.1, x0 + 2.4, 1.15, 2.5, -57.52, -57.46, 'glass');
    box(x0 - 0.05, x0 + 0.05, 0, 2.8, ZN, -56.9, 'ecWhite', { collide: true });
    L.person(xc, -58.35, { yaw: 0, suit: 0x0b0e18, skin: pick(SKIN, r()), hair: pick(HAIR, r()) });
    screen(xc, 3.42, ZN + 0.1, 0, 2.0, RC.PRICING);
    for (let k = 0; k < 1 + Math.floor(r() * 3); k++) guest(xc + (r() - 0.5) * 0.3, -56.6 + k * 1.0, { yaw: Math.PI, fidget: 0.2 });
  }
  box(52.95, 83.05, 0, 2.8, ZN, ZN + 0.05, 'ecBlackGlass');
  box(52.9, 83.1, 2.8, 2.86, ZN, -56.9, 'ecGold');
  [RC.RACE, RC.PRICING, RC.RESULTS, RC.PRICING, RC.RACE, RC.BRAND].forEach((cell, i) => screen(55.6 + i * 5, 5.35, ZN + 0.1, 0, 4.4, cell));
  plaque(ctx, 'POSITION WINDOWS', X0 + 0.2, 4.6, -35, Math.PI / 2, { h: 0.55, color: '#e3c27a', sub: 'Open Position · Pricing live' });
  for (const [x, z] of [[58, -46], [66, -44], [74, -46], [62, -34], [70, -32], [58, -22], [76, -24], [82, -40], [82, -26]]) {
    L.cyl(x, z, 0.4, 0, 1.08, 'ecGold', { seg: 14, collide: true }); L.cyl(x, z, 0.45, 1.08, 1.12, 'ecBlackGlass', { seg: 14 });
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + r(); guest(x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, { yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), fidget: 0.4 }); }
  }
  for (let i = 0; i < 18; i++) guest(55 + r() * 25, -50 + r() * 34, { walk: [[54, -52 + (i % 6) * 6], [80, -52 + (i % 6) * 6 + 2], [80, -18], [54, -17]], speed: 1 + r() * 0.5 });

  // ================================================================ Asset Inspection Ring (the parade ring, south, double height)
  {
    const sand = new THREE.Shape(); sand.absellipse(RING.cx, -RING.cz, RING.a, RING.b, 0, TAU, false);
    const hole = new THREE.Path(); hole.absellipse(RING.cx, -RING.cz, RING.ai, RING.bi, 0, TAU, true); sand.holes.push(hole);
    L.geo(flatShape(sand, 0.03, 64), 'ecSand');
    const grass = new THREE.Shape(); grass.absellipse(RING.cx, -RING.cz, RING.ai, RING.bi, 0, TAU, false);
    L.geo(flatShape(grass, 0.03, 64), 'ecTurf');
    const ell = (a, b, n) => Array.from({ length: n }, (_, i) => { const t = (i / n) * TAU; return [RING.cx + a * Math.cos(t), RING.cz + b * Math.sin(t)]; });
    const tube = (pts, y, rad, mat) => L.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), true), pts.length * 2, rad, 6, true), mat);
    const outer = ell(RING.a, RING.b, 48), inner = ell(RING.ai - 0.1, RING.bi - 0.1, 40);
    for (const [x, z] of outer) L.cyl(x, z, 0.06, 0, 1.15, 'ecWhite', { seg: 6 });
    tube(outer, 1.1, 0.06, 'ecWhite'); tube(outer, 0.6, 0.05, 'ecWhite');
    for (const [x, z] of inner) L.cyl(x, z, 0.04, 0, 0.6, 'ecWhite', { seg: 6 });
    tube(inner, 0.58, 0.04, 'ecWhite');
    // crowd on the rail
    ell(RING.a + 1.1, RING.b + 1.1, 54).forEach(([x, z], i) => { if (r() < 0.75) guest(x, z, { yaw: Math.atan2(RING.cx - x, RING.cz - z), fidget: 0.35 }); void i; });
    plaque(ctx, 'ASSET INSPECTION RING', 64, 7.9, ZS - 0.15, Math.PI, { h: 0.6, color: '#e3c27a', sub: 'Pre-performance due diligence' });
    screen(64, 14.9, ZS - 0.15, Math.PI, 14, RC.PRICING);
    screen(64, 14.9, ZN + 0.15, 0, 14, RC.RACE);
    plaque(ctx, "CHAMPIONS' LOUNGE", 64, 10.2, ZN + 0.15, 0, { h: 0.5, color: '#e3c27a' });
  }
  // saddling stalls under the concourse (X 80.5..86), facing the ring
  for (let i = 0; i <= 10; i++) { const z = 14 + i * 4; box(80.5, XE - 0.2, 0, 2.6, z - 0.08, z + 0.08, 'walnut', { collide: true }); box(80.45, XE - 0.2, 2.6, 2.68, z - 0.1, z + 0.1, 'ecGold'); }
  box(80.5, XE - 0.2, 2.68, 3.0, 14, 54, 'ecWhiteDeep');
  plaque(ctx, 'SADDLING STALLS', XS + 0.45, 4.6, 34, Math.PI / 2, { h: 0.35, color: '#e3c27a' });

  // ================================================================ Champions' Lounge (north deck, +7) and Panorama Concourse (+7)
  box(56, 72, DY, DY + 1.1, -57.6, -56.4, 'walnut', { collide: true }); box(55.95, 72.05, DY + 1.1, DY + 1.16, -57.65, -56.35, 'ecGold');
  box(56, 72, DY + 1.4, DY + 2.6, ZN + 0.02, ZN + 0.3, 'ecBacklight');
  for (let i = 0; i < 4; i++) L.person(58 + i * 4, -58.1, { y: DY, yaw: 0, suit: 0x0b0e18, skin: pick(SKIN, r()), hair: pick(HAIR, r()) });
  for (let i = 0; i < 10; i++) guest(57 + i * 1.6, -55.6, { y: DY, yaw: Math.PI, fidget: 0.3 });
  for (const [cx, cz] of [[56, -44], [63, -44], [70, -44], [56, -32], [63, -32], [70, -32], [56, -20], [70, -20]]) {
    L.cyl(cx, cz, 0.6, DY, DY + 0.45, 'ecBlackGlass', { seg: 16, collide: true });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4, x = cx + Math.cos(a) * 1.5, z = cz + Math.sin(a) * 1.5;
      box(x - 0.4, x + 0.4, DY, DY + 0.45, z - 0.4, z + 0.4, 'leather', { collide: true });
      if (r() < 0.8) guest(x, z, { y: DY - 0.02, yaw: Math.atan2(cx - x, cz - z), sit: true });
    }
  }
  for (let x = 51.5; x < XS - 1; x += 1.8) if (r() < 0.7) guest(x, -12.7, { y: DY, yaw: 0, fidget: 0.3 });
  for (let z = -44; z < ZS - 2; z += 5) {
    if (Math.abs(z) < 2) continue;
    L.cyl(84.6, z, 0.35, DY, DY + 1.1, 'ecGold', { seg: 12, collide: true }); L.cyl(84.6, z, 0.42, DY + 1.1, DY + 1.14, 'ecBlackGlass', { seg: 12 });
    for (const dz of [-0.9, 0.9]) if (r() < 0.85) guest(85.2, z + dz, { y: DY, yaw: Math.PI / 2, fidget: 0.35 });
  }
  for (let z = 14; z < ZS - 2; z += 2.4) if (r() < 0.7) guest(78.5, z, { y: DY, yaw: -Math.PI / 2, fidget: 0.3 });
  for (let i = 0; i < 20; i++) guest(81 + r(), -50 + r() * 100, { y: DY, walk: [[80.6, -54], [80.6, 56], [82.6, 56], [82.6, -54]], speed: 1 + r() * 0.4 });
  for (let i = 0; i < 10; i++) guest(60 + r() * 10, -40, { y: DY, walk: [[52, -50], [76, -50], [76, -14.5], [52, -14.5]], speed: 1 + r() * 0.4 });
  for (let i = 0; i < 8; i++) guest(88 + r() * 6, -50, { y: DY, walk: [[81, -52], [94, -52], [95, -48.5], [81, -48]], speed: 1.1 });

  // ================================================================ the track hall: night sky, skyline, turf, track
  {
    const sky = new THREE.PlaneGeometry(208.9 - XE, ZS - ZN).rotateX(Math.PI / 2).translate((XE + 208.9) / 2, CEIL, 0);
    L.geo(sky, 'ecSky');
    const sk = (g) => L.geo(g, 'ecSkyline');
    const wallPlane = (len, h, rotY, x, y, z, u0 = 0) => { const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + (uv.getX(i) * len) / 130); return g.rotateY(rotY).translate(x, y, z); };
    sk(wallPlane(208.9 - XE, CEIL, Math.PI, (XE + 208.9) / 2, CEIL / 2, ZS - 0.05));
    sk(wallPlane(ZS - ZN, CEIL, -Math.PI / 2, 208.85, CEIL / 2, 0, 0.37));
    sk(wallPlane(208.9 - 96, CEIL, 0, (96 + 208.9) / 2, CEIL / 2, ZN + 0.05, 0.71));
    L.floor(XE, 208.9, ZN, ZS, 0.005, 'ecTurfDark');
    const track = stadiumShape(TRK.rout); track.holes.push(stadiumShape(TRK.rin));
    const tg = flatShape(track, 0.025, 40); L.geo(tg, 'ecDirt');
    // shape UVs are metres; the dirt/turf materials tile via texture.repeat
    L.geo(flatShape(stadiumShape(TRK.rin), 0.02, 40), 'ecTurf');
    const lake = new THREE.Shape(); lake.absellipse(149, -2, 15, 5.5, 0, TAU, false);
    L.geo(flatShape(lake, 0.04, 48), 'water');
    const lakeRim = new THREE.Shape(); lakeRim.absellipse(149, -2, 15.6, 6.1, 0, TAU, false); const lh = new THREE.Path(); lh.absellipse(149, -2, 15, 5.5, 0, TAU, true); lakeRim.holes.push(lh);
    L.geo(flatShape(lakeRim, 0.05, 48), 'ecWhite');
    box(148.9, 149.1, 0.025, 0.035, -TRK.rout, -TRK.rin, 'ecWhite'); // finish line
    L.cyl(149, -TRK.rout - 0.6, 0.12, 0, 3.2, 'ecWhite', { seg: 10 }); L.cyl(149, -TRK.rout - 0.6, 0.55, 3.2, 3.32, 'ecGold', { seg: 20 });
    box(148.4, 149.6, 2.3, 3.2, -TRK.rout - 0.68, -TRK.rout - 0.52, 'glow', { color: 0xfff2d0 });
    // rails
    for (const [R, top] of [[TRK.rout + 0.3, 1.1], [TRK.rin - 0.3, 1.0]]) {
      const pts = stadiumPts(R, 2.5);
      L.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, top, z)), true), pts.length * 2, 0.07, 6, true), 'ecWhite');
      pts.forEach(([x, z], i) => { if (i % 2 === 0) L.cyl(x, z, 0.05, 0, top, 'ecWhite', { seg: 6 }); });
    }
    // infield screen (faces the stand) and flower beds
    for (const x of [133, 165]) box(x - 0.4, x + 0.4, 0, 3.2, 15.6, 16.4, 'blackMetal');
    box(131, 167, 3.2, 13.6, 16.1, 16.6, 'ecBlackGlass'); box(130.8, 167.2, 13.6, 13.9, 16.0, 16.7, 'glow', { color: 0xd6b47a });
    scr.push({ x: 149, y: e + 8.4, z: 16.05, yaw: Math.PI, w: 34, h: 9.6, cell: RC.RACE });
    for (let i = 0; i < 9; i++) box(131 + i * 4.2, 133.5 + i * 4.2, 0.02, 0.35, 11, 12.2,'satinV', { color: [0xc8102e, 0xf2c14a, 0xffffff][i % 3] });
  }
  // floodlight pylons (south side + east end) with soft beams onto the track
  for (const [x, z] of [[100, 50], [125, 50], [150, 50], [175, 50], [200, 50], [206.5, -24], [206.5, 24]]) {
    L.cyl(x, z, 0.35, 0, 16.4, 'steel', { seg: 10 });
    const yaw = Math.atan2(149 - x, -z), m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.55, yaw, 0, 'YXZ')).setPosition(x, 17, z);
    L.geo(new THREE.BoxGeometry(5.2, 2.6, 0.5).applyMatrix4(m), 'blackMetal');
    L.geo(new THREE.PlaneGeometry(4.8, 2.2).translate(0, 0, 0.26).applyMatrix4(m), 'glow', 0xf4f8ff);
    const tgt = new THREE.Vector3(x + (149 - x) * 0.35, 0, z * 0.25), src = new THREE.Vector3(x, 17, z);
    // cone: apex at the lamp head, opening onto the track (local -y after the shift -> +z -> src->tgt)
    const len = src.distanceTo(tgt), cone = new THREE.ConeGeometry(7, len, 20, 1, true).translate(0, -len / 2, 0);
    const cm = new THREE.Matrix4().lookAt(tgt, src, _up);
    cone.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).applyMatrix4(cm).translate(src.x, src.y, src.z);
    L.geo(cone, 'ecBeam');
  }

  // ================================================================ the crescent Members' Grandstand
  const seats = []; // [x, y, z, yaw, colour]
  {
    const tread = quads(), riser = quads(), edge = quads(), walkTop = quads(), shell = quads(), glassQ = quads(), roofT = quads(), roofB = quads(), led = quads(), pave = quads();
    const MID = (A0 + A1) / 2;
    for (let k = 0; k < NROW; k++) {
      const ra = R0 + k * RD, rb = ra + RD, y = Y0 + k * RY, yp = k ? y - RY : 0;
      for (const [s0, s1] of spans(A0, A1, ra)) {
        const as = angs(s0, s1, ra);
        for (let i = 0; i < as.length - 1; i++) {
          const a = as[i], b = as[i + 1];
          tread.q(PP(ra, a, y), PP(rb, a, y), PP(rb, b, y), PP(ra, b, y), [0, 1, 0]);
          riser.q(PP(ra, a, yp), PP(ra, b, yp), PP(ra, b, y), PP(ra, a, y), neg(radial((a + b) / 2)));
        }
        // seats along the row
        const rs = ra + 0.42, step = 0.55 / rs;
        for (let a = s0 + step / 2 + 0.25 / rs; a < s1 - 0.25 / rs; a += step) {
          const [x, , z] = PP(rs, a, 0);
          seats.push([x, y, z, Math.atan2(GX - x, GZ - z), Math.abs(a - MID) < 0.06 ? 0xd6b47a : (k % 6 === 5 ? 0x9aa3ad : 0xe3e6ea)]);
        }
      }
    }
    // aisles: half steps, with side faces against the rows
    for (const ac of AISLES) for (let kk = 0; kk < NROW * 2; kk++) {
      const ra = R0 + kk * (RD / 2), rb = ra + RD / 2, y = 0.4 + 0.2 * kk, yp = kk ? y - 0.2 : 0;
      const a = ac - AISLE_HW / ra, b = ac + AISLE_HW / ra;
      tread.q(PP(ra, a, y), PP(rb, a, y), PP(rb, b, y), PP(ra, b, y), [0, 1, 0]);
      riser.q(PP(ra, a, yp), PP(ra, b, yp), PP(ra, b, y), PP(ra, a, y), neg(radial(ac)));
      if (kk % 2 === 0) { // front half of a row: the row stands 0.2 m above the aisle step
        const ky = Y0 + (kk / 2) * RY;
        for (const [ae, sg] of [[a, 1], [b, -1]]) edge.q(PP(ra, ae, y), PP(rb, ae, y), PP(rb, ae, ky), PP(ra, ae, ky), [-Math.sin(ae) * sg, 0, Math.cos(ae) * sg]);
      }
      edge.q(PP(ra + 0.02, a, y), PP(ra + 0.02, b, y), PP(ra + 0.02, b, y - 0.025), PP(ra + 0.02, a, y - 0.025), neg(radial(ac))); // step nosing strip
    }
    // top walkway, back wall, front barrier, apron paving
    const aB0 = angAt(96, BACK + 0.15);
    for (const as of [angs(A0, A1, WALK)]) for (let i = 0; i < as.length - 1; i++) {
      const a = as[i], b = as[i + 1];
      walkTop.q(PP(WALK, a, DY), PP(BACK, a, DY), PP(BACK, b, DY), PP(WALK, b, DY), [0, 1, 0]);
      pave.q(PP(196, a, 0.012), PP(R0, a, 0.012), PP(R0, b, 0.012), PP(196, b, 0.012), [0, 1, 0]);
      for (const dr of [-0.08, 0.08]) glassQ.q(PP(R0 - 0.15 + dr * 0.1, a, Y0), PP(R0 - 0.15 + dr * 0.1, b, Y0), PP(R0 - 0.15 + dr * 0.1, b, Y0 + 1.1), PP(R0 - 0.15 + dr * 0.1, a, Y0 + 1.1), dr < 0 ? neg(radial(a)) : radial(a));
      led.q(PP(R0 - 0.01, a, 0.1), PP(R0 - 0.01, b, 0.1), PP(R0 - 0.01, b, 0.4), PP(R0 - 0.01, a, 0.4), neg(radial(a))); // gold LED band on the front fascia
    }
    for (const as of [angs(aB0, A1, BACK)]) for (let i = 0; i < as.length - 1; i++) {
      const a = as[i], b = as[i + 1];
      shell.q(PP(BACK, a, DY), PP(BACK, b, DY), PP(BACK, b, 12.4), PP(BACK, a, 12.4), neg(radial(a)));
      shell.q(PP(BACK + 0.3, a, 0), PP(BACK + 0.3, b, 0), PP(BACK + 0.3, b, 12.4), PP(BACK + 0.3, a, 12.4), radial(a));
      shell.q(PP(BACK, a, 12.4), PP(BACK + 0.3, a, 12.4), PP(BACK + 0.3, b, 12.4), PP(BACK, b, 12.4), [0, 1, 0]);
    }
    // the space behind the stand (back wall → north wall) is solid building up to the roof, so there is no
    // pit beside the bridge deck. Slices 0.75 m wide stay inside the back wall's 0.3 m thickness.
    for (let xa = 96; xa < 208.9; xa += 0.75) {
      const xb = Math.min(208.9, xa + 0.75), rr = BACK + 0.3;
      const zAt = (x) => GZ - Math.sqrt(rr * rr - (x - GX) ** 2);
      box(xa, xb, 0, 12.4, ZN, Math.max(zAt(xa), zAt(xb)), 'ecWhite');
    }
    ctx.stand = { aB0 };
    // the cantilevered crescent roof: thick at the back wall, a thin lit blade at the front
    const yb = (u) => 12.4 + 4.0 * Math.pow((BACK + 1 - u) / 25.5, 0.8), th = (u) => 1.2 - 0.9 * ((BACK + 1 - u) / 25.5);
    const us = Array.from({ length: 10 }, (_, i) => BACK + 1 - (i / 9) * 25.5);
    const ra = angs(A0 - 0.01, A1 + 0.01, BACK, 2.2);
    for (let i = 0; i < ra.length - 1; i++) {
      const a = ra[i], b = ra[i + 1];
      for (let j = 0; j < us.length - 1; j++) {
        const u0 = us[j], u1 = us[j + 1];
        roofB.q(PP(u0, a, yb(u0)), PP(u1, a, yb(u1)), PP(u1, b, yb(u1)), PP(u0, b, yb(u0)), [0, -1, 0]);
        roofT.q(PP(u0, a, yb(u0) + th(u0)), PP(u1, a, yb(u1) + th(u1)), PP(u1, b, yb(u1) + th(u1)), PP(u0, b, yb(u0) + th(u0)), [0, 1, 0]);
      }
      const uf = us[us.length - 1];
      roofT.q(PP(uf, a, yb(uf)), PP(uf, b, yb(uf)), PP(uf, b, yb(uf) + th(uf)), PP(uf, a, yb(uf) + th(uf)), neg(radial(a)));
      led.q(PP(uf - 0.02, a, yb(uf) + 0.02), PP(uf - 0.02, b, yb(uf) + 0.02), PP(uf - 0.02, b, yb(uf) + th(uf) - 0.02), PP(uf - 0.02, a, yb(uf) + th(uf) - 0.02), neg(radial(a)));
      for (const u of [200, 206.5, 213]) led.q(PP(u - 0.18, a, yb(u - 0.18) - 0.03), PP(u + 0.18, a, yb(u + 0.18) - 0.03), PP(u + 0.18, b, yb(u + 0.18) - 0.03), PP(u - 0.18, b, yb(u - 0.18) - 0.03), [0, -1, 0]);
    }
    for (const a of angs(A0 + 0.02, A1 - 0.02, BACK, 11)) L.geo(obGeo(PP(BACK + 0.2, a, 12.2), PP(196, a, yb(196) - 0.3), 0.35, 0.55), 'ecWhite'); // roof ribs
    L.geo(tread.geo(), 'satinV', 0xc9ccd2); L.geo(riser.geo(), 'satinV', 0x8e939b); L.geo(edge.geo(), 'satinV', 0xb5b9c0);
    L.geo(walkTop.geo(), 'stone'); L.geo(shell.geo(), 'ecWhite'); L.geo(glassQ.geo(), 'glass'); L.geo(pave.geo(), 'granite');
    L.geo(roofT.geo(), 'ecWhite'); L.geo(roofB.geo(), 'ecWhiteDeep'); L.geo(led.geo(), 'glow', 0xffd9a0);
    // gold handrail along the front barrier
    const railPts = angs(A0, A1, R0, 3).map((a) => new THREE.Vector3(...PP(R0 - 0.15, a, Y0 + 1.12)));
    L.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), railPts.length * 2, 0.045, 6, false), 'ecGold');
    // stand end walls: the east end closes the walkway, the west end leaves it open onto the bridge deck
    L.geo(polarProfile(A1 + 0.15 / R0, [[R0 - 0.4, 0], [BACK + 0.3, 0], [BACK + 0.3, 12.6], [R0 - 0.4, 1.9]], 0.3), 'ecWhite');
    L.geo(polarProfile(A0 - 0.15 / R0, [[R0 - 0.4, 0], [BACK + 0.3, 0], [BACK + 0.3, DY], [WALK, DY], [WALK, 8.2], [R0 - 0.4, 1.9]], 0.3), 'ecWhite');
    // standing crowd on the top walkway and along the apron rail
    for (const a of angs(A0 + 0.01, A1 - 0.01, WALK, 2.6)) if (r() < 0.75) { const [x, , z] = PP(WALK + 0.8 + r() * 2.2, a, 0); guest(x, z, { y: DY, yaw: Math.atan2(GX - x, GZ - z), fidget: 0.4 }); }
    for (const a of angs(A0 + 0.01, A1 - 0.01, 197, 1.3)) if (r() < 0.6) { const [x, , z] = PP(197 + r() * 2, a, 0); guest(x, z, { yaw: Math.atan2(GX - x, GZ - z), fidget: 0.5 }); }
    for (let i = 0; i < 14; i++) { const a0 = A0 + 0.02 + r() * (A1 - A0 - 0.04); const pts = angs(a0, Math.min(A1 - 0.01, a0 + 0.12), WALK + 2, 4).map((a) => { const [x, , z] = PP(WALK + 2, a, 0); return [x, z]; }); guest(pts[0][0], pts[0][1], { y: DY, walk: [...pts, ...pts.slice().reverse()], speed: 1.1 }); }
  }
  // seats (instanced, chunked by sector) + the seated crowd
  {
    const seatGeo = (() => {
      const parts = [new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.42, 0.02), new THREE.BoxGeometry(0.46, 0.46, 0.06).translate(0, 0.68, -0.2), new THREE.BoxGeometry(0.08, 0.38, 0.08).translate(0, 0.19, -0.05)];
      return mergeGeometries(parts.map((g) => g.toNonIndexed()));
    })();
    const buckets = new Map();
    for (const s of seats) { const k = Math.floor((Math.atan2(s[2] - GZ, s[0] - GX) - A0) / ((A1 - A0) / 8)); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(s); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(seatGeo, LM.ecSeat, list.length);
      list.forEach(([x, y, z, yw, c], i) => { mesh.setMatrixAt(i, m4.compose(p.set(x, e + y, z), q.setFromAxisAngle(up, yw), one)); mesh.setColorAt(i, col.set(c)); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); ctx.add(mesh);
    }
    ctx.disposables.push(seatGeo);
    for (const [x, y, z, yw] of seats) if (r() < 0.68) guest(x, z, { y: y - 0.02, yaw: yw, sit: true });
  }

  // ================================================================ horses: the field on the track, the ring, the stalls
  const G = horseGeo();
  const NT = RUNNERS.length, NR = 6, NS = 5, NH = NT + NR + NS;
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; ctx.add(m); return m; };
  const coat = mk(G.coat, LM.people, NH), dark = mk(G.dark, LM.ecHorseDark, NH), cloth = mk(G.cloth, LM.people, NH);
  const silk = mk(G.silk, LM.people, NT), legs = mk(G.legs, LM.ecJockeyWhite, NT);
  const col = new THREE.Color();
  for (let i = 0; i < NH; i++) { coat.setColorAt(i, col.set(COATS[(i * 5 + 1) % COATS.length])); cloth.setColorAt(i, col.set(i < NT ? 0xf4f2ee : i < NT + NR ? 0x141a33 : 0x7a1418)); }
  for (let i = 0; i < NT; i++) silk.setColorAt(i, col.set(RUNNERS[i].silk));
  const grooms = peopleInstanced(ctx, NR);
  for (let i = 0; i < NR; i++) grooms.color(i, 0x141a33, pick(SKIN, r()), 0x111111);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const setH = (i, x, y, z, yaw, pitch = 0) => { q.setFromEuler(eu.set(pitch, yaw, 0, 'YXZ')); m4.compose(p.set(x, e + y, z), q, one); coat.setMatrixAt(i, m4); dark.setMatrixAt(i, m4); cloth.setMatrixAt(i, m4); if (i < NT) { silk.setMatrixAt(i, m4); legs.setMatrixAt(i, m4); } };
  for (let i = 0; i < NS; i++) setH(NT + NR + i, 83.6, 0, 16 + i * 8, -Math.PI / 2); // stalls (every other bay)
  for (let i = 0; i < NS; i++) L.person(81.3, 17 + i * 8, { yaw: -Math.PI / 2, suit: 0x141a33, skin: pick(SKIN, r()), hair: 0x111111 });
  setTrackLength(TRK.len);
  let t = 0;
  const RA = RING.a - 1.5, RB = RING.b - 1.5;
  ctx.onUpdate((dt) => {
    t += dt;
    updateRaceScreens(dt, ctx.group.visible);
    if (!ctx.group.visible) return;
    for (let i = 0; i < NT; i++) {
      const lane = -3.5 + (i % 4) * 1.6 + Math.floor(i / 4) * 0.8, [x, z, yaw] = trackPos(RACE.dist[i], lane), ph = t * 7.5 + i * 1.7;
      setH(i, x, Math.abs(Math.sin(ph)) * 0.14, z, yaw, Math.sin(ph) * 0.06);
    }
    for (let i = 0; i < NR; i++) { // walking clockwise round the ring, each led by a groom on the inside
      const th = -(t * 1.4) / ((RA + RB) / 2) + (i / NR) * TAU, x = RING.cx + RA * Math.cos(th), z = RING.cz + RB * Math.sin(th);
      const dx = RA * Math.sin(th), dz = -RB * Math.cos(th), yaw = Math.atan2(dx, dz);
      setH(NT + i, x, Math.abs(Math.sin(t * 3 + i)) * 0.03, z, yaw);
      const gx = RING.cx + (RA - 1.1) * Math.cos(th + 0.05), gz = RING.cz + (RB - 1.1) * Math.sin(th + 0.05);
      q.setFromAxisAngle(_up, yaw); m4.compose(p.set(gx, e + 0.85 + Math.abs(Math.sin(t * 4 + i)) * 0.03, gz), q, one); grooms.set(i, m4);
    }
    for (const m of [coat, dark, cloth, silk, legs]) m.instanceMatrix.needsUpdate = true;
    grooms.commit();
  });
  for (const m of [coat, cloth, silk]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  // initial placement (also covers frames before the first update)
  for (let i = 0; i < NT; i++) { const [x, z, yaw] = trackPos(RACE.dist[i], -3 + i * 0.8); setH(i, x, 0, z, yaw); }
  for (let i = 0; i < NR; i++) setH(NT + i, RING.cx + RA * Math.cos((i / NR) * TAU), 0, RING.cz + RB * Math.sin((i / NR) * TAU), 0);

  // ================================================================ finish
  for (const m of buildRaceScreens(scr)) ctx.add(m, m.geometry);
  ctx.shapes = [equineShape(e, H)];
  ctx.seatCount = seats.length;
  ctx.equineStats = { seats: seats.length, people: L.people.length, screens: scr.length, horses: NH };
  L.build();
}
