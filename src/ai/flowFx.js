// Cheap hand-off effects shared by the three rooms (docs/ai-visuals-plan.md §2.2): rubber STAMPS that slam
// onto a spot (VETO / FILLED / CLEARED / BOUGHT / REJECTED / SETTLED) and light PULSES that travel between two
// agents. One pool of sprites + one pool of tiny emissive spheres, shared geometry, NO lights. Only animates
// while something is active. Stamps never block the walkway: they hang at head height or above, no collision.
import * as THREE from 'three';

const KINDS = {
  VETO: { c: '#ff3b3b', size: 1.0, rot: -0.12 }, REJECTED: { c: '#ffb020', size: 0.8, rot: 0.1 }, FILLED: { c: '#4dff9a', size: 0.6, rot: -0.06 },
  CLEARED: { c: '#7dffb8', size: 0.6, rot: 0.06 }, BOUGHT: { c: '#4dff9a', size: 0.7, rot: -0.08 }, WON: { c: '#4dff9a', size: 0.8, rot: -0.08 },
  LOST: { c: '#ff6a6a', size: 0.8, rot: 0.08 }, LOCKED: { c: '#ffd96a', size: 0.9, rot: -0.05 }, STAKED: { c: '#ffd96a', size: 0.7, rot: 0.07 },
};
const texCache = new Map();
function stampTex(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const k = KINDS[kind] || KINDS.CLEARED, cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
  const g = cv.getContext('2d');
  g.translate(256, 96); g.rotate(k.rot);
  g.strokeStyle = k.c; g.fillStyle = 'rgba(8,8,12,.55)'; g.lineWidth = 12;
  g.beginPath(); g.roundRect(-236, -78, 472, 156, 22); g.fill(); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.roundRect(-220, -62, 440, 124, 14); g.stroke();
  g.fillStyle = k.c; g.font = '900 108px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kind, 0, 6);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(kind, t); return t;
}

export class FlowFx {
  constructor(parent, { stamps = 6, pulses = 10 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'ai-flow-fx'; parent.add(this.group);
    this.stamps = Array.from({ length: stamps }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.renderOrder = 997;
      this.group.add(s); return { s, t: 99, life: 0, size: 1 };
    });
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    this.pulses = Array.from({ length: pulses }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); m.visible = false; this.group.add(m);
      return { m, t: 99, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), arc: 0.6 };
    });
    this.active = 0;
  }
  /** slam a stamp at pos (world); kind in KINDS; scale multiplies its size; hold seconds before it fades */
  stamp(kind, pos, { scale = 1, hold = 5 } = {}) {
    const slot = this.stamps.find((x) => x.t >= x.life) || this.stamps.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    const k = KINDS[kind] || KINDS.CLEARED;
    slot.s.material.map = stampTex(kind); slot.s.material.needsUpdate = true;
    slot.s.position.copy(pos); slot.size = k.size * scale; slot.t = 0; slot.life = hold + 0.9; slot.hold = hold; slot.s.visible = true;
  }
  /** a light pulse from a to b (world Vector3s), hex colour, seconds */
  pulse(a, b, color = 0xffffff, dur = 1.1) {
    const p = this.pulses.find((x) => x.t >= x.dur); if (!p) return;
    p.a.copy(a); p.b.copy(b); p.t = 0; p.dur = Math.max(0.3, dur); p.arc = 0.35 + a.distanceTo(b) * 0.05; p.m.material.color.setHex(color); p.m.visible = true;
  }
  update(dt) {
    let n = 0;
    for (const x of this.stamps) {
      if (x.t >= x.life) { if (x.s.visible) { x.s.visible = false; x.s.material.opacity = 0; } continue; }
      x.t += dt; n++;
      const u = x.t, slam = u < 0.16 ? 3.2 - (u / 0.16) * 2.4 : u < 0.28 ? 0.8 + (u - 0.16) / 0.12 * 0.2 : 1; // punches in from big, overshoots, settles
      const fade = u > x.hold ? Math.max(0, 1 - (u - x.hold) / 0.9) : 1;
      x.s.scale.set(1.9 * x.size * slam, 0.71 * x.size * slam, 1); x.s.material.opacity = Math.min(1, u / 0.06) * fade;
    }
    for (const p of this.pulses) {
      if (p.t >= p.dur) { if (p.m.visible) p.m.visible = false; continue; }
      p.t += dt; n++;
      const k = Math.min(1, p.t / p.dur), e = k * k * (3 - 2 * k);
      p.m.position.lerpVectors(p.a, p.b, e); p.m.position.y += Math.sin(Math.PI * e) * p.arc;
      p.m.scale.setScalar(0.8 + Math.sin(Math.PI * k) * 1.2); p.m.material.opacity = 1 - Math.max(0, k - 0.85) / 0.15;
    }
    this.active = n;
  }
}
