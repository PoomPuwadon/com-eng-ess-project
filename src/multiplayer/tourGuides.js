// Tour Mode guides (user, 2026-11-18):
//  · CEO trackers: while a tour is on, a Chief Executive sees every touring guest through walls and floors —
//    a DOM marker over each guest (name, distance, their floor if it is not yours), clamped to the screen
//    edge with a pointer when the guest is behind you or off-screen. One DOM layer, pooled (≤ 50 nodes).
//  · Leisure Suite arrows: while the tour stands in the Executive Leisure Suite (VT-01), everybody on VT-01
//    gets a see-through arrow over their head pointing to the nearest Rotational Variance Instrument, plus
//    a beacon over that table that shows through walls. Hidden once you are at the table or seated.
// 3D cost: 2 meshes (the arrow), only while the arrow is shown. Never drawn for guests outside a tour.
import * as THREE from 'three';
import { nearestTable } from '../interact.js';
import { FLOOR_BY_ID } from '../layout/building.js';

const CSS = `
.tg-layer { position: fixed; inset: 0; pointer-events: none; z-index: 36; overflow: hidden; }
.tg-mk { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); will-change: transform; text-align: center; white-space: nowrap;
  font: 800 12px "Segoe UI", system-ui, sans-serif; color: #fff; text-shadow: 0 1px 3px #000; }
.tg-mk .pin { width: 18px; height: 18px; margin: 0 auto 2px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #12ff6a; border: 2px solid #063; box-shadow: 0 0 10px #12ff6a; }
.tg-mk .lb { background: rgba(4,20,10,.78); border: 1px solid #12ff6a; border-radius: 999px; padding: 2px 8px; }
.tg-mk .lb small { color: #9fe8b8; font-weight: 700; margin-left: 4px; }
.tg-mk.edge .pin { border-radius: 3px; transform: rotate(var(--a)); clip-path: polygon(50% 0, 100% 100%, 50% 75%, 0 100%); border: 0; width: 22px; height: 22px; }
.tg-beacon { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); will-change: transform; text-align: center; white-space: nowrap; font: 900 13px "Segoe UI", system-ui; color: #1a1200; }
.tg-beacon .lb { background: #ffd400; border-radius: 8px; padding: 4px 10px; box-shadow: 0 0 16px #ffd400; }
.tg-beacon .lb small { display: block; font: 700 11px system-ui; }
.tg-beacon .stem { width: 3px; height: 26px; margin: 0 auto; background: linear-gradient(#ffd400, rgba(255,212,0,0)); }
.tg-beacon.edge .lb::before { content: '➤ '; display: inline-block; transform: rotate(var(--a)); }
`;
const EDGE = 36;

export class TourGuides {
  /** ctx: { scene, camera, rt, remotes, player, leisureCtx(), seated() } */
  constructor(ctx) {
    this.ctx = ctx; this.t = 0;
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    this.layer = document.createElement('div'); this.layer.className = 'tg-layer'; document.body.append(this.layer);
    this.pool = new Map(); // remote id -> element
    this.beacon = document.createElement('div'); this.beacon.className = 'tg-beacon'; this.beacon.innerHTML = '<div class="lb">ROTATIONAL VARIANCE INSTRUMENT<small></small></div><div class="stem"></div>'; this.beacon.style.display = 'none';
    this.layer.append(this.beacon);
    // see-through arrow (same plate as the VT-03 ring guide), gold
    const mat = (c, o = 1) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide }); return m; };
    const shape = (k) => { const a = new THREE.Shape(); a.moveTo(-0.22 * k, -0.9 * k); a.lineTo(0.22 * k, -0.9 * k); a.lineTo(0.22 * k, 0.1 * k); a.lineTo(0.6 * k, 0.1 * k); a.lineTo(0, 0.95 * k); a.lineTo(-0.6 * k, 0.1 * k); a.lineTo(-0.22 * k, 0.1 * k); a.closePath(); return a; };
    const plate = (k) => new THREE.ShapeGeometry(shape(k)).rotateX(-Math.PI / 2).rotateY(Math.PI);
    this.arrow = new THREE.Group(); this.arrow.name = 'tour-roulette-arrow';
    const rim = new THREE.Mesh(plate(1.18).translate(0, -0.01, -0.02), mat(0x1a1200, 0.85)), face = new THREE.Mesh(plate(1), mat(0xffd400));
    rim.renderOrder = 994; face.renderOrder = 995;
    for (const m of [rim, face]) { m.frustumCulled = false; this.arrow.add(m); }
    this.arrow.scale.setScalar(1.3); this.arrow.visible = false;
    this.ctx.scene.add(this.arrow);
    this._v = new THREE.Vector3(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this.state = { trackers: 0, arrow: false, target: null };
  }

  /** screen position of a world point; off-screen / behind -> clamped to the edge with an angle */
  place(el, x, y, z) {
    const W = innerWidth, H = innerHeight, v = this._v.set(x, y, z).project(this.ctx.camera);
    let sx = (v.x * 0.5 + 0.5) * W, sy = (0.5 - v.y * 0.5) * H;
    const behind = v.z > 1;
    if (behind) { sx = W - sx; sy = H - sy; } // mirrored when behind the camera
    const off = behind || sx < EDGE || sx > W - EDGE || sy < EDGE + 20 || sy > H - EDGE;
    if (off) {
      const cx = W / 2, cy = H / 2;
      let dx = sx - cx, dy = sy - cy;
      if (behind && Math.abs(dy) < 1) dy = H; // straight behind: point down
      const k = Math.min((W / 2 - EDGE) / Math.max(1e-3, Math.abs(dx)), (H / 2 - EDGE - 20) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
      el.style.setProperty('--a', `${Math.atan2(dy, dx) + Math.PI / 2}rad`);
    }
    el.classList.toggle('edge', off);
    const hw = (el.offsetWidth || 120) / 2 + 6; // keep the whole label on screen
    sx = Math.max(hw, Math.min(W - hw, sx));
    el.style.display = '';
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, ${off ? '-50%' : '-100%'})`;
  }

  update(dt) {
    this.t += dt;
    const { rt, remotes, player } = this.ctx, tour = rt.meta?.tour || {};
    // ---- CEO: trackers on every touring guest
    const keep = new Set();
    if (tour.on && rt.role === 'ceo') {
      for (const rm of remotes.list()) {
        if (rm.role !== 'player' || !rm.buf?.length) continue;
        keep.add(rm.id);
        let el = this.pool.get(rm.id);
        if (!el) { el = document.createElement('div'); el.className = 'tg-mk'; el.innerHTML = '<div class="pin"></div><div class="lb"><span></span><small></small></div>'; this.layer.append(el); this.pool.set(rm.id, el); }
        const d = Math.round(rm.pos.distanceTo(player.pos));
        el.querySelector('span').textContent = rm.name;
        el.querySelector('small').textContent = rm.floor && rm.floor !== player.floor?.id ? `${rm.floor} · ${FLOOR_BY_ID[rm.floor]?.short || ''}` : `${d} m`;
        this.place(el, rm.pos.x, rm.pos.y + 2.6, rm.pos.z);
      }
    }
    for (const [id, el] of this.pool) if (!keep.has(id)) { el.remove(); this.pool.delete(id); }
    this.state.trackers = keep.size;

    // ---- tour in the Leisure Suite: everybody on VT-01 is pointed at the nearest roulette table
    let target = null;
    if (tour.on && tour.floor === 'VT-01' && player.floor?.id === 'VT-01' && !this.ctx.seated()) {
      const n = nearestTable(this.ctx.leisureCtx(), player.pos.x, player.pos.z);
      if (n && n.dist > 2.4) target = { x: n.table.tx + 0.3, z: n.table.z, dist: n.dist };
    }
    this.state.arrow = Boolean(target); this.state.target = target && { x: +target.x.toFixed(1), z: +target.z.toFixed(1), dist: +target.dist.toFixed(1) };
    this.arrow.visible = Boolean(target);
    if (!target) { this.beacon.style.display = 'none'; return; }
    const p = player.pos, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const bob = Math.sin(this.t * 6) * 0.25;
    this.arrow.position.set(p.x + ux * (1.3 + bob), p.y + 2.6 + Math.sin(this.t * 3) * 0.08, p.z + uz * (1.3 + bob));
    // the plate (normal +y, nose +z) points at the table and rolls its face towards the camera, so it never reads edge-on
    const cam = this.ctx.camera.getWorldPosition(this._v).sub(this.arrow.position);
    this._z.set(ux, 0, uz);
    this._y.copy(cam).addScaledVector(this._z, -cam.dot(this._z)); if (this._y.lengthSq() < 1e-6) this._y.set(0, 1, 0); this._y.normalize();
    this._x.crossVectors(this._y, this._z);
    this.arrow.quaternion.setFromRotationMatrix(this._m.makeBasis(this._x, this._y, this._z));
    this.beacon.querySelector('small').textContent = `${Math.round(d)} m · your host recommends a position · E to take a seat`;
    this.place(this.beacon, target.x, p.y + 2.2, target.z);
  }
}
