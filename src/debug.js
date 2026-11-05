import { FLOOR_BY_ID, FLOORS, clusterOf, canAccess, findRoom, BANKS } from './layout/building.js';
import { rideCheck } from './elevators.js';
import { RADIUS } from './player.js';

// ---------------------------------------------------------------- perf sampler (window.__perf)
export class PerfSampler {
  constructor(renderer) {
    this.renderer = renderer;
    this.frames = []; // [time, dt]
    this.stats = { fps: 0, fps1Low: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, heapMB: 0 };
  }
  tick(now, dt, cpuMs) {
    this.frames.push([now, dt]);
    while (this.frames.length && now - this.frames[0][0] > 10_000) this.frames.shift();
    const info = this.renderer.info;
    const dts = this.frames.map((f) => f[1]).sort((a, b) => b - a);
    const n = dts.length;
    const median = n ? dts[Math.floor(n / 2)] : 16;
    const p99 = n ? dts[Math.max(0, Math.floor(n * 0.01))] : 16;
    Object.assign(this.stats, {
      fps: 1000 / median, fps1Low: 1000 / p99, frameMs: cpuMs,
      drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      samples: n,
    });
    return this.stats;
  }
  reset() { this.frames = []; }
}

// ---------------------------------------------------------------- grid pathfinding (per walk cluster)
const CELL = 1;
function gridFor(clusterIds, colliders, role, ignoreLocks, shapes = []) {
  const fl = clusterIds.map((id) => FLOOR_BY_ID[id]);
  const x0 = Math.min(...fl.map((f) => f.bounds.x0)), x1 = Math.max(...fl.map((f) => f.bounds.x1));
  const z0 = Math.min(...fl.map((f) => f.bounds.z0)), z1 = Math.max(...fl.map((f) => f.bounds.z1));
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((z1 - z0) / CELL);
  const block = new Uint8Array(W * H);
  const elev = fl[0].elevation;
  // outside any cluster floor's bounds = blocked
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
    if (!fl.some((f) => x >= f.bounds.x0 && x <= f.bounds.x1 && z >= f.bounds.z0 && z <= f.bounds.z1)) block[j * W + i] = 1;
  }
  const live = shapes.filter((sh) => sh.active(elev + 0.1));
  if (live.length) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (live.some((sh) => sh.gridBlock(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL))) block[j * W + i] = 1;
  }
  const pad = RADIUS + 0.15;
  for (const c of colliders) {
    if (c.y1 <= elev + 0.45 || c.y0 > elev + 1.8 || c.y1 < elev - 0.5) continue;
    if (c.lock && (ignoreLocks || canAccess(role, c.lock))) continue;
    const i0 = Math.max(0, Math.floor((c.x0 - pad - x0) / CELL)), i1 = Math.min(W - 1, Math.floor((c.x1 + pad - x0) / CELL));
    const j0 = Math.max(0, Math.floor((c.z0 - pad - z0) / CELL)), j1 = Math.min(H - 1, Math.floor((c.z1 + pad - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) block[j * W + i] = 1;
    }
  }
  return { x0, z0, W, H, block };
}

function nearestFree(g, i, j) {
  if (i >= 0 && j >= 0 && i < g.W && j < g.H && !g.block[j * g.W + i]) return [i, j];
  for (let r = 1; r < 30; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < g.W && b < g.H && !g.block[b * g.W + a]) return [a, b];
  }
  return null;
}

export function findPath(clusterIds, colliders, role, from, to, ignoreLocks = false, shapes = []) {
  const g = gridFor(clusterIds, colliders, role, ignoreLocks, shapes);
  const toCell = (x, z) => [Math.floor((x - g.x0) / CELL), Math.floor((z - g.z0) / CELL)];
  const s = nearestFree(g, ...toCell(from.x, from.z));
  const t = nearestFree(g, ...toCell(to.x, to.z));
  if (!s || !t) return null;
  const N = g.W * g.H;
  const gs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const si = s[1] * g.W + s[0], ti = t[1] * g.W + t[0];
  const h = (k) => Math.hypot((k % g.W) - t[0], Math.floor(k / g.W) - t[1]);
  // binary heap
  const heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  gs[si] = 0; push(si, h(si));
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === ti) break;
    const ci = k % g.W, cj = Math.floor(k / g.W);
    for (const [di, dj, w] of D) {
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= g.W || b >= g.H) continue;
      const nk = b * g.W + a;
      if (g.block[nk] || closed[nk]) continue;
      if (di && dj && (g.block[cj * g.W + a] || g.block[b * g.W + ci])) continue; // no corner cutting
      const ng = gs[k] + w;
      if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(nk, ng + h(nk)); }
    }
  }
  if (!closed[ti]) return null;
  const cells = [];
  for (let k = ti; k !== -1; k = came[k]) cells.push(k);
  cells.reverse();
  // simplify: keep turning points
  const pts = cells.map((k) => ({ x: g.x0 + ((k % g.W) + 0.5) * CELL, z: g.z0 + (Math.floor(k / g.W) + 0.5) * CELL }));
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    if (Math.sign(b.x - a.x) !== Math.sign(c.x - b.x) || Math.sign(b.z - a.z) !== Math.sign(c.z - b.z)) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  // end exactly on the target only if it is walkable; otherwise stop at the nearest free cell
  const tc = toCell(to.x, to.z);
  if (tc[0] === t[0] && tc[1] === t[1]) out[out.length - 1] = { x: to.x, z: to.z };
  return out;
}

// Route across floors: list of [cluster walk -> elevator ride] legs (BFS over floors).
export function planRoute(fromFloor, toFloor, role) {
  if (clusterOf(fromFloor).includes(toFloor)) return [];
  const start = clusterOf(fromFloor);
  const seen = new Set(start);
  const q = [[start, []]];
  while (q.length) {
    const [cl, legs] = q.shift();
    for (const fid of cl) {
      for (const zn of FLOOR_BY_ID[fid].elevators) {
        for (const stop of BANKS[zn.bank].stops) {
          if (seen.has(stop)) continue;
          if (!rideCheck(role, zn.bank, stop, fid).ok) continue;
          const next = clusterOf(stop);
          const nl = [...legs, { onFloor: fid, bank: zn.bank, zone: zn, to: stop }];
          if (next.includes(toFloor)) return nl;
          next.forEach((n) => seen.add(n));
          q.push([next, nl]);
        }
      }
    }
  }
  return null;
}

export function roomSpawn(roomId) {
  const hit = findRoom(roomId);
  if (!hit) return null;
  const { floor, room } = hit;
  const s = room.spawn || { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
  return { floor, room, x: s.x, z: s.z };
}

export const ALL_FLOOR_IDS = FLOORS.map((f) => f.id);
