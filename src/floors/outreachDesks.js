import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LM } from '../world/lux.js';

// ================================================================= OT-03 — desk rows (step 2, revised 2026-11-09)
// The operation sits INSIDE the three big halls behind their glass fronts (user: desks only in the
// halls); the terraces carry the supervisors' decks and the support areas. One seat = a narrow desk
// with a low partition, twin monitors on a stand, keyboard, headset, a glowing score tag and a task
// chair; the operator sits at it. All desk parts are instanced (one InstancedMesh per material per
// group); monitors and handsets are added by outreach.js. Plain names in comments only: the scam call centre.

// seat-local coordinates: the operator's hips at the origin, facing -X (rotated for seats facing +X)
const PARTS = {
  floorPanel: [[-1.05, -0.35, 0.72, 0.75, -0.53, 0.53]], // desk top
  gunDarkO: [[-1.0, -0.4, 0, 0.72, -0.53, -0.5], [-1.0, -0.4, 0, 0.72, 0.5, 0.53],
    [-0.985, -0.95, 0.86, 1.2, -0.515, -0.015], [-0.985, -0.95, 0.86, 1.2, 0.015, 0.515]], // desk sides, monitor bodies
  panelMid: [[-1.09, -1.05, 0.0, 1.28, -0.55, 0.55]], // front modesty panel / low partition
  railSteel: [[-0.975, -0.955, 0.75, 0.86, -0.28, -0.24], [-0.975, -0.955, 0.75, 0.86, 0.24, 0.28], [0.0, 0.05, 0.0, 0.42, -0.025, 0.025], [-0.2, 0.25, 0.0, 0.03, -0.24, 0.24]],
  rubber: [[-0.22, 0.25, 0.42, 0.48, -0.24, 0.24], [0.25, 0.31, 0.48, 1.05, -0.22, 0.22], [-0.72, -0.56, 0.75, 0.768, -0.2, 0.2], [-0.55, -0.45, 0.75, 0.86, -0.46, -0.38]],
  ledBlue: [[-0.47, -0.43, 0.75, 0.82, 0.38, 0.5], [-1.095, -1.09, 1.22, 1.26, -0.55, 0.55]], // score tag, partition light line
};
let TEMPLATE = null;
function template() {
  if (TEMPLATE) return TEMPLATE;
  TEMPLATE = {};
  for (const [mat, boxes] of Object.entries(PARTS)) {
    TEMPLATE[mat] = mergeGeometries(boxes.map(([x0, x1, y0, y1, z0, z1]) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.deleteAttribute('uv'); return g;
    }));
  }
  return TEMPLATE;
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const SUITS = [0x1f2f5a, 0x2b2f38, 0x3a3f47, 0x4a4f58, 0x1d2a44, 0x5a3a2a, 0x2f3a2f, 0x6a6e76];
export const SKIN = [0xd8a47f, 0xc68c62, 0x8d5a3b, 0xf0c8a0, 0xb07850, 0xe0b48a];
export const HAIR = [0x2a1a10, 0x111111, 0x5a3a20, 0x3a2a1a, 0x111111, 0x6a4a2a];

/**
 * groups: [{ rows: [{ x, zs: [...] }], y, dir (+1 = facing +X, -1 = facing -X), sector, suit?, emptyRate? }]
 * Builds the desks (instanced, one mesh per material per group), seated operators and desk colliders.
 * Returns the seats: [{ x, y, z, dir, sector, empty }]
 */
export function buildDesks(ctx, L, groups, seed = 911) {
  const T = template(), r = rng(seed), seats = [];
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (const gp of groups) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gp.dir > 0 ? Math.PI : 0);
    const list = [];
    for (const row of gp.rows) for (const z of row.zs) {
      const x = row.x, d0 = x + gp.dir * 1.09, d1 = x + gp.dir * 0.35; // desk span (front edge .. operator edge)
      list.push({ x, z });
      const empty = r() < (gp.emptyRate ?? 0.07);
      seats.push({ x, y: gp.y, z, dir: gp.dir, sector: gp.sector, empty });
      ctx.colliders.push({ x0: Math.min(d0, d1), x1: Math.max(d0, d1), z0: z - 0.53, z1: z + 0.53, y0: ctx.e + gp.y, y1: ctx.e + gp.y + 1.28 });
      if (!empty) L.person(x, z, { yaw: gp.dir > 0 ? Math.PI / 2 : -Math.PI / 2, y: gp.y, sit: true, fidget: 0.25, suit: gp.suit ?? SUITS[Math.floor(r() * SUITS.length)], skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)] });
    }
    for (const [mat, geo] of Object.entries(T)) {
      const mesh = new THREE.InstancedMesh(geo, LM[mat], list.length);
      list.forEach((it, i) => mesh.setMatrixAt(i, m4.compose(p.set(it.x, ctx.e + gp.y, it.z), q, s)));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true;
      ctx.add(mesh);
    }
  }
  return seats;
}

// the rows of one hall: operators face +X (into the hall, away from the glass) so from the terrace
// you look in over their shoulders at the screens. walkway 2.6 m inside the glass; aisles at the
// doors (Z ±12, ±24) and down the middle; seats clear of the column grid.
const SEG = [[-37.4, -25.3], [-22.7, -13.3], [-10.7, -1.5], [1.5, 10.7], [13.3, 22.7], [25.3, 37.4]];
export function hallRows(x0, nRows, pitch = 2.3, cols = { every: 8, z: [-31.5, -22.5, -6.5, 6.5, 22.5, 31.5] }) {
  const rows = [];
  for (let k = 0; k < nRows; k++) {
    const x = x0 + 2.6 + 0.35 + k * pitch;
    const colX = []; for (let c = x0 + cols.every; c < -42; c += cols.every) colX.push(c);
    const zs = [];
    for (const [a, b] of SEG) for (let z = a + 0.55; z <= b - 0.5; z += 1.15) {
      const clash = colX.some((cx) => cx > x - 0.6 && cx < x + 1.5) && cols.z.some((cz) => Math.abs(cz - z) < 0.95);
      if (!clash) zs.push(+z.toFixed(2));
    }
    rows.push({ x, zs });
  }
  return rows;
}
// a straight row along Z between z0 and z1 (both signs), e.g. a supervisors' console
export function consoleRow(x, za, zb, step = 1.3) {
  const zs = []; for (let z = za; z <= zb + 0.01; z += step) { if ([12, 24].some((g) => Math.abs(z - g) < 1.5)) continue; zs.push(+z.toFixed(2)); zs.push(-(+z.toFixed(2))); } // gaps on the hall-door axes
  return [{ x, zs }];
}
