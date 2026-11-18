// VT-03 "walk into the ring" guide (user, 2026-11-18: make it very clear where the ring is).
// Shown only to a competitor who is not in the ring yet:
//  · a big yellow arrow floating over the boxer's head, pointing at the ring and bobbing towards it
//  · chevrons sliding along the floor ahead of the boxer, towards the ring
//  · the ring itself pulses: a glowing frame on the canvas and a tall beam of light above it
// ~8 draw calls, only while the guide is visible (threejs-performance: nothing is added for spectators).
import * as THREE from 'three';

// = server/realtime/boxing.js RING (x, z, half) and PAVILION_Y + RING.top (canvas height)
export const RING_AT = { x: 120, z: 0, half: 5.3, y: 67 + 1.2 };
const YELLOW = 0xffd400, N_CHEV = 5, CHEV_GAP = 1.6;

const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false });

export class RingGuide {
  constructor(scene) {
    this.scene = scene; this.t = 0; this.on = false;
    this.group = new THREE.Group(); this.group.name = 'ring-guide'; this.group.visible = false;
    // ---- arrow over the head (points along +z before rotation); drawn on top so it never hides behind the crowd
    // a flat arrow plate (reads as an arrow from the third-person camera behind and above you), with a dark rim
    const arrowMat = glow(YELLOW); arrowMat.depthTest = false; arrowMat.side = THREE.DoubleSide;
    const edgeMat = glow(0x1a1200, 0.85); edgeMat.depthTest = false; edgeMat.side = THREE.DoubleSide;
    const shape = (k) => { const a = new THREE.Shape(); a.moveTo(-0.22 * k, -0.9 * k); a.lineTo(0.22 * k, -0.9 * k); a.lineTo(0.22 * k, 0.1 * k); a.lineTo(0.6 * k, 0.1 * k); a.lineTo(0, 0.95 * k); a.lineTo(-0.6 * k, 0.1 * k); a.lineTo(-0.22 * k, 0.1 * k); a.closePath(); return a; };
    const plate = (k) => new THREE.ShapeGeometry(shape(k)).rotateX(-Math.PI / 2).rotateY(Math.PI); // flat, pointing +z
    this.arrow = new THREE.Group();
    const rim = new THREE.Mesh(plate(1.18).translate(0, -0.01, -0.02), edgeMat), face = new THREE.Mesh(plate(1), arrowMat);
    rim.renderOrder = 994; face.renderOrder = 995;
    for (const m of [rim, face]) { m.frustumCulled = false; this.arrow.add(m); }
    this.arrow.scale.setScalar(1.4);
    this.group.add(this.arrow);
    // ---- floor chevrons
    const chev = new THREE.Shape();
    chev.moveTo(-0.7, -0.35); chev.lineTo(0, 0.35); chev.lineTo(0.7, -0.35); chev.lineTo(0.7, -0.05); chev.lineTo(0, 0.65); chev.lineTo(-0.7, -0.05); chev.closePath();
    const chevGeo = new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2); // lies flat, points along -z ... turned below
    this.chevs = Array.from({ length: N_CHEV }, () => { const m = new THREE.Mesh(chevGeo, glow(YELLOW, 0.8)); m.renderOrder = 6; this.group.add(m); return m; });
    // ---- the ring: pulsing frame on the canvas + a beam of light above it
    const h = RING_AT.half, w = 0.22, frame = [];
    for (const [x0, x1, z0, z1] of [[-h, h, -h, -h + w], [-h, h, h - w, h], [-h, -h + w, -h, h], [h - w, h, -h, h]]) frame.push(new THREE.BoxGeometry(x1 - x0, 0.04, z1 - z0).translate((x0 + x1) / 2, 0, (z0 + z1) / 2));
    this.frameMat = glow(YELLOW, 0.9);
    this.frame = new THREE.Group();
    for (const g of frame) this.frame.add(new THREE.Mesh(g, this.frameMat));
    this.frame.position.set(RING_AT.x, RING_AT.y + 0.03, RING_AT.z);
    this.beamMat = glow(0xffe680, 0.2); this.beamMat.blending = THREE.AdditiveBlending; this.beamMat.side = THREE.DoubleSide;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.9, h * 1.05, 26, 4, 1, true).rotateY(Math.PI / 4), this.beamMat);
    this.beam.position.set(RING_AT.x, RING_AT.y + 13, RING_AT.z); this.beam.renderOrder = 7;
    this.group.add(this.frame, this.beam);
    this._d = new THREE.Vector3();
  }

  /** distance (m, horizontal) from a point to the ring centre */
  static dist(p) { return Math.hypot(RING_AT.x - p.x, RING_AT.z - p.z); }

  /** show: the local boxer still has to walk in; pos: the player's feet */
  update(dt, show, pos) {
    if (show !== this.on) {
      this.on = show; this.group.visible = show;
      if (show) this.scene.add(this.group); else this.scene.remove(this.group);
    }
    if (!show) return;
    this.t += dt;
    const dx = RING_AT.x - pos.x, dz = RING_AT.z - pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, yaw = Math.atan2(ux, uz);
    // arrow: over the head, pushed out towards the ring, bobbing forward
    const bob = Math.sin(this.t * 6) * 0.25;
    this.arrow.position.set(pos.x + ux * (1.3 + bob), pos.y + 2.6 + Math.sin(this.t * 3) * 0.08, pos.z + uz * (1.3 + bob));
    this.arrow.rotation.set(-0.5, yaw, 0, 'YXZ'); // nose up: from the camera behind you it reads as an arrow pointing up the screen, ahead
    // chevrons slide towards the ring and fade at the end of the run
    const run = Math.min(N_CHEV * CHEV_GAP, Math.max(0, d - RING_AT.half));
    this.chevs.forEach((m, i) => {
      const s = ((i * CHEV_GAP + this.t * 2.4) % (N_CHEV * CHEV_GAP)) + 1.2;
      m.visible = s < run + 1.2;
      m.position.set(pos.x + ux * s, pos.y + 0.06, pos.z + uz * s);
      m.rotation.y = yaw + Math.PI; // the shape points along -z after the flat rotation
      m.material.opacity = 0.85 * Math.min(1, (N_CHEV * CHEV_GAP + 1.2 - s) / 2.5);
    });
    const p = 0.5 + 0.5 * Math.sin(this.t * 5);
    this.frameMat.opacity = 0.45 + 0.55 * p;
    this.beamMat.opacity = 0.08 + 0.14 * p;
  }
}
