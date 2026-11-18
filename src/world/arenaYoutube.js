// VT-02 Arena Media: YouTube highlights ON a screen. A YouTube player cannot be drawn into a WebGL
// texture (cross-origin frames are never readable), so it rides in a CSS3D layer: ONE privacy-enhanced
// embed (youtube-nocookie.com, muted autoplay, no controls) positioned and scaled exactly over the reel
// screen nearest to you that faces you. The other reel screens keep the shared WebGL card (thumbnail +
// title). Trade-off: a CSS layer always draws on top of the 3D scene, so the player is only shown while
// its screen is in front of you, facing you, within 55 m AND unobstructed: 5 rays (centre + corners) from the
// camera against the scene, 4 times a second; anything in the way (a hanging screen, a pillar, a guest) hides
// it. Hidden everywhere else (other floors, behind you, apps open). Cost: one iframe, no draw calls.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const PX_W = 1280, PX_H = 720, NEAR = 55;
let css = null, scene = null, obj = null, frame = null, current = null, slot = null;
const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const ray = new THREE.Raycaster();
const isSelf = (o) => { for (; o; o = o.parent) if (o.userData?.selfAvatar) return true; return false; };
let occT = 0, occluded = false, occSlot = null;
/** true when something in the scene blocks the camera's view of screen s (centre or any corner) */
function blocked(s, root, camera) {
  ray.camera = camera; // sprites (name plates) need it
  const pts = [[0, 0], [-0.45, -0.42], [0.45, -0.42], [-0.45, 0.42], [0.45, 0.42]];
  const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw); // the screen's right-hand direction
  for (const [u, v] of pts) {
    _p.set(s.x + rx * u * s.w + Math.sin(s.yaw) * 0.05, s.y + v * s.h, s.z + rz * u * s.w + Math.cos(s.yaw) * 0.05);
    const dist = _d.subVectors(_p, _c).length();
    // both directions: most walls are single-sided, and a ray only hits a face from its front
    const solid = (h) => h.object.visible !== false && !h.object.isSprite && !(h.object.material?.transparent && h.object.material.opacity < 0.5) && !isSelf(h.object);
    _d.normalize(); ray.set(_c, _d); ray.far = dist - 0.25; ray.near = 0.3;
    if (ray.intersectObjects(root.children, true).some(solid)) return true;
    ray.set(_p, _d.negate()); ray.near = 0.25; ray.far = dist - 0.3;
    if (ray.intersectObjects(root.children, true).some(solid)) return true;
  }
  return false;
}

function init() {
  css = new CSS3DRenderer();
  css.setSize(innerWidth, innerHeight);
  Object.assign(css.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '0' });
  css.domElement.className = 'arena-yt-layer';
  const gl = document.getElementById('c'); if (gl) gl.after(css.domElement); else document.body.prepend(css.domElement); // just above the 3D canvas, under every HUD element
  addEventListener('resize', () => css.setSize(innerWidth, innerHeight));
  scene = new THREE.Scene();
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { width: `${PX_W}px`, height: `${PX_H}px`, background: '#000', pointerEvents: 'none' });
  frame = document.createElement('iframe');
  Object.assign(frame, { width: PX_W, height: PX_H, title: 'Arena highlights', allow: 'autoplay; encrypted-media', referrerPolicy: 'strict-origin-when-cross-origin' });
  Object.assign(frame.style, { border: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  wrap.append(frame);
  obj = new CSS3DObject(wrap);
  obj.visible = false;
  scene.add(obj);
}

/** the YouTube id to show on a screen (null = none) */
export function setArenaYoutube(ytId) {
  if (ytId === current) return;
  current = ytId;
  if (!css) init();
  frame.src = ytId ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3&disablekb=1` : 'about:blank';
  if (!ytId) { obj.visible = false; obj.element.style.display = 'none'; }
}

/** per frame: place the player on the best reel screen (screens: broadcast.js MEDIA.items.reel), or hide it */
/** bowl: { cx, cz, r } — the player is only shown to a camera inside the bowl (never through its walls) */
export function updateArenaYoutube(camera, visible, screens = [], root = null, dt = 0, bowl = null) {
  if (!css || !current) return;
  let best = null, bd = Infinity;
  if (visible && !document.body.classList.contains('app-open')) {
    camera.getWorldPosition(_c); camera.getWorldDirection(_f);
    const inside = !bowl || Math.hypot(_c.x - bowl.cx, _c.z - bowl.cz) < bowl.r;
    for (const s of inside ? screens : []) {
      const dx = s.x - _c.x, dy = s.y - _c.y, dz = s.z - _c.z, d = Math.hypot(dx, dy, dz);
      if (d > NEAR) continue;
      _n.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)); // the screen's front
      if ((_n.x * -dx + _n.z * -dz) / Math.max(1e-3, Math.hypot(dx, dz)) < 0.4) continue; // behind it, or too edge-on to read
      if ((_f.x * dx + _f.y * dy + _f.z * dz) / d < 0.35) continue; // not in front of the camera
      if (d < bd) { bd = d; best = s; }
    }
  }
  if (best && root) {
    occT -= dt;
    if (occT <= 0 || best !== occSlot) { occT = 0.25; occSlot = best; try { occluded = blocked(best, root, camera); } catch (e) { occluded = true; console.warn('[arena media] occlusion check', e.message); } }
    if (occluded) best = null;
  }
  const show = Boolean(best);
  obj.element.style.display = show ? '' : 'none';
  obj.visible = show;
  if (show && best !== slot) {
    slot = best;
    obj.position.set(best.x + Math.sin(best.yaw) * 0.03, best.y, best.z + Math.cos(best.yaw) * 0.03);
    obj.rotation.set(0, best.yaw, 0);
    obj.scale.set(best.w / PX_W, best.h / PX_H, 1);
  }
  css.domElement.style.display = show ? '' : 'none';
  if (show) css.render(scene, camera);
}
export const arenaYoutubeState = () => ({ id: current, shown: Boolean(obj?.visible), at: slot ? { x: +slot.x.toFixed(1), z: +slot.z.toFixed(1) } : null });
