// VT-03 bout spotlights (user, 2026-11-18): during a bout every boxer gets their own spotlight, aimed
// from the pavilion roof and following them around, with a visible glowing beam and a pool of light
// at their feet.
// Performance: adding or removing lights makes three.js recompile every lit material (a visible
// stutter), so a fixed pool is created once and attached to the scene only while you are on VT-03;
// between bouts the lights sit at zero intensity instead of being removed.
import * as THREE from 'three';

const POOL = 6;
const RING = { x: 120, z: 0 }, FLOOR_Y = 67, RIG_Y = FLOOR_Y + 20, RIG_R = 9; // rig hangs under the 25 m roof
const TINTS = [0xffd9c2, 0xc9dcff, 0xfff3b8, 0xc8ffd9, 0xeccfff, 0xffffff]; // red corner warm, blue corner cool, …
const PEAK = 140; // candela-ish (physically based lights, decay 1); brighter blows out under the arena bloom

export class BoutSpotlights {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'bout-spotlights';
    this.attached = false;
    const beamGeo = new THREE.CylinderGeometry(0.18, 1.0, 1, 24, 1, true).translate(0, -0.5, 0); // unit length, apex at the top
    const poolGeo = new THREE.CircleGeometry(1.15, 32).rotateX(-Math.PI / 2);
    this.spots = [];
    for (let i = 0; i < POOL; i++) {
      const a = (i / POOL) * Math.PI * 2 + 0.4;
      const light = new THREE.SpotLight(TINTS[i], 0, 40, 0.11, 0.55, 1);
      light.position.set(RING.x + Math.cos(a) * RIG_R, RIG_Y, RING.z + Math.sin(a) * RIG_R);
      light.castShadow = false;
      const beamMat = new THREE.MeshBasicMaterial({ color: TINTS[i], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Mesh(beamGeo, beamMat); beam.renderOrder = 8; beam.frustumCulled = false;
      const poolMat = new THREE.MeshBasicMaterial({ color: TINTS[i], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const pool = new THREE.Mesh(poolGeo, poolMat); pool.renderOrder = 7;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.5, 14), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      lamp.position.copy(light.position);
      this.group.add(light, light.target, beam, pool, lamp);
      this.spots.push({ light, beam, pool, lamp, k: 0, aim: new THREE.Vector3(RING.x, FLOOR_Y, RING.z) });
    }
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, -1, 0);
  }

  /**
   * onFloor: the viewer is on VT-03 (the pool is attached only then).
   * targets: world positions (feet) of the boxers, in bout order; [] = no bout (lights fade out).
   */
  update(dt, onFloor, targets) {
    if (onFloor !== this.attached) { if (onFloor) this.scene.add(this.group); else this.scene.remove(this.group); this.attached = onFloor; }
    if (!onFloor) return;
    const t = performance.now() / 1000;
    this.spots.forEach((s, i) => {
      const p = targets[i];
      s.k += ((p ? 1 : 0) - s.k) * Math.min(1, dt * 3); // fade in / out
      if (p) s.aim.lerp(p, Math.min(1, dt * 8)); // follow smoothly
      const on = s.k > 0.01;
      s.light.intensity = PEAK * s.k * (0.94 + 0.06 * Math.sin(t * 7 + i)); // a little live flicker
      s.light.target.position.set(s.aim.x, s.aim.y + 1, s.aim.z);
      s.beam.visible = s.pool.visible = on;
      if (!on) return;
      // beam: from the lamp to the boxer's feet
      const from = s.light.position, d = this._v.copy(s.aim).sub(from), len = d.length();
      s.beam.position.copy(from);
      s.beam.quaternion.setFromUnitVectors(this._up, d.normalize());
      const w = len * Math.tan(s.light.angle) * 0.9; // the cone's real width at the boxer
      s.beam.scale.set(w, len, w);
      s.beam.material.opacity = 0.11 * s.k;
      s.pool.position.set(s.aim.x, s.aim.y + 0.03, s.aim.z);
      s.pool.material.opacity = 0.32 * s.k;
    });
  }
}
