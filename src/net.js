// PROTOTYPE multiplayer presence: other players as instanced capsules + pooled name tags + tiny chat.
// Talks to server/index.mjs over same-origin /ws (works on localhost and through a Cloudflare tunnel).
import * as THREE from 'three';

const SEND_HZ = 15, MAX = 50, TAGS = 8; // name tags only for the 8 nearest players
const ROLE_COL = { visitor: 0x8fa8c8, cleared: 0x5cc98a, tour: 0xe89a3c, admin: 0x2b2f3a, ceo: 0xd4a93a };

export class Net {
  constructor(scene, hud) {
    this.scene = scene; this.hud = hud;
    this.id = null; this.admin = false; this.pw = null; this.remotes = new Map(); this.sendAcc = 0; this.online = 0; this.status = 'connecting';
    const q = new URLSearchParams(location.search);
    let name = q.get('name');
    try { name = name || localStorage.getItem('firm.name'); } catch { /* storage blocked */ }
    if (!name) name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
    try { localStorage.setItem('firm.name', name); } catch { /* ignore */ }
    this.name = name;

    // all remote bodies = 1 draw call, all heads/visors = 1 draw call
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 10), mat, MAX);
    this.visors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0x111111 }), MAX);
    for (const m of [this.bodies, this.visors]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.bodies.setColorAt(0, new THREE.Color());
    this.tags = Array.from({ length: TAGS }, () => this.makeTag());
    this.m4 = new THREE.Matrix4(); this.q4 = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(1, 1, 1);
    this.col = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);

    this.buildUi();
    this.askName().then(() => this.connect());
  }

  // PROTOTYPE: everyone types a display name on entry (prefilled with the last one used in this browser)
  askName() {
    if (new URLSearchParams(location.search).has('name')) return Promise.resolve();
    return new Promise((done) => {
      const gate = document.createElement('div'); gate.id = 'name-gate';
      gate.innerHTML = '<div class="brand">[FIRM NAME]</div><div class="tag">Two Towers. One Vision.</div><form><h2>Welcome to the Firm</h2><p>Enter your name for the visitor list.</p><input maxlength="20" autocomplete="nickname" placeholder="Your name" required><button>Enter the building</button></form>';
      document.body.appendChild(gate); document.body.classList.add('gated');
      // nothing reaches the game until a name is entered (no walking, no pointer lock behind the screen)
      const block = (e) => { if (e.target !== input) { e.stopImmediatePropagation(); if (e.type === 'keydown' && e.key !== 'Tab') e.preventDefault(); } };
      for (const ev of ['keydown', 'keyup']) window.addEventListener(ev, block, true);
      const input = gate.querySelector('input'); input.value = this.name.startsWith('Guest-') ? '' : this.name;
      for (const ev of ['keydown', 'keyup']) input.addEventListener(ev, (e) => e.stopPropagation());
      for (const ev of ['mousedown', 'click', 'pointerdown']) gate.addEventListener(ev, (e) => e.stopPropagation()); // no pointer lock behind the gate
      setTimeout(() => input.focus(), 50);
      gate.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const v = input.value.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 20);
        if (!v) return;
        this.name = v; try { localStorage.setItem('firm.name', v); } catch { /* ignore */ }
        for (const ev of ['keydown', 'keyup']) window.removeEventListener(ev, block, true);
        goFullscreen(); // the Enter tap is a user gesture, so the browser allows it (iPhone Safari ignores it)
        gate.remove(); document.body.classList.remove('gated'); done();
      };
    });
  }

  connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.status = 'online'; ws.send(JSON.stringify({ t: 'hello', name: this.name }));
      let pw = this.pw; try { pw = pw || sessionStorage.getItem('firm.pw'); } catch { /* ignore */ }
      if (pw) { this.pw = pw; ws.send(JSON.stringify({ t: 'login', pw })); }
    };
    ws.onmessage = (e) => this.onMsg(JSON.parse(e.data));
    ws.onclose = () => { this.status = 'offline'; this.remotes.clear(); setTimeout(() => this.connect(), 2000); };
    ws.onerror = () => {};
  }

  onMsg(m) {
    if (m.t === 'welcome') { this.id = m.id; return; }
    if (m.t === 'leave') { this.remotes.delete(m.id); return; }
    if (m.t === 'chat') { this.addChat(m.id === this.id ? 'You' : m.name, m.text); return; }
    if (m.t === 'tp') { this.onTeleport && this.onTeleport(m); this.hud.toast(`${m.name || m.by} summoned everyone`, 3); return; }
    if (m.t === 'denied') { this.hud.toast('Wrong password', 2); return; }
    if (m.t === 'admin') {
      if (!m.ok) { this.pw = null; try { sessionStorage.removeItem('firm.pw'); } catch { /* ignore */ } this.hud.toast('Wrong password', 2); return; }
      try { sessionStorage.setItem('firm.pw', this.pw); } catch { /* ignore */ } // re-login after reconnects
      if (!this.admin) this.hud.toast('Admin unlocked: all controls enabled', 2.5);
      this.admin = true; this.summonBtn.textContent = 'Admin: summon all';
      this.onAdmin && this.onAdmin();
      return;
    }
    if (m.t === 'summoned') { this.hud.toast(`Summoned ${m.n} player${m.n === 1 ? '' : 's'}`, 2.5); return; }
    if (m.t !== 'snap') return;
    const seen = new Set();
    this.online = m.p.length;
    for (const [id, name, role, floor, x, y, z, yaw, moving] of m.p) {
      if (id === this.id) continue;
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) { r = { pos: new THREE.Vector3(x, y, z), yaw, phase: Math.random() * 6 }; this.remotes.set(id, r); }
      // big jump or floor change (teleport / lift exit): snap instead of gliding through walls
      if (r.floor !== floor || Math.hypot(r.pos.x - x, r.pos.z - z) > 6) { r.pos.set(x, y, z); r.yaw = yaw; }
      Object.assign(r, { name, role, floor, tx: x, ty: y, tz: z, tyaw: yaw, moving });
    }
    for (const id of this.remotes.keys()) if (!seen.has(id)) this.remotes.delete(id);
  }

  update(dt, player, camera, visibleFloors) {
    // ---- send own pose
    this.sendAcc += dt;
    if (this.ws && this.ws.readyState === 1 && this.sendAcc >= 1 / SEND_HZ && player.floor) {
      this.sendAcc = 0;
      const p = player.pos;
      const moving = this._last ? Math.hypot(p.x - this._last.x, p.z - this._last.z) > 0.02 : false;
      this._last = p.clone();
      this.ws.send(JSON.stringify({ t: 'pose', x: p.x, y: p.y, z: p.z, yaw: player.yaw, floor: player.floor.id, role: player.role, moving }));
    }
    // ---- draw remotes on visible floors (smoothed toward the latest snapshot)
    const k = 1 - Math.exp(-dt * 12);
    const vis = new Set(visibleFloors);
    const near = [];
    let n = 0;
    for (const r of this.remotes.values()) {
      if (r.tx === undefined) continue;
      r.pos.x += (r.tx - r.pos.x) * k; r.pos.y += (r.ty - r.pos.y) * k; r.pos.z += (r.tz - r.pos.z) * k;
      let d = r.tyaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * k;
      if (!vis.has(r.floor) || n >= MAX) continue;
      const dx = r.pos.x - camera.position.x, dz = r.pos.z - camera.position.z;
      if (dx * dx + dz * dz < 1 && Math.abs(r.pos.y + 1.7 - camera.position.y) < 1.5) continue; // standing inside you (shared spawn point)
      r.phase += dt * (r.moving ? 10 : 0);
      const bob = r.moving ? Math.abs(Math.sin(r.phase)) * 0.06 : 0;
      this.q4.setFromAxisAngle(this.up, r.yaw);
      this.m4.compose(this.v3.set(r.pos.x, r.pos.y + 0.87 + bob, r.pos.z), this.q4, this.s3);
      this.bodies.setMatrixAt(n, this.m4);
      this.bodies.setColorAt(n, this.col.set(ROLE_COL[r.role] || ROLE_COL.visitor));
      // visor on the face (-Z is forward for yaw 0, same as the player camera)
      this.v3.set(-Math.sin(r.yaw) * 0.26, 1.48 + bob, -Math.cos(r.yaw) * 0.26).add(r.pos);
      this.m4.compose(this.v3, this.q4, this.s3);
      this.visors.setMatrixAt(n, this.m4);
      near.push({ r, d: r.pos.distanceToSquared(camera.position) });
      n++;
    }
    this.bodies.count = this.visors.count = n;
    if (n) { this.bodies.instanceMatrix.needsUpdate = this.visors.instanceMatrix.needsUpdate = true; this.bodies.instanceColor.needsUpdate = true; }
    near.sort((a, b) => a.d - b.d);
    this.tags.forEach((t, i) => {
      const e = near[i];
      t.visible = !!e && e.d < 40 * 40;
      if (!t.visible) return;
      if (t.userData.name !== e.r.name) this.drawTag(t, e.r.name);
      t.position.set(e.r.pos.x, e.r.pos.y + 2.15, e.r.pos.z);
    });
    this.ui.count.textContent = this.status === 'online' ? `● ${this.online} online` : `○ ${this.status}…`;
    this.ui.count.style.color = this.status === 'online' ? '#7be3a0' : '#e3a07b';
  }

  makeTag() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    s.scale.set(1.6, 0.3, 1); s.visible = false; s.userData = { cv, tex, name: null };
    this.scene.add(s);
    return s;
  }

  drawTag(s, name) {
    const { cv, tex } = s.userData, g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 48);
    g.fillStyle = 'rgba(10,12,18,.75)'; g.beginPath(); g.roundRect(4, 4, 248, 40, 12); g.fill();
    g.fillStyle = '#fff'; g.font = '600 24px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, 128, 25);
    tex.needsUpdate = true; s.userData.name = name;
  }

  // ---- minimal chat: Enter (or the chat button) opens the box
  buildUi() {
    const wrap = document.createElement('div');
    wrap.id = 'net';
    wrap.innerHTML = `<div id="net-count">○ connecting…</div><div id="net-log"></div>
      <form id="net-form" class="hidden"><input id="net-in" maxlength="200" placeholder="Message everyone…" autocomplete="off" enterkeyhint="send"></form>`;
    document.body.appendChild(wrap);
    const sb = document.createElement('button');
    sb.id = 'summon-btn'; sb.textContent = 'Admin login';
    sb.onclick = (e) => {
      e.stopPropagation(); sb.blur(); document.exitPointerLock?.();
      if (!this.ws || this.ws.readyState !== 1) return;
      if (this.admin) { this.ws.send(JSON.stringify({ t: 'summon' })); return; }
      const pw = prompt('Admin password');
      if (pw) { this.pw = pw; this.ws.send(JSON.stringify({ t: 'login', pw })); }
    };
    document.body.appendChild(sb);
    this.summonBtn = sb;
    // full-screen toggle for desktop (touch devices get their own ⛶ button from touch.js); also F11-free: press F
    const fb = document.createElement('button');
    fb.id = 'fs-btn';
    const paint = () => { fb.textContent = isFullscreen() ? '⛶ Exit full screen' : '⛶ Full screen'; };
    fb.onclick = (e) => { e.stopPropagation(); fb.blur(); toggleFullscreen(); };
    document.addEventListener('fullscreenchange', paint); document.addEventListener('webkitfullscreenchange', paint);
    addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !this.chatOpen && !document.getElementById('name-gate')) toggleFullscreen(); });
    paint(); document.body.appendChild(fb);
    this.ui = { count: wrap.querySelector('#net-count'), log: wrap.querySelector('#net-log'), form: wrap.querySelector('#net-form'), input: wrap.querySelector('#net-in') };
    this.ui.form.onsubmit = (e) => {
      e.preventDefault();
      const text = this.ui.input.value.trim();
      if (text && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'chat', text }));
      this.closeChat();
    };
    this.ui.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.closeChat(); });
    this.ui.input.addEventListener('keyup', (e) => e.stopPropagation());
    addEventListener('keydown', (e) => { if (e.key === 'Enter' && this.ui.form.classList.contains('hidden')) { e.preventDefault(); this.openChat(); } });
  }

  get chatOpen() { return !this.ui.form.classList.contains('hidden'); }
  openChat() { document.exitPointerLock?.(); this.ui.form.classList.remove('hidden'); this.ui.input.focus(); }
  closeChat() { this.ui.input.value = ''; this.ui.input.blur(); this.ui.form.classList.add('hidden'); }

  addChat(name, text) {
    const row = document.createElement('div');
    const b = document.createElement('b'); b.textContent = `${name}: `;
    row.append(b, document.createTextNode(text));
    this.ui.log.appendChild(row);
    while (this.ui.log.children.length > 6) this.ui.log.firstChild.remove();
    setTimeout(() => row.classList.add('old'), 15000);
  }
}

// ---- full screen (prototype)
const root = document.documentElement;
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function goFullscreen() {
  if (isFullscreen()) return;
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(root, { navigationUI: 'hide' })).catch(() => {});
}
function toggleFullscreen() {
  if (!isFullscreen()) { goFullscreen(); return; }
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit) Promise.resolve(exit.call(document)).catch(() => {});
}
