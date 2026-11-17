// The CEO marker (user, 2026-11-18): bright green, with an arrow, impossible to miss. A screen-space
// overlay that is always on top (seen through walls and floors): a glowing pill with the distance and
// the floor, and a bobbing arrow pointing down at the CEO. When the CEO is off screen or behind you,
// the marker sticks to the screen edge and the arrow turns to point the way.
import * as THREE from 'three';
import { makeCEO } from './roster.js';
import { FLOOR_BY_ID } from '../layout/building.js';

const CSS = `
.ceo-mk { position: fixed; left: 0; top: 0; z-index: 40; pointer-events: none; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; font-family: "Segoe UI", Inter, Arial, sans-serif; will-change: transform; }
.ceo-mk .pill { background: #12ff6a; color: #02240f; font-weight: 900; font-size: 19px; letter-spacing: .06em; padding: 6px 14px 6px 12px; border-radius: 999px; border: 3px solid #e9fff1;
  box-shadow: 0 0 0 3px rgba(18,255,106,.35), 0 0 22px 6px rgba(18,255,106,.75), 0 0 60px 14px rgba(18,255,106,.35); white-space: nowrap; animation: ceoPulse 1.1s ease-in-out infinite; }
.ceo-mk .pill b { font-size: 22px; margin-right: 4px; }
.ceo-mk .pill span { font-weight: 800; margin-left: 8px; padding-left: 8px; border-left: 2px solid rgba(2,36,15,.35); }
.ceo-mk .where { margin-top: 4px; color: #b9ffd4; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; text-shadow: 0 0 6px #000, 0 0 10px rgba(18,255,106,.8); white-space: nowrap; }
.ceo-mk .arrowWrap { width: 56px; height: 56px; margin-top: 2px; display: flex; align-items: center; justify-content: center; }
.ceo-mk .arrow { width: 0; height: 0; border-left: 22px solid transparent; border-right: 22px solid transparent; border-top: 34px solid #12ff6a;
  filter: drop-shadow(0 0 6px #12ff6a) drop-shadow(0 0 14px rgba(18,255,106,.9)) drop-shadow(0 2px 0 #e9fff1); animation: ceoBob .7s ease-in-out infinite alternate; }
.ceo-mk.edge .arrow { animation: none; }
@keyframes ceoBob { from { transform: translateY(-5px); } to { transform: translateY(7px); } }
@keyframes ceoPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
`;
let styled = false;

export class CeoMarker {
  constructor() {
    if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true; }
    this.el = document.createElement('div'); this.el.className = 'ceo-mk';
    this.el.innerHTML = '<div class="pill"><b>♛</b>CEO<span class="d">—</span></div><div class="where"></div><div class="arrowWrap"><div class="arrow"></div></div>';
    document.body.append(this.el);
    this.dEl = this.el.querySelector('.d'); this.wEl = this.el.querySelector('.where'); this.aEl = this.el.querySelector('.arrowWrap');
    this._d = ''; this._w = null; this.v = new THREE.Vector3();
  }
  set visible(v) { this.el.style.display = v ? 'flex' : 'none'; }
  /** target: world point just above the CEO's head; from: the viewer's position (for the distance) */
  update(camera, target, from, where = '') {
    const d = `${Math.round(from.distanceTo(target))} m`;
    if (d !== this._d) { this.dEl.textContent = this._d = d; }
    if (where !== this._w) { this.wEl.textContent = this._w = where; this.wEl.style.display = where ? 'block' : 'none'; }
    const v = this.v.copy(target).project(camera), W = innerWidth, H = innerHeight;
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * W, y = (0.5 - v.y * 0.5) * H;
    if (behind) { x = W - x; y = H - y; }
    const M = 70, on = !behind && x > M && x < W - M && y > M + 60 && y < H - M;
    this.el.classList.toggle('edge', !on);
    if (on) {
      this.aEl.style.transform = '';
      this.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    } else {
      // clamp to the screen edge along the ray from the centre, arrow pointing at the CEO
      const cx = W / 2, cy = H / 2;
      let dx = x - cx, dy = y - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - M) / Math.max(1e-3, Math.abs(dx)), (H / 2 - M - 30) / Math.max(1e-3, Math.abs(dy)));
      const ex = cx + dx * k, ey = cy + dy * k;
      this.aEl.style.transform = `rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`;
      this.el.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
    }
  }
}

// Until multiplayer presence lands, the building's one CEO is a stand-in who paces the Command Deck
// (OT-05). When you play as the CEO, the stand-in steps aside: you are the CEO (and others will see
// the marker over you).
const DECK = [[-57.5, -7], [-57.5, 7]];
export class CeoPresence {
  constructor(scene, camera) {
    this.camera = camera;
    this.ceo = makeCEO();
    this.ceo.root.traverse((o) => { o.castShadow = false; });
    if (this.ceo.tag) this.ceo.tag.visible = false; // the marker replaces the name plate
    scene.add(this.ceo.root);
    this.floor = FLOOR_BY_ID['OT-05'];
    this.marker = new CeoMarker();
    this.u = 0; this.dir = 1; this.wait = 0; this.t = 0; this.self = false;
    this.target = new THREE.Vector3();
  }
  setPlayerRole(role) { this.self = role === 'ceo'; }
  update(dt, player, visibleIds) {
    this.t += dt;
    const c = this.ceo, e = this.floor.elevation;
    // pace the deck, stopping at each end for a puff
    let speed = 0;
    if (this.wait > 0) this.wait -= dt;
    else {
      const len = Math.abs(DECK[1][1] - DECK[0][1]);
      this.u += (dt * 1.1 * this.dir) / len; speed = 1.1;
      if (this.u >= 1 || this.u <= 0) { this.u = Math.min(1, Math.max(0, this.u)); this.dir *= -1; this.wait = 4 + Math.random() * 4; }
    }
    const z = DECK[0][1] + (DECK[1][1] - DECK[0][1]) * this.u;
    c.root.position.set(DECK[0][0], e, z);
    c.root.rotation.y = this.wait > 0 ? -Math.PI / 2 : this.dir > 0 ? 0 : Math.PI;
    c.root.visible = !this.self && visibleIds.includes('OT-05');
    if (c.root.visible) c.update(dt, this.t, speed);
    this.marker.visible = !this.self;
    if (this.self) return;
    this.target.set(c.root.position.x, e + c.tagY * c.root.scale.x + 0.1, z);
    const here = player.floor?.id === 'OT-05' ? '' : 'OT-05 · Executive Command Centre';
    this.marker.update(this.camera, this.target, player.pos, here);
  }
}
