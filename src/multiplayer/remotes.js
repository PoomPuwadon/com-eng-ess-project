// Other players: avatars from avatarFor(role) (roster.js), interpolated between server snapshots
// (rendered ~150 ms behind), nametags as one DOM layer, CEO markers over every real CEO, and the
// VT-03 boxer highlight (see-through-walls silhouette + name + health bar).
//
// Perf (threejs-performance): a kit Character is ~36 draw calls, so only the nearest few remote
// players on loaded floors get a full avatar; everyone else is drawn by two instanced meshes
// (body + head, coloured by role) — at most ~2 extra draw calls however many guests there are.
import * as THREE from 'three';
import { avatarFor, makeBoxer } from '../characters/roster.js';
import { CeoMarker } from '../characters/ceoMarker.js';
import { FLOOR_BY_ID } from '../layout/building.js';
import { QUALITY } from '../quality.js';
import { memberPose, basketRadius, BASKET_Y } from '../../server/realtime/basket.js';

// a full avatar costs ~36 draw calls (measured): at most 2 within 30 m (1 in Low graphics), the rest are proxies
// (measured with 50 players in the lobby: 4 full avatars took the frame to 334 calls; 2 keeps it near the 250 budget)
const FULL_NEAR = 30, DELAY = 0.15, MAX_PROXIES = 64;
// crowds (> 6 guests in view) and Low graphics: only the nearest guest gets a full avatar
const fullMax = (shown) => (QUALITY.low || shown > 6 ? 1 : 2), MAX_TAGS = 16;
const ROLE_COL = { player: 0xe8b04a, admin: 0x2a2c32, ceo: 0xefe4c8 };
const CSS = `
.mp-tags { position: fixed; inset: 0; pointer-events: none; z-index: 35; }
.mp-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); white-space: nowrap; font: 700 12px "Segoe UI", system-ui, sans-serif; color: #fff;
  background: rgba(10,12,18,.72); border: 1px solid rgba(214,178,94,.55); border-radius: 999px; padding: 2px 9px; text-shadow: 0 1px 2px #000; will-change: transform; }
.mp-tag .dv { font: 800 9px system-ui; letter-spacing: .06em; margin-left: 6px; padding: 1px 5px; border-radius: 4px; background: #2e7bd6; color: #fff; }
.mp-tag .dv.m { background: #c2410c; }
.mp-tag.admin { border-color: #9ad; } .mp-tag.ceo { border-color: #12ff6a; }
.mp-tag .rl { color: #f0d18a; font-weight: 800; margin-right: 5px; }
.mp-box { position: fixed; left: 0; top: 0; transform: translate(-50%, -100%); z-index: 41; pointer-events: none; text-align: center; font: 900 14px "Segoe UI", system-ui; color: #fff; will-change: transform;
  text-shadow: 0 0 6px #000, 0 0 12px #ff7a00; }
.mp-box .hp { width: 120px; height: 12px; margin: 3px auto 0; border: 2px solid #fff; border-radius: 6px; background: rgba(0,0,0,.6); overflow: hidden; box-shadow: 0 0 12px #ff7a00; }
.mp-box .hp i { display: block; height: 100%; background: linear-gradient(90deg, #ff2d2d, #ffb000 50%, #3ddc84); transition: width .2s; }
.mp-box.ko { opacity: .55; } .mp-box.ko .nm::after { content: ' · DOWN'; color: #ff5c6c; }
`;

class Remote {
  constructor(id) { this.id = id; this.buf = []; this.av = null; this.avRole = null; this.pos = new THREE.Vector3(); this.yaw = 0; this.bodyYaw = 0; this.spd = 0; this.t = Math.random() * 10; this.floor = null; this.room = null; this.name = ''; this.role = 'player'; this.device = 'pc'; this.seen = 0; }
  push(t, r) {
    this.buf.push({ t, x: r.x, y: r.y, z: r.z, yaw: r.yaw });
    if (this.buf.length > 20) this.buf.shift();
    Object.assign(this, { floor: r.floor, room: r.room, name: r.name, role: r.role, device: r.device, spd: r.spd, seen: t });
  }
  sample(now) {
    const b = this.buf, rt = now - DELAY;
    if (!b.length) return false;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > rt) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const k = c.t === a.t ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (c.t - a.t)));
    const prev = this.pos.clone();
    if (Math.hypot(c.x - a.x, c.z - a.z) > 12 || Math.abs(c.y - a.y) > 8) this.pos.set(c.x, c.y, c.z); // teleports snap
    else this.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
    this.vel = prev.distanceTo(this.pos);
    return true;
  }
}

export class RemotePlayers {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.map = new Map(); this.selfId = null;
    this.hideCeo = false; this.boxers = new Map(); this.baskets = {};
    const s = document.createElement('style'); s.textContent = CSS; document.head.append(s);
    this.tagLayer = document.createElement('div'); this.tagLayer.className = 'mp-tags'; document.body.append(this.tagLayer);
    this.tags = new Map(); this.markers = []; this.boxTags = new Map();
    // instanced proxies for far guests
    const body = new THREE.CapsuleGeometry(0.3, 0.9, 3, 8); body.translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.2, 10, 8); head.translate(0, 1.62, 0);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.proxyBody = new THREE.InstancedMesh(body, m, MAX_PROXIES); this.proxyHead = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xd9a47f, roughness: 0.8 }), MAX_PROXIES);
    for (const im of [this.proxyBody, this.proxyHead]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
    this.proxyBody.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROXIES * 3), 3);
    // the CEO's basket (one ring + net, scaled to the load)
    this.basketMeshes = new Map();
    // x-ray silhouette for boxers (drawn on top of everything)
    this.xrayGeo = new THREE.CapsuleGeometry(0.42, 1.25, 4, 10); this.xrayGeo.translate(0, 1.05, 0);
    this.xrayMat = new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.38, depthTest: false, depthWrite: false, toneMapped: false });
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._c = new THREE.Color();
  }

  ingest(at, rows) {
    const now = performance.now() / 1000, live = new Set();
    for (const r of rows) {
      if (r.id === this.selfId) continue;
      live.add(r.id);
      let rm = this.map.get(r.id);
      if (!rm) { rm = new Remote(r.id); this.map.set(r.id, rm); }
      rm.push(now, r);
    }
    for (const id of [...this.map.keys()]) if (!live.has(id)) this.drop(id);
  }
  drop(id) {
    const rm = this.map.get(id);
    if (!rm) return;
    if (rm.av) this.scene.remove(rm.av.root);
    if (rm.xray) rm.xray.removeFromParent();
    this.tags.get(id)?.remove(); this.tags.delete(id);
    this.boxTags.get(id)?.remove(); this.boxTags.delete(id);
    this.map.delete(id);
  }
  get(id) { return this.map.get(id); }
  /** the host's interpolated pose (basket riding, markers) */
  hostPose(id) { const r = this.map.get(id); return r && r.buf.length ? r.pos : null; }
  list() { return [...this.map.values()]; }

  /** the look a remote should wear: a boxer in a live bout wears the fighter kit (red / blue corner) */
  lookOf(rm) { const b = this.boxers.get(rm.id); return b ? `fighter:${b.corner}` : rm.role; }
  makeAvatar(rm) {
    if (rm.av) this.scene.remove(rm.av.root);
    if (rm.xray) { rm.xray.removeFromParent(); rm.xray = null; }
    const look = this.lookOf(rm);
    const av = look.startsWith('fighter:') ? makeBoxer(look.slice(8), rm.name) : avatarFor(rm.role === 'player' ? 'visitor' : rm.role, rm.name);
    av.root.traverse((o) => { o.castShadow = false; });
    if (av.tag) av.tag.visible = false; // the DOM layer draws every nametag
    this.scene.add(av.root);
    rm.av = av; rm.avRole = look;
  }

  update(dt, { visibleIds, viewer, selfPose, overrides }) {
    const now = performance.now() / 1000, vis = new Set(visibleIds);
    const shown = [];
    for (const rm of this.map.values()) {
      if (!rm.sample(now)) continue;
      const ov = overrides && overrides.get(rm.id);
      if (ov) { rm.pos.copy(ov.pos); rm.bodyYaw = ov.yaw; rm.vel = 0; rm.floor = 'VT-04'; }
      const on = vis.has(rm.floor) || (rm.floor && FLOOR_BY_ID[rm.floor] && visibleIds.some((v) => Math.abs(FLOOR_BY_ID[v].elevation - rm.pos.y) < 6));
      rm.visible = Boolean(on);
      rm.dist = rm.pos.distanceTo(viewer);
      if (rm.visible) shown.push(rm);
    }
    shown.sort((a, b) => a.dist - b.dist);
    let np = 0;
    shown.forEach((rm, i) => {
      const full = (i < fullMax(shown.length) && rm.dist < FULL_NEAR) || this.boxers.has(rm.id);
      if (full) {
        if (!rm.av || rm.avRole !== this.lookOf(rm)) this.makeAvatar(rm);
        const a = rm.av;
        a.root.visible = true;
        a.root.position.copy(rm.pos);
        const v = rm.vel / Math.max(1e-3, dt);
        if (v > 0.2 && rm.lastPos) { const d = Math.atan2(rm.pos.x - rm.lastPos.x, rm.pos.z - rm.lastPos.z); let dd = d - rm.bodyYaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); rm.bodyYaw += dd * Math.min(1, dt * 12); }
        const bx = this.boxers.get(rm.id);
        if (bx) { // a boxer faces where they aim once in the ring; knocked down = on the canvas
          a.ko = bx.hp <= 0; a.walkIn = !bx.inRing;
          if (bx.inRing && rm.buf.length) { let d = rm.buf[rm.buf.length - 1].yaw + Math.PI - rm.bodyYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); rm.bodyYaw += d * Math.min(1, dt * 14); }
        }
        a.root.rotation.y = rm.bodyYaw;
        rm.t += dt; a.update(dt, rm.t, Math.min(10, v));
      } else {
        if (rm.av) rm.av.root.visible = false;
        if (np < MAX_PROXIES) {
          this._m.makeRotationY(rm.bodyYaw).setPosition(rm.pos);
          this.proxyBody.setMatrixAt(np, this._m); this.proxyHead.setMatrixAt(np, this._m);
          this.proxyBody.setColorAt(np, this._c.set(ROLE_COL[rm.role] || ROLE_COL.player));
          np++;
        }
      }
      rm.lastPos = (rm.lastPos || new THREE.Vector3()).copy(rm.pos);
    });
    for (const rm of this.map.values()) if (!rm.visible && rm.av) rm.av.root.visible = false;
    this.proxyBody.count = this.proxyHead.count = np;
    this.proxyBody.instanceMatrix.needsUpdate = this.proxyHead.instanceMatrix.needsUpdate = true;
    if (this.proxyBody.instanceColor) this.proxyBody.instanceColor.needsUpdate = true;
    this.drawTags(shown);
    this.drawMarkers(viewer, selfPose);
    this.drawBoxers();
    this.drawBaskets(selfPose);
  }

  // ---------------------------------------------------------------- nametags (DOM, one layer)
  drawTags(shown) {
    const W = innerWidth, H = innerHeight, keep = new Set();
    let n = 0;
    for (const rm of shown) {
      if (rm.dist > 45 || this.boxers.has(rm.id) || n >= MAX_TAGS) continue;
      const s = rm.av && rm.av.root.visible ? rm.av.root.scale.x : 1;
      const v = this._v.set(rm.pos.x, rm.pos.y + 2.25 * s, rm.pos.z).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      keep.add(rm.id); n++;
      let el = this.tags.get(rm.id);
      if (!el) { el = document.createElement('div'); this.tagLayer.append(el); this.tags.set(rm.id, el); }
      const key = `${rm.name}|${rm.role}|${rm.device}`;
      if (el._k !== key) {
        el._k = key; el.className = `mp-tag ${rm.role}`;
        const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
        el.innerHTML = `${rm.role === 'admin' ? '<span class="rl">STAFF</span>' : rm.role === 'ceo' ? '<span class="rl">♛</span>' : ''}${esc(rm.name)}<span class="dv ${rm.device === 'mobile' ? 'm' : ''}">${rm.device === 'mobile' ? 'MOBILE' : 'PC'}</span>`;
      }
      el.style.display = '';
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((0.5 - v.y * 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.tags) if (!keep.has(id)) el.style.display = 'none';
  }

  // ---------------------------------------------------------------- CEO markers over every real CEO (never yourself)
  ceoCount() { return this.list().filter((r) => r.role === 'ceo').length; }
  drawMarkers(viewer, selfPose) {
    const ceos = this.hideCeo ? [] : this.list().filter((r) => r.role === 'ceo' && r.buf.length);
    while (this.markers.length < ceos.length) this.markers.push(new CeoMarker());
    this.markers.forEach((mk, i) => {
      const r = ceos[i];
      mk.visible = Boolean(r);
      if (!r) return;
      const s = r.av ? r.av.root.scale.x : 1.25;
      const basket = this.baskets[r.id];
      const lift = basket && basket.length ? BASKET_Y + 2.2 : 0;
      const where = r.floor && r.floor !== selfPose?.floor ? `${r.name} · ${r.floor} · ${FLOOR_BY_ID[r.floor]?.sign || ''}` : r.name;
      mk.update(this.camera, this._v.set(r.pos.x, r.pos.y + 2.55 * s + lift, r.pos.z).clone(), viewer, where);
    });
  }

  // ---------------------------------------------------------------- VT-03 boxers: x-ray silhouette + name + health bar
  setBoxers(list, selfId) {
    this.boxers = new Map((list || []).map((b, i) => [b.conn, { ...b, corner: b.corner || (i % 2 ? 'blue' : 'red') }]).filter(([id]) => id !== selfId));
    for (const rm of this.map.values()) {
      const on = this.boxers.has(rm.id);
      if (on && rm.av && !rm.xray) { rm.xray = new THREE.Mesh(this.xrayGeo, this.xrayMat); rm.xray.renderOrder = 990; rm.av.root.add(rm.xray); }
      if (rm.xray && (!on || !rm.av || rm.xray.parent !== rm.av.root)) { rm.xray.removeFromParent(); rm.xray = null; if (on && rm.av) { rm.xray = new THREE.Mesh(this.xrayGeo, this.xrayMat); rm.xray.renderOrder = 990; rm.av.root.add(rm.xray); } }
    }
    for (const [id, el] of this.boxTags) if (!this.boxers.has(id)) { el.remove(); this.boxTags.delete(id); }
  }
  drawBoxers() {
    const W = innerWidth, H = innerHeight;
    for (const [id, b] of this.boxers) {
      const rm = this.map.get(id);
      let el = this.boxTags.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'mp-box'; el.innerHTML = '<div class="nm"></div><div class="hp"><i></i></div>'; document.body.append(el); this.boxTags.set(id, el); }
      if (!rm || !rm.buf.length) { el.style.display = 'none'; continue; }
      if (!rm.xray && rm.av) this.setBoxers([...this.boxers.values()], this.selfId);
      el.querySelector('.nm').textContent = b.name; el.querySelector('.hp i').style.width = `${Math.max(0, b.hp)}%`;
      el.classList.toggle('ko', b.hp <= 0);
      const v = this._v.set(rm.pos.x, rm.pos.y + 2.35, rm.pos.z).project(this.camera);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((0.5 - v.y * 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ---------------------------------------------------------------- the CEO baskets
  drawBaskets(selfPose) {
    const live = new Set();
    for (const [host, members] of Object.entries(this.baskets)) {
      if (!members?.length) continue;
      const hp = host === this.selfId ? selfPose?.pos : this.hostPose(host);
      if (!hp) continue;
      live.add(host);
      let g = this.basketMeshes.get(host);
      const R = basketRadius(members.length);
      if (!g || g.userData.R !== R) {
        if (g) this.scene.remove(g);
        g = new THREE.Group(); g.userData.R = R;
        const gold = new THREE.MeshStandardMaterial({ color: 0xd9ad3c, metalness: 0.9, roughness: 0.3 });
        const wicker = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.85, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.9 }));
        floor.position.y = -0.06; g.add(floor);
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.92, 0.95, 24, 1, true), wicker); wall.position.y = 0.42; g.add(wall);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 32), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9; g.add(rim);
        for (let k = 0; k < 4; k++) { // the ropes up to the gold crown
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4, rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), gold);
          rope.position.set(Math.cos(a) * R * 0.5, 1.9, Math.sin(a) * R * 0.5); rope.rotation.z = Math.cos(a) * 0.4; rope.rotation.x = -Math.sin(a) * 0.4; g.add(rope);
        }
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 8), gold); crown.position.y = 3.0; g.add(crown);
        g.traverse((o) => { o.castShadow = false; });
        this.scene.add(g); this.basketMeshes.set(host, g);
      }
      const b = memberPose({ x: hp.x, y: hp.y, z: hp.z }, 0, 1); // basket floor centre
      g.position.set(b.x, b.y, b.z);
      g.rotation.y += 0.004;
    }
    for (const [host, g] of this.basketMeshes) if (!live.has(host)) { this.scene.remove(g); this.basketMeshes.delete(host); }
  }
}
